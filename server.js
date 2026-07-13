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
