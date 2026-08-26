# Castra

A local Travian Kingdoms dashboard: village overview, army ceiling projection, and trade route planning.
Runs entirely on your machine. No account, no server, no network calls.

## Run it

```bash
npm install
npm run dev
```

Opens on `http://localhost:5180`.

Data persists to your browser's `localStorage`. Use **Reference → Export JSON** to back up or move between machines.

## What it computes

### Villages
Net production per hour after troop upkeep and population, hours until each store fills or empties,
and warnings when a village is about to spill resources or starve its army.

Enter **gross** production straight off the game's resource overview — the field output including
oasis, mill, and bakery bonuses, *before* upkeep. The app subtracts upkeep itself, so it can tell you
where the crop is going.

### Army
Pick a troop mix (a "batch" is the ratio you set — e.g. 1 Imperian : 1 Equites Caesaris). It then gives you:

- **Sustainable rate** — batches/day your economy can actually fund, and whether the limit is a
  resource or your training queue.
- **Crop headroom** — spare crop/h right now.
- **Army ceiling** — how many more units you can feed before crop hits zero.
- **Growth projection** — day-by-day cumulative army, and the day you hit the crop wall.
- **Per-resource limits** — which resource is the bottleneck. That's what to fix first; everything
  above it is surplus you should be trading or spending.

### Trade routes
Builds a surplus/deficit picture across all villages, then greedily matches each deficit to the
nearest source, preferring villages that will **overflow anyway** within your horizon — those
deliveries are free, so they're marked `free`. Set those up as recurring trade routes in game.

Accounts for:
- Merchant count = marketplace level
- Merchant capacity = tribe base × (1 + trade office bonus × level), scaled by server speed
- **Roman Trade Office is double effectiveness** vs other tribes
- Round-trip time, so a merchant's real throughput is `capacity / (2 × travel)`
- Toroidal map wrapping — villages either side of the map seam are close, not far

The map plots your villages at their real coordinates with routes drawn between them, coloured by
resource, with line weight showing merchant commitment.

## Data provenance

Every troop value tracks where it came from, shown as chips in the **Reference** tab. Cost and combat
stats are tracked separately, because they came from different places.

- `confirmed` — from support.kingdoms.com
- `T4 guess` — Travian Legends fallback, unconfirmed for Kingdoms
- `yours` — you typed it; survives future updates to the shipped table

### Combat stats — all confirmed

Source: [official Kingdoms troop specifications](https://support.kingdoms.com/en/articles/109-troop-specifications).
Attack, def-inf, def-cav, speed, carry, and crop upkeep are confirmed for all ten Roman units. Every
value matched the T4 figures, so combat maths was never wrong.

Siege weapons (rams, catapults) count as **infantry** in combat calculations.

### Costs — 8 of 10 confirmed

| Unit | Wood | Clay | Iron | Crop/h | Source |
|---|---|---|---|---|---|
| Legionnaire | 120 | 100 | 150 | 1 | T4 guess |
| Praetorian | 80 | 100 | 160 | 1 | confirmed |
| Imperian | 100 | 110 | 140 | 1 | confirmed |
| Equites Legati | 140 | 160 | 20 | 2 | T4 guess |
| Equites Imperatoris | 350 | 260 | 180 | 3 | confirmed |
| Equites Caesaris | 280 | 340 | 600 | 4 | confirmed |
| Battering Ram | 700 | 180 | 400 | 3 | confirmed |
| Fire Catapult | 690 | 1000 | 400 | 6 | confirmed |
| Senator | 30750 | 27200 | 45000 | 5 | confirmed |
| Settler | 3500 | 3000 | 4500 | 1 | confirmed |

**Kingdoms charges no crop to train.** Cost is wood/clay/iron only; crop is upkeep alone. This is a
structural difference from Legends, which charged crop up front.

Kingdoms costs run well below T4. Corrections so far: a 1:1 Imperian/Equites Caesaris hammer builds
**36% faster** than T4 figures implied, and a 3-settler party costs **60% less time** than T4 suggested.

### Known conflicts

Kingdoms' own docs contradict themselves on **Senator and Settler speed**: the spec table says 4 and 5,
their individual article pages say 8 and 10. The spec table is used. Flagged with a `conflict` chip in
the UI. Only affects travel time for those units.

**Trade Office scaling** is unresolved. T4 documents 10%/level base and 20%/level for Romans; some
worlds ran double. Default here is 20%/level. Read your own Trade Office tooltip and set it once.

## Assumptions worth knowing

- Population eats 1 crop/hr each (toggleable).
- Horse Drinking Trough: −1 crop for Equites Caesaris at level 20 only. Partial tiers are not modelled.
- Training time uses `base × 0.9^(level−1)`. Verify against your barracks if the queue projection matters.
- Routing is greedy, not optimal. It covers the most urgent deficit first from the nearest source.
  For 5–15 villages this lands very close to optimal; it isn't solving a min-cost flow.

## Structure

```
src/
  gameData.js   troop table, tribe constants, defaults  ← edit seeds here
  calc.js       all the math: production, ceiling, distance, routing
  store.js      localStorage persistence + import/export
  components/
    Villages.jsx    overview cards + data entry
    Army.jsx        ceiling and projection
    Trade.jsx       routes, balance matrix, travel times
    EmpireMap.jsx   the coordinate map
    Reference.jsx   editable troop table + world settings
```

`calc.js` is pure functions with no React — straightforward to unit test or reuse if you want to point
it at a scraper later.
