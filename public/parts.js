// Parts library — creatures are data (chassis specs), rendered from these primitives.
const SVGNS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
function stain(v, c) {
  if (typeof v === 'string' && v.startsWith('$')) return (c.stains || {})[v.slice(1)] || '#8a7350';
  return v;
}
function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PARTS = {
  gooBody(g, p, c) {
    const grp = el('g', { filter: 'url(#goo)', opacity: p.opacity ?? 0.32, class: 'part-goo-body' }, g);
    const r = p.r ?? 40;
    const fill = stain(p.fill ?? '$body', c);
    el('circle', { cx: 0, cy: 0, r, fill }, grp);
    const n = p.lobes ?? 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI + (p.angle ?? 0.5);
      el('circle', {
        cx: Math.cos(a) * r * 0.75, cy: Math.sin(a) * r * 0.75,
        r: r * (0.4 + 0.12 * (i % 3)), fill, class: `mc-a${(i % 4) + 1}`,
      }, grp);
    }
    for (let i = 0; i < (p.pods ?? 1); i++) {
      el('circle', {
        cx: r * 0.6 * (i % 2 ? -1 : 1), cy: r * 0.2, r: r * 0.22, fill,
        class: i % 2 ? 'mc-podw' : 'mc-pode',
      }, grp);
    }
  },
  ring(g, p, c) {
    const r = el('circle', {
      cx: 0, cy: 0, r: p.r, fill: 'none', stroke: stain(p.stroke ?? '$body', c),
      'stroke-opacity': 0.75, 'stroke-width': p.width ?? 2, 'stroke-dasharray': p.dash ?? '5 4',
      class: `tb part-ring ${p.dur < 0 ? 'mc-spin-r' : 'mc-spin'}`,
    }, g);
    r.style.animationDuration = `${Math.abs(p.dur ?? 20)}s`;
  },
  core(g, p, c) {
    const fill = stain(p.fill ?? '$accent', c);
    const halo = el('circle', { cx: 0, cy: 0, r: (p.r ?? 6) * 2, fill, 'fill-opacity': 0.25, class: 'part-core-halo' }, g);
    halo.style.filter = 'blur(4px)';
    el('circle', { cx: 0, cy: 0, r: p.r ?? 6, fill, class: 'tb mc-core part-core' }, g);
    el('circle', { cx: 0, cy: 0, r: (p.r ?? 6) * 0.4, fill: '#fdf8ea' }, g);
  },
  orbiter(g, p, c) {
    const grp = el('g', { class: 'tb mc-spin part-orbiter' }, g);
    grp.style.animationDuration = `${p.dur ?? 16}s`;
    const d = p.dist ?? 32, s = p.size ?? 10;
    if (p.shape === 'tri') {
      el('polygon', {
        points: `${d},${-s / 2} ${d + s},${s / 2} ${d - s},${s / 2}`,
        fill: stain(p.fill ?? '$accent', c), 'fill-opacity': 0.5,
      }, grp);
    } else {
      el('rect', {
        x: d - s / 2, y: -s / 2, width: s, height: s, fill: 'none',
        stroke: stain(p.stroke ?? '$body', c), 'stroke-opacity': 0.7, 'stroke-width': 1.5,
      }, grp);
    }
  },
  eye(g, p, c) {
    const wrap = el('g', { class: 'tb mc-blink part-eye' }, g);
    wrap.style.animationDelay = `${p.phase ?? 0}s`;
    el('ellipse', {
      cx: p.x ?? 0, cy: p.y ?? 0, rx: p.r ?? 10, ry: (p.r ?? 10) * 0.88,
      fill: '#f8f2e2', stroke: 'rgba(90,60,40,.5)', 'stroke-width': 1,
    }, wrap);
    const look = el('g', { class: 'mc-look' }, wrap);
    look.style.animationDelay = `${(p.phase ?? 0) * 1.6}s`;
    el('circle', { cx: p.x ?? 0, cy: p.y ?? 0, r: (p.r ?? 10) * 0.48, fill: stain(p.iris ?? '$accent', c) }, look);
    el('circle', { cx: p.x ?? 0, cy: p.y ?? 0, r: (p.r ?? 10) * 0.22, fill: '#241a10' }, look);
  },
  eyes(g, p, c) {
    const rng = mulberry32(hash(c.id));
    const n = p.count ?? 5, spread = p.spread ?? 26;
    const IRIS = ['$accent', '#a1794a', '#4a3f96', '#a13a63', '#2e8b74'];
    for (let i = 0; i < n; i++) {
      const a = rng() * 2 * Math.PI, d = spread * Math.sqrt(rng());
      PARTS.eye(g, {
        x: Math.cos(a) * d, y: Math.sin(a) * d, r: Math.max(5, 13 - i * 1.8),
        iris: IRIS[i % IRIS.length], phase: -rng() * 5,
      }, c);
    }
  },
  cilia(g, p, c) {
    el('ellipse', {
      cx: 0, cy: 0, rx: p.rx ?? 66, ry: p.ry ?? 42, fill: 'none',
      stroke: stain(p.stroke ?? '$body', c), 'stroke-opacity': 0.45, 'stroke-width': 6,
      'stroke-dasharray': '1.5 4.5', class: 'tb mc-cilia part-cilia',
    }, g);
  },
  flagella(g, p, c) {
    const grp = el('g', { class: 'mc-flagwob part-flagella' }, g);
    const stroke = stain(p.stroke ?? '$body', c);
    for (let i = 0; i < (p.count ?? 2); i++) {
      const y = -6 + i * 12;
      const path = el('path', {
        d: `M-34,${y} C -62,${y - 14} -74,${y + 14} -100,${y + 6}`,
        fill: 'none', stroke, 'stroke-opacity': 0.6, 'stroke-width': 2,
        'stroke-dasharray': '3 3', class: 'mc-flag',
      }, grp);
      path.style.animationDelay = `${-i * 0.4}s`;
    }
  },
  ribbonSkirt(g, p, c) {
    const fill = stain(p.fill ?? '$body', c);
    const sway = el('g', { class: 'tb mc-sway part-ribbon-skirt' }, g);
    const goo = el('g', { filter: 'url(#goo)', opacity: 0.32 }, sway);
    el('circle', { cx: 0, cy: -24, r: p.r ?? 30, fill }, goo);
    el('circle', { cx: -16, cy: -17, r: 19, fill }, goo);
    el('circle', { cx: 16, cy: -17, r: 19, fill }, goo);
    const hem = p.hem ?? 5;
    for (let i = 0; i < hem; i++) {
      const x = -26 + (52 / (hem - 1)) * i;
      const h = el('circle', { cx: x, cy: 6, r: 9, fill, class: 'mc-wv' }, goo);
      h.style.animationDelay = `${-i * 0.4}s`;
    }
    for (let i = 0; i < (p.ribbons ?? 3); i++) {
      const x = -18 + i * 18;
      const rb = el('path', {
        d: `M${x},10 C ${x - 6},32 ${x + 6},52 ${x - 2},76`, fill: 'none',
        stroke: fill, 'stroke-opacity': 0.5, 'stroke-width': 2,
        'stroke-dasharray': '4 4', class: 'mc-ribbon',
      }, sway);
      rb.style.animationDelay = `${-i * 0.45}s`;
    }
  },
  waveChain(g, p, c) {
    const fill = stain(p.fill ?? '$body', c);
    const n = p.segments ?? 7, r = p.r ?? 14;
    const grp = el('g', { filter: 'url(#goo)', opacity: p.opacity ?? 0.3, class: 'part-wave-chain' }, g);
    for (let i = 0; i < n; i++) {
      const cx = (i - (n - 1) / 2) * r * 1.65;
      const taper = 1 - 0.3 * Math.abs(i - (n - 1) / 2) / n;
      const seg = el('circle', { cx, cy: 0, r: r * taper, fill, class: 'mc-wv' }, grp);
      seg.style.animationDelay = `${-i * 0.35}s`;
      const nuc = el('circle', { cx, cy: 0, r: 3, fill, 'fill-opacity': 0.9, class: 'mc-wv' }, g);
      nuc.style.animationDelay = `${-i * 0.35}s`;
    }
  },
  swarm(g, p, c) {
    const rng = mulberry32(hash(c.id));
    const fill = stain(p.fill ?? '$body', c);
    const R = p.r ?? 46;
    el('ellipse', {
      cx: 0, cy: 0, rx: R * 1.25, ry: R * 0.95, fill: 'none', stroke: 'rgba(138,115,80,.3)',
      'stroke-width': 1, 'stroke-dasharray': '2 6', class: 'tb mc-halo part-swarm-halo',
    }, g);
    const grp = el('g', { class: 'tb mc-halo part-swarm' }, g);
    grp.style.animationDuration = '9s';
    for (let i = 0; i < (p.count ?? 18); i++) {
      const a = rng() * 2 * Math.PI, d = R * Math.sqrt(rng());
      const dot = el('circle', {
        cx: Math.cos(a) * d, cy: Math.sin(a) * d * 0.8, r: 1.4 + rng() * 1.2,
        fill, class: `mc-d${(i % 3) + 1}`,
      }, grp);
      dot.style.animationDelay = `${-rng() * 5}s`;
    }
    el('circle', { cx: 0, cy: 0, r: 4, fill: stain(p.heart ?? '$accent', c), class: 'tb mc-core' }, grp);
  },
  stalkLure(g, p, c) {
    const fill = stain(p.fill ?? '$body', c);
    const glow = stain(p.glow ?? '$accent', c);
    const goo = el('g', { filter: 'url(#goo)', opacity: 0.34, class: 'part-stalk' }, g);
    el('circle', { cx: 26, cy: -28, r: 9, fill }, goo);
    el('circle', { cx: 38, cy: -40, r: 7, fill }, goo);
    el('circle', { cx: 48, cy: -50, r: 6, fill }, goo);
    const halo = el('circle', { cx: 57, cy: -58, r: 10, fill: glow, 'fill-opacity': 0.3, class: 'part-lure-halo' }, g);
    halo.style.filter = 'blur(3px)';
    el('circle', { cx: 57, cy: -58, r: 5, fill: glow, class: 'tb mc-core part-lure' }, g);
    el('circle', { cx: 57, cy: -58, r: 2, fill: '#fdf3d6' }, g);
  },
  nucleus(g, p, c) {
    el('ellipse', {
      cx: p.x ?? 0, cy: p.y ?? 0, rx: p.rx ?? 15, ry: p.ry ?? 11,
      fill: stain(p.fill ?? '$body', c), 'fill-opacity': 0.8, class: 'tb mc-halo part-nucleus',
    }, g);
  },
  grain(g, p, c) {
    el('circle', {
      cx: p.x ?? 10, cy: p.y ?? 10, r: p.r ?? 4,
      fill: stain(p.fill ?? '#a1794a', c), 'fill-opacity': 0.9, class: 'part-grain',
    }, g);
  },
  vacuole(g, p, c) {
    el('circle', {
      cx: p.x ?? -12, cy: p.y ?? -8, r: p.r ?? 9, fill: stain(p.fill ?? '$accent', c),
      'fill-opacity': 0.12, stroke: stain(p.stroke ?? '$accent', c), 'stroke-opacity': 0.6,
      'stroke-width': 1.5, class: 'part-vacuole',
    }, g);
  },
};

// The six built-in body plans. Runtime `define-chassis` commands extend this map.
const CHASSIS = {
  reactor: { parts: [
    { type: 'gooBody', r: 40, lobes: 4, pods: 1, opacity: 0.3 },
    { type: 'ring', r: 22, dash: '5 4', dur: 22 },
    { type: 'ring', r: 13, dash: '2 3', dur: -13, stroke: '$accent', width: 1.5 },
    { type: 'core', r: 6 },
    { type: 'orbiter', shape: 'rect', dist: 34, size: 10, dur: 16 },
    { type: 'orbiter', shape: 'tri', dist: 28, size: 9, dur: 24 },
  ] },
  swimmer: { orient: true, parts: [
    { type: 'cilia', rx: 66, ry: 42 },
    { type: 'gooBody', r: 34, lobes: 3, pods: 1, angle: 0, opacity: 0.34 },
    { type: 'flagella', count: 2 },
    { type: 'nucleus', rx: 15, ry: 11 },
    { type: 'grain', x: 34, y: -8, r: 3.5, fill: '#3c281e' },
  ] },
  medusa: { parts: [
    { type: 'ribbonSkirt', r: 30, hem: 5, ribbons: 3 },
    { type: 'nucleus', y: -26, rx: 12, ry: 9 },
    { type: 'grain', x: -14, y: -32, r: 3.5 },
  ] },
  watch: { parts: [
    { type: 'gooBody', r: 38, lobes: 4, pods: 0, opacity: 0.3 },
    { type: 'eyes', count: 5, spread: 26 },
  ] },
  salp: { orient: true, parts: [
    { type: 'waveChain', segments: 7, r: 14 },
  ] },
  murmuration: { parts: [
    { type: 'swarm', count: 18, r: 46 },
  ] },
};

function renderCreature(c, layer) {
  const g = el('g', { class: 'creature', 'data-id': c.id }, layer);
  const aura = el('ellipse', {
    class: 'aura', cx: 0, cy: 0, rx: 58, ry: 46,
    fill: c.tint || '#000', 'fill-opacity': 0.16, display: c.tint ? '' : 'none',
  }, g);
  aura.style.filter = 'blur(6px)';
  // invisible hit disc: sparse chassis (murmuration dots, salp gaps) are otherwise nearly ungrabbable
  el('circle', { cx: 0, cy: 0, r: 62, fill: 'none', 'pointer-events': 'all', class: 'hit-area' }, g);
  const spec = c.chassisSpec || CHASSIS[c.chassis] || CHASSIS.watch;
  for (const part of spec.parts) {
    if (PARTS[part.type]) PARTS[part.type](g, part, c);
  }
  g.dataset.mood = c.mood || 'calm';
  return g;
}
function setTint(g, color) {
  const aura = g.querySelector('.aura');
  if (!color) { aura.setAttribute('display', 'none'); return; }
  aura.setAttribute('fill', color);
  aura.removeAttribute('display');
}
