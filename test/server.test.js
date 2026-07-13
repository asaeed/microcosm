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
