#!/usr/bin/env node
// Story player — engine-side playback of a director-authored story arc.
// The director writes the beats (the brain work happens at authoring time);
// this script only times them. Usage:
//   node scripts/play-story.js scenarios/<name>/story-current.json
// Story shape: {"beats": [
//   {"wait": 15, "commands": [ ...same command objects as POST /act... ]},
//   {"until": {"id": "pallor", "near": [0.31, 0.67], "dist": 0.07, "timeout": 90}, "commands": [...]}
// ]}
const fs = require('fs');
const story = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const base = process.env.MICROCOSM_URL || 'http://localhost:4380';
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

const act = (commands) => fetch(`${base}/act`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ commands }),
}).catch(() => {});

(async () => {
  await act([{ cmd: 'world', story: true }]); // pauses the page's ambient chatter for the performance
  for (const beat of story.beats || []) {
    if (beat.wait) await sleep(beat.wait);
    if (beat.until) {
      const { id, near, dist = 0.07, timeout = 90 } = beat.until;
      const t0 = Date.now();
      while (Date.now() - t0 < timeout * 1000) {
        try {
          const s = await (await fetch(`${base}/state`)).json();
          const c = s.world.creatures[id];
          if (c && Math.hypot(c.pos[0] - near[0], c.pos[1] - near[1]) < dist) break;
        } catch {}
        await sleep(2);
      }
    }
    if (beat.commands && beat.commands.length) await act(beat.commands);
  }
  await act([{ cmd: 'world', story: false }]); // curtain down: ambient chatter resumes
})();
