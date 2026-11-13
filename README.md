# Microcosm

A browser petri-dish world of AI-driven single-cell creatures. The page is
a stage — vintage-specimen-plate visuals, SVG creatures built from a small
parts library, page-owned physics (drift, motes, energy decay). A live
Claude Code session is the director: it decides everything every creature
does and says, and writes the story (relationships, beliefs, factions,
plots) as it goes. No death, no reproduction, no LLM API key — the
"brain" is whichever Claude Code session is attending the world.

## Run it

```bash
node server.js                      # runs the "default" scenario
SCENARIO=vent-chapel node server.js # runs a named scenario
```

Then open `http://localhost:4380`.

**Engine vs scenario:** the repo is the engine; each running world is a
scenario. A scenario lives in `scenarios/<name>/` (gitignored) and holds
`world.json` (the save — creatures, structures, chronicle) and `notes.md`
(the director's living memory for that run). State persists on every change
and reloads on restart, so a slide survives killing the terminal. Set
`PORT`/`MICROCOSM_SAVE` env vars to override the default port (4380) or
save-file location.

## Summon the director

Open Claude Code in this repo and say something like:

> Read `director/PROTOCOL.md` and run the world.

`director/PROTOCOL.md` is the full operating manual: server endpoints, all
13 command verbs with JSON examples, the creature schema, chassis/parts
reference, world rules and tuning numbers, and style guidance. It also
covers the scenario's `notes.md`, which the director keeps up to date as
the world's living memory (cast, relationships, beliefs, factions, plots)
so a future session can pick the story back up.

## No-AI smoke test

```bash
bash scripts/demo.sh
```

Plays a short scripted scene (two creatures spawn, converse, one starts
building a chapel) directly against a running server via `curl` — no
Claude session required. Useful for verifying the server/page plumbing
works before involving a director.

Run the tests: `node --test test/*.test.js`

## Chassis gallery

Open `public/gallery.html` (served by the same server, e.g.
`http://localhost:4380/gallery.html`) to see all six built-in chassis
presets plus one custom `chassisSpec`, rendered side by side.

## File map

```
server.js                 # state hub: static files, /state /input /act /physics, SSE, persistence
test/server.test.js       # node:test HTTP tests
test/sim.test.js          # node:test pure-function tests
public/index.html         # DOM shell, CSS, SVG defs, layers, app glue
public/parts.js           # PARTS render primitives, CHASSIS presets, renderCreature
public/sim.js             # physics: steering, motes, energy, hazards
public/net.js             # Net: input/physics/listen (SSE) helpers
public/ui.js              # creation bar, specimen-tag popover, god tools, chronicle notes, presence dot
public/gallery.html       # dev page: renders every chassis preset + one custom spec
director/PROTOCOL.md      # the director's operating manual
scenarios/<name>/         # one running world: world.json (save) + notes.md (director memory), gitignored
scripts/demo.sh           # AI-free smoke scene (seeds whatever scenario the server is running)
```

## Design docs

- `docs/superpowers/specs/2026-07-13-microcosm-design.md` — the design spec
- `docs/superpowers/plans/2026-07-13-microcosm.md` — the implementation plan
