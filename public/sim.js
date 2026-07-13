// Simulation — the page owns physics: motion, motes, energy. The director only sets intents.
function steerVec(pos, target, speed, dt) {
  const dx = target[0] - pos[0], dy = target[1] - pos[1];
  const d = Math.hypot(dx, dy);
  if (d < 0.002) return [0, 0, true];
  const step = Math.min(speed * dt, d);
  return [(dx / d) * step, (dy / d) * step, false];
}
function nearestMote(pos, motes) {
  let best = null, bd = Infinity;
  for (const m of motes) {
    const d = Math.hypot(m.x - pos[0], m.y - pos[1]);
    if (d < bd) { bd = d; best = m; }
  }
  return best ? { mote: best, d: bd } : null;
}
function energyTick(e, moving, dt) {
  return Math.max(0, e - (moving ? 0.012 : 0.005) * dt);
}
function hazardPush(pos, hazards, nowMs) {
  let dx = 0, dy = 0;
  for (const h of hazards) {
    if (h.until && h.until < nowMs) continue;
    const ox = pos[0] - h.x, oy = pos[1] - h.y;
    const d = Math.hypot(ox, oy);
    if (d > (h.r || 0.09) || d === 0) continue;
    const push = 0.08 * (1 - d / (h.r || 0.09));
    dx += (ox / d) * push; dy += (oy / d) * push;
  }
  return [dx, dy];
}

const Sim = {
  items: new Map(), // id -> {c, g, sx, sy}
  motes: [],        // {x, y, vy, sway, el}
  hazards: [],      // {x, y, r, until, el}
  t: 0, sinceReport: 0, sinceSpawn: 0, ventTimers: null,

  add(c, g) {
    const h = hash(c.id);
    this.items.set(c.id, { c, g, sx: (h % 97) / 97, sy: (h % 89) / 89 });
  },
  remove(id) {
    const it = this.items.get(id);
    if (it) { it.g.remove(); this.items.delete(id); }
  },

  bloom(x, y, count = 14) {
    const layer = document.getElementById('motes');
    for (let i = 0; i < count && this.motes.length < 120; i++) {
      const m = {
        x: x + (Math.random() - 0.5) * 0.06,
        y: y + (Math.random() - 0.5) * 0.05,
        vy: 0.004 + Math.random() * 0.008, sway: Math.random() * 10,
        el: el('circle', { r: 1.5 + Math.random(), fill: 'rgba(90,70,40,.4)', class: 'mote' }, layer),
      };
      this.motes.push(m);
    }
  },
  setHazard(x, y) {
    const layer = document.getElementById('motes');
    const g = el('circle', {
      cx: 0, cy: 0, r: 10, fill: '#5e2a52', 'fill-opacity': 0.12,
      stroke: '#5e2a52', 'stroke-opacity': 0.35, 'stroke-dasharray': '3 5', class: 'hazard',
    }, layer);
    const h = { x, y, r: 0.09, until: Date.now() + 60000, el: g };
    this.hazards.push(h);
    const [px, py] = View.px([x, y]);
    g.setAttribute('cx', px); g.setAttribute('cy', py);
    g.setAttribute('r', 0.09 * Math.min(innerWidth, innerHeight));
    return h;
  },

  step(dt, world) {
    this.t += dt;
    // ambient marine snow
    this.sinceSpawn += dt;
    if (this.sinceSpawn > 1 / 1.2 && this.motes.length < 120) {
      this.sinceSpawn = 0;
      this.bloom(Math.random(), -0.02, 1);
    }
    // vent blooms
    if (world && world.vents) {
      this.ventTimers ??= world.vents.map(() => 0);
      world.vents.forEach((v, i) => {
        this.ventTimers[i] += dt;
        if (this.ventTimers[i] > (v.period || 60)) { this.ventTimers[i] = 0; this.bloom(v.pos[0], v.pos[1], 14); }
      });
    }
    // motes fall
    for (const m of this.motes) {
      m.y += m.vy * dt;
      m.x += Math.sin(this.t * 0.6 + m.sway) * 0.002 * dt;
      if (m.y > 1.02) { m.y = -0.02; m.x = Math.random(); }
      const [px, py] = View.px([m.x, m.y]);
      m.el.setAttribute('cx', px); m.el.setAttribute('cy', py);
    }
    // expired hazards
    this.hazards = this.hazards.filter((h) => {
      if (h.until > Date.now()) return true;
      h.el.remove(); return false;
    });
    for (const it of this.items.values()) this.stepCreature(it, dt);
    this.sinceReport += dt;
    if (this.sinceReport > 3) {
      this.sinceReport = 0;
      Net.physics([...this.items.values()].map(({ c }) => ({ id: c.id, pos: c.pos, energy: c.energy })));
    }
  },

  stepCreature(it, dt) {
    const { c } = it;
    const speedMul = c.energy < 0.15 ? 0.5 : 1;
    let dx = 0, dy = 0, moving = false;
    const intent = c.intent || { verb: 'idle' };
    if (intent.verb === 'move-to' && intent.target) {
      const [mx, my, arrived] = steerVec(c.pos, intent.target, 0.06 * speedMul, dt);
      dx += mx; dy += my; moving = !arrived;
      if (arrived) c.intent = { verb: 'idle' };
    } else if (intent.verb === 'forage') {
      const near = nearestMote(c.pos, this.motes);
      if (near) {
        if (near.d < 0.02) {
          near.mote.el.remove();
          this.motes.splice(this.motes.indexOf(near.mote), 1);
          c.energy = Math.min(1, c.energy + 0.08);
        } else {
          const [mx, my] = steerVec(c.pos, [near.mote.x, near.mote.y], 0.05 * speedMul, dt);
          dx += mx; dy += my; moving = true;
        }
      }
    }
    // ever-present gentle wander
    dx += Math.sin(this.t * 0.3 + it.sx * 40) * 0.004 * dt;
    dy += Math.cos(this.t * 0.23 + it.sy * 40) * 0.004 * dt;
    const [hx, hy] = hazardPush(c.pos, this.hazards, Date.now());
    dx += hx * dt * 8; dy += hy * dt * 8;
    c.pos[0] = Math.min(0.97, Math.max(0.03, c.pos[0] + dx));
    c.pos[1] = Math.min(0.94, Math.max(0.06, c.pos[1] + dy));
    c.energy = energyTick(c.energy, moving, dt);
    const [px, py] = View.px(c.pos);
    let rot = '';
    const spec = c.chassisSpec || (typeof CHASSIS !== 'undefined' && CHASSIS[c.chassis]);
    if (spec && spec.orient && (Math.abs(dx) + Math.abs(dy)) > 0.0001) {
      it.heading = Math.atan2(dy, dx) * 180 / Math.PI;
    }
    if (spec && spec.orient && it.heading != null) rot = ` rotate(${it.heading})`;
    it.g.setAttribute('transform', `translate(${px},${py}) scale(${c.scale || 1})${rot}`);
  },
};

if (typeof module !== 'undefined') module.exports = { steerVec, nearestMote, energyTick, hazardPush };
