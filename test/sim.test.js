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
