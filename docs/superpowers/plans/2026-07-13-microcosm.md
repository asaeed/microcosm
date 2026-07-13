# Microcosm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser petri-dish world of AI-driven blob creatures — the page is a stage, a stdlib Node server is the state hub, and a live Claude Code session is the director that decides everything creatures do and say.

**Architecture:** Three parts: `server.js` (Node stdlib HTTP: static files, canonical world state, SSE relay, disk persistence), a static page (SVG stage: goo-rendered creatures from data-defined chassis, page-owned physics/motes/energy), and the director protocol (`GET /state` → think → `POST /act`). One amendment to the spec's "single index.html": the page is split into several plain `<script>` files (no build step, same no-framework constraint) so each file stays small enough to hold in context.

**Tech Stack:** Node ≥ 18 (stdlib only, `node:test` for tests), vanilla JS, SVG + CSS animations, SSE. Zero npm dependencies.

**Spec:** `docs/superpowers/specs/2026-07-13-microcosm-design.md` (read it first).

## Global Constraints

- Node ≥ 18; **zero npm dependencies**; no build step; no framework.
- Server port **4380** (`PORT` env overrides). Save file `world.json` (`MICROCOSM_SAVE` env overrides — tests rely on this).
- All world positions are **normalized [0..1] × [0..1]**; only the page converts to pixels.
- Palette tokens (exact): ink `#4a3a26`, ink-soft `#6a563c`, label `#8a7350`, paper `#fffdf4`, paper-edge `#c9b489`, rose `#a13a63`, violet `#4a3f96`, cerulean `#33608f`, verdigris `#2e8b74`, ochre `#a1794a`, plum `#5e2a52`, clay `#96504f`. Parchment background: `radial-gradient(circle at 50% 45%, #fbf6ea 0%, #f3ead6 55%, #e6d8bd 90%, #d9c8a6 100%)`.
- Serif UI: `Georgia, 'Times New Roman', serif`. No emoji anywhere in UI copy.
- `class`/`className` on every major element (spec requirement, aids devtools).
- **No death, no reproduction** mechanics anywhere.
- Creature appearance must be **deterministic per creature id** (seeded PRNG, not `Math.random()`).
- Script load order in `index.html`: `parts.js` → `sim.js` → `net.js` → `ui.js` → inline app glue.
- Commit locally after each task; **never push**.
- Reference mockups (visual source of truth for keyframes/geometry): `.superpowers/brainstorm/81041-1783902203/content/final-cast.html` and `chronicle.html` in this repo (gitignored but present locally).

## File Structure

```
microcosm/
├── server.js                 # state hub: static, /state /input /act /physics, SSE, persistence
├── test/server.test.js       # node:test HTTP tests
├── test/sim.test.js          # node:test pure-function tests
├── public/
│   ├── index.html            # DOM shell, CSS, SVG defs (#goo), layers, app glue <script>
│   ├── parts.js              # el/stain/hash/rng helpers, PARTS library, CHASSIS presets, renderCreature
│   ├── sim.js                # pure fns (steerVec, nearestMote, energyTick, hazardPush) + Sim engine
│   ├── net.js                # Net: snapshot/input/physics/listen (SSE)
│   ├── ui.js                 # creation bar, specimen-tag popover, god tools, chronicle notes, presence dot
│   └── gallery.html          # dev page: renders all chassis presets + one custom spec
├── director/PROTOCOL.md      # the director's operating manual (endpoints, verbs, parts, style)
├── director-notes.md         # director memory (created at first run; template in Task 8)
├── scripts/demo.sh           # curl smoke-director: spawns a scene without Claude
├── README.md
└── world.json                # runtime save (gitignored)
```

---

### Task 1: Server — state hub, commands, SSE, persistence

**Files:**
- Create: `server.js`
- Test: `test/server.test.js`
- Modify: `.gitignore` (add `world.json`)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: HTTP API used by every later task —
  - `GET /` and static files from `public/`
  - `GET /events` — SSE; on connect emits `event: snapshot` with full world JSON; later emits `event: commands` (array of applied commands) and `event: director` (`{t}` ms timestamp whenever the director consumes state)
  - `GET /state[?consume=1]` — `{world, inputs}`; `consume=1` empties the input queue
  - `POST /input` — body is any JSON object; queued with an ISO `t` stamp; 204
  - `POST /act` — `{commands: [...]}` → `{results: [{ok} | {ok:false,error}]}`; applied commands broadcast + persisted
  - `POST /physics` — `{updates: [{id, pos?, energy?}]}`; merged silently; 204
  - Command set (exact): `spawn`, `define-chassis`, `move-to`, `forage`, `idle`, `say`, `emote`, `tint`, `set-attribute`, `give`, `build`, `chronicle`, `world`

- [ ] **Step 1: Write the failing tests**

```js
// test/server.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
process.env.MICROCOSM_SAVE = path.join(os.tmpdir(), `microcosm-test-${process.pid}.json`);
const { server } = require('../server.js');
let base;

before(() => new Promise((r) => server.listen(0, () => {
  base = `http://localhost:${server.address().port}`; r();
})));
after(() => server.close());

const post = (p, body) => fetch(base + p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const state = async (q = '') => (await fetch(`${base}/state${q}`)).json();

test('input queues, consume clears', async () => {
  await post('/input', { type: 'create', prompt: 'a preacher' });
  let s = await state('?consume=1');
  assert.equal(s.inputs.length, 1);
  assert.equal(s.inputs[0].prompt, 'a preacher');
  assert.ok(s.inputs[0].t);
  s = await state();
  assert.equal(s.inputs.length, 0);
});

const CREATURE = {
  id: 'c1', name: 'Testling', epithet: 'T. testus', prompt: 'a test subject',
  chassis: 'reactor', chassisSpec: null, stains: { body: '#a13a63', accent: '#2e8b74' },
  scale: 1, attributes: {}, pos: [0.5, 0.5], energy: 0.8,
  intent: { verb: 'idle' }, mood: 'calm', tint: null,
};

test('act mutates world; unknown cmd errors without aborting batch', async () => {
  const r = await (await post('/act', { commands: [
    { cmd: 'spawn', creature: CREATURE },
    { cmd: 'set-attribute', id: 'c1', name: 'gullibility', value: 0.8 },
    { cmd: 'nope' },
    { cmd: 'emote', id: 'missing', mood: 'sad' },
    { cmd: 'chronicle', text: 'Testling emerges.' },
  ] })).json();
  assert.deepEqual(r.results.map((x) => x.ok), [true, true, false, false, true]);
  const s = await state();
  assert.equal(s.world.creatures.c1.attributes.gullibility, 0.8);
  assert.equal(s.world.chronicle.at(-1).text, 'Testling emerges.');
});

test('give transfers bounded energy; build accretes structures', async () => {
  await post('/act', { commands: [
    { cmd: 'spawn', creature: { ...CREATURE, id: 'c2', energy: 0.2 } },
    { cmd: 'give', from: 'c1', to: 'c2', amount: 0.3 },
    { cmd: 'build', structureId: 's1', id: 'c1', name: 'Chapel', blob: [0.4, 0.4, 0.03] },
    { cmd: 'build', structureId: 's1', id: 'c2', blob: [0.42, 0.4, 0.02] },
  ] });
  const s = await state();
  assert.ok(Math.abs(s.world.creatures.c2.energy - 0.5) < 1e-9);
  assert.equal(s.world.structures.s1.name, 'Chapel');
  assert.equal(s.world.structures.s1.blobs.length, 2);
  assert.deepEqual(s.world.structures.s1.builders, ['c1', 'c2']);
});

test('SSE: snapshot on connect, then commands', async () => {
  const res = await fetch(`${base}/events`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const readEvent = async () => {
    while (!buf.includes('\n\n')) buf += dec.decode((await reader.read()).value);
    const i = buf.indexOf('\n\n');
    const raw = buf.slice(0, i); buf = buf.slice(i + 2);
    return raw;
  };
  assert.match(await readEvent(), /event: snapshot/);
  await post('/act', { commands: [{ cmd: 'chronicle', text: 'sse works' }] });
  const ev = await readEvent();
  assert.match(ev, /event: commands/);
  assert.match(ev, /sse works/);
  await reader.cancel();
});

test('persists to disk (debounced) and would reload', async () => {
  await new Promise((r) => setTimeout(r, 600));
  const saved = JSON.parse(require('fs').readFileSync(process.env.MICROCOSM_SAVE, 'utf8'));
  assert.ok(saved.creatures.c1);
  assert.ok(saved.chronicle.length >= 1);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd ~/claude/microcosm && node --test test/server.test.js`
Expected: FAIL — `Cannot find module '../server.js'`

- [ ] **Step 3: Implement `server.js`**

```js
#!/usr/bin/env node
// Microcosm state hub. Stdlib only. The browser is the stage; the Claude session is the director.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4380;
const PUB = path.join(__dirname, 'public');
const SAVE = process.env.MICROCOSM_SAVE || path.join(__dirname, 'world.json');

const DEFAULT_WORLD = () => ({
  creatures: {},
  structures: {},
  chassis: {},   // runtime-defined chassis; built-in presets live in public/parts.js
  vents: [{ pos: [0.22, 0.72], period: 45 }, { pos: [0.78, 0.3], period: 70 }],
  hazards: [],
  chronicle: [],
  meta: { slideNo: 1, createdAt: new Date().toISOString() },
});
let world = DEFAULT_WORLD();
try { world = { ...DEFAULT_WORLD(), ...JSON.parse(fs.readFileSync(SAVE, 'utf8')) }; } catch {}

let inputs = [];
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFileSync(SAVE, JSON.stringify(world)), 400);
}

const clients = new Set();
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

function creature(id) {
  const c = world.creatures[id];
  if (!c) throw new Error(`unknown creature: ${id}`);
  return c;
}

const CMDS = {
  spawn: (a) => { world.creatures[a.creature.id] = a.creature; },
  'define-chassis': (a) => { world.chassis[a.id] = a.spec; },
  'move-to': (a) => { creature(a.id).intent = { verb: 'move-to', target: a.target }; },
  forage: (a) => { creature(a.id).intent = { verb: 'forage' }; },
  idle: (a) => { creature(a.id).intent = { verb: 'idle' }; },
  say: (a) => { creature(a.id); }, // validates id; speech is ephemeral, carried by the broadcast
  emote: (a) => { creature(a.id).mood = a.mood; },
  tint: (a) => { creature(a.id).tint = a.color; },
  'set-attribute': (a) => { creature(a.id).attributes[a.name] = a.value; },
  give: (a) => {
    const from = creature(a.from), to = creature(a.to);
    const amt = Math.min(a.amount, from.energy);
    from.energy -= amt;
    to.energy = Math.min(1, to.energy + amt);
  },
  build: (a) => {
    const s = (world.structures[a.structureId] ??= {
      name: a.name || 'structure', blobs: [], tint: a.tint || '#8a7350', builders: [],
    });
    if (a.name) s.name = a.name;
    if (a.blob) s.blobs.push(a.blob);
    if (a.id && !s.builders.includes(a.id)) s.builders.push(a.id);
  },
  chronicle: (a) => { world.chronicle.push({ t: new Date().toISOString(), text: a.text }); },
  world: (a) => { for (const k of ['vents', 'hazards']) if (a[k]) world[k] = a[k]; },
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (d) => { b += d; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
  });
}
function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive',
      });
      res.write(`event: snapshot\ndata: ${JSON.stringify(world)}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/state') {
      const out = { world, inputs };
      if (url.searchParams.get('consume') === '1') {
        inputs = [];
        broadcast('director', { t: Date.now() });
      }
      return json(res, 200, out);
    }
    if (req.method === 'POST' && url.pathname === '/input') {
      inputs.push({ t: new Date().toISOString(), ...(await readBody(req)) });
      res.writeHead(204);
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/act') {
      const { commands = [] } = await readBody(req);
      const applied = [];
      const results = commands.map((c) => {
        try {
          if (!CMDS[c.cmd]) throw new Error(`unknown cmd: ${c.cmd}`);
          CMDS[c.cmd](c);
          applied.push(c);
          return { ok: true };
        } catch (e) { return { ok: false, error: e.message }; }
      });
      if (applied.length) { broadcast('commands', applied); persist(); }
      return json(res, 200, { results });
    }
    if (req.method === 'POST' && url.pathname === '/physics') {
      const { updates = [] } = await readBody(req);
      for (const u of updates) {
        const c = world.creatures[u.id];
        if (!c) continue;
        if (u.pos) c.pos = u.pos;
        if (u.energy != null) c.energy = u.energy;
      }
      persist();
      res.writeHead(204);
      return res.end();
    }
    const file = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) { json(res, 400, { error: e.message }); }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`microcosm slide ready: http://localhost:${PORT}`));
}
module.exports = { server };
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test test/server.test.js`
Expected: `# pass 5`, `# fail 0`

- [ ] **Step 5: Add `world.json` to `.gitignore` and commit**

Append `world.json` on its own line to `.gitignore`. Then:

```bash
git add server.js test/server.test.js .gitignore
git commit -m "feat: state-hub server with command verbs, SSE, persistence"
```

---

### Task 2: Page shell + Net wiring

**Files:**
- Create: `public/index.html`, `public/net.js`
- Create (stubs so script tags resolve): `public/parts.js`, `public/sim.js`, `public/ui.js` (each just `// filled in by a later task`)

**Interfaces:**
- Consumes: server HTTP API (Task 1).
- Produces (later tasks rely on these exact names):
  - `Net.input(obj)`, `Net.physics(updatesArray)`, `Net.listen({onSnapshot, onCommands, onDirector})`
  - DOM: `svg#slide` containing `defs` with filter `#goo`, layer groups `g#structures`, `g#motes`, `g#creatures`; HTML overlays `div#bubbles`, `div#margin-notes`, `div#hud`
  - `View.px([x,y]) -> [px,py]`, `View.norm(px,py) -> [x,y]` (defined inline in index.html)
  - CSS keyframes usable by parts: `mc-l1..4`, `mc-pod-e`, `mc-pod-w`, `mc-spin`, `mc-spin-r`, `mc-pulse`, `mc-wobble`, `mc-breathe`, `mc-ripple`, `mc-sway`, `mc-wave`, `mc-blink`, `mc-look`, `mc-j1..3` and classes `.tb`, `.mc-a1..4`, `.mc-pode/.mc-podw`, `.mc-spin/.mc-spin-r`, `.mc-core`, `.mc-cilia`, `.mc-flag`, `.mc-flagwob`, `.mc-sway`, `.mc-wv`, `.mc-ribbon`, `.mc-blink`, `.mc-look`, `.mc-halo`, `.mc-d1..3`

- [ ] **Step 1: Write `public/net.js`**

```js
// Net — the page's only talk-path to the server. Plain global, no modules (no build step).
const Net = {
  input(data) {
    return fetch('/input', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
  },
  physics(updates) {
    return fetch('/physics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }),
    });
  },
  listen({ onSnapshot, onCommands, onDirector }) {
    const es = new EventSource('/events'); // auto-reconnects
    es.addEventListener('snapshot', (e) => onSnapshot(JSON.parse(e.data)));
    es.addEventListener('commands', (e) => onCommands(JSON.parse(e.data)));
    es.addEventListener('director', (e) => onDirector && onDirector(JSON.parse(e.data)));
    return es;
  },
};
```

- [ ] **Step 2: Write `public/index.html`**

The shell: parchment page, SVG stage with goo filter + graticule, HTML overlays, all shared keyframes (ported verbatim from the `final-cast.html` mockup, renamed `p-*` → `mc-*`), and the app glue that will grow in later tasks. Complete file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Microcosm</title>
<style>
  :root {
    --ink: #4a3a26; --ink-soft: #6a563c; --label: #8a7350;
    --paper: #fffdf4; --paper-edge: #c9b489;
    --rose: #a13a63; --violet: #4a3f96; --cerulean: #33608f; --verdigris: #2e8b74;
    --ochre: #a1794a; --plum: #5e2a52; --clay: #96504f;
  }
  html, body { height: 100%; }
  body {
    margin: 0; overflow: hidden; color: var(--ink);
    font-family: Georgia, 'Times New Roman', serif;
    background: radial-gradient(circle at 50% 45%, #fbf6ea 0%, #f3ead6 55%, #e6d8bd 90%, #d9c8a6 100%);
  }
  .vignette { position: fixed; inset: 0; pointer-events: none;
    box-shadow: inset 0 0 18vmin rgba(120, 95, 50, .25); }
  #slide { position: fixed; inset: 0; width: 100vw; height: 100vh; }
  .graticule { fill: none; stroke: rgba(90, 70, 40, .18); stroke-dasharray: 4 6; }
  #bubbles, #margin-notes, #hud { position: fixed; }
  #bubbles { inset: 0; pointer-events: none; }
  #margin-notes { top: 12px; right: 12px; bottom: 90px; width: 230px; }
  #hud { inset: 0; pointer-events: none; }
  #hud > * { pointer-events: auto; }

  .tb { transform-box: fill-box; transform-origin: center; }
  @keyframes mc-l1 { to { transform: translate(11px, 8px); } }
  @keyframes mc-l2 { to { transform: translate(-13px, -7px); } }
  @keyframes mc-l3 { to { transform: translate(9px, -11px); } }
  @keyframes mc-l4 { to { transform: translate(-9px, 10px); } }
  @keyframes mc-pod-e { to { transform: translate(50px, -14px); } }
  @keyframes mc-pod-w { to { transform: translate(-44px, 12px); } }
  @keyframes mc-spin { to { transform: rotate(360deg); } }
  @keyframes mc-spin-r { to { transform: rotate(-360deg); } }
  @keyframes mc-pulse { 0%, 100% { opacity: .5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.25); } }
  @keyframes mc-wobble { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
  @keyframes mc-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
  @keyframes mc-ripple { to { stroke-dashoffset: -24; } }
  @keyframes mc-sway { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
  @keyframes mc-wave { to { transform: translateY(-12px); } }
  @keyframes mc-blink { 0%, 90%, 100% { transform: scaleY(1); } 94%, 96% { transform: scaleY(.06); } }
  @keyframes mc-look { 0%, 18% { transform: translate(0, 0); } 28%, 48% { transform: translate(4px, 1px); }
    58%, 78% { transform: translate(-3px, 2px); } 88%, 100% { transform: translate(0, 0); } }
  @keyframes mc-j1 { 0%, 100% { transform: translate(0, 0); } 25% { transform: translate(5px, -3px); }
    50% { transform: translate(1px, -7px); } 75% { transform: translate(-4px, -2px); } }
  @keyframes mc-j2 { 0%, 100% { transform: translate(0, 0); } 25% { transform: translate(-5px, 3px); }
    50% { transform: translate(-1px, 7px); } 75% { transform: translate(4px, 2px); } }
  @keyframes mc-j3 { 0%, 100% { transform: translate(0, 0); } 33% { transform: translate(6px, 2px); }
    66% { transform: translate(-3px, -5px); } }

  .mc-a1 { animation: mc-l1 6.5s ease-in-out infinite alternate; }
  .mc-a2 { animation: mc-l2 8s ease-in-out infinite alternate; }
  .mc-a3 { animation: mc-l3 7s ease-in-out infinite alternate -2s; }
  .mc-a4 { animation: mc-l4 9s ease-in-out infinite alternate -4s; }
  .mc-pode { animation: mc-pod-e 5.5s ease-in-out infinite alternate; }
  .mc-podw { animation: mc-pod-w 6.5s ease-in-out infinite alternate -3s; }
  .mc-spin { animation: mc-spin 20s linear infinite; }
  .mc-spin-r { animation: mc-spin-r 13s linear infinite; }
  .mc-core { animation: mc-pulse 3.2s ease-in-out infinite; }
  .mc-cilia { animation: mc-breathe 4.5s ease-in-out infinite; }
  .mc-flag { animation: mc-ripple 1.1s linear infinite; }
  .mc-flagwob { animation: mc-wobble 3.8s ease-in-out infinite; transform-origin: 100% 50%; }
  .mc-sway { animation: mc-sway 6s ease-in-out infinite; }
  .mc-wv { animation: mc-wave 2.4s ease-in-out infinite alternate; }
  .mc-ribbon { animation: mc-ripple 1.3s linear infinite; }
  .mc-blink { animation: mc-blink 5s ease-in-out infinite; }
  .mc-look { animation: mc-look 9s ease-in-out infinite; }
  .mc-halo { animation: mc-breathe 7s ease-in-out infinite; }
  .mc-d1 { animation: mc-j1 5s linear infinite; }
  .mc-d2 { animation: mc-j2 6.2s linear infinite; }
  .mc-d3 { animation: mc-j3 4.4s linear infinite; }

  /* mood modulates animation tempo (director sets via emote) */
  .creature[data-mood="agitated"] * { animation-duration: revert-layer; }
  .creature[data-mood="agitated"] .mc-a1, .creature[data-mood="agitated"] .mc-a2,
  .creature[data-mood="agitated"] .mc-a3, .creature[data-mood="agitated"] .mc-a4 { animation-duration: 2.5s; }
  .creature[data-mood="weary"] .mc-a1, .creature[data-mood="weary"] .mc-a2,
  .creature[data-mood="weary"] .mc-a3, .creature[data-mood="weary"] .mc-a4 { animation-duration: 14s; }
</style>
</head>
<body>
<svg id="slide" class="stage">
  <defs>
    <filter id="goo">
      <feGaussianBlur in="SourceGraphic" stdDeviation="7"/>
      <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"/>
    </filter>
  </defs>
  <circle class="graticule" id="graticule" />
  <g id="structures" class="layer-structures"></g>
  <g id="motes" class="layer-motes"></g>
  <g id="creatures" class="layer-creatures"></g>
</svg>
<div class="vignette"></div>
<div id="bubbles" class="bubbles-layer"></div>
<div id="margin-notes" class="chronicle-margin"></div>
<div id="hud" class="hud-layer"></div>

<script src="parts.js"></script>
<script src="sim.js"></script>
<script src="net.js"></script>
<script src="ui.js"></script>
<script>
  // App glue — grows in Tasks 4, 5, 6, 7.
  const View = {
    px: ([x, y]) => [x * innerWidth, y * innerHeight],
    norm: (px, py) => [px / innerWidth, py / innerHeight],
  };
  const App = { world: null, es: null, lastDirector: 0 };

  function sizeGraticule() {
    const g = document.getElementById('graticule');
    const r = Math.min(innerWidth, innerHeight) * 0.42;
    g.setAttribute('cx', innerWidth / 2);
    g.setAttribute('cy', innerHeight / 2);
    g.setAttribute('r', r);
  }
  addEventListener('resize', sizeGraticule);
  sizeGraticule();

  App.es = Net.listen({
    onSnapshot(world) { App.world = world; console.log('snapshot', world); },
    onCommands(cmds) { console.log('commands', cmds); },
    onDirector({ t }) { App.lastDirector = t; },
  });
</script>
</body>
</html>
```

- [ ] **Step 3: Create the three stub files**

`public/parts.js`, `public/sim.js`, `public/ui.js`, each containing exactly:

```js
// filled in by a later task
```

- [ ] **Step 4: Verify the wire end-to-end**

```bash
node server.js &
sleep 1
curl -s localhost:4380/ | grep -c 'id="slide"'          # expect: 1
curl -s -X POST localhost:4380/act -H 'Content-Type: application/json' \
  -d '{"commands":[{"cmd":"chronicle","text":"wire test"}]}'  # expect: {"results":[{"ok":true}]}
```

Then open `http://localhost:4380` in a browser: parchment page with dashed graticule ring, console shows `snapshot {...}`, and re-running the curl above logs `commands [...]` in the console. Kill the server after.

- [ ] **Step 5: Commit**

```bash
git add public/
git commit -m "feat: page shell, shared keyframes, Net SSE wiring"
```

---

### Task 3: Parts library, chassis presets, gallery

**Files:**
- Create (replace stub): `public/parts.js`
- Create: `public/gallery.html`

**Interfaces:**
- Consumes: CSS classes/keyframes and `#goo` filter from Task 2.
- Produces:
  - `el(tag, attrs, parent)` — SVG element helper
  - `stain(value, creature)` — resolves `'$body'`/`'$accent'` tokens against `creature.stains`
  - `hash(str)`, `mulberry32(seed)` — deterministic per-creature randomness
  - `PARTS` — `{gooBody, ring, core, orbiter, eye, eyes, cilia, flagella, ribbonSkirt, waveChain, swarm, stalkLure, nucleus, grain, vacuole}`, each `(parentG, params, creature) -> void`
  - `CHASSIS` — presets keyed `reactor | swimmer | medusa | watch | salp | murmuration`, shape `{orient?: bool, parts: [{type, ...params}]}`
  - `renderCreature(creature, layerG) -> SVGGElement` (outer `g.creature[data-id]`, includes hidden `.aura` ellipse for faction tint)
  - `setTint(g, color)` — shows/hides the aura

- [ ] **Step 1: Write `public/parts.js`**

Geometry and animation values are ports of the approved mockups (`final-cast.html`). Complete file:

```js
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
```

- [ ] **Step 2: Write `public/gallery.html`**

Dev harness proving the presets AND runtime extensibility (a custom spec no preset defines):

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Microcosm — chassis gallery</title>
<link rel="stylesheet" href="data:text/css,">
<style>
  body { margin: 0; font-family: Georgia, serif; color: #4a3a26;
    background: radial-gradient(circle at 50% 45%, #fbf6ea 0%, #f3ead6 55%, #e6d8bd 90%, #d9c8a6 100%); }
  h1 { font-style: italic; font-weight: normal; text-align: center; margin: 18px 0 4px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 8px; padding: 12px; }
  figure { margin: 0; text-align: center; }
  figcaption { font-style: italic; font-size: 14px; }
  svg { width: 100%; height: 240px; }
</style>
<!-- reuse the stage keyframes by copying them from index.html at runtime -->
</head>
<body>
<h1>Chassis gallery</h1>
<div class="grid" id="grid"></div>
<script src="parts.js"></script>
<script>
  // Pull the keyframe stylesheet from index.html so there is one source of truth.
  fetch('index.html').then((r) => r.text()).then((html) => {
    const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
    render();
  });

  const STAINS = [
    { body: '#4a3f96', accent: '#2e8b74' }, { body: '#33608f', accent: '#a1794a' },
    { body: '#4a3f96', accent: '#a13a63' }, { body: '#96504f', accent: '#2e8b74' },
    { body: '#33608f', accent: '#4a3f96' }, { body: '#5e2a52', accent: '#a13a63' },
  ];
  const CUSTOM = { // extensibility proof: not a preset
    parts: [
      { type: 'gooBody', r: 36, lobes: 5, pods: 2, opacity: 0.3 },
      { type: 'ring', r: 18, dash: '3 3', dur: 30 },
      { type: 'stalkLure' },
      { type: 'eye', x: -8, y: -4, r: 9 },
    ],
  };

  function render() {
    const grid = document.getElementById('grid');
    const entries = [...Object.keys(CHASSIS).map((k) => [k, null]), ['custom: spiral penitent', CUSTOM]];
    entries.forEach(([label, spec], i) => {
      const fig = document.createElement('figure');
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', '-160 -120 320 240');
      svg.innerHTML = `<defs><filter id="goo">
        <feGaussianBlur in="SourceGraphic" stdDeviation="7"/>
        <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"/>
      </filter></defs>`;
      const c = {
        id: `gallery-${i}`, chassis: spec ? null : label, chassisSpec: spec,
        stains: STAINS[i % STAINS.length], mood: 'calm', tint: null,
      };
      renderCreature(c, svg);
      fig.appendChild(svg);
      const cap = document.createElement('figcaption');
      cap.textContent = label;
      fig.appendChild(cap);
      grid.appendChild(fig);
    });
  }
</script>
</body>
</html>
```

- [ ] **Step 3: Verify visually**

Run `node server.js`, open `http://localhost:4380/gallery.html`. Expected: seven animated creatures — reactor (rings + orbiters), swimmer (cilia + flagella + eyespot), medusa (swaying skirt + ribbons), watch (five blinking eyes), salp (traveling wave), murmuration (breathing swarm), and the custom lure-bearing spec. All amorphous (goo lobes drifting), none a plain circle. If Playwright MCP is available, screenshot to `/tmp/microcosm-gallery.png` and inspect; if the browser profile is locked, `pkill -f ms-playwright-mcp` first (known issue).

- [ ] **Step 4: Commit**

```bash
git add public/parts.js public/gallery.html
git commit -m "feat: parts library, six chassis presets, gallery harness"
```

---

### Task 4: Simulation — steering, motes, energy, physics reporting

**Files:**
- Create (replace stub): `public/sim.js`
- Test: `test/sim.test.js`
- Modify: `public/index.html` (app glue: start the rAF loop)

**Interfaces:**
- Consumes: `View`, `Net.physics`, `renderCreature` DOM structure, `hash` from parts.js.
- Produces:
  - Pure: `steerVec(pos, target, speed, dt) -> [dx, dy, arrived]`, `nearestMote(pos, motes) -> {mote, d} | null`, `energyTick(e, moving, dt) -> e'`, `hazardPush(pos, hazards, nowMs) -> [dx, dy]` (all exported for node via `module.exports` guard)
  - Engine: `Sim.add(creature, gElement)`, `Sim.remove(id)`, `Sim.setHazard(x, y)`, `Sim.bloom(x, y, count)`, `Sim.step(dtSeconds, world)` — moves creatures (intent + wander + hazard avoidance), spawns/falls motes (ambient + vent blooms), eats on forage contact, decays energy, writes `transform` on each creature `g`, POSTs `/physics` every 3 s
  - Tuning constants (exact): move-to speed `0.06`/s, forage speed `0.05`/s, sluggish threshold energy `< 0.15` → half speed, eat radius `0.02`, eat gain `+0.08`, decay `0.005`/s idle `0.012`/s moving, mote cap `120`, ambient spawn `1.2`/s, bloom size `14`, hazard radius `0.09` TTL `60s`

- [ ] **Step 1: Write the failing tests**

```js
// test/sim.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { steerVec, nearestMote, energyTick, hazardPush } = require('../public/sim.js');

test('steerVec steps toward target, capped by speed*dt, reports arrival', () => {
  const [dx, dy, arrived] = steerVec([0, 0], [1, 0], 0.06, 1);
  assert.ok(Math.abs(dx - 0.06) < 1e-9);
  assert.equal(dy, 0);
  assert.equal(arrived, false);
  const [, , done] = steerVec([0.999, 0.5], [1, 0.5], 0.06, 1);
  assert.equal(done, true);
});

test('nearestMote finds closest, null when empty', () => {
  assert.equal(nearestMote([0.5, 0.5], []), null);
  const motes = [{ x: 0.9, y: 0.9 }, { x: 0.52, y: 0.5 }];
  const r = nearestMote([0.5, 0.5], motes);
  assert.equal(r.mote, motes[1]);
  assert.ok(Math.abs(r.d - 0.02) < 1e-9);
});

test('energyTick decays, floors at 0, moving costs more', () => {
  assert.ok(energyTick(0.5, false, 1) > energyTick(0.5, true, 1));
  assert.equal(energyTick(0.001, true, 1), 0);
});

test('hazardPush pushes away inside radius, zero outside, ignores expired', () => {
  const now = 1000000;
  const hz = [{ x: 0.5, y: 0.5, r: 0.09, until: now + 5000 }];
  const [ax] = hazardPush([0.55, 0.5], hz, now);
  assert.ok(ax > 0); // pushed east, away from center
  assert.deepEqual(hazardPush([0.8, 0.8], hz, now), [0, 0]);
  assert.deepEqual(hazardPush([0.55, 0.5], [{ ...hz[0], until: now - 1 }], now), [0, 0]);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test test/sim.test.js`
Expected: FAIL — exports missing (stub file).

- [ ] **Step 3: Write `public/sim.js`**

```js
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
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test test/sim.test.js`
Expected: `# pass 4`, `# fail 0`. Also re-run `node --test test/server.test.js` (still green).

- [ ] **Step 5: Start the loop in `index.html` app glue**

Replace the `App.es = Net.listen({...})` block at the bottom of `index.html` with:

```js
  App.es = Net.listen({
    onSnapshot(world) {
      App.world = world;
      Object.assign(CHASSIS, world.chassis || {});
      document.getElementById('creatures').replaceChildren();
      Sim.items.clear();
      for (const c of Object.values(world.creatures)) {
        Sim.add(c, renderCreature(c, document.getElementById('creatures')));
      }
    },
    onCommands(cmds) { for (const c of cmds) applyCommand(c); },
    onDirector({ t }) { App.lastDirector = t; },
  });

  function applyCommand(c) { console.log('command', c); } // replaced in Task 5

  let last = performance.now();
  (function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (App.world) Sim.step(dt, App.world);
    requestAnimationFrame(frame);
  })(performance.now());
```

- [ ] **Step 6: Verify in browser**

`node server.js`, then seed a creature and watch it live:

```bash
curl -s -X POST localhost:4380/act -H 'Content-Type: application/json' -d '{"commands":[
  {"cmd":"spawn","creature":{"id":"t1","name":"Drifty","epithet":"D. testus","prompt":"x","chassis":"swimmer","chassisSpec":null,"stains":{"body":"#33608f","accent":"#a1794a"},"scale":1,"attributes":{},"pos":[0.3,0.4],"energy":0.9,"intent":{"verb":"forage"},"mood":"calm","tint":null}}]}'
```

Reload the page. Expected: motes drift down; the swimmer creature wanders, chases and eats motes (motes disappear near it); after ~3s `world.json` (or `GET /state`) shows updated `pos`/`energy`. Kill server.

- [ ] **Step 7: Commit**

```bash
git add public/sim.js public/index.html test/sim.test.js
git commit -m "feat: physics sim - steering, motes, energy, orientation, physics reporting"
```

---

### Task 5: Command application — spawn, speech bubbles, structures, the rest

**Files:**
- Modify: `public/index.html` (replace `applyCommand` stub; add bubble + structure CSS)
- Modify: `public/ui.js` (bubble + structure helpers live here)

**Interfaces:**
- Consumes: `renderCreature`, `setTint`, `Sim`, `View`, `App.world`.
- Produces (Tasks 6–7 rely on):
  - `UI.bubble(creature, text, kind)` — kind `'speech' | 'whisper'`; paper-tag div near the creature, fades after 7s, stacks per creature
  - `UI.renderStructure(id, structure)` — goo blob union in `g#structures` with a serif name label
  - `UI.developing(promptText)` / `UI.resolveDeveloping()` — placeholder chips while the director composes a specimen
  - `UI.onSay(fn)` — hook so the popover whisper thread (Task 6) also receives say commands
  - `applyCommand(cmd)` in index.html handling every verb

- [ ] **Step 1: Add UI helpers to `public/ui.js`** (replacing the stub)

```js
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
    div.style.left = `${Math.min(innerWidth - 240, Math.max(8, px - 60))}px`;
    div.style.top = `${Math.max(8, py - 70 - stack * 34)}px`;
    layer.appendChild(div);
    setTimeout(() => { div.classList.add('bubble-fade'); setTimeout(() => div.remove(), 900); }, 7000);
  },

  renderStructure(id, s) {
    const layer = document.getElementById('structures');
    let g = layer.querySelector(`[data-id="${id}"]`);
    if (!g) {
      g = el('g', { class: 'structure', 'data-id': id }, layer);
      el('g', { filter: 'url(#goo)', opacity: 0.22, class: 'structure-goo' }, g);
      const label = document.createElementNS(SVGNS, 'text');
      label.setAttribute('class', 'structure-label');
      g.appendChild(label);
    }
    const goo = g.querySelector('.structure-goo');
    goo.replaceChildren();
    const scale = Math.min(innerWidth, innerHeight);
    let sx = 0, sy = 0;
    for (const [x, y, r] of s.blobs) {
      const [px, py] = View.px([x, y]);
      el('circle', { cx: px, cy: py, r: r * scale, fill: s.tint || '#8a7350' }, goo);
      sx += px; sy += py;
    }
    const label = g.querySelector('.structure-label');
    if (s.blobs.length) {
      label.textContent = s.name;
      label.setAttribute('x', sx / s.blobs.length);
      label.setAttribute('y', sy / s.blobs.length + 4);
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
    chip.textContent = `specimen developing — "${prompt.slice(0, 60)}"`;
    box.appendChild(chip);
  },
  resolveDeveloping() {
    document.querySelector('.developing-chip')?.remove();
  },
};
```

- [ ] **Step 2: Add the CSS** (inside the `<style>` block of `index.html`)

```css
  .bubble { position: absolute; max-width: 220px; padding: 6px 10px; font-size: 13px;
    font-style: italic; background: var(--paper); border: 1px solid var(--paper-edge);
    box-shadow: 2px 2px 0 rgba(120, 95, 50, .18); transform: rotate(-1deg);
    transition: opacity .9s; }
  .bubble-whisper { border-style: dashed; color: var(--plum); }
  .bubble-fade { opacity: 0; }
  .structure-label { font-family: Georgia, serif; font-style: italic; font-size: 12px;
    fill: var(--ink-soft); text-anchor: middle; }
  .developing-stack { position: fixed; bottom: 64px; left: 50%; transform: translateX(-50%); }
  .developing-chip { margin-top: 6px; padding: 4px 10px; font-size: 12px; font-style: italic;
    color: var(--label); background: rgba(255, 253, 244, .8); border: 1px dashed var(--paper-edge);
    animation: mc-breathe 2s ease-in-out infinite; }
```

- [ ] **Step 3: Replace `applyCommand` in `index.html`**

```js
  function applyCommand(a) {
    const w = App.world;
    const cr = a.id ? w.creatures[a.id] : null;
    switch (a.cmd) {
      case 'spawn': {
        w.creatures[a.creature.id] = a.creature;
        Sim.remove(a.creature.id); // re-spawn with same id = chassis override
        document.querySelector(`#creatures [data-id="${a.creature.id}"]`)?.remove();
        Sim.add(a.creature, renderCreature(a.creature, document.getElementById('creatures')));
        UI.resolveDeveloping();
        break;
      }
      case 'define-chassis': CHASSIS[a.id] = a.spec; break;
      case 'move-to': if (cr) cr.intent = { verb: 'move-to', target: a.target }; break;
      case 'forage': if (cr) cr.intent = { verb: 'forage' }; break;
      case 'idle': if (cr) cr.intent = { verb: 'idle' }; break;
      case 'say': {
        if (!cr) break;
        UI.bubble(cr, a.text, a.target === 'user' ? 'whisper' : 'speech');
        UI.sayHooks.forEach((fn) => fn(a));
        break;
      }
      case 'emote': {
        if (!cr) break;
        cr.mood = a.mood;
        const g = document.querySelector(`#creatures [data-id="${a.id}"]`);
        if (g) g.dataset.mood = a.mood;
        break;
      }
      case 'tint': {
        if (!cr) break;
        cr.tint = a.color;
        const g = document.querySelector(`#creatures [data-id="${a.id}"]`);
        if (g) setTint(g, a.color);
        break;
      }
      case 'set-attribute': if (cr) cr.attributes[a.name] = a.value; break;
      case 'give': {
        const from = w.creatures[a.from], to = w.creatures[a.to];
        if (!from || !to) break;
        const amt = Math.min(a.amount, from.energy);
        from.energy -= amt; to.energy = Math.min(1, to.energy + amt);
        break;
      }
      case 'build': {
        const s = (w.structures[a.structureId] ??= {
          name: a.name || 'structure', blobs: [], tint: a.tint || '#8a7350', builders: [],
        });
        if (a.name) s.name = a.name;
        if (a.blob) s.blobs.push(a.blob);
        UI.renderStructure(a.structureId, s);
        break;
      }
      case 'chronicle': w.chronicle.push({ t: new Date().toISOString(), text: a.text }); break; // margin note UI in Task 7
      case 'world': for (const k of ['vents', 'hazards']) if (a[k]) w[k] = a[k]; break;
    }
  }
```

Also extend `onSnapshot` to render persisted structures:

```js
      for (const [sid, s] of Object.entries(world.structures || {})) UI.renderStructure(sid, s);
```

- [ ] **Step 4: Verify with a scripted scene**

Server running, page open, then:

```bash
curl -s -X POST localhost:4380/act -H 'Content-Type: application/json' -d '{"commands":[
  {"cmd":"say","id":"t1","text":"The vent provides, brother."},
  {"cmd":"emote","id":"t1","mood":"agitated"},
  {"cmd":"tint","id":"t1","color":"#4a3f96"},
  {"cmd":"build","structureId":"s1","id":"t1","name":"Chapel","blob":[0.55,0.5,0.035]},
  {"cmd":"build","structureId":"s1","id":"t1","blob":[0.58,0.48,0.03]},
  {"cmd":"move-to","id":"t1","target":[0.56,0.55]}]}'
```

Expected: paper speech bubble appears and fades; lobes speed up (agitated); violet aura appears; a goo structure labeled *Chapel* renders; the creature glides toward it. Reload the page — structure and tint persist (snapshot path).

- [ ] **Step 5: Commit**

```bash
git add public/ui.js public/index.html
git commit -m "feat: full command application - speech tags, structures, tint, mood"
```

---

### Task 6: Creation bar + specimen-tag popover (sliders, whisper, chassis override)

**Files:**
- Modify: `public/ui.js` (append), `public/index.html` (CSS + init call)

**Interfaces:**
- Consumes: `Net.input`, `UI.onSay`, `App.world`, creature `g` elements.
- Produces:
  - `UI.initHud()` — builds creation bar (`.creation-bar`) and wires creature click → popover
  - Popover (`.specimen-tag`): name + epithet + mood line, one range slider per `attributes` entry (`input` → optimistic local set + `Net.input({type:'set-attribute', id, name, value})`), whisper thread + input (`Net.input({type:'whisper', id, text})`), chassis `<select>` (`Net.input({type:'set-chassis', id, chassis})`)
  - Creation: submit → `Net.input({type:'create', prompt})` + `UI.developing(prompt)`
  - Input event types the director consumes (exact): `create`, `whisper`, `set-attribute`, `set-chassis`, `god-food`, `god-hazard`, `god-drag`

- [ ] **Step 1: Append to `public/ui.js`**

```js
UI.initHud = function initHud() {
  const hud = document.getElementById('hud');

  // creation bar
  const bar = document.createElement('form');
  bar.className = 'creation-bar';
  bar.innerHTML = `<input class="creation-input" type="text"
    placeholder="Describe a new specimen — its nature, goals, temperament" maxlength="500">`;
  bar.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = bar.querySelector('input');
    const prompt = input.value.trim();
    if (!prompt) return;
    Net.input({ type: 'create', prompt });
    UI.developing(prompt);
    input.value = '';
  });
  hud.appendChild(bar);

  // creature click -> popover (drag handled in Task 7; a click is a <6px pointer travel)
  let downAt = null;
  document.getElementById('slide').addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY, e.target.closest('.creature')];
  });
  document.getElementById('slide').addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const [x, y, g] = downAt;
    downAt = null;
    if (Math.hypot(e.clientX - x, e.clientY - y) > 6 || !g) return;
    UI.openTag(g.dataset.id);
  });
};

UI.threads = {}; // id -> [{who: 'you'|'them', text}]
UI.openTag = function openTag(id) {
  document.querySelector('.specimen-tag')?.remove();
  const c = App.world.creatures[id];
  if (!c) return;
  const [px, py] = View.px(c.pos);
  const tag = document.createElement('div');
  tag.className = 'specimen-tag';
  tag.style.left = `${Math.min(innerWidth - 270, px + 40)}px`;
  tag.style.top = `${Math.max(10, py - 80)}px`;

  const sliders = Object.entries(c.attributes || {}).map(([name, val]) => `
    <label class="tag-slider">${name}
      <input type="range" min="0" max="1" step="0.05" value="${val}" data-attr="${name}">
    </label>`).join('');
  const options = Object.keys(CHASSIS)
    .map((k) => `<option value="${k}" ${k === c.chassis ? 'selected' : ''}>${k}</option>`).join('');
  const thread = (UI.threads[id] || [])
    .map((m) => `<div class="thread-${m.who}">${m.who === 'you' ? 'You: ' : ''}${m.text}</div>`).join('');

  tag.innerHTML = `
    <button class="tag-close" type="button">×</button>
    <div class="tag-name">${c.name}</div>
    <div class="tag-epithet">${c.epithet || ''} — <span class="tag-mood">${c.mood}</span></div>
    ${sliders}
    <label class="tag-slider">chassis <select class="tag-chassis">${options}</select></label>
    <div class="tag-thread">${thread}</div>
    <form class="tag-whisper"><input type="text" placeholder="Whisper to ${c.name}…" maxlength="300"></form>`;

  tag.querySelector('.tag-close').addEventListener('click', () => tag.remove());
  tag.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('change', () => {
    const name = r.dataset.attr, value = parseFloat(r.value);
    c.attributes[name] = value;
    Net.input({ type: 'set-attribute', id, name, value });
  }));
  tag.querySelector('.tag-chassis').addEventListener('change', (e) => {
    Net.input({ type: 'set-chassis', id, chassis: e.target.value });
  });
  tag.querySelector('.tag-whisper').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = e.target.querySelector('input');
    const text = inp.value.trim();
    if (!text) return;
    (UI.threads[id] ??= []).push({ who: 'you', text });
    Net.input({ type: 'whisper', id, text });
    inp.value = '';
    UI.openTag(id); // re-render thread
  });
  document.getElementById('hud').appendChild(tag);
};

// whispers back from the director land in the thread
UI.onSay((a) => {
  if (a.target !== 'user') return;
  (UI.threads[a.id] ??= []).push({ who: 'them', text: a.text });
  if (document.querySelector('.specimen-tag')) UI.openTag(a.id);
});
```

- [ ] **Step 2: Add CSS to `index.html`**

```css
  .creation-bar { position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%); width: min(560px, 70vw); }
  .creation-input { width: 100%; box-sizing: border-box; padding: 8px 12px; font: italic 14px Georgia, serif;
    color: var(--ink); background: var(--paper); border: 1px solid var(--paper-edge);
    box-shadow: 2px 2px 0 rgba(120, 95, 50, .18); outline: none; }
  .creation-input::placeholder { color: var(--label); }
  .specimen-tag { position: fixed; width: 250px; padding: 10px 12px; background: var(--paper);
    border: 1px solid var(--paper-edge); box-shadow: 2px 2px 0 rgba(120, 95, 50, .18);
    font-size: 12.5px; transform: rotate(-.5deg); }
  .tag-close { position: absolute; top: 2px; right: 6px; border: 0; background: none;
    font-size: 15px; color: var(--label); cursor: pointer; }
  .tag-name { font-weight: bold; font-size: 14px; }
  .tag-epithet { font-style: italic; color: var(--ink-soft); margin-bottom: 6px; }
  .tag-slider { display: block; margin: 4px 0; color: var(--ink-soft);
    font-variant: small-caps; letter-spacing: .5px; }
  .tag-slider input, .tag-slider select { width: 100%; accent-color: var(--ochre); }
  .tag-thread { max-height: 110px; overflow-y: auto; margin: 6px 0; font-style: italic; }
  .thread-you { color: var(--plum); }
  .tag-whisper input { width: 100%; box-sizing: border-box; font: italic 12px Georgia, serif;
    padding: 4px 6px; border: 1px dashed var(--paper-edge); background: rgba(255, 253, 244, .7); }
```

And call `UI.initHud();` once at the end of the app glue script.

- [ ] **Step 3: Verify**

Page open with creature `t1` present (Task 4 seed). Expected: typing in the creation bar and submitting shows a "specimen developing" chip and `GET /state` shows the queued `create` input. Clicking the creature opens the specimen tag; if it has attributes, sliders render and dragging one queues `set-attribute`; whispering appends to the thread and queues `whisper`. Then simulate the director answering:

```bash
curl -s -X POST localhost:4380/act -H 'Content-Type: application/json' \
  -d '{"commands":[{"cmd":"say","id":"t1","text":"I hear you, Great Eye.","target":"user"}]}'
```

Expected: dashed whisper bubble near the creature AND the reply appears in the open thread.

- [ ] **Step 4: Commit**

```bash
git add public/ui.js public/index.html
git commit -m "feat: creation bar and specimen-tag popover with sliders and whisper thread"
```

---

### Task 7: God tools, drag, chronicle margin notes, director presence

**Files:**
- Modify: `public/ui.js` (append), `public/index.html` (CSS; chronicle hook in `applyCommand`)

**Interfaces:**
- Consumes: `Sim.bloom`, `Sim.setHazard`, `Net.input`, `Net.physics`, `App.world.chronicle`, `App.lastDirector`.
- Produces:
  - `UI.initTools()` — brass tool cluster bottom-left: `feed` and `hazard` toggle modes (default mode: interact). In feed mode a slide click calls `Sim.bloom(x, y, 20)` + `Net.input({type:'god-food', pos})`; hazard mode calls `Sim.setHazard(x, y)` + `Net.input({type:'god-hazard', pos})`; either click exits the mode.
  - Drag: pointer travel > 6px starting on a creature moves it (all modes); on release: `Net.physics([{id, pos}])` + `Net.input({type:'god-drag', id, to: pos})`
  - `UI.marginNote(text)` — paper tag prepended to `#margin-notes`, max 6 visible, hover pauses fading; clicking any note or the "Chronicle" tab opens `.chronicle-overlay` listing all of `App.world.chronicle`
  - `UI.initPresence()` — brass dot top-left; lit when `Date.now() - App.lastDirector < 30000`, else dim with title "the director is away"
  - `applyCommand` case `'chronicle'` additionally calls `UI.marginNote(a.text)`

- [ ] **Step 1: Append to `public/ui.js`**

```js
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
  });
  hud.appendChild(tools);

  const slide = document.getElementById('slide');
  let drag = null; // {id, item}
  slide.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.creature');
    if (g && UI.mode === 'interact') drag = { id: g.dataset.id, moved: false, x: e.clientX, y: e.clientY };
  });
  slide.addEventListener('pointermove', (e) => {
    if (!drag) return;
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
      drag = null;
      return;
    }
    drag = null;
    if (UI.mode === 'interact') return;
    if (e.target.closest('.god-tools') || e.target.closest('.specimen-tag')) return;
    const pos = View.norm(e.clientX, e.clientY);
    if (UI.mode === 'feed') { Sim.bloom(pos[0], pos[1], 20); Net.input({ type: 'god-food', pos }); }
    if (UI.mode === 'hazard') { Sim.setHazard(pos[0], pos[1]); Net.input({ type: 'god-hazard', pos }); }
    UI.mode = 'interact';
    document.body.style.cursor = '';
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
    }</span> ${e.text}</div>`).join('');
  ov.innerHTML = `<div class="chronicle-paper">
    <button class="tag-close" type="button">×</button>
    <div class="tag-name">Chronicle — Slide No. ${App.world.meta.slideNo}</div>
    <div class="chronicle-list">${rows || '<em>Nothing observed yet.</em>'}</div></div>`;
  ov.querySelector('.tag-close').addEventListener('click', () => ov.remove());
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.getElementById('hud').appendChild(ov);
  ov.querySelector('.chronicle-list').scrollTop = 1e9;
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
```

- [ ] **Step 2: CSS + hooks in `index.html`**

CSS:

```css
  .god-tools { position: fixed; bottom: 12px; left: 12px; display: flex; gap: 6px; }
  .god-tool { width: 34px; height: 34px; border-radius: 50%; cursor: pointer; font-size: 15px;
    color: var(--ink); border: 1px solid var(--label);
    background: radial-gradient(circle at 35% 30%, #e8d9b8, #b89b62); }
  .god-tool-active { box-shadow: 0 0 0 3px rgba(161, 121, 74, .45); }
  .margin-note { margin: 6px 0; padding: 5px 8px; font-size: 12px; font-style: italic;
    color: var(--ink-soft); background: rgba(255, 253, 244, .85); border: 1px solid rgba(201, 180, 137, .6);
    box-shadow: 1px 1px 0 rgba(120, 95, 50, .12); transform: rotate(-1deg); cursor: pointer;
    animation: note-in .5s ease-out; }
  .margin-note:nth-child(even) { transform: rotate(.8deg); }
  #margin-notes:not(:hover) .margin-note:nth-child(n+4) { opacity: .45; }
  @keyframes note-in { from { opacity: 0; transform: translateY(12px); } }
  .chronicle-overlay { position: fixed; inset: 0; background: rgba(74, 58, 38, .25);
    display: flex; align-items: center; justify-content: center; }
  .chronicle-paper { position: relative; width: min(520px, 84vw); max-height: 70vh; padding: 16px 20px;
    background: var(--paper); border: 1px solid var(--paper-edge);
    box-shadow: 4px 4px 0 rgba(120, 95, 50, .25); display: flex; flex-direction: column; }
  .chronicle-list { overflow-y: auto; margin-top: 8px; font-size: 13px; line-height: 1.6; }
  .chronicle-t { color: var(--label); font-variant: small-caps; margin-right: 6px; }
  .director-dot { position: fixed; top: 12px; left: 12px; width: 12px; height: 12px; border-radius: 50%;
    border: 1px solid var(--label); background: #cbb58c; opacity: .5; }
  .director-here { background: var(--verdigris); opacity: 1; box-shadow: 0 0 8px rgba(46, 139, 116, .6); }
```

In `applyCommand`, extend the `chronicle` case:

```js
      case 'chronicle': w.chronicle.push({ t: new Date().toISOString(), text: a.text }); UI.marginNote(a.text); break;
```

At app-glue end, after `UI.initHud();` add: `UI.initTools(); UI.initPresence();`

- [ ] **Step 3: Verify**

With server + page + creature `t1`: feed tool → click slide → mote burst appears, `god-food` queued in `/state`; hazard tool → dashed plum cloud, creature steers clear of it; dragging the creature relocates it and queues `god-drag`; `curl … '{"commands":[{"cmd":"chronicle","text":"The Preacher begins a chapel."}]}'` → margin note drifts in; clicking it opens the full chronicle paper; `curl 'localhost:4380/state?consume=1'` → director dot lights for 30s.

- [ ] **Step 4: Commit**

```bash
git add public/ui.js public/index.html
git commit -m "feat: god tools, drag, chronicle margin notes, director presence dot"
```

---

### Task 8: Director protocol doc, notes template, demo scene, README

**Files:**
- Create: `director/PROTOCOL.md`, `director-notes.md`, `scripts/demo.sh`, `README.md`

**Interfaces:**
- Consumes: everything above (documents it).
- Produces: the operating manual a fresh Claude session reads to run the world; a no-AI smoke scene.

- [ ] **Step 1: Write `director/PROTOCOL.md`**

Must contain, at minimum, these sections (write them out fully, matching Tasks 1–7 exactly):

1. **Role** — you are the director: every creature's behavior, speech, and the world's story are your decisions. The page handles physics; you handle meaning. Stay in the fiction; never break voice in chronicle/say text.
2. **Loop** — `curl -s 'localhost:4380/state?consume=1'` → read `world` + `inputs` → update `director-notes.md` → `curl -s -X POST localhost:4380/act -H 'Content-Type: application/json' -d '{"commands":[...]}'`. Tick every 5–15s while attending; batch 5–20 commands; every creature is *you* — one mind, many voices, so decide jointly (rivalries, group scenes), not per-creature in isolation.
3. **Command reference** — one JSON example per verb (all 13), copied shapes from Task 1's `CMDS`.
4. **Input types you must handle** — `create` (author a full creature: name, epithet, chassis choice or custom `chassisSpec`, stains from the palette, 1–3 invented slider `attributes` implied by the prompt, spawn + chronicle it), `whisper` (reply with `say` target `'user'`, and let it *change the creature's beliefs*), `set-attribute`, `set-chassis` (re-`spawn` same id with new chassis), `god-food`/`god-hazard`/`god-drag` (react in-fiction).
5. **Creature record schema** — the exact JSON shape from the spec (all fields, Task 1 test's `CREATURE` as the example).
6. **Chassis & parts** — the six presets by name and temperament; the parts table (`type` + params) for composing custom `chassisSpec`s; `define-chassis` for reusable new plans.
7. **World rules** — motes/vents scarcity, shelters via repeated `build` (one blob per tick, 4–8 blobs = a home), trust/beliefs/factions/disputes conventions, **no death/reproduction**; `tint` = faction color; palette tokens listed.
8. **director-notes.md conventions** — keep current-state sections (Cast, Relationships, Beliefs, Factions, Plots, Mechanics-this-run), rewrite rather than append, update every few ticks.
9. **Style** — chronicle entries are a naturalist's field notes (present tense, wry, specific); speech is in-character and short (≤ 140 chars usually); silence is fine — not every tick needs every creature to speak.

- [ ] **Step 2: Write `director-notes.md`**

```markdown
# Director notes — Slide No. 1

## Cast
(none yet)

## Relationships
(pairwise trust: -1..1 — only notable pairs)

## Beliefs
(belief → who holds it, how strongly)

## Factions
(name, tint, members, claimed territory)

## Plots
(active storylines, one line each)

## Mechanics this run
(user-requested dials and how they work, e.g. gullibility: adoption odds for heard beliefs)
```

- [ ] **Step 3: Write `scripts/demo.sh`** (chmod +x)

```bash
#!/bin/bash
# Smoke-director: plays a tiny scene against a running server. No AI required.
B=${1:-http://localhost:4380}
act() { curl -s -X POST "$B/act" -H 'Content-Type: application/json' -d "$1" > /dev/null; }

act '{"commands":[
 {"cmd":"spawn","creature":{"id":"preacher","name":"Br. Lumen","epithet":"P. fervens","prompt":"a preacher of the vent","chassis":"reactor","chassisSpec":null,"stains":{"body":"#4a3f96","accent":"#2e8b74"},"scale":1.1,"attributes":{"zeal":0.9},"pos":[0.35,0.45],"energy":0.8,"intent":{"verb":"idle"},"mood":"hopeful","tint":null}},
 {"cmd":"spawn","creature":{"id":"skeptic","name":"Sr. Quill","epithet":"S. dubium","prompt":"a sharp skeptic","chassis":"watch","chassisSpec":null,"stains":{"body":"#96504f","accent":"#a13a63"},"scale":1,"attributes":{"suspicion":0.8},"pos":[0.62,0.5],"energy":0.7,"intent":{"verb":"idle"},"mood":"wary","tint":null}},
 {"cmd":"chronicle","text":"Two specimens introduced to the slide. They regard one another."}]}'
sleep 4
act '{"commands":[
 {"cmd":"say","id":"preacher","text":"The vent provides, sister. Come and see."},
 {"cmd":"move-to","id":"preacher","target":[0.55,0.5]},
 {"cmd":"emote","id":"skeptic","mood":"agitated"}]}'
sleep 6
act '{"commands":[
 {"cmd":"say","id":"skeptic","text":"The vent is warm water and wishful thinking."},
 {"cmd":"build","structureId":"chapel","id":"preacher","name":"Vent Chapel","blob":[0.3,0.68,0.035]},
 {"cmd":"chronicle","text":"Br. Lumen lays the first membrane of a chapel near the east vent."}]}'
echo "demo scene played."
```

- [ ] **Step 4: Write `README.md`**

Short: what Microcosm is (one paragraph), how to run (`node server.js`, open `http://localhost:4380`), how to summon the director (open Claude Code in this repo; say "read director/PROTOCOL.md and run the world"), `scripts/demo.sh` for an AI-free smoke scene, `gallery.html` for chassis, file map, and a pointer to the spec + plan under `docs/superpowers/`.

- [ ] **Step 5: Verify + commit**

`node server.js` (fresh `world.json`: delete it first), `bash scripts/demo.sh`, watch the page: two creatures spawn and converse, a chapel begins, margin notes appear. Then:

```bash
git add director/ director-notes.md scripts/demo.sh README.md
git commit -m "docs: director protocol, notes template, demo scene, README"
```

---

### Task 9: Acceptance — persistence restart + success-criteria pass

**Files:** none created; fixes go wherever the pass finds problems.

- [ ] **Step 1: Persistence restart check**

```bash
rm -f world.json && node server.js & sleep 1
bash scripts/demo.sh
sleep 2 && kill %1 && sleep 1
node server.js & sleep 1
curl -s localhost:4380/state | node -e "
  let b='';process.stdin.on('data',d=>b+=d).on('end',()=>{
    const s=JSON.parse(b);
    console.assert(s.world.creatures.preacher,'preacher survived restart');
    console.assert(s.world.structures.chapel,'chapel survived restart');
    console.assert(s.world.chronicle.length>=2,'chronicle survived restart');
    console.log('persistence OK');});"
```

Expected: `persistence OK`. Reload the browser — same scene resumes.

- [ ] **Step 2: Success-criteria walkthrough (browser, Playwright if available)**

Check each item; fix and re-check anything that fails:

1. All six chassis + one custom spec animate in `gallery.html`; none look circular.
2. Creation bar → `create` input queued (`/state` shows it) + developing chip shown.
3. Simulated director spawn (curl) resolves the chip and the creature appears.
4. Specimen tag: sliders render from `attributes`, dragging queues `set-attribute`; whisper queues `whisper`; simulated `say` target `user` lands in the thread and as a dashed bubble.
5. Food bloom, hazard (creatures avoid), and drag all work and queue their inputs.
6. Chronicle: margin notes appear per `chronicle` command; overlay lists full history.
7. Director dot lights on `/state?consume=1`.
8. `node --test test/` fully green.

- [ ] **Step 3: Update docs to match reality**

Re-read `README.md`, `director/PROTOCOL.md`, and the spec's UI section against what was built; fix any drift (same-change-updates-docs rule).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: acceptance pass - persistence, success criteria, doc sync"
```

---

## Plan Self-Review (completed)

- **Spec coverage:** brain model A1 → Tasks 1+8 (protocol); verbs/nouns → Task 1 command set + Task 5 application; six-chassis extensible palette → Task 3 (presets as data + custom spec in gallery + `define-chassis`); world rules (motes/vents/shelters/no-death) → Tasks 4+5+8; Open Water UI + margin notes + god tools + whisper + sliders → Tasks 6+7; persistence (`world.json` + `director-notes.md`) → Tasks 1+8+9; success criteria → Task 9. Director-dependent behaviors (belief spread, faction drama) are protocol duties (Task 8), not page code — by design.
- **Placeholder scan:** none; every code step has complete code. PROTOCOL/README bodies are specified by exhaustive section lists tied to already-written code.
- **Type consistency:** command names, input `type` strings, creature fields (`epithet` included everywhere), `Net.*` signatures, `UI.*` names, and tuning constants cross-checked across tasks.
