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
that in the scenario's `notes.md` or your own scratch thinking, not in world text.

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

Think: update your mental model (and the scenario's notes file —
`scenarios/<name>/notes.md`, matching the server's `SCENARIO` env — if
anything notable changed: new relationship, new belief, new plot beat), then decide
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

All 15 verbs the server accepts (`CMDS` in `server.js`). Unknown commands or
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

**voice** — replaces the creature's ambient line banks. The page runs all
small-talk cadence itself (proximity conversations with turn-taking — each
bubble shows 5s, then a 3s pause — plus cross-slide approach visits); these
banks are the words it draws from, so author them per creature and refresh
them as the story shifts — stale banks mean creatures mutter last week's
plot. Kinds: `greetings`/`replies` (conversations), `musings` (solo),
`status` (the creature's brief, honest words to its god about its current
state — shown atop its popup menu when clicked; the page composes a plain
one from mood/energy/intent if unset), `onDrop` (spoken bubble after the
user drags it somewhere). Templates filled at speak time: `{name}`
(conversation partner), `{mood}`, `{energy}`. Built-in generic defaults
apply to any creature without a bank.

```json
{"cmd": "voice", "id": "preacher", "voice": {
  "greetings": ["Peace upon your membrane, {name}."],
  "replies": ["The vent provides. Even now."],
  "musings": ["One more membrane. Then rest."],
  "status": ["Rebuilding, Hand. Zeal thin; hands steady."],
  "onDrop": ["...so the Hand wills."]
}}
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

**unbuild** — removes the most recently laid blob from a structure (the
dispute verb: sabotage, decay, exile-by-demolition). Removing the last blob
deletes the structure entirely.

```json
{"cmd": "unbuild", "structureId": "chapel"}
```

**chronicle** — appends a timestamped field-note; shows as a margin note
and in the full chronicle overlay.

```json
{"cmd": "chronicle", "text": "Br. Lumen lays the first membrane of a chapel near the east vent."}
```

**world** — overwrites `vents`, `hazards`, and/or `story` wholesale (only
the keys you include are touched). `story: true` pauses the page's ambient
chatter for a performance — the story player sets and clears it
automatically, so you rarely send it by hand.

```json
{"cmd": "world", "vents": [{"pos": [0.22, 0.72], "period": 45}, {"pos": [0.78, 0.3], "period": 70}]}
```

## 4. Input types you must handle

Queued user inputs arrive in `/state`'s `inputs` array, each with a
server-added `t` timestamp. Handle every one you see before consuming.

- **`decree`** — `{type, prompt}`. Freeform text from the bottom bar; the
  user may describe a new specimen OR issue any order about the world and
  its characters ("make it rain food", "quill apologizes", "start a
  talent show"). Interpret and enact it.
  - Creature description → author a full creature: invent a name and
    Latinate epithet, pick a built-in chassis or write a `chassisSpec`,
    pick stains from the palette (§7), invent 1–3 slider `attributes`
    implied by the prompt (a "gullible normie" implies `gullibility`),
    place it, `spawn` it with a `voice` bank in character, and `chronicle`
    its arrival.
  - Anything else → translate into commands, story beats (§10), dial
    changes, or world edits — whatever enacts it best. Fold it into the
    current narrative rather than executing it robotically.
- **`whisper`** — `{type, id, text}`. The user spoke to creature `id`
  in-character. Reply with a `say` command targeting `"user"` from that
  creature, and let the whisper actually change something — update the
  creature's beliefs/relationships in the scenario's `notes.md`, and where
  it makes sense reflect it mechanically too (a `set-attribute`, a `tint`
  shift, a new intent). Reply promptly — the page tells the user their
  whisper is "queued" whenever the director looks away.
- **`set-attribute`** — `{type, id, name, value}`. Informational: the page
  has already written it canonically (it posts the matching `set-attribute`
  to `/act` itself). Don't echo it — just react narratively if the change
  matters (a zeal drop, a suspicion spike).
- **`set-chassis`** — `{type, id, chassis}`. Informational: the page has
  already re-`spawn`ed the creature with the new chassis itself. React
  in-fiction if you like — transformation is a dramatic event.
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
  that creature's tag. Invent whatever traits the scenario needs. One name
  is engine-recognized: **`skittish`** — creatures with it physically flee
  anyone within 0.18 (force scales with the value), and above 0.5 the
  chatter engine won't pull them into conversations. It's still a normal
  slider, so the user can dial a hermit into a socialite live.
- `chassis` names a built-in preset (§6) or an id you registered with
  `define-chassis`; `chassisSpec` (if non-null) overrides `chassis`
  entirely with an inline `{parts:[...]}` (and optional `orient:true`).
- `tint`, when set, is a hex color drawn as an aura behind the creature —
  use it for faction membership, not mood (mood is `emote`).
- `voice` (optional) holds the ambient line banks (see the `voice` command);
  the page's chatter engine reads it directly off the creature record.
- `intent` is `{"verb":"idle"}`, `{"verb":"forage"}`, or
  `{"verb":"move-to","target":[x,y]}` — set indirectly through the `idle`/
  `forage`/`move-to` commands, or directly in a `spawn`. The server's stored
  `intent` can be stale: the page auto-reverts a creature to `{"verb":"idle"}`
  once a move-to arrives (and on drag), but `/physics` only reports
  pos/energy, so `/state` may still show the old intent — judge "arrived" by
  position, not intent.

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
  Idle creatures also graze on their own: they drift toward motes within
  0.07 at 0.02 units/sec and eat within the same 0.02 radius — so a god
  food-drop matters even with no orders; and below 0.25 energy an idle
  creature forages in earnest by itself (full 0.05 speed, any distance), so
  populations no longer starve while socializing. `forage` is the
  deliberate version, and `move-to` travel ignores food entirely.
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
  theft, exile from a shelter, tearing membranes off a structure
  (`unbuild`) — never violence that harms/removes a creature.
- **No death, no reproduction** — full stop, this is a hard v1 constraint,
  not a tuning knob.
- **`tint`** is the faction-color mechanism: set it on member creatures
  (and optionally a structure they hold) to make membership visually
  legible as an aura/blob color.
- **Palette tokens** (use these hexes for stains/tints, matching the page's
  CSS variables): rose `#a13a63`, violet `#4a3f96`, cerulean `#33608f`,
  verdigris `#2e8b74`, ochre `#a1794a`, plum `#5e2a52`, clay `#96504f`.

## 8. Scenario notes conventions

Keep the scenario's `notes.md` (`scenarios/<name>/notes.md`, beside its
`world.json`) as **current state**, not a log. Sections: Cast,
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

## 10. Stories

Whenever you attend the world, don't just answer inputs — weave a story.
Author a 3–5 minute arc for the characters currently present (mine the
scenario notes: relationships, plots, dials), then let the engine play it
back on a timeline:

1. Write the arc as timed beats to `scenarios/<name>/story-current.json`:

```json
{"beats": [
  {"commands": [{"cmd": "chronicle", "text": "Act one begins..."}]},
  {"wait": 15, "commands": [{"cmd": "say", "id": "preacher", "text": "..."}]},
  {"until": {"id": "pallor", "near": [0.31, 0.67], "dist": 0.07, "timeout": 90},
   "commands": [{"cmd": "unbuild", "structureId": "chapel"}]}
]}
```

2. Launch it (kill any previous player first):

```bash
pkill -f play-story; nohup node scripts/play-story.js \
  scenarios/<name>/story-current.json > /dev/null 2>&1 &
```

The player automatically brackets the performance with `world story:true/false`,
which pauses the page's ambient chatter so the narrative reads clean (poke and
drop reactions stay live; a crashed player un-pauses itself after 2 quiet
minutes).

Story rules: silly, funny, dramatic, thrilling — **never too serious**.
Beats every 8–20 seconds, speech in one-or-two-line volleys (the page's
5s/3s bubble cadence paces itself). Use only creatures present. End every
story with a ~60-second wander beat (scattered `move-to`s, `forage`s)
before whatever comes next. Stories change real state — builds, tints,
moods, dials — so update the scenario notes after authoring, and make the
next story inherit the consequences of the last.
