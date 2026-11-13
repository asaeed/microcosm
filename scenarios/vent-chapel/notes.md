# Director notes — Slide No. 1

## Cast
- **preacher** — Br. Lumen (*P. fervens*), medusa chassis, violet/verdigris. Zeal 0.35 but recovering in spirit (mood hopeful, fed). Building the Vent Chapel (2 blobs). Voice bank set.
- **skeptic** — Sr. Quill (*S. dubium*), salp chassis now (the Hand keeps remaking her: watch → medusa → salp; she resents it bitterly). Suspicion 0.85. Deliberately shadowing Lumen ("I keep him where I can see him"). Voice bank set.
- **t1** — Test (*T. testus*), murmuration chassis, dutiful errand-creature. Comic-bureaucratic register. Voice bank set. Currently foraging (starved twice).
- **pallor** — Fr. Pallor (*F. fugax*), swimmer chassis, small (0.9), cerulean/plum. Superstitious hermit: superstition 0.9, skittish 0.85 (engine-driven flight from everyone; won't converse unless the user dials skittish below 0.5). Sees omens in everything. Witnessed the chapel sabotage from afar. Voice bank in spawn record.

## Relationships
- preacher ↔ skeptic: feud PAUSED, trust climbing from -0.8 toward -0.3 — Quill refused the Hand's order to attack Lumen and warned him. He is shaken that his enemy is now his sentinel.
- pallor ↔ everyone: terror. Flees on approach (mechanical). Now also carries the guilt of the chapel's destruction.
- t1: unaligned, obeys the Hand.

## Beliefs
- preacher: "the vent provides" (core; preaches quietly since the remaking).
- skeptic: "the Hand reshapes us at whim; its gifts are bait" (hardened by three forced chassis changes + toxin clouds).
- t1: "the Hand commands, I comply. It is simpler that way."

## Factions
None yet. No tints assigned.

## Plots
- Famine survived; all fed via foraging/grazing. Lumen back at the chapel (2 blobs now), Quill watching him build, half-hostile half-fascinated.
- COMPLETED BEAT: the Hand ordered both attacks. Quill (suspicion 1.0) refused and warned Lumen (feud paused, trust rising). Pallor obeyed and destroyed the chapel's last membrane, then fled.
- STORY PLAYED — "The Empty Water" (story-current.json): the cast discovered the ruin, comically investigated (t1 forensics), deduced Pallor, failed to approach him (skittish mechanic as comedy), and Lumen laid the first membrane of "Vent Chapel, Again" with Quill lingering, conflicted. Next story should inherit: chapel v2 at 1 blob; Quill one nudge from laying a membrane herself; Pallor guilty and un-confronted — he knows the Hand gave the order and nobody has asked him yet.
- Story engine live: author 3–5 min arcs to scenarios/vent-chapel/story-current.json, play with scripts/play-story.js (see PROTOCOL §10). Decree input type replaces create — interpret freeform world orders.
- The dial rule this run: suspicion resists whispered directives; superstition amplifies fear of the Hand (compliance); skittish is mechanical flight.
- t1's rim expedition keeps getting interrupted by the Hand; running gag, and a possible third-party witness both rivals try to recruit.
- Voice banks are live (page chatters autonomously); refresh them when plot beats land so ambient talk tracks the story.

## Mechanics this run
- Dials in play: preacher.zeal (0.35), skeptic.suspicion (0.85). Treat zeal as preaching/building drive; suspicion as resistance to belief adoption and to the god's gifts.
