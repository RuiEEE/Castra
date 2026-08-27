# Castra — project context

Local-only dashboard for **Travian Kingdoms**. Vite + React, no backend, no network
calls. State lives in `localStorage`, with JSON import/export.

**Multi-tribe + multi-server (DATA_VERSION 7).** Supports Romans, Gauls and Teutons, and
several game worlds at once. State is `{ activeServerId, servers: [{ id, name, settings,
villages, troops, mix, routes, hero* }] }`; each server is self-contained. Tribe is chosen
once in the "Add server" flow and is **FIXED for that server's lifetime — there is no tribe
switching.** The store flattens the active server to the top level so every tab reads props
unchanged. Horse Drinking Trough is **Roman-only**. Gaul/Teuton merchant constants and the
non-Roman export unit-key order are still unconfirmed guesses — see memory
`multi-tribe-servers.md`.

Run: `npm install && npm run dev` → localhost:5180

## Purpose

Min-max empire progression across multiple villages. Three questions it answers:
1. Where is production going, and what's about to overflow or starve?
2. How big an army can I feed, and when do I hit the crop wall?
3. Which resources should move between which villages, using how many merchants?

## Architecture

```
src/
  gameData.js   troop table, tribe constants, defaults, provenance flags
  calc.js       pure functions — production, upkeep, ceiling, distance, routing. No React.
  gameImport.js parses the game's own `?c=player&a=getAll` response into village patches. Pure.
  store.js      localStorage + versioned migration + import/export
  components/
    Villages.jsx    overview cards + data entry + the game-export import
    Hero.jsx        hero placement and attribute points
    Production.jsx  empire training output + build-now distribution
    Crop.jsx        crop balance + merchant feeding plan
    Reference.jsx   editable troop table + world settings
```

Army.jsx, Trade.jsx, EmpireMap.jsx and VillageMap.jsx are still on disk but unwired. Trade is to be
reworked later, so its routing/parking helpers stay in `calc.js`. VillageMap drew a 7x7 schematic of
a village in the editor; the owner judged it not worth the space and it was removed 2026-08-23.

**The game export is the only import path.** The old paste-a-table modes for troops and population
were dropped once `?c=player&a=getAll` was shown to carry both, more accurately (2026-08-23). The
standing instruction is to keep going the same way: when the export carries something the app was
asking the owner to type, build the feature on the richer data and retire the manual entry.

`calc.js` has no React dependency by design — testable, and reusable if this ever gets a scraper.

## CRITICAL: game data rules

**This is Travian Kingdoms, NOT Travian Legends (T4).** They differ materially. Do not "correct"
Kingdoms values toward T4 values, and do not fill gaps from T4 without flagging it.

**Kingdoms charges no crop to train troops.** Cost is wood/clay/iron only. Crop is upkeep alone.
Every confirmed Kingdoms unit page lists exactly three resources. T4 charged crop up front. The
`cost` array keeps a 4th slot (crop) so the model stays general — it is 0 for Kingdoms. Do not
populate it from T4 data.

**Kingdoms costs run ~40–50% below T4.** Using T4 figures understated sustainable build rate by ~36%
on a 1:1 Imperian/Equites Caesaris mix. This is not cosmetic.

Every troop carries a `src` flag. Respect it:
- `kingdoms` — confirmed from support.kingdoms.com. Do not change without a source.
- `t4` — Legends fallback, unconfirmed for Kingdoms. Pessimistic. Replace when the real value is known.
  No units remain in this state — all ten Roman units are fully confirmed (costs and stats).
- `user` — the owner typed it. **Most authoritative thing in the file.** Never overwrite.

`store.js` tracks `editedFields` per unit so hand-edits survive shipped-table updates. If you change
the shipped table in `gameData.js`, bump `DATA_VERSION` in `store.js` or stale localStorage will
shadow your change.

### Confirmed Kingdoms values

Combat stats (att / def-inf / def-cav / speed / carry / crop) are confirmed for **all ten** Roman units
from https://support.kingdoms.com/en/articles/109-troop-specifications — every value matched T4.
Siege weapons count as **infantry** in combat calculations.

Costs confirmed for **all 10 of 10** (owner verified in-game 2026-07-16):

| Unit | Wood | Clay | Iron |
|---|---|---|---|
| Legionnaire | 75 | 50 | 100 |
| Praetorian | 80 | 100 | 160 |
| Imperian | 100 | 110 | 140 |
| Equites Legati | 100 | 140 | 10 |
| Equites Imperatoris | 350 | 260 | 180 |
| Equites Caesaris | 280 | 340 | 600 |
| Battering Ram | 700 | 180 | 400 |
| Fire Catapult | 690 | 1000 | 400 |
| Senator | 30750 | 27200 | 45000 |
| Settler | 3500 | 3000 | 4500 |

Roman merchant: 500 capacity, 16 fields/hour. Marketplace level = merchant count.

Senator/Settler speed confirmed in-game: **8 / 10** (article-page values, not the spec
table's 4/5). Conflict flags dropped. Trade Office confirmed: 20% base, Romans reach 2×
capacity at level 5, 3× at 10, 4× at 15, 5× at 20 — matches `tradeOfficeBonusPerLevel: 0.20`.

Full editable knowledge base: `GAME_DATA.md`.

### Open questions — ask the owner, don't guess

1. ~~One unexplained training-time modifier.~~ **SOLVED (2026-08-26).** `base * 0.9^(level-1)`
   is CONFIRMED for Kingdoms — the export's `UnitQueue.durationPerUnit / baseTrain` falls 0.9002
   per building level, identically for every unit type. The "flat ~3.35% global speedup of unknown
   cause" seen on top of it was the **fealty training-time bonus** — empire-wide, `0.5·L − 6`%,
   which at the owner's L18–19 gives ~3.35–3.5%. Confirmed by a real in-game data point: a
   Praetorian in the capital takes **3m05s**, and the model lands 185.8s (3m06s) using fealty −3.5%
   × Archon −19% with **no** extra factor — an independent 3.35% on top would predict ~3m00s, under
   the game figure. So there is no leftover mystery modifier; it is now modelled by
   `calc.fealtyBonus`. (The further ~20% seen in Belas was already solved: the hero's **Helmet of
   the Archon**, −19% infantry training time in the hero village — now modelled too, see
   `calc.trainingBonuses` / Hero tab Equipment panel.)
2. The exact Horse Drinking Trough level where Equites Legati / Imperatoris first get their −1.
   Known to be active by 15, but the levels below that are untested.

## Modelling assumptions

- Population eats 1 crop/hr each (toggleable in settings).
- Horse Drinking Trough: −1 crop per cavalry unit, but each unit has its own tier
  (`calc.TROUGH_TIER`, applied by `calc.effectiveUpkeep`). Equites Legati and Equites Imperatoris
  are discounted by level 15; Equites Caesaris still needs level 20. Confirmed from the game
  export — the owner's one trough village (L15) is the only one where EL eat 1 and EI eat 2, and
  its Equites Caesaris are undiscounted.
  This matters — it takes EC from 45 to 60 att/crop, the difference between a luxury and a real unit.
- **`village.troops` is the deployable army and nothing else.** Wounded units are held in
  `village.wounded`, which is NOT a subset of `troops` — they can't move and can't defend, so
  counting them would overstate what a village can do. They eat half upkeep
  (`WOUNDED_UPKEEP_FACTOR`) as a separate additive term, and they get their own Healing tent panel.
  Don't fold them back in. Another player's troops stationed in your village are fed by **you**, at
  full rate (`village.hosted`); oasis animals are free. All three confirmed against the game's own
  per-village `supplyTroops`, which the model matches exactly for every village.
- **Healing costs half the training cost** (`HEAL_COST_FACTOR`, owner-confirmed) — that is the whole
  point of the tent. The tent's queue is a THIRD group, disjoint from both `troops` and `wounded`:
  paying to heal takes a unit out of `wounded` and puts it in `trainQueue` under building 46, so a
  village can show 253 wounded and 1,210 already on their way back. Don't add them together.
- **Queues are import-time snapshots.** `village.buildQueue` and `village.trainQueue` hold absolute
  unix finish times, so they simply elapse — anything in the past has landed. BuildingQueue's
  queueType 1 is the village centre, 2 the resource fields, and 4 the Master Builder's plan, which
  is unpaid and whose `finished` is an ordering placeholder, NOT an ETA.
- Maps are **toroidal**. `distance()` wraps at the seam; x=−195 and x=195 on a 200-radius world are
  11 fields apart, not 390. Don't replace this with plain Euclidean.
- **A route's departure interval is a whole number of hours — NOT always one.** The app believed
  hourly-only for a day; the owner corrected it (2026-08-23) by pointing at a live **two-hourly
  route carrying 1,500 crop over a 1 h 29 m leg**, which the old model called impossible. So
  nothing is out of range and nothing has to be hauled "by hand": a leg longer than half a round
  trip is reached by departing *less* often, not by giving up. `ROUTE_INTERVAL`, `MAX_ROUTE_TRAVEL`
  and `routable` are gone; `MAX_ROUTE_INTERVAL = 24`.
  A merchant must still be BACK before the next departure, so cost is a step function:
  `sets = ceil(2 * travel / interval)`, `loads = ceil(rate * interval / capacity)`,
  `merchants = loads * sets` (`calc.routeSchedule` / `calc.routeCost`; `rate` is per HOUR
  everywhere, a trip carries `rate * interval`).
  **The two roundings pull against each other, so the cheapest interval must be SEARCHED, not
  derived** — a longer interval buys fewer sets but forces a bigger convoy, and the winner usually
  sits near the round trip. `calc.bestRouteCost` scans 1–24 h; `calc.planLeg` does the same inside
  a village's merchant budget and is what `cropPlan` uses. Do NOT revert to the smooth
  `capacity / (2 * travel)` average — it ignores both ceilings.
  Which intervals the game actually offers is **unconfirmed**: 1 h and 2 h are known good, so the
  app accepts any whole hour and lets the owner type the real one rather than guess a menu.
- **Standing routes are entered by hand, on their own Routes tab.** The game export does NOT carry
  trade routes, so this is the one place manual entry is still correct. It has its own tab
  (`components/Routes.jsx`, 2026-08-23) because **ONE route is ONE departure and one departure is
  ONE convoy** — a route loaded with wood *and* crop is neither a crop thing nor a wood thing, so it
  can't belong to the Crop or Production tab. Those tabs still answer *"what's still missing"*;
  Routes answers *"what have I already set up, and what is it costing me"*.
  A route is `{fromId, toId | wwId, rates: {wood?, clay?, iron?, crop?}, interval, merchants}` —
  typed the way the game asks for it (**load per trip** per resource + **every N hours**), stored as
  per-**hour** rates = load ÷ interval, since that is what every balance figure needs. Use
  `calc.routeRates(route)` to read them: it also understands the old single-resource `{res, rate}`
  shape, which `store.migrateRoute` converts on load (idempotent — no `DATA_VERSION` bump needed).
  A route saved before intervals existed has no `interval`; treat that as 1.
  **Merchant capacity is SHARED across the trip** — 400 wood + 300 crop is 700 against a
  500-capacity merchant, so cost is computed on `calc.routeTotal(route)`, **never per resource**.
  `routeDeltas` credits the destination unless it's a wonder (those resources leave the empire),
  `committedMerchants` takes its merchants off the planner's budget, and `cropPlan` subtracts
  wonder-bound routes from the wonder's need.
  **A village's real position is `grows − queue burn + in − out` — count BOTH directions.** A relay
  village breaks any one-directional check, and the owner caught it (2026-08-23): with Belas →
  Massamá 10,000 and Massamá → Queluz 2,000, counting only inbound called Massamá "+2,033 spare"
  when it was +33, while counting only outbound flagged it "2,000 over" even though it receives
  10,000. `calc.villageBalances()` is the one source of truth for all four resources, behind both
  the Crop tab's coverage bars and the Routes tab's **"N over"** chip, which means *ends up
  negative*, not *ships more than it grows*. The route form projects the source's resulting balance
  per carried resource before you commit it — when editing it adds the route's own rates back first,
  or the projection charges the village twice. **"N missing"** = the route needs more merchants than
  the marketplace has.
- **Current stored resources are not tracked.** They change by the minute, so the app models rates
  (per hour / per day), not balances. When a decision needs actual stock ("I want to build X, here
  is what I have"), the numbers get entered at that moment. Don't reintroduce a `stored` field.
- Troops parked in a **World Wonder** eat half upkeep (`WW_UPKEEP_FACTOR`), and the WW isn't your
  village, so that crop leaves your books entirely — it becomes a shipment you owe. Modelled as a
  detachment with `ww: true`; `calc.wonderSupport()` reports the crop/hour to ship. Deliberately
  NOT subtracted from net crop — it shows as a warning so the obligation stays visible.
- Routing is greedy: most urgent deficit first, nearest source, preferring villages that will overflow
  anyway within the horizon (marked `free`). It is not a min-cost flow. Close to optimal at 5–15
  villages. If it's ever replaced with a real solver, keep the "free" concept — overflow resources
  have zero opportunity cost and that's the main lever.
- **The Crop tab keeps two questions apart.** Whether the *empire* grows more crop than it eats is a
  production problem — merchants move crop, they don't make it, so when `totals.net < 0` no plan can
  help and the tab says so. Only once that's positive does *where* the crop sits become a shipping
  problem. `calc.cropPlan()` is rate-based (there are no stored resources to model): worst deficit
  first, a merchant carrying `capacity / (2 * travel)` per hour. It consumes each source's spare crop
  as it allocates, so the list reads as one plan you can carry out in full, not a set of mutually
  exclusive options.
- **Destinations include the World Wonder.** The wonder garrison's crop is a real standing shipment,
  so `cropPlan` routes to it rather than only warning about it. It has no village record, but the
  game's village id IS the map tile — `gameImport.tileCoords()` decodes `villageIdLocation` into x/y
  (`x = (id & 0x7FFF) − 16384`, `y = (id >> 15) − 16384`), which places a village you don't own.
  Detachments are keyed `ww:<wwId>` so two wonders stay separate delivery addresses. Saves imported
  before this have no coords and are reported as unroutable until the next export.
- **Source preference (owner, 2026-08-23): one village covering a whole delivery beats three
  covering thirds.** Fewer convoys, fewer merchants tied down. Order is: can-do-it-alone, then
  fewest merchants, then nearest. Nearest is the right tiebreak for a partial source because
  throughput is `capacity / (2 * travel)`, so the closest source is also the one moving the most
  crop per merchant. Don't "simplify" this back to plain nearest-first.
- **The export's own production figure is kept, as a check on the model.** `getAll` reports each
  village's hourly output, which already includes the oases the payload never lists. `gameImport`
  puts it on `village.reported` (crop reconstructed to gross as
  `production[4] + supplyBuildings + supplyTroops`) and `store.importGameExport` persists it —
  it used to be destructured away and thrown out. `calc.productionGap()` subtracts the field model
  from it, and the Crop tab shows the difference so its deficits don't read as authoritative when
  they're understated. Deliberately **not** used as the production number yet: the crop
  reconstruction has never been checked against a real import, and a gap could also be a hero item
  or a bonus building the model doesn't know about. Confirm against the game before promoting it.
- **Parking is not offered as a crop fix.** `calc.parkingSuggestions()` still exists and is correct,
  but the Crop tab shipped without it (owner, 2026-08-23): *"at this point in the game we need to
  have troops available."* Relocating an army to cheapen its upkeep costs you the ability to use it.
  Don't re-add the panel without being asked.

## Conventions

- Production inputs are **gross** — field output before upkeep, straight off the game's resource
  overview. The app subtracts pop and troops itself so it can show *where* crop goes.
- Plain CSS with variables in `styles.css`. No Tailwind. Design is Roman-inscriptional: Cinzel display,
  IBM Plex Sans/Mono, Tyrian purple + gold on near-black.
- No localStorage keys beyond `castra.state.v1`.
