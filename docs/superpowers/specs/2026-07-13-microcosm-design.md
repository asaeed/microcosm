# Microcosm — Design Spec

**Date:** 2026-07-13
**Status:** Approved pending user review
**One-liner:** A browser-based microscopic world of AI-driven single-cell creatures. The user creates characters with freeform text, watches them pursue goals, form alliances, and scheme — and intervenes as a god. Claude Code (a live interactive session) is the brain that decides everything every creature does and says.

## Core decisions (settled during brainstorm)

| Decision | Choice |
|---|---|
| Brain model | **A1 — Claude Code live in the session.** The page is a stage; the running Claude session is the director. No headless daemon, no embedded API key. |
| User presence | **Interventionist god.** Whisper to creatures (in-character chat), drop food blooms, spawn hazards, drag creatures. |
| Life/death | **No death, no reproduction** in v1. Shelved as a possible pivot after feel-testing. |
| Visual world | **Vintage Specimen Plate.** Warm parchment brightfield slide, stained-watercolor creatures, serif field-note typography, Haeckel energy. |
| Layout | **Open Water + Margin Notes.** Full-bleed slide; floating creation bar; god tools in a corner; chronicle as handwritten margin notes drifting up the right edge (hover to freeze, scroll full history). |
| Creature designs | **Six-chassis extensible palette:** Alien Reactor, Ciliated Swimmer, Skirted Medusa, The Watch, Salp Chain, Murmuration. Chassis are data, not code — new ones can be defined mid-run. |

## Design principle: verbs vs nouns

The page implements a small set of generic **verbs** (move, say, emote, forage, build, give, tint, set-attribute, spawn, define-chassis, plus bookkeeping: chronicle, world). All **meaning** — religion, gullibility, elections, feuds — lives in the director's head and notes. New scenario mechanics never require new page code; the director improvises them through the same verbs. This is what makes "limitless scenarios" tractable.

## Architecture

Three parts, one repo (`~/claude/microcosm/`):

```
browser (index.html)  ←SSE/HTTP→  server (server.js)  ←HTTP→  director (Claude Code session)
   stage: render + physics          canonical state store        brain: behavior + speech + story
```

- **`server.js`** — Node, stdlib only (`http`, `fs`). Serves static files, holds canonical world state, relays messages, persists to disk. No npm dependencies.
- **`index.html`** — single file, vanilla JS + SVG. Renders the world at 60fps, owns physics/ambient motion, collects user input.
- **Director** — the interactive Claude Code session. Polls state, thinks, posts commands. Also authors creatures and chassis. Runs a tick every ~5–15s while the session is active. World pauses (gracefully, ambient motion continues) when the director is away.

### Authority split

- **Page-authoritative:** positions, motion interpolation, mote/particle simulation, collisions, eating contact, energy decay. Page reports physics deltas to the server.
- **Director-authoritative:** all behavior, speech, social state, story. Beliefs/trust/factions/plots live in `director-notes.md`, not in server state.
- **Server-authoritative:** nothing; it is the message hub and the single persistent store of renderable state.

### Server endpoints

| Endpoint | Direction | Purpose |
|---|---|---|
| `GET /` | browser | serve `index.html` |
| `GET /events` (SSE) | server→browser | push director commands + state changes live |
| `POST /input` | browser→server | user actions: create-creature prompt, whisper text, slider change, god-tool use, drag |
| `GET /state` | director | full world snapshot + queued unconsumed user inputs |
| `POST /act` | director | batch of commands (see verb list); applied to state, broadcast via SSE |
| `POST /physics` | browser→server | debounced physics deltas (positions, energy, motes eaten) |

### Director command verbs

`move-to`, `say` (with target: creature/user/broadcast), `emote` (mood affects animation intensity/posture), `forage` (seek food; contact/consumption is page-side), `build` (biofilm structure: grow/extend/name), `give` (motes between creatures), `tint` (faction color drift), `set-attribute`, `spawn-creature` (full creature record incl. chassis spec), `define-chassis` (add a body plan to the palette), `chronicle` (write a margin note), `world` (vent timing, ambient events).

## Creature model

```json
{
  "id": "c7", "name": "Brother Credulon",
  "prompt": "a very gullible normie who...",
  "chassis": "watch | reactor | swimmer | medusa | salp | murmuration | <custom id>",
  "chassisSpec": { "parts": [ ... ] },
  "stains": { "body": "#a13a63", "accent": "#2e8b74" },
  "scale": 1.0,
  "attributes": { "gullibility": 0.8 },
  "pos": [x, y], "energy": 0.7,
  "intent": { "verb": "move-to", "target": [x, y] },
  "mood": "anxious", "tint": "#4a3f96"
}
```

- `attributes` is an open dictionary. The director invents dialable traits per run (the gullibility mechanic); the UI renders every entry as a 0–1 slider in the creature's specimen tag. Slider changes flow back to the director as inputs.
- `chassisSpec` composes the **parts library**; the six palette entries are built-in presets expressed in the same format.

### Parts library (render primitives)

`gooBody` (N drifting lobes + pseudopods, goo-filtered union — the amorphous base), `ring` (rotating dashed), `core` (pulsing), `orbiter` (geometric satellite), `eye` (blinking, gaze-tracking), `cilia` (fringe), `flagella` (trailing, rippling), `ribbonSkirt` (undulating hem + ribbon tentacles), `waveChain` (segmented traveling-wave body), `swarm` (particle cloud + heart-mote + dashed halo), `stalkLure` (glowing dangled bulb), `nucleus`/`grain`/`vacuole` (organelles).

Each part takes params (count, size, color, speed). A chassis = list of parts + a motion style (`drift`, `swim`, `undulate`, `wave`, `swarm`). Gaze (eyes), orientation (swimmer front), and mood modulation are driven by intent/emote state.

## World rules v1

- **Food:** motes drift down like marine snow; 2–3 vents bloom on cycles. Eating restores energy; energy decays slowly. At zero energy a creature goes sluggish and plaintive — never dies.
- **Shelter:** creatures secrete biofilm structures (blob unions that grow over multiple ticks). Structures are named places; shared building expresses alliance.
- **Relationships:** pairwise trust/affinity, tracked by the director. Gifts build it; theft, insults, broken promises burn it.
- **Beliefs & rumors:** information objects held per-creature, spread on mingling; adoption odds shaped by traits (e.g. gullibility). User whispers inject beliefs directly.
- **Factions:** emerge when beliefs/goals cluster; visible as membrane `tint` drift; factions claim vents; contested vents ignite disputes.
- **Disputes:** shoving, mote theft, exile from shelters. Social violence only.

## UI spec

- Full-bleed parchment slide, dashed graticule ring, ambient motes.
- **Creation bar** (bottom center, paper style): freeform prompt → queued for director, who names the creature, composes/picks chassis, sets stains, infers slider attributes. A shimmering "specimen developing…" placeholder appears until the director's spawn command lands.
- **Specimen tag popover** (click creature): name, epithet, mood; attribute sliders; whisper thread (user types, director answers in character); chassis override control.
- **God tools** (corner cluster, brass instruments): food bloom (click place), hazard (toxin cloud), drag (pointer-drag a creature; the director is informed and creatures may react indignantly).
- **Chronicle margin notes** (right edge): director-authored observations drift up and fade; hover freezes; click opens the full scrollable record.
- **Speech bubbles:** handwritten paper specimen tags near the speaker, queued to avoid overlap, fading after a few seconds. Also logged to the chronicle when noteworthy.
- All major elements carry `className`s for devtools identification.

## Persistence

- Server writes `world.json` (debounced) on every change; loads it on boot. The slide, creatures, structures, and chronicle survive restarts.
- The director maintains `director-notes.md` in the repo — social graph, beliefs, plots, per-run mechanics — so a *future session* can resume the story, not just the scenery.

## Tick protocol (director loop)

1. `GET /state` → snapshot + unconsumed user inputs.
2. Think: update social state in notes; for each creature (batch, not per-creature calls — the director is one mind) decide next intents and any speech.
3. `POST /act` with the command batch (typically 5–20 commands).
4. Repeat every ~5–15s; page interpolates so motion never stutters. Between ticks, ambient behavior (drifting, idle wobbles, mote eating already in progress) continues page-side.

## Out of scope (v1)

Death/reproduction (shelved pivot), sound, mobile layout, multi-user, auth, headless daemon mode (protocol deliberately supports adding it later as a wrapper — same `/state` + `/act`).

## Success criteria

The preacher/skeptic scenario runs end-to-end: create "a preacher" and "a skeptic" and 10 gullible normies via the creation bar; each normie's tag shows a working gullibility slider the director invented; belief spread is visible (tint drift, chronicle notes, congregation at a built chapel); whispering "the preacher hoards motes" to the skeptic changes behavior; food drop / hazard / drag all provoke reactions; killing the terminal and reopening tomorrow resumes the same world and story.
