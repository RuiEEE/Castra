# Travian Kingdoms — Romans knowledge base

Owner-editable source of truth for the numbers the app models. When you fix a value
here, mirror it into `gameData.js` (troops / tribe constants) or `calc.js` (formulas),
then bump `DATA_VERSION` in `store.js` so stale localStorage doesn't shadow the change.

**Kingdoms, not Legends (T4).** Costs run ~40–50% below T4. Training costs Wood/Clay/Iron
only — crop is upkeep, never a build cost.

Provenance (`src`): `kingdoms` = confirmed from docs / verified in-game · `t4` = unconfirmed
Legends fallback · `user` = you typed it, most authoritative.

## Roman troops — all ten CONFIRMED

| Unit | Wood | Clay | Iron | Att | DefInf | DefCav | Speed | Carry | Crop | Type | src |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Legionnaire | 75 | 50 | 100 | 40 | 35 | 50 | 6 | 50 | 1 | inf | kingdoms |
| Praetorian | 80 | 100 | 160 | 30 | 65 | 35 | 5 | 20 | 1 | inf | kingdoms |
| Imperian | 100 | 110 | 140 | 70 | 40 | 25 | 7 | 50 | 1 | inf | kingdoms |
| Equites Legati (scout) | 100 | 140 | 10 | 0 | 20 | 10 | 16 | 0 | 2 | cav | kingdoms |
| Equites Imperatoris | 350 | 260 | 180 | 120 | 65 | 50 | 14 | 100 | 3 | cav | kingdoms |
| Equites Caesaris | 280 | 340 | 600 | 180 | 80 | 105 | 10 | 70 | 4 | cav | kingdoms |
| Battering Ram | 700 | 180 | 400 | 60 | 30 | 75 | 4 | 0 | 3 | inf* | kingdoms |
| Fire Catapult | 690 | 1000 | 400 | 75 | 60 | 10 | 3 | 0 | 6 | inf* | kingdoms |
| Senator | 30750 | 27200 | 45000 | 50 | 40 | 30 | 8 | 0 | 5 | inf | kingdoms |
| Settler | 3500 | 3000 | 4500 | 0 | 80 | 80 | 10 | 3000 | 1 | inf | kingdoms |

\* Siege weapons (rams, catapults) count as **infantry** in combat calculations.

Notes on the last two units:
- **Legionnaire** cost 75/50/100 confirmed (was a T4 fallback of 120/100/150).
- **Equites Legati** cost 100/140/10 confirmed (was a T4 fallback of 140/160/20).
- **Senator** speed = **8** (article page value; spec table said 4). Research cost, not
  modelled: Wood 15880 / Clay 13800 / Iron 36400. Requires Academy 20, Rally Point 10.
- **Settler** speed = **10** (article page value; spec table said 5).

## Tribe constants (Romans)

- Merchant capacity: **500** resources per trip.
- Merchant speed: **16** fields/hour.
- Marketplace level = merchant count (1 merchant per level).
- Throughput per merchant = `capacity / (2 × travel_hours)` (round trip).

## Trade Office — CONFIRMED

Adds 20% of base capacity per level. Romans' effective schedule:

| Level | Multiplier | Roman capacity |
|---|---|---|
| 0 | 1× | 500 |
| 5 | 2× | 1000 |
| 10 | 3× | 1500 |
| 15 | 4× | 2000 |
| 20 | 5× | 2500 |

Formula in code: `capacity = base × (1 + 0.20 × tradeOffice)` — value `tradeOfficeBonusPerLevel: 0.20`.

## Modelling assumptions

- Population eats **1 crop/hr** each (confirmed ON for this world).
- Horse Drinking Trough: −1 crop per cavalry unit, per-unit tiers (`calc.TROUGH_TIER`):
  Equites Legati and Equites Imperatoris by **level 15**, Equites Caesaris at **level 20**
  (takes EC from 45 → 60 att/crop). Confirmed 2026-08-22 from the game export — the one trough
  village (L15) is the only one where EL eat 1 and EI eat 2, and its EC are undiscounted.
  The exact level EL/EI kick in is still unknown, only bounded ≤ 15.
- Wounded troops eat **half** upkeep (`WOUNDED_UPKEEP_FACTOR = 0.5`).
- Another player's troops stationed in your village are fed by **you**, at full rate. Oasis
  animals are free (the game reports them at 0 upkeep). Both confirmed against the game's own
  per-village `supplyTroops` — the model now matches it exactly for every village.
- Maps are **toroidal** — `distance()` wraps at the seam.
- Production inputs are **gross** (field output before upkeep); the app subtracts pop + troops.

## Open questions — still unconfirmed, don't guess

1. **Trade Office %** — RESOLVED: 20% base, schedule above.
2. **Legionnaire / Equites Legati costs** — RESOLVED: confirmed above.
3. **Senator / Settler speed** — RESOLVED: 8 / 10.
4. **Barracks / stable training time** — RESOLVED: `base × 0.9^(level−1)` confirmed for Kingdoms
   (`trainSpeedBase: 0.9`). The game export's `UnitQueue.durationPerUnit ÷ baseTrain` depends only
   on building level and falls by 0.9002 per level, the same for every unit type (Barracks L15–L20,
   Stable L14). Still open: a flat ~3.35% global speedup on top of it (measured ratio ≈
   `0.9665 × 0.9^(level−1)`, consistent to ±0.001 over seven readings), cause unknown.
   The extra ~20% in Belas is explained — the hero wears **Helmet of the Archon**, −19% infantry
   training time in Barracks / Great Barracks / Healing Tents (18% base + 1% upgrade). Hero
   equipment is not modelled; it follows the hero between villages.
5. **Horse Drinking Trough tiers** — PARTLY RESOLVED: EL/EI discounted by 15, EC at 20. The
   exact level EL/EI first get their −1 is still untested (anywhere from 1 to 15).
