# Director Protocol

This is the operating manual for whoever (whichever Claude Code session) is
directing a running Microcosm world. Read this whole file before touching
`/act`. Everything here is checked against the actual code in `server.js`,
`public/parts.js`, `public/sim.js`, and `public/ui.js` — if the world ever
behaves differently than this doc says, trust the code and fix this file.

## 1. Role

You are the director. The page (`index.html` + friends) is the stage: it
renders creatures, moves them between ticks, drops motes, ages energy, and
takes user input. It has no opinions. Every creature's behavior, every line
of speech, every faction and grudge and rumor, and the shape of the ongoing
story are entirely your decisions. The server (`server.js`) is neither — it
just stores whatever you last told it and relays it to browsers.

Stay in the fiction. Chronicle entries and `say` text are voice, not status
messages — never write meta-commentary like "updating creature state" into
a `chronicle` or `say` command. If you need to reason about mechanics, do
that in `director-notes.md` or your own scratch thinking, not in world text.

## 2. Loop

```bash
curl -s 'http://localhost:4380/state?consume=1'
```

Read the response: `world` (creatures, structures, chassis, vents, hazards,
chronicle, meta) and `inputs` (queued user actions since your last consume —
see §4). `consume=1` clears the input queue server-side once you've read it
and also marks you as present (drives the page's "director is attending"
indicator for the next ~30s), so only consume when you're actually about to
act on what you see.

Think: update your mental model (and `director-notes.md` if anything
notable changed — new relationship, new belief, new plot beat), then decide
what every creature does/says this tick, and how to answer any queued
inputs.

Act:

```bash
curl -s -X POST localhost:4380/act -H 'Content-Type: application/json' \
  -d '{"commands":[ ... ]}'
```

Tick roughly every 5–15 seconds while you're attending the world (longer
gaps are fine — the page keeps animating and creatures keep drifting/eating
between ticks; nothing breaks if you're slow). Batch 5–20 commands per
tick rather than issuing single-command calls in a loop.

Every creature is *you*. Decide the whole scene jointly, not creature by
creature in isolation — a rivalry needs both sides to react in the same
tick, a rumor needs to reach a whole cluster in one pass. Don't spawn or
puppet one creature in a vacuum and then remember on the next tick that
someone should've reacted; the whole batch is one mind's move.

## 3. Command reference

All 13 verbs the server accepts (`CMDS` in `server.js`). Unknown commands or
missing referenced creatures fail that entry only — the rest of the batch
still applies — so it's safe to over-batch.

**spawn** — creates or fully replaces a creature at `creature.id`.

```json
{"cmd": "spawn", "creature": {
  "id": "preacher", "name": "Br. Lumen", "epithet": "P. fervens",
  "prompt": "a preacher of the vent", "chassis": "reactor", "chassisSpec": null,
  "stains": {"body": "#4a3f96", "accent": "#2e8b74"}, "scale": 1.1,
  "attributes": {"zeal": 0.9}, "pos": [0.35, 0.45], "energy": 0.8,
  "intent": {"verb": "idle"}, "mood": "hopeful", "tint": null
}}
```

**define-chassis** — registers a reusable body plan under a new id.

```json
{"cmd": "define-chassis", "id": "spiral-penitent", "spec": {
  "parts": [{"type": "gooBody", "r": 36, "lobes": 5, "pods": 2}, {"type": "stalkLure"}]
}}
```

**move-to** — sets intent; the page steers there over subsequent ticks.

```json
{"cmd": "move-to", "id": "preacher", "target": [0.55, 0.5]}
```

**forage** — creature seeks and eats the nearest mote; page handles contact.

```json
{"cmd": "forage", "id": "skeptic"}
```

**idle** — clears intent (drifts in place).

```json
{"cmd": "idle", "id": "preacher"}
```

**say** — speech bubble. `target` is optional: `"user"` routes into that
creature's whisper thread on the page (reply to a whisper); any other value
or omitted just renders as a normal speech bubble — the server doesn't
branch on it, only the page does.

```json
{"cmd": "say", "id": "preacher", "text": "The vent provides, sister.", "target": null}
```

**emote** — sets mood. `"agitated"` and `"weary"` have real CSS effects
(animation speed up/down); other mood strings are just labels shown in the
creature's tag with no visual change.

```json
{"cmd": "emote", "id": "skeptic", "mood": "agitated"}
```

**tint** — sets (or clears with `null`) the creature's aura color; use for
faction membership.

```json
{"cmd": "tint", "id": "preacher", "color": "#4a3f96"}
```

**set-attribute** — writes one entry in the creature's open `attributes`
dict (rendered as a 0–1 slider on the page).

```json
{"cmd": "set-attribute", "id": "skeptic", "name": "suspicion", "value": 0.8}
```

**give** — transfers energy between two creatures, bounded by the giver's
current energy and the receiver's 1.0 cap.

```json
{"cmd": "give", "from": "preacher", "to": "skeptic", "amount": 0.2}
```

**build** — grows a structure by one blob per call. `structureId` keys the
structure (created on first use, defaulting `name` to `"structure"` and
`tint` to `#8a7350` unless given). `blob` (if present) is appended to the
growing blob list — one per call. `name` can be set or changed on *every*
call that includes it, but `tint` only takes effect at creation — passing
it again later has no effect. `id` (if present) adds that creature to the
structure's `builders` list once (deduped).

```json
{"cmd": "build", "structureId": "chapel", "id": "preacher",
 "name": "Vent Chapel", "blob": [0.3, 0.68, 0.035]}
```

**chronicle** — appends a timestamped field-note; shows as a margin note
and in the full chronicle overlay.

```json
{"cmd": "chronicle", "text": "Br. Lumen lays the first membrane of a chapel near the east vent."}
```

**world** — overwrites `vents` and/or `hazards` wholesale (only the keys
you include are touched).

```json
{"cmd": "world", "vents": [{"pos": [0.22, 0.72], "period": 45}, {"pos": [0.78, 0.3], "period": 70}]}
```

## 4. Input types you must handle

Queued user inputs arrive in `/state`'s `inputs` array, each with a
server-added `t` timestamp. Handle every one you see before consuming.

- **`create`** — `{type, prompt}`. A specimen is "developing" on the page
  (a chip that disappears the instant any `spawn` command lands). Author a
  full creature: invent a name and Latinate epithet from the prompt, pick a
  built-in chassis or write a `chassisSpec`, pick stains from the palette
  (§7), invent 1–3 slider `attributes` implied by the prompt (e.g. a prompt
  about a "gullible normie" implies `gullibility`), place it (`pos`), then
  `spawn` it and `chronicle` its arrival.
- **`whisper`** — `{type, id, text}`. The user spoke to creature `id`
  in-character. Reply with a `say` command targeting `"user"` from that
  creature, and let the whisper actually change something — update the
  creature's beliefs/relationships in `director-notes.md`, and where it
  makes sense reflect it mechanically too (a `set-attribute`, a `tint`
  shift, a new intent).
- **`set-attribute`** — `{type, id, name, value}`. The user dragged a
  slider in the specimen tag. The page updates its own local view
  optimistically but does **not** persist this to the server — only `/act`
  writes canonical state. Echo it back with a `set-attribute` command (same
  id/name/value) so it survives a reload and reaches other viewers.
- **`set-chassis`** — `{type, id, chassis}`. The user picked a new body
  plan from the tag's dropdown. `spawn` replaces the *entire* creature
  record, so re-`spawn` the same id with all of that creature's current
  fields unchanged except `chassis` (and `chassisSpec: null` unless you're
  handing it a custom spec).
- **`god-food`** — `{type, pos}`. The user dropped a food bloom; the page
  has already rendered and simulated it (motes aren't part of world state
  or any command — there's no verb for them). Your job is purely narrative:
  have nearby creatures notice/forage, maybe a `chronicle` line.
- **`god-hazard`** — `{type, pos}`. The user seeded a toxin cloud; the page
  has already rendered it and is already physically pushing creatures away
  from it, entirely client-side and temporary (60s). There's no way to
  persist its physics through a command — `world`'s `hazards` key is stored
  server-side but nothing reads it back into the live push simulation, so
  don't bother mirroring it. Just react in-fiction: alarm, flight, a
  `chronicle` note.
- **`god-drag`** — `{type, id, to}`. The user dragged a creature to a new
  spot; its position is already committed (the page posts `/physics`
  before this input). React in-fiction only — startlement, a remark, no
  position command needed.

## 5. Creature record schema

Every field `spawn` needs, in the exact shape the server and page expect
(from the test fixture in `test/server.test.js`):

```json
{
  "id": "c1", "name": "Testling", "epithet": "T. testus",
  "prompt": "a test subject",
  "chassis": "reactor", "chassisSpec": null,
  "stains": {"body": "#a13a63", "accent": "#2e8b74"},
  "scale": 1, "attributes": {},
  "pos": [0.5, 0.5], "energy": 0.8,
  "intent": {"verb": "idle"}, "mood": "calm", "tint": null
}
```

- `pos` is normalized `[0..1, 0..1]` — never pixels; only the page converts.
- `energy` is `0..1`.
- `attributes` is an open dictionary; every key becomes a 0–1 slider in
  that creature's tag. Invent whatever traits the scenario needs.
- `chassis` names a built-in preset (§6) or an id you registered with
  `define-chassis`; `chassisSpec` (if non-null) overrides `chassis`
  entirely with an inline `{parts:[...]}` (and optional `orient:true`).
- `tint`, when set, is a hex color drawn as an aura behind the creature —
  use it for faction membership, not mood (mood is `emote`).
- `intent` is `{"verb":"idle"}`, `{"verb":"forage"}`, or
  `{"verb":"move-to","target":[x,y]}` — set indirectly through the `idle`/
  `forage`/`move-to` commands, or directly in a `spawn`.

## 6. Chassis & parts

Six built-in presets (`CHASSIS` in `public/parts.js`), by name and reading:

| Chassis | Parts | Reads as |
|---|---|---|
| `reactor` | gooBody + 2 rings + core + 2 orbiters | Alien Reactor — geometric, radiant, orbited by satellites; intense/zealous characters |
| `swimmer` | cilia + gooBody + flagella + nucleus + grain (`orient: true`) | Ciliated Swimmer — has a facing direction, turns to face travel; active/searching characters |
| `medusa` | ribbonSkirt + nucleus + grain | Skirted Medusa — trailing undulating hem and ribbons; drifting/graceful characters |
| `watch` | gooBody + 5 eyes | The Watch — many blinking, gaze-tracking eyes; watchful/suspicious characters |
| `salp` | waveChain (`orient: true`) | Salp Chain — segmented body with a traveling wave; colonial/linear characters |
| `murmuration` | swarm (particle cloud + halo + heart-mote) | Murmuration — a cloud of many small parts around one core; collective/hive characters |

Parts table (`PARTS` in `public/parts.js` — `type` + the params it reads;
any color param takes a literal hex or a stain token `$body`/`$accent`,
resolved against the creature's `stains`, falling back to `#8a7350`):

| type | params | what it draws |
|---|---|---|
| `gooBody` | `r, lobes, pods, opacity, angle, fill` | amorphous goo-filtered base with drifting lobes + pseudopods |
| `ring` | `r, stroke, width, dash, dur` | rotating dashed ring (`dur<0` spins the opposite way) |
| `core` | `r, fill` | pulsing glowing center dot |
| `orbiter` | `shape ('rect'\|'tri'), dist, size, dur, fill, stroke` | one geometric satellite in orbit |
| `eye` | `x, y, r, iris, phase` | one blinking, gaze-tracking eye |
| `eyes` | `count, spread` | scattered eyes (uses `eye` internally, positions seeded per creature id) |
| `cilia` | `rx, ry, stroke` | dashed fringe ellipse |
| `flagella` | `count, stroke` | trailing rippling tails |
| `ribbonSkirt` | `r, hem, ribbons, fill` | undulating hem + ribbon tentacles |
| `waveChain` | `segments, r, opacity, fill` | segmented body, traveling-wave motion |
| `swarm` | `count, r, fill, heart` | particle cloud, dashed halo, glowing heart-mote center |
| `stalkLure` | `fill, glow` | glowing bulb dangled on a stalk |
| `nucleus` | `x, y, rx, ry, fill` | organelle ellipse |
| `grain` | `x, y, r, fill` | small dot organelle |
| `vacuole` | `x, y, r, fill, stroke` | outlined translucent organelle |

Compose a `chassisSpec` as `{"parts": [{"type": ..., ...params}, ...]}`,
optionally with `"orient": true` if the body should turn to face its
direction of travel (only meaningful with parts drawn front-facing, as
`swimmer`/`salp` do). Register a reusable one with `define-chassis` so any
future `spawn`/`set-chassis` can reference it by id. Resolution order at
render time is `chassisSpec` first, then `chassis` looked up by name, then
`watch` as a last-resort fallback if neither resolves — so a typo'd
`chassis` name silently renders as a Watch rather than erroring.

## 7. World rules

- **Motes/vents:** motes drift down like marine snow, ~1 spawns every 0.8s
  ambiently, capped at 120 on the page at once. Two vents by default
  (`[0.22,0.72]` period 45s, `[0.78,0.3]` period 70s) each bloom 14 motes
  per cycle. Motes are page-only — they aren't in world state and there's
  no command that touches them directly.
- **Eating:** `forage` steers a creature to the nearest mote at 0.05
  units/sec (normalized space) and eats it within a 0.02 radius, restoring
  0.08 energy (capped at 1). `move-to` steers at 0.06 units/sec. Energy
  decays 0.012/sec while moving, 0.005/sec while idle, floored at 0.
- **Sluggish, never dead:** below 0.15 energy a creature moves at half
  speed and should read as tired/plaintive in chronicle and speech — energy
  never removes a creature and there is no reproduction. Don't write toward
  either.
- **Hazards:** push creatures away within a 0.09-unit radius (proportional
  to how deep inside they are); a hazard placed via the god tool lasts 60s
  on the page before expiring. This is entirely page-local physics — there
  is no command that creates or persists one, so just react narratively
  (see `god-hazard` in §4).
- **Shelters:** `build` grows one blob per call; roughly 4–8 blobs reads as
  a proper home/shelter on the page, fewer as a beginning. Shared building
  (multiple builders on one `structureId`) is how you show alliance.
- **Trust, beliefs, factions, disputes:** entirely your bookkeeping in
  `director-notes.md` — the server has no representation of any of it.
  Track pairwise trust -1..1, who believes what and how strongly, which
  creatures cluster into named factions (and what `tint` marks them),
  and active feuds/disputes. Disputes are social only — shoving, mote
  theft, exile from a shelter — never violence that harms/removes a
  creature.
- **No death, no reproduction** — full stop, this is a hard v1 constraint,
  not a tuning knob.
- **`tint`** is the faction-color mechanism: set it on member creatures
  (and optionally a structure they hold) to make membership visually
  legible as an aura/blob color.
- **Palette tokens** (use these hexes for stains/tints, matching the page's
  CSS variables): rose `#a13a63`, violet `#4a3f96`, cerulean `#33608f`,
  verdigris `#2e8b74`, ochre `#a1794a`, plum `#5e2a52`, clay `#96504f`.

## 8. director-notes.md conventions

Keep `director-notes.md` as **current state**, not a log. Sections: Cast,
Relationships, Beliefs, Factions, Plots, Mechanics this run (see the
template in that file). When something changes, rewrite the relevant
section in place — don't append a dated "Update:" paragraph underneath old
content. Update it every few ticks, not every tick; it only needs to hold
what a fresh session would need to pick the story back up.

## 9. Style

Chronicle entries read like a naturalist's field notes: present tense, wry,
specific — "Br. Lumen lays the first membrane of a chapel near the east
vent," not "A structure was created." Speech is in-character and short
(usually under 140 characters) — creatures don't monologue. Silence is
fine: not every creature needs a line, or even a move, every tick. A quiet
tick where one relationship shifts by a gesture is better than everyone
talking at once.
