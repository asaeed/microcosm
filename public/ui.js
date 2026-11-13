// UI helpers — bubbles, structures, placeholders. Popovers/tools/chronicle arrive in Tasks 6-7.
const UI = {
  sayHooks: [],
  onSay(fn) { this.sayHooks.push(fn); },

  bubble(c, text, kind = 'speech') {
    const layer = document.getElementById('bubbles');
    const [px, py] = View.px(c.pos);
    const div = document.createElement('div');
    div.className = `bubble bubble-${kind}`;
    div.textContent = kind === 'whisper' ? `(to you) ${text}` : text;
    const stack = layer.querySelectorAll(`[data-for="${c.id}"]`).length;
    div.dataset.for = c.id;
    // ponytail: if this creature's tag is open, put the bubble on the tag's other side
    const tag = document.querySelector(`.specimen-tag[data-id="${c.id}"]`);
    let lx = Math.min(innerWidth - 240, Math.max(8, px - 60));
    if (tag) lx = tag.offsetLeft > px ? Math.max(8, px - 240) : Math.min(innerWidth - 240, px + 50);
    div.style.left = `${lx}px`;
    div.style.top = `${Math.max(8, py - 70 - stack * 34)}px`;
    layer.appendChild(div);
    setTimeout(() => { div.classList.add('bubble-fade'); setTimeout(() => div.remove(), 900); }, 5000);
  },

  renderStructure(id, s) {
    const layer = document.getElementById('structures');
    let g = layer.querySelector(`[data-id="${id}"]`);
    if (!g) {
      g = el('g', { class: 'structure', 'data-id': id }, layer);
      el('g', { filter: 'url(#goo)', opacity: 0.22, class: 'tb mc-halo structure-goo' }, g);
      el('g', { class: 'structure-lines' }, g);
      el('line', { class: 'structure-leader', 'stroke-width': 1, 'stroke-dasharray': '2 3' }, g);
      const label = document.createElementNS(SVGNS, 'text');
      label.setAttribute('class', 'structure-label');
      label.style.textAnchor = 'start';
      g.appendChild(label);
    }
    const goo = g.querySelector('.structure-goo');
    const lines = g.querySelector('.structure-lines');
    goo.replaceChildren();
    lines.replaceChildren();
    const scale = Math.min(innerWidth, innerHeight);
    const tint = s.tint || '#8a7350';
    let sx = 0, sy = 0;
    s.blobs.forEach(([x, y, r], i) => {
      const [px, py] = View.px([x, y]);
      const pr = r * scale;
      el('circle', { cx: px, cy: py, r: pr, fill: tint }, goo);
      // pencil-work: dashed growth rings + a few porthole dots, deterministic per blob
      el('circle', { cx: px, cy: py, r: pr * 0.72, fill: 'none', stroke: tint,
        'stroke-opacity': 0.5, 'stroke-width': 1, 'stroke-dasharray': '3 4' }, lines);
      if (i % 2 === 0) el('circle', { cx: px, cy: py, r: pr * 0.4, fill: 'none', stroke: tint,
        'stroke-opacity': 0.35, 'stroke-width': 1, 'stroke-dasharray': '1.5 3' }, lines);
      const rng = mulberry32(hash(id) + i);
      for (let d = 0; d < 3; d++) {
        const a = rng() * 2 * Math.PI, dist = pr * (0.45 + rng() * 0.4);
        el('circle', { cx: px + Math.cos(a) * dist, cy: py + Math.sin(a) * dist, r: 1.6,
          fill: tint, 'fill-opacity': 0.7 }, lines);
      }
      sx += px; sy += py;
    });
    const label = g.querySelector('.structure-label');
    const leader = g.querySelector('.structure-leader');
    if (s.blobs.length) {
      // specimen-plate annotation: offset italic label with a dashed leader line
      const cx = sx / s.blobs.length, cy = sy / s.blobs.length;
      const maxR = Math.max(...s.blobs.map(([, , r]) => r)) * scale;
      const lx = cx + maxR + 26, ly = cy - maxR - 14;
      label.textContent = s.name;
      label.setAttribute('x', lx);
      label.setAttribute('y', ly);
      leader.setAttribute('x1', lx - 4); leader.setAttribute('y1', ly + 3);
      leader.setAttribute('x2', cx + maxR * 0.55); leader.setAttribute('y2', cy - maxR * 0.55);
      leader.setAttribute('stroke', 'rgba(74,58,38,.35)');
    }
  },

  renderVents(world) {
    const layer = document.getElementById('structures');
    layer.querySelectorAll('.vent').forEach((v) => v.remove());
    const scale = Math.min(innerWidth, innerHeight);
    for (const v of world.vents || []) {
      const [px, py] = View.px(v.pos);
      const g = el('g', { class: 'vent', transform: `translate(${px},${py})` }, layer);
      el('path', { d: 'M-16,6 Q0,-10 16,6', fill: 'none', stroke: '#8a7350',
        'stroke-opacity': 0.55, 'stroke-width': 2 }, g);
      el('path', { d: 'M-9,6 Q0,-3 9,6', fill: 'none', stroke: '#8a7350',
        'stroke-opacity': 0.4, 'stroke-width': 1.5 }, g);
      for (let i = 0; i < 3; i++) {
        const shimmer = el('circle', { cx: -6 + i * 6, cy: -8 - i * 3, r: 1.4,
          fill: '#a1794a', 'fill-opacity': 0.6, class: 'mc-wv' }, g);
        shimmer.style.animationDelay = `${-i * 0.8}s`;
      }
      el('circle', { cx: 0, cy: 0, r: 0.05 * scale, fill: 'none',
        stroke: 'rgba(138,115,80,.3)', 'stroke-width': 1, 'stroke-dasharray': '1.5 5', class: 'tb mc-halo' }, g);
    }
  },

  developing(prompt) {
    const hud = document.getElementById('hud');
    let box = hud.querySelector('.developing-stack');
    if (!box) {
      box = document.createElement('div');
      box.className = 'developing-stack';
      hud.appendChild(box);
    }
    const chip = document.createElement('div');
    chip.className = 'developing-chip';
    chip.textContent = `decree lodged with the director — "${prompt.slice(0, 60)}"`;
    box.appendChild(chip);
    setTimeout(() => chip.remove(), 12000); // acknowledgment, not a status — decrees may take a director visit
  },
  resolveDeveloping() {
    document.querySelector('.developing-chip')?.remove();
  },
};

UI.initHud = function initHud() {
  const hud = document.getElementById('hud');

  // creation bar
  const bar = document.createElement('form');
  bar.className = 'creation-bar';
  bar.innerHTML = `<input class="creation-input" type="text"
    placeholder="Describe a new specimen — or decree anything about this world" maxlength="500">`;
  bar.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = bar.querySelector('input');
    const prompt = input.value.trim();
    if (!prompt) return;
    Net.input({ type: 'decree', prompt }); // the director interprets: creature description, world order, story request…
    UI.developing(prompt);
    input.value = '';
  });
  hud.appendChild(bar);

  // creature click -> popover (drag handled in Task 7; a click is a <6px pointer travel)
  let downAt = null;
  document.getElementById('slide').addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // secondary button belongs to the context menu
    downAt = [e.clientX, e.clientY, e.target.closest('.creature')];
  });
  document.getElementById('slide').addEventListener('pointerup', (e) => {
    if ((UI.mode || 'interact') !== 'interact') { downAt = null; return; } // tool clicks never open the popover
    if (!downAt) return;
    const [x, y, g] = downAt;
    downAt = null;
    if (Math.hypot(e.clientX - x, e.clientY - y) > 6 || !g) return;
    UI.openTag(g.dataset.id); // one menu, everything in it
  });
  // secondary click opens the same menu (and suppresses the browser one)
  document.getElementById('slide').addEventListener('contextmenu', (e) => {
    const g = e.target.closest('.creature');
    if (!g) return;
    e.preventDefault();
    UI.openTag(g.dataset.id);
  });
};

// escape director/user-authored strings before innerHTML interpolation
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

UI.threads = {}; // id -> [{who: 'you'|'them', text}]
// the creature's brief, honest words to its god about its current state
UI.statusLine = function statusLine(c) {
  const authored = c.voice && c.voice.status && c.voice.status.length ? UI.line(c, 'status') : null;
  if (authored) return authored;
  const e = c.energy || 0;
  const strength = e < 0.15 ? 'starving' : e < 0.4 ? 'lean' : e < 0.75 ? 'fed' : 'brimming';
  const doing = c.intent && c.intent.verb === 'move-to' ? 'traveling'
    : c.intent && c.intent.verb === 'forage' ? 'hunting motes' : 'drifting';
  return `${c.mood || 'calm'}, ${strength}, ${doing}.`;
};
UI.openTag = function openTag(id) {
  document.querySelector('.specimen-tag')?.remove();
  const c = App.world.creatures[id];
  if (!c) return;
  const [px, py] = View.px(c.pos);
  const tag = document.createElement('div');
  tag.className = 'specimen-tag';
  tag.dataset.id = id;
  // near the right edge, flip the tag to the creature's left — it must never cover the creature (blocks dragging)
  const left = px + 40 > innerWidth - 270 ? Math.max(8, px - 290) : px + 40;
  tag.style.left = `${left}px`;
  tag.style.top = `${Math.max(10, py - 80)}px`;
  tag.style.visibility = 'hidden'; // measured and clamped on-screen after append (height varies with sliders/thread)

  const sliders = Object.entries(c.attributes || {}).map(([name, val]) => `
    <label class="tag-slider">${esc(name)}
      <input type="range" min="0" max="1" step="0.05" value="${val}" data-attr="${esc(name)}">
    </label>`).join('');
  const options = Object.keys(CHASSIS)
    .map((k) => `<option value="${esc(k)}" ${k === c.chassis ? 'selected' : ''}>${esc(k)}</option>`).join('');
  const thread = (UI.threads[id] || [])
    .map((m) => `<div class="thread-${m.who}">${m.who === 'you' ? 'You: ' : ''}${esc(m.text)}</div>`).join('');

  tag.innerHTML = `
    <button class="tag-close" type="button">×</button>
    <div class="tag-name">${esc(c.name)}</div>
    <div class="tag-epithet">${esc(c.epithet || '')}</div>
    <div class="tag-status">“${esc(UI.statusLine(c))}”</div>
    ${sliders}
    <label class="tag-slider">chassis <select class="tag-chassis">${options}</select></label>
    <div class="tag-thread">${thread}</div>
    <form class="tag-whisper"><input type="text" placeholder="Whisper to ${esc(c.name)}…" maxlength="300"></form>`;

  tag.querySelector('.tag-close').addEventListener('click', () => tag.remove());
  tag.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('change', () => {
    const name = r.dataset.attr, value = parseFloat(r.value);
    c.attributes[name] = value;
    Net.act([{ cmd: 'set-attribute', id, name, value }]); // canonical — survives reload
    Net.input({ type: 'set-attribute', id, name, value }); // director awareness only
  }));
  tag.querySelector('.tag-chassis')?.addEventListener('change', (e) => {
    // god controls act instantly: the page re-spawns the creature itself; the input just informs the director
    Net.act([{ cmd: 'spawn', creature: { ...c, chassis: e.target.value, chassisSpec: null } }]);
    Net.input({ type: 'set-chassis', id, chassis: e.target.value });
  });
  tag.querySelector('.tag-whisper').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = e.target.querySelector('input');
    const text = inp.value.trim();
    if (!text) return;
    (UI.threads[id] ??= []).push({ who: 'you', text });
    Net.input({ type: 'whisper', id, text });
    if (Date.now() - App.lastDirector > 30000) {
      UI.threads[id].push({ who: 'sys', text: '(queued — the director is away)' });
    }
    inp.value = '';
    UI.openTag(id); // re-render thread
  });
  document.getElementById('hud').appendChild(tag);
  // clamp fully on-screen now that the height is known
  tag.style.top = `${Math.min(Math.max(10, py - 80), Math.max(10, innerHeight - tag.offsetHeight - 10))}px`;
  tag.style.visibility = '';
};

// whispers back from the director land in the thread
UI.onSay((a) => {
  if (a.target !== 'user') return;
  (UI.threads[a.id] ??= []).push({ who: 'them', text: a.text });
  const open = document.querySelector('.specimen-tag');
  if (open && open.dataset.id === a.id) UI.openTag(a.id);
});

UI.pulse = function pulse(x, y, color) {
  const [px, py] = View.px([x, y]);
  const ring = el('circle', {
    cx: px, cy: py, r: 8, fill: 'none', stroke: color, 'stroke-width': 2, class: 'fx-pulse',
  }, document.getElementById('motes'));
  setTimeout(() => ring.remove(), 950);
};

UI.mode = 'interact';
UI.initTools = function initTools() {
  const hud = document.getElementById('hud');
  const tools = document.createElement('div');
  tools.className = 'god-tools';
  tools.innerHTML = `
    <button type="button" class="god-tool" data-mode="feed" title="Drop a food bloom">✦</button>
    <button type="button" class="god-tool" data-mode="hazard" title="Seed a toxin cloud">☄</button>`;
  tools.addEventListener('click', (e) => {
    const b = e.target.closest('.god-tool');
    if (!b) return;
    UI.mode = UI.mode === b.dataset.mode ? 'interact' : b.dataset.mode;
    tools.querySelectorAll('.god-tool').forEach((x) =>
      x.classList.toggle('god-tool-active', x.dataset.mode === UI.mode));
    document.body.style.cursor = UI.mode === 'interact' ? '' : 'crosshair';
    hint.style.display = UI.mode === 'interact' ? 'none' : '';
  });
  hud.appendChild(tools);
  const hint = document.createElement('div');
  hint.className = 'god-hint';
  hint.textContent = 'click the water to place';
  hint.style.display = 'none';
  hud.appendChild(hint);

  const slide = document.getElementById('slide');
  let drag = null; // {id, item}
  slide.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.creature');
    if (g && UI.mode === 'interact' && e.button === 0) {
      drag = { id: g.dataset.id, moved: false, x: e.clientX, y: e.clientY };
      document.body.classList.add('grabbing');
    }
  });
  slide.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (e.buttons === 0) { drag = null; document.body.classList.remove('grabbing'); return; } // pointerup landed on a HUD element
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
    if (!drag.moved) return;
    const c = App.world.creatures[drag.id];
    c.pos = View.norm(e.clientX, e.clientY);
    c.intent = { verb: 'idle' };
  });
  slide.addEventListener('pointerup', (e) => {
    if (drag && drag.moved) {
      const c = App.world.creatures[drag.id];
      Net.physics([{ id: drag.id, pos: c.pos }]);
      Net.input({ type: 'god-drag', id: drag.id, to: c.pos });
      UI.speak(c, 'onDrop'); // creatures react to being relocated
      drag = null;
      document.body.classList.remove('grabbing');
      return;
    }
    drag = null;
    if (UI.mode === 'interact') { document.body.classList.remove('grabbing'); return; }
    if (e.target.closest('.god-tools') || e.target.closest('.specimen-tag')) return;
    const pos = View.norm(e.clientX, e.clientY);
    if (UI.mode === 'feed') { Sim.bloom(pos[0], pos[1], 20); UI.pulse(pos[0], pos[1], '#a1794a'); Net.input({ type: 'god-food', pos }); }
    if (UI.mode === 'hazard') { Sim.setHazard(pos[0], pos[1]); UI.pulse(pos[0], pos[1], '#5e2a52'); Net.input({ type: 'god-hazard', pos }); }
    UI.mode = 'interact';
    document.body.style.cursor = '';
    hint.style.display = 'none';
    document.querySelectorAll('.god-tool').forEach((x) => x.classList.remove('god-tool-active'));
  });
};

UI.marginNote = function marginNote(text) {
  const box = document.getElementById('margin-notes');
  const note = document.createElement('div');
  note.className = 'margin-note';
  note.textContent = text;
  note.addEventListener('click', UI.openChronicle);
  box.prepend(note);
  while (box.children.length > 6) box.lastChild.remove();
};

UI.openChronicle = function openChronicle() {
  document.querySelector('.chronicle-overlay')?.remove();
  const ov = document.createElement('div');
  ov.className = 'chronicle-overlay';
  const rows = (App.world.chronicle || [])
    .map((e) => `<div class="chronicle-row"><span class="chronicle-t">${
      new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }</span> ${esc(e.text)}</div>`).join('');
  ov.innerHTML = `<div class="chronicle-paper">
    <button class="tag-close" type="button">×</button>
    <div class="tag-name">Chronicle — Slide No. ${esc(App.world.meta.slideNo)}</div>
    <div class="chronicle-list">${rows || '<em>Nothing observed yet.</em>'}</div></div>`;
  ov.querySelector('.tag-close').addEventListener('click', () => ov.remove());
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.getElementById('hud').appendChild(ov);
  ov.querySelector('.chronicle-list').scrollTop = 1e9;
};

// ---- Chatter: page-side conversation engine ---------------------------------
// The page owns the CADENCE of small talk (proximity turn-taking, approach
// visits, poke/drop reactions); the director owns the CONTENT via each
// creature's `voice` bank (the `voice` command). Defaults cover creatures the
// director hasn't voiced yet. Templates: {name} (partner), {mood}, {energy}.
UI.chatterDefaults = {
  greetings: ['The water is thick today, {name}.', 'Ah. You again.', 'You drift far from your patch, {name}.'],
  replies: ['Mm. So they say.', 'Perhaps. Perhaps not.', 'I was thinking the same.', 'Keep your distance and say that.'],
  musings: ['The snow falls and falls.', 'Something watches. I feel it.'],
  onDrop: ['Put me DOWN— ah. You already did.', 'A strange current, that. I am {mood} about it.'],
};
UI.line = function line(c, kind, partner) {
  if (!c) return null;
  const bank = (c.voice && c.voice[kind] && c.voice[kind].length ? c.voice[kind] : UI.chatterDefaults[kind]) || [];
  if (!bank.length) return null;
  return bank[Math.floor(Math.random() * bank.length)]
    .replaceAll('{name}', partner ? partner.name : 'friend')
    .replaceAll('{mood}', c.mood || 'calm')
    .replaceAll('{energy}', `${Math.round((c.energy || 0) * 100)}%`);
};
UI.speak = function speak(c, kind, partner) {
  const text = UI.line(c, kind, partner);
  if (text) UI.bubble(c, text);
};
UI.initChatter = function initChatter() {
  const S = { convo: null, approach: null, cooldown: {}, lastApproach: 0, lastMuse: 0 };
  UI.chatterState = S;
  const get = (id) => App.world && App.world.creatures[id];
  const dist = (a, b) => Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]);
  const pairKey = (x, y) => [x, y].sort().join('~');
  setInterval(() => {
    if (!App.world) return;
    const cs = Object.values(App.world.creatures);
    const now = Date.now();

    // a story is performing: hold all ambient chatter so the narrative reads clean.
    // failsafe: if the story flag sticks (crashed player) but no commands arrive for 2min, resume.
    if (App.world.story && now - (App.lastCmdAt || 0) < 120000) { S.convo = null; S.approach = null; return; }

    if (S.convo) {
      const a = get(S.convo.a), b = get(S.convo.b);
      if (!a || !b || dist(a, b) > 0.22) { S.convo = null; return; } // drifted apart mid-talk
      if (now >= S.convo.nextAt) {
        const speaker = S.convo.turn % 2 === 0 ? a : b;
        UI.speak(speaker, S.convo.turn === 0 ? 'greetings' : 'replies', speaker === a ? b : a);
        S.convo.turn++;
        S.convo.nextAt = now + 8000; // 5s on screen + 3s pause, taking turns
        if (S.convo.turn >= S.convo.maxTurns) {
          if (Math.random() < 0.3) b.intent = { verb: 'move-to', target: [...a.pos] }; // sometimes one follows
          else a.intent = { verb: 'move-to', target: [
            Math.min(0.95, Math.max(0.05, a.pos[0] + (Math.random() - 0.5) * 0.3)),
            Math.min(0.9, Math.max(0.1, a.pos[1] + (Math.random() - 0.5) * 0.3))] };
          S.cooldown[pairKey(a.id, b.id)] = now + 25000 + Math.random() * 25000;
          S.convo = null;
        }
      }
      return;
    }

    // two creatures close together and off cooldown -> strike up a conversation
    const shy = (c) => ((c.attributes && c.attributes.skittish) || 0) > 0.5; // skittish creatures flee, not chat
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        if (shy(cs[i]) || shy(cs[j])) continue;
        if (dist(cs[i], cs[j]) > 0.14) continue;
        if ((S.cooldown[pairKey(cs[i].id, cs[j].id)] || 0) > now) continue;
        cs[i].intent = { verb: 'idle' };
        cs[j].intent = { verb: 'idle' };
        S.convo = { a: cs[i].id, b: cs[j].id, turn: 0, nextAt: now + 800, maxTurns: 4 + Math.floor(Math.random() * 3) };
        S.approach = null;
        return;
      }
    }

    // otherwise occasionally send someone across the slide to visit someone
    if (!S.approach && now - S.lastApproach > 20000 && cs.length > 1) {
      const social = cs.filter((x) => !shy(x));
      const a = social[Math.floor(Math.random() * social.length)];
      const others = a ? cs.filter((x) => x !== a && !shy(x) && (S.cooldown[pairKey(a.id, x.id)] || 0) <= now) : [];
      if (others.length) {
        S.approach = { a: a.id, b: others[Math.floor(Math.random() * others.length)].id };
        S.lastApproach = now;
      }
    }
    if (S.approach) {
      const a = get(S.approach.a), b = get(S.approach.b);
      if (!a || !b) { S.approach = null; return; }
      if (dist(a, b) <= 0.13) S.approach = null; // close enough: the proximity rule takes over
      else a.intent = { verb: 'move-to', target: [...b.pos] };
    }

    // rare solo muttering so a lone creature still feels alive
    if (now - S.lastMuse > 40000 && Math.random() < 0.4 && cs.length) {
      UI.speak(cs[Math.floor(Math.random() * cs.length)], 'musings');
      S.lastMuse = now;
    }
  }, 1000);
};

UI.initPresence = function initPresence() {
  const dot = document.createElement('div');
  dot.className = 'director-dot';
  dot.title = 'the director is away';
  document.getElementById('hud').appendChild(dot);
  setInterval(() => {
    const here = Date.now() - App.lastDirector < 30000;
    dot.classList.toggle('director-here', here);
    dot.title = here ? 'the director is attending' : 'the director is away';
  }, 2000);
};
