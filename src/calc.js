import {
  RES_IDS, WW_UPKEEP_FACTOR, WOUNDED_UPKEEP_FACTOR, HEAL_COST_FACTOR,
  storageCapacity, totalCapacity, heroItemValue,
} from './gameData'
import {
  CP_BUILDINGS, EXPANSION_CP, SMALL_CELEBRATION, LARGE_CELEBRATION,
  SMALL_PARTY_SECONDS, LARGE_PARTY_SECONDS, LARGE_PARTY_MIN_TOWN_HALL,
  STOLEN_TREASURE,
} from './cultureData'

// --- Storage capacity -------------------------------------------------------
// Prefer the array of building levels (a village can have several of each);
// fall back to a single level, then to a stored raw number for old saves.
function capacityFrom(levels, single, raw, premium) {
  if (Array.isArray(levels)) return totalCapacity(levels, premium)
  if (single != null) return storageCapacity(single, premium)
  return raw || 0
}
// Premium (+25%) is account-wide — passed in from settings, not the village.
export function warehouseCapacity(village, premium) {
  return capacityFrom(village.warehouses, village.warehouseLevel, village.warehouse, premium)
}
export function granaryCapacity(village, premium) {
  return capacityFrom(village.granaries, village.granaryLevel, village.granary, premium)
}

// --- Distance ---------------------------------------------------------------
// Travian maps wrap at the edges (toroidal). A village at -195 and one at 195
// are 10 fields apart, not 390.
export function distance(a, b, settings) {
  let dx = Math.abs(a.x - b.x)
  let dy = Math.abs(a.y - b.y)
  if (settings.wrapMap) {
    const span = settings.mapRadius * 2 + 1
    dx = Math.min(dx, span - dx)
    dy = Math.min(dy, span - dy)
  }
  return Math.sqrt(dx * dx + dy * dy)
}

// --- Merchants --------------------------------------------------------------
// Marketplace level = number of merchants (1 per level).
export function merchantCount(village) {
  return Math.max(0, village.marketplace)
}

// Trade Office raises capacity by a % of BASE capacity per level. The per-level
// bonus is a tribe property (Romans confirmed at 20%/level). On speed servers
// capacity scales too.
export function merchantCapacity(village, tribe, settings) {
  const base = tribe.merchantCapacity * settings.serverSpeed
  const bonus = 1 + tribe.tradeOfficeBonusPerLevel * (village.tradeOffice || 0)
  return Math.floor(base * bonus)
}

export function merchantSpeed(tribe, settings) {
  return tribe.merchantSpeed * settings.serverSpeed
}

// One-way travel hours between two villages.
export function travelHours(a, b, tribe, settings) {
  const d = distance(a, b, settings)
  return d / merchantSpeed(tribe, settings)
}

// A trade route departs on a fixed schedule, and a merchant has to be BACK
// before the next departure is due. That makes distance a step function, not
// the smooth capacity/(2*travel) an idealised convoy would manage — a merchant
// that gets home in 20 minutes still stands idle for the other 40.
//
// The interval is NOT fixed at an hour. That was the model until the owner
// corrected it (2026-08-23): he runs a TWO-hourly route carrying 1,500 crop over
// a 1 h 29 m leg — a route the hourly-only model declared impossible. A longer
// interval is precisely how you reach a village further out than half a round
// trip, so nothing is out of range and nothing has to be hauled by hand.
//
// The two costs pull against each other, which is why the cheapest interval has
// to be searched for rather than derived:
//   longer interval → fewer SETS, since a set has more time to get home
//   longer interval → a bigger convoy each trip, so more LOADS
// Their product tends towards the smooth capacity/(2*travel) ideal; what you are
// really minimising is the waste in those two roundings. The winner usually sits
// near the round trip — dispatch as often as the merchants get back.
export const MAX_ROUTE_INTERVAL = 24

export function routeSchedule(travel, interval = 1) {
  return {
    interval,
    sets: Math.max(1, Math.ceil((2 * travel) / interval - 1e-9)),
    roundTrip: 2 * travel,
  }
}

// What a standing route actually ties up. `loads` is how many merchants leave
// together; `sets` is how many such groups you need so one is always ready to
// depart. Merchants is the product — that is the number the marketplace has to
// cover, and it is why a route just over half an interval costs double.
//
// `rate` is crop per HOUR throughout the app; a single trip carries rate × interval.
export function routeCost(travel, capacity, rate, interval = 1) {
  const s = routeSchedule(travel, interval)
  const perTrip = rate * interval
  const loads = Math.max(1, Math.ceil(perTrip / capacity))
  return {
    ...s,
    loads,
    merchants: loads * s.sets,
    perTrip: Math.round(perTrip),
    maxRate: (loads * capacity) / interval,
  }
}

// The cheapest whole-hour interval for a given rate.
export function bestRouteCost(travel, capacity, rate) {
  let best = null
  for (let i = 1; i <= MAX_ROUTE_INTERVAL; i++) {
    const c = routeCost(travel, capacity, rate, i)
    if (!best || c.merchants < best.merchants) best = c
  }
  return best
}

// The best one source can do for one delivery: search the intervals, and inside
// each cap the convoy to the merchants the village actually has. Deliver as much
// as possible first, then deliver it with as few merchants as possible.
export function planLeg(travel, capacity, want, budget) {
  let best = null
  for (let i = 1; i <= MAX_ROUTE_INTERVAL; i++) {
    const s = routeSchedule(travel, i)
    const loads = Math.min(Math.ceil((want * i) / capacity - 1e-9), Math.floor(budget / s.sets))
    if (loads < 1) continue
    const rate = Math.min(want, (loads * capacity) / i)
    const merchants = loads * s.sets
    if (!best || rate > best.rate + 1e-9 || (rate > best.rate - 1e-9 && merchants < best.merchants)) {
      best = { interval: i, sets: s.sets, loads, merchants, rate, perTrip: Math.round((rate * i) / loads) }
    }
  }
  return best
}

// The resources training actually costs. Kingdoms charges no crop to train, so
// crop never appears in a training budget — it is upkeep and nothing else.
export const WCI = ['wood', 'clay', 'iron']

// Fill ONE delivery greedily, cheapest source first. `spare` (how much of the
// resource each village can give away) and `budget` (its free merchants) are
// Maps and are MUTATED as capacity is consumed, so a sequence of calls reads as
// one plan you can carry out in full rather than a set of alternatives that all
// point at the same surplus village.
//
// Source preference, in order (owner, 2026-08-23):
//   1. one village covering the whole delivery beats three covering thirds —
//      fewer convoys to set up and fewer merchants tied down
//   2. among those that can do it alone, the one needing the fewest merchants
//   3. then the nearest, which for a partial source is also the one moving the
//      most per merchant, since throughput is capacity / (2 * travel)
export function fillDelivery(to, need, sources, spare, budget, tribe, settings) {
  const legs = []
  let left = need
  while (left > 0.01) {
    const candidates = sources
      .filter((v) => v.id !== to.id && (spare.get(v.id) || 0) > 0.01 && (budget.get(v.id) || 0) > 0)
      .map((v) => {
        const travel = travelHours(v, to, tribe, settings)
        const capacity = merchantCapacity(v, tribe, settings)
        const want = Math.min(left, spare.get(v.id))
        // Size the convoy by the schedule, not by average throughput: whole
        // merchants leave together and the whole group is unavailable until it
        // returns, so a source can be capped by merchants long before it runs
        // out of the resource. The departure interval is part of the answer.
        const leg = planLeg(travel, capacity, want, budget.get(v.id))
        if (!leg) return null
        return { from: v, travel, ...leg, solo: leg.rate >= left - 0.01 }
      })
      .filter((c) => c && c.rate > 0.01 && c.merchants > 0)
    if (!candidates.length) break

    candidates.sort((a, b) =>
      (Number(b.solo) - Number(a.solo))
      || (a.solo ? a.merchants - b.merchants : 0)
      || (a.travel - b.travel))

    const c = candidates[0]
    legs.push(c)
    spare.set(c.from.id, spare.get(c.from.id) - c.rate)
    budget.set(c.from.id, budget.get(c.from.id) - c.merchants)
    left -= c.rate
  }
  return { legs, remaining: left }
}

// Merchants each village has free once its standing routes are paid for.
// Merchants are shared across every resource, so a crop route genuinely takes
// capacity away from a wood one — the budget is deliberately not per-resource.
export function merchantBudget(villages, routes) {
  const committed = committedMerchants(routes)
  return new Map(villages.map((v) => [v.id, Math.max(0, merchantCount(v) - (committed[v.id] || 0))]))
}

// --- Troop upkeep -----------------------------------------------------------
// The Horse Drinking Trough takes 1 crop off cavalry upkeep, gated per unit by
// trough level. Read off the owner's own getAll export: their capital is the
// only village with a trough (level 15) and it is the only village where
// Equites Legati eat 1 instead of 2 and Equites Imperatoris eat 2 instead of 3.
// Equites Caesaris were NOT discounted at 15, so their tier is higher — kept at
// 20. OPEN: the level where Legati/Imperatoris first get the discount is only
// bounded at <= 15; it may start lower.
// The Horse Drinking Trough is ROMAN-ONLY: this table is keyed by Roman cavalry
// ids, and no Gaul/Teuton unit shares them, so their cavalry always eat full
// listed upkeep. No tribe argument is needed — the id lookup is the guard.
const TROUGH_TIER = { eq_legati: 15, eq_imperatoris: 15, eq_caesaris: 20 }

export function effectiveUpkeep(troopDef, village) {
  let up = troopDef.upkeep
  const tier = TROUGH_TIER[troopDef.id]
  if (tier != null && (village.troughLevel || 0) >= tier) up -= 1
  return Math.max(0, up)
}

// Crop upkeep of an explicit troop-count map, using a given village's trough
// (the Horse Drinking Trough only helps troops physically in that village).
export function countsUpkeep(counts, troops, village) {
  return troops.reduce((sum, t) => sum + (counts?.[t.id] || 0) * effectiveUpkeep(t, village), 0)
}

// Crop this village actually pays each hour. Three parts, all confirmed against
// the game's own per-village `supplyTroops` total:
//   - its own army, at its own trough
//   - plus the healing tent at half rate. `wounded` is kept OUT of `troops`:
//     those units can't move and can't defend, so they aren't part of the army
//     — they're a repair bill that happens to eat crop.
//   - plus another player's troops stationed here, which the HOST feeds in
//     Kingdoms. Oasis animals are the exception and cost nothing, so they never
//     make it into `hosted`.
export function troopUpkeep(village, troops) {
  const own = countsUpkeep(village.troops, troops, village)
  const wounded = countsUpkeep(village.wounded, troops, village) * WOUNDED_UPKEEP_FACTOR
  const hosted = countsUpkeep(village.hosted, troops, village)
  return own + wounded + hosted
}

// --- Kingdom & account training bonuses -------------------------------------
// Three stacking systems reduce what troops cost and how long they take to train:
//   fealty    — per game world, grows with your fealty level (loyalty to a
//               kingdom). Confirmed linear from the owner's in-game fealty screen.
//   prestige  — account-wide (lobby). Each level UNLOCKS a fixed extra bonus that
//               then stays flat; it does NOT scale with further levels. Confirmed
//               up to level 8; higher unlocks unknown.
//   hero item — the equipped helmet, and only in the village the hero sits in.
// Percentages stack ADDITIVELY, the way the game displays them (fealty -8.5% +
// prestige -1% = -9.5%), then apply to the base cost with floor rounding.
export const TRAIN_BUILDINGS = ['barracks', 'stable', 'workshop', 'residence']

// A no-op bonus set: every factor 1, no hero item. The default so the training
// functions still work when called without kingdom bonuses (unwired tabs, tests).
export const NO_BONUS = {
  costFactor: { barracks: 1, stable: 1, workshop: 1, residence: 1 },
  timeFactor: { barracks: 1, stable: 1, workshop: 1, residence: 1 },
  healFactor: 1,
  heroVillageId: null,
  heroTimeFactor: { barracks: 1, stable: 1 },
}

// Fealty bonus %, by category, at a given fealty level (caps at 20). Each troop-
// cost line is 0.5*level - 1 once unlocked (Workshop L8, Stable L9, Barracks +
// Residence/Palace L10); training time is 0.5*level - 6 (Barracks L15, Stable
// L16); Healing Tent cost is 0.5*level - 4.5 (L13). Confirmed in-game at L19.
export function fealtyBonus(level) {
  const L = Math.max(0, Math.min(level || 0, 20))
  const at = (unlock, base) => (L >= unlock ? base + 0.5 * (L - unlock) : 0)
  return {
    cost: { workshop: at(8, 3), stable: at(9, 3.5), barracks: at(10, 4), residence: at(10, 4) },
    time: { barracks: at(15, 1.5), stable: at(16, 2) },
    heal: at(13, 2),
  }
}

// Prestige bonus %, by category, at a given prestige level. Flat unlocks, not
// scaling — active once prestige reaches the listed level. Confirmed to L8.
export function prestigeBonus(level) {
  const L = level || 0
  const on = (unlock, amt) => (L >= unlock ? amt : 0)
  return {
    cost: { workshop: on(4, 1), stable: on(5, 1), barracks: on(5, 1), residence: on(5, 1) },
    time: { barracks: on(8, 1), stable: on(8, 1) },
    heal: on(7, 1),
  }
}

// The equipped helmet's training-time reduction %, split by building. Only the
// Infantry (Barracks) and Cavalry (Stable) helmets touch training time.
export function heroItemTime(equipped) {
  const e = heroItemValue(equipped)
  if (!e) return { barracks: 0, stable: 0 }
  if (e.def.stat === 'timeBarracks') return { barracks: e.value, stable: 0 }
  if (e.def.stat === 'timeStable') return { barracks: 0, stable: e.value }
  return { barracks: 0, stable: 0 }
}

// Fold fealty (per world) + prestige (account-wide) + the hero's helmet into one
// set of multipliers the training functions read. Percentages sum, then become a
// 1 - pct/100 multiplier applied to base cost/time.
export function trainingBonuses(settings, prestige, heroVillageId, equipped) {
  const f = fealtyBonus(settings?.fealty)
  const p = prestigeBonus(prestige)
  const costFactor = {}
  const timeFactor = {}
  for (const b of TRAIN_BUILDINGS) {
    costFactor[b] = 1 - ((f.cost[b] || 0) + (p.cost[b] || 0)) / 100
    timeFactor[b] = 1 - ((f.time[b] || 0) + (p.time[b] || 0)) / 100
  }
  const ht = heroItemTime(equipped)
  return {
    costFactor,
    timeFactor,
    healFactor: 1 - ((f.heal || 0) + (p.heal || 0)) / 100,
    heroVillageId: heroVillageId || null,
    heroTimeFactor: { barracks: 1 - (ht.barracks || 0) / 100, stable: 1 - (ht.stable || 0) / 100 },
  }
}

// What it costs to bring a set of wounded units back: half the training cost,
// per resource. Kingdoms charges no crop to train, so the crop slot stays 0. The
// half is taken off the fealty/prestige-reduced training cost, then the Healing
// Tent's own fealty/prestige discount applies on top (healFactor) — an assumption
// worth checking against a real in-game heal, since the two could overlap.
export function healCost(counts, troops, bonuses = NO_BONUS) {
  const out = { wood: 0, clay: 0, iron: 0, crop: 0 }
  for (const t of troops) {
    const n = counts?.[t.id] || 0
    if (!n) continue
    const cf = bonuses.costFactor?.[t.building] ?? 1
    RES_IDS.forEach((r, i) => {
      const per = Math.floor((t.cost[i] || 0) * cf)
      out[r] += n * per * HEAL_COST_FACTOR * (bonuses.healFactor ?? 1)
    })
  }
  for (const r of RES_IDS) out[r] = Math.round(out[r])
  return out
}

export function troopCount(village) {
  return Object.values(village.troops || {}).reduce((a, b) => a + (b || 0), 0)
}

// --- Field production -------------------------------------------------------
// Per-field output per hour by level, normal (1×) speed. Confirmed in-game.
// Index = field level; level 0 = empty.
export const FIELD_PRODUCTION = [
  0, 5, 9, 15, 22, 33, 50, 70, 100, 145, 200,
  280, 375, 495, 635, 800, 1000, 1300, 1600, 2000, 2500,
]

// Bonus buildings add 5% per level to their resource. Crop is boosted by two
// buildings (Grain Mill + Bakery), so its percentage can stack higher.
const BONUS_BUILDING = {
  wood: (b) => (b.sawmill || 0) * 5,
  clay: (b) => (b.brickyard || 0) * 5,
  iron: (b) => (b.ironFoundry || 0) * 5,
  crop: (b) => ((b.grainMill || 0) + (b.bakery || 0)) * 5,
}

// Normalize a resource's fields into an array of individual levels. Supports the
// current array form, the older { count, level } form, and missing data.
export function fieldLevels(fields, res) {
  const f = fields?.[res]
  if (Array.isArray(f)) return f
  if (f && typeof f === 'object') return Array.from({ length: f.count || 0 }, () => f.level || 0)
  return []
}

function fieldBase(fields, res) {
  return fieldLevels(fields, res).reduce((sum, lvl) => {
    const l = Math.max(0, Math.min(lvl || 0, FIELD_PRODUCTION.length - 1))
    return sum + (FIELD_PRODUCTION[l] || 0)
  }, 0)
}

// Sum oasis bonuses across every annexed oasis. Percentages and stationed-troop
// flat production stack. Supports the current `oases` list and the older
// per-resource `oasis` object.
export function oasisTotals(village) {
  const pct = { wood: 0, clay: 0, iron: 0, crop: 0 }
  const flat = { wood: 0, clay: 0, iron: 0, crop: 0 }
  if (Array.isArray(village.oases)) {
    for (const o of village.oases) {
      for (const s of o.slots || []) {
        if (!s || !s.res) continue
        // pct and flat are shared across the oasis; older data kept them per-slot.
        pct[s.res] += o.pct != null ? o.pct : (s.pct || 0)
        flat[s.res] += o.flat != null ? o.flat : (s.flat || 0)
      }
    }
  } else if (village.oasis) {
    for (const r of RES_IDS) {
      pct[r] += village.oasis[r]?.pct || 0
      flat[r] += village.oasis[r]?.flat || 0
    }
  }
  return { pct, flat }
}

// Gross production per hour (before upkeep), at 1× speed. Model, confirmed
// against the in-game resource summary:
//   base   = Σ FIELD_PRODUCTION[level] over that resource's individual fields
//   bonus% = bonus building % + oasis %          (additive, applied to base)
//   interim = base + base·bonus% + hero + oasis flat troop production
//   total  = interim · (1 + premium)             (premium = +25% or 0)
// Villages saved before field data existed fall back to their typed gross.
export function grossProduction(village, premium) {
  if (!village.fields) {
    const p = village.production || {}
    return { wood: p.wood || 0, clay: p.clay || 0, iron: p.iron || 0, crop: p.crop || 0 }
  }
  const b = village.buildings || {}
  const oasis = oasisTotals(village)
  const out = {}
  for (const r of RES_IDS) {
    const base = fieldBase(village.fields, r)
    const pct = (BONUS_BUILDING[r](b) + oasis.pct[r]) / 100
    const flat = oasis.flat[r] + (village.hero?.[r] || 0)
    const interim = base + base * pct + flat
    out[r] = interim * (premium ? 1.25 : 1)
  }
  return out
}

// How far the field model falls short of what the game actually reports.
//
// The export doesn't list oases, so a village with annexed ones out-produces
// everything `grossProduction` can explain. `village.reported` is the game's own
// hourly output and already includes them, which makes the difference a direct
// measure of what we're missing — almost always oases, occasionally a bonus
// building or hero item the model doesn't know about.
//
// Positive means the model is PESSIMISTIC by that much. Returns null when the
// village has never been imported, since there is nothing to compare against.
export function productionGap(village, premium) {
  if (!village.reported) return null
  const modelled = grossProduction(village, premium)
  const gap = {}
  let worst = 0
  for (const r of RES_IDS) {
    gap[r] = (village.reported[r] || 0) - (modelled[r] || 0)
    if (Math.abs(gap[r]) > Math.abs(worst)) worst = gap[r]
  }
  return { gap, worst, modelled, reported: village.reported }
}

// --- Village economics ------------------------------------------------------
export function villageNet(village, troops, settings, delta) {
  const upkeep = troopUpkeep(village, troops)
  const pop = settings.popEatsCrop ? village.population || 0 : 0
  const gross = grossProduction(village, settings.premium)
  const net = {}
  for (const r of RES_IDS) {
    net[r] = (gross[r] || 0) * settings.serverSpeed
  }
  net.crop = net.crop - upkeep - pop
  // Standing trade routes: subtract what this village ships out, add what it
  // receives. `delta` is the per-resource hourly balance from routeDeltas().
  if (delta) for (const r of RES_IDS) net[r] += delta[r] || 0
  return { net, upkeep, pop }
}

// --- Standing trade routes --------------------------------------------------
// ONE route is one departure — a single convoy that can carry SEVERAL resources
// on the same trip, the way the game lets you load a transport. So a route holds
// `rates`, a per-resource amount per HOUR (the app's unit everywhere; a trip
// carries rate × interval).
//
// A merchant's capacity is shared by whatever is in the cart: 400 wood + 300
// crop is 700 of a 500-capacity merchant's load, so it takes two, not one each.
// That is why `routeTotal` exists and why costing is done on the TOTAL, never
// per resource (owner-confirmed 2026-08-23).
export const RESOURCES = ['wood', 'clay', 'iron', 'crop']

// Routes saved before a route could carry more than one resource are `{res,
// rate}`. Read them through here and they look like every other route — the
// shape is normalised on read, so nothing downstream has to know.
export function routeRates(route) {
  if (route?.rates) return route.rates
  if (route?.res) return { [route.res]: route.rate || 0 }
  return {}
}

// What the whole convoy carries per hour, across every resource in it. This is
// the number routeCost/bestRouteCost must be given: merchants are sized by the
// total load, not by any one resource in it.
export function routeTotal(route) {
  const rates = routeRates(route)
  return RESOURCES.reduce((s, r) => s + (rates[r] || 0), 0)
}

// Net effect of every route: each source loses what it sends, each destination
// gains it. These deltas fold into villageNet so every projection reflects the
// routes you've set up.
export function routeDeltas(routes) {
  const map = {}
  const bump = (id, res, amt) => {
    if (id == null || !amt) return
    if (!map[id]) map[id] = { wood: 0, clay: 0, iron: 0, crop: 0 }
    map[id][res] += amt
  }
  for (const r of routes || []) {
    const rates = routeRates(r)
    for (const res of RESOURCES) {
      const amt = rates[res] || 0
      if (!amt) continue
      bump(r.fromId, res, -amt)
      // A route to a World Wonder has no village on the receiving end: what it
      // carries leaves the empire. The source pays, nobody is credited.
      if (!r.wwId) bump(r.toId, res, amt)
    }
  }
  return map
}

// Merchants already tied up in standing routes, per source village.
export function committedMerchants(routes) {
  const map = {}
  for (const r of routes || []) map[r.fromId] = (map[r.fromId] || 0) + (r.merchants || 0)
  return map
}

// --- Detached troops (parked in another village) ----------------------------
// Troops a village owns can be stationed in another village; they eat the
// HOST's crop, not the home's. A `village.detachments` entry is
// { toId, troops: {troopId: count} }, or { ww: true, troops } for troops sent to
// a World Wonder. Effect on crop: the home stops feeding them (at its own
// trough), the host starts (at its trough). Ownership and army count stay with
// the home — only crop upkeep relocates. A WW is not your village, so nothing
// lands on your books at all — the cost becomes a shipment (wonderSupport).
export function stationDeltas(villages, troops) {
  const byId = new Map((villages || []).map((v) => [v.id, v]))
  const map = {}
  const bump = (id, crop) => {
    if (id == null || !crop) return
    if (!map[id]) map[id] = { wood: 0, clay: 0, iron: 0, crop: 0 }
    map[id].crop += crop
  }
  for (const v of villages || []) {
    for (const d of v.detachments || []) {
      bump(v.id, countsUpkeep(d.troops, troops, v))              // home no longer feeds them
      if (d.ww) continue
      const host = byId.get(d.toId)
      bump(d.toId, -countsUpkeep(d.troops, troops, host || v))   // host now feeds them
    }
  }
  return map
}

// --- World Wonder support ---------------------------------------------------
// Defence sent to a World Wonder eats crop THERE, at half rate, and the WW isn't
// yours — so none of that upkeep shows up in any village's net crop. What it
// costs you instead is a standing shipment: half the normal upkeep, every hour,
// delivered to the WW. Real, but invisible in the numbers, so surface it.
// Troughs are a building in the village the troops stand in, so a WW garrison
// gets no trough discount — upkeep is the base figure.
const NO_TROUGH = {}

export function wonderSupport(villages, troops) {
  const byVillage = {}
  let crop = 0
  let units = 0
  for (const v of villages || []) {
    for (const d of v.detachments || []) {
      if (!d.ww) continue
      const c = countsUpkeep(d.troops, troops, NO_TROUGH) * WW_UPKEEP_FACTOR
      const u = Object.values(d.troops || {}).reduce((a, b) => a + (b || 0), 0)
      if (!byVillage[v.id]) byVillage[v.id] = { crop: 0, units: 0 }
      byVillage[v.id].crop += c
      byVillage[v.id].units += u
      crop += c
      units += u
    }
  }
  return { byVillage, crop, units }
}

// The wonders your troops sit at, as shipping destinations. Several of your
// villages can garrison the same wonder, so they group by tile — one wonder is
// one delivery address, not one per sender. Coordinates come from the tile id
// the importer decoded; a save taken before that lands here without them and
// can't be routed to, only reported.
export function wonderTargets(villages, troops) {
  const byTile = new Map()
  for (const v of villages || []) {
    for (const d of v.detachments || []) {
      if (!d.ww) continue
      const key = d.wwId ?? 'ww'
      if (!byTile.has(key)) {
        byTile.set(key, { id: `ww:${key}`, wwId: key, ww: true, x: d.x, y: d.y, crop: 0, units: 0, from: [] })
      }
      const t = byTile.get(key)
      t.crop += countsUpkeep(d.troops, troops, NO_TROUGH) * WW_UPKEEP_FACTOR
      t.units += Object.values(d.troops || {}).reduce((a, b) => a + (b || 0), 0)
      t.from.push(v.name)
      t.name = t.x != null ? `Wonder (${t.x}|${t.y})` : 'World Wonder'
    }
  }
  return [...byTile.values()]
}

// Sum any number of per-village resource-delta maps into one.
function mergeDeltas(...maps) {
  const out = {}
  for (const m of maps) {
    for (const id of Object.keys(m || {})) {
      if (!out[id]) out[id] = { wood: 0, clay: 0, iron: 0, crop: 0 }
      for (const r of RES_IDS) out[id][r] += m[id][r] || 0
    }
  }
  return out
}

// The full per-village hourly delta from everything that moves resources
// between villages: standing trade routes + detached-troop crop upkeep.
export function netDeltas(villages, troops, routes) {
  return mergeDeltas(routeDeltas(routes), stationDeltas(villages, troops))
}

// --- Crop balance -----------------------------------------------------------
// Crop is the only resource with a standing drain that grows by itself, so it's
// the only one an empire can actually run out of. Everything here is a RATE:
// stored resources aren't tracked, so the question is never "how full is the
// granary" but "does this village pay for itself every hour, and if not, who
// covers it".

// Where one village's crop goes. Same arithmetic as villageNet, itemised —
// `delta` carries the crop that moved with a detachment plus any standing route.
export function cropBreakdown(village, troops, settings, delta) {
  const gross = grossProduction(village, settings.premium).crop * settings.serverSpeed
  const army = countsUpkeep(village.troops, troops, village)
  const wounded = countsUpkeep(village.wounded, troops, village) * WOUNDED_UPKEEP_FACTOR
  const hosted = countsUpkeep(village.hosted, troops, village)
  const pop = settings.popEatsCrop ? village.population || 0 : 0
  const moved = delta?.crop || 0
  return {
    gross, army, wounded, hosted, pop, moved,
    net: gross - army - wounded - hosted - pop + moved,
  }
}

// The three buildings that train troops at the same time. A village can run any
// combination of them, so `village.produces` holds one unit per building.
export const TRAINABLE_BUILDINGS = ['barracks', 'stable', 'workshop']

export const trainingLevel = (village, building) =>
  building === 'barracks' ? village.barracks || 0
    : building === 'stable' ? village.stable || 0
      : building === 'workshop' ? village.workshop || 0
        : 0

// One entry per training building the village has a unit assigned to, with its
// throughput and hourly resource demand. This is the unit of work the Production
// tab and trainingDemand both build on — a village can appear up to three times.
export function villageProducers(village, troops, settings, bonuses = NO_BONUS) {
  const produces = village.produces || {}
  const out = []
  for (const building of TRAINABLE_BUILDINGS) {
    const id = produces[building]
    if (!id) continue
    const def = (troops || []).find((t) => t.id === id)
    if (!def) continue
    const secs = trainTimeSeconds(def, village, settings, bonuses)
    const perHour = secs ? 3600 / secs : 0
    // The unit's real per-item cost after the kingdom's training-cost discount,
    // floored the way the game charges it (75 -> floor(75*0.905) = 67).
    const cf = bonuses.costFactor?.[building] ?? 1
    const unit = (i) => Math.floor((def.cost[i] || 0) * cf)
    out.push({
      def, building, secs, perHour, perDay: perHour * 24,
      level: trainingLevel(village, building),
      demand: {
        wood: perHour * unit(0),
        clay: perHour * unit(1),
        iron: perHour * unit(2),
      },
      missing: !secs,
    })
  }
  return out
}

// What a village's training queues burn per hour, summed across every building
// it trains in. Kingdoms charges no crop to train, so this is wood/clay/iron only.
export function trainingDemand(village, troops, settings, bonuses = NO_BONUS) {
  const d = { wood: 0, clay: 0, iron: 0 }
  for (const p of villageProducers(village, troops, settings, bonuses)) {
    for (const r of WCI) d[r] += p.demand[r]
  }
  return d
}

// The one true per-village position for all four resources, after everything
// that moves them: field production, the training queue, crop upkeep, and the
// standing routes. This is what "does this route push the sender into the red"
// has to be answered against, so the Routes tab and the Production tab agree.
export function villageBalances(villages, troops, settings, routes, bonuses = NO_BONUS) {
  const deltas = netDeltas(villages, troops, routes)
  const out = {}
  for (const v of villages || []) {
    const g = grossProduction(v, settings.premium)
    const burn = trainingDemand(v, troops, settings, bonuses)
    const moved = deltas[v.id] || {}
    out[v.id] = {
      wood: g.wood * settings.serverSpeed - burn.wood + (moved.wood || 0),
      clay: g.clay * settings.serverSpeed - burn.clay + (moved.clay || 0),
      iron: g.iron * settings.serverSpeed - burn.iron + (moved.iron || 0),
      crop: cropBreakdown(v, troops, settings, moved).net,
    }
  }
  return out
}

// Greedy feeding plan. Destinations are every village running a crop deficit
// PLUS every World Wonder you have troops parked at — the wonder's crop is a
// real standing shipment you owe, so it belongs in the plan, not just in a
// warning. Biggest need first; sources are chosen by fillDelivery.
//
// Not a min-cost flow. At this village count the heuristic is close enough and
// the plan stays legible, which matters more.
export function cropPlan(villages, troops, settings, tribe, routes) {
  const deltas = netDeltas(villages, troops, routes)
  const rows = villages.map((v) => ({ village: v, ...cropBreakdown(v, troops, settings, deltas[v.id]) }))
  const wonders = wonderTargets(villages, troops)

  const spare = new Map(rows.map((r) => [r.village.id, Math.max(0, r.net)]))
  const budget = merchantBudget(villages, routes)
  const shipments = []
  const unmet = []

  // Crop already arriving on a route you've set up. Village destinations are
  // handled by routeDeltas (it lifts their net), so only wonders need counting
  // here — they have no village record for a delta to land on.
  const wwCovered = {}
  for (const r of routes || []) {
    const crop = routeRates(r).crop || 0
    if (r.wwId && crop) wwCovered[r.wwId] = (wwCovered[r.wwId] || 0) + crop
  }
  for (const w of wonders) {
    w.covered = wwCovered[w.wwId] || 0
    w.remaining = w.crop - w.covered
  }

  // Crop a village ships OUT on standing routes, per source. A village that only
  // runs a deficit because it exports crop isn't a delivery target — shipping
  // crop back into it just to patch the hole it dug is circular. The fix is to
  // trim its outbound route, so it goes on `overcommitted` instead of into the
  // plan. A village still short after zeroing its exports is a genuine deficit.
  const outbound = {}
  for (const r of routes || []) {
    const crop = routeRates(r).crop || 0
    if (crop) outbound[r.fromId] = (outbound[r.fromId] || 0) + crop
  }
  const overcommitted = []
  const needy = []
  for (const r of rows.filter((r) => r.net < 0)) {
    const sent = outbound[r.village.id] || 0
    if (sent > 0 && r.net + sent >= -0.01) {
      overcommitted.push({ village: r.village, over: -r.net, sent })
    } else {
      needy.push({ to: r.village, need: -r.net })
    }
  }

  const destinations = [
    ...needy,
    ...wonders.filter((w) => w.remaining > 0.01).map((w) => ({ to: w, need: w.remaining, ww: true })),
  ].sort((a, b) => b.need - a.need)

  for (const d of destinations) {
    // A wonder imported before its tile was decoded has no coordinates, so
    // there's no travel time and no plan — report it rather than guess.
    if (d.to.x == null || d.to.y == null) {
      unmet.push({ to: d.to, ww: d.ww, shortfall: d.need, need: d.need, unplaced: true })
      continue
    }

    const { legs, remaining } = fillDelivery(d.to, d.need, villages, spare, budget, tribe, settings)
    for (const c of legs) {
      shipments.push({
        from: c.from, to: d.to, ww: d.ww, res: 'crop', rate: c.rate, merchants: c.merchants,
        travel: c.travel, sets: c.sets, interval: c.interval,
        loads: c.loads, loadPerTrip: c.perTrip,
        solo: c.solo && legs.length === 1,
      })
    }
    if (remaining > 0.01) unmet.push({ to: d.to, ww: d.ww, shortfall: remaining, need: d.need })
  }

  // Turn each over-committed flag into an actionable pair, using whatever spare
  // crop and merchants the genuine deliveries above didn't need. (1) Trim the
  // village's outbound crop by exactly the amount it runs negative — that brings
  // it back to break-even. (2) The village it was feeding loses that crop, so
  // where THAT village would itself go short, name a real-surplus source to make
  // it up. A recipient that stays positive after the trim needs no make-up route:
  // the crop was simply being over-shipped to a village that didn't need it.
  const byId = new Map(villages.map((v) => [v.id, v]))
  const wonderById = new Map(wonders.map((w) => [w.wwId, w]))
  for (const oc of overcommitted) {
    oc.fixes = []
    oc.makeup = []
    oc.makeupUnmet = 0
    const cropRoutes = (routes || [])
      .filter((r) => r.fromId === oc.village.id && (routeRates(r).crop || 0) > 0)
      .map((r) => ({ route: r, crop: routeRates(r).crop || 0 }))
      .sort((a, b) => b.crop - a.crop)
    let trimLeft = oc.over
    for (const { route, crop } of cropRoutes) {
      if (trimLeft <= 0.01) break
      const trim = Math.min(crop, trimLeft)
      trimLeft -= trim
      const dest = route.wwId ? wonderById.get(route.wwId) : byId.get(route.toId)
      // A wonder always needs its full shipment; a village absorbs the trim out
      // of its own post-plan surplus first, so only the shortfall is made up.
      const buffer = !dest || route.wwId ? 0 : Math.max(0, spare.get(dest.id) || 0)
      if (buffer > 0) spare.set(dest.id, buffer - Math.min(trim, buffer))
      const need = Math.max(0, trim - buffer)
      oc.fixes.push({ route, to: dest, ww: !!route.wwId, trim, makeupNeed: need })
      if (!dest || dest.x == null || dest.y == null) { oc.makeupUnmet += need; continue }
      if (need <= 0.01) continue
      const { legs, remaining } = fillDelivery(dest, need, villages, spare, budget, tribe, settings)
      for (const c of legs) {
        oc.makeup.push({
          from: c.from, to: dest, ww: !!route.wwId, rate: c.rate, merchants: c.merchants,
          travel: c.travel, sets: c.sets, interval: c.interval, loads: c.loads, loadPerTrip: c.perTrip,
        })
      }
      oc.makeupUnmet += remaining
    }
  }

  const totals = { gross: 0, army: 0, wounded: 0, hosted: 0, pop: 0, net: 0, deficit: 0, surplus: 0 }
  for (const r of rows) {
    for (const k of ['gross', 'army', 'wounded', 'hosted', 'pop', 'net']) totals[k] += r[k]
    if (r.net >= 0) totals.surplus += r.net
  }
  // Only villages that actually need crop shipped in count as owed — an
  // over-committed village is fixed by cutting its own route, not by a delivery.
  totals.deficit = needy.reduce((s, d) => s + d.need, 0)
  totals.wonder = wonders.reduce((s, w) => s + w.crop, 0)
  totals.wonderCovered = wonders.reduce((s, w) => s + Math.min(w.covered, w.crop), 0)
  totals.wonderUnits = wonders.reduce((s, w) => s + w.units, 0)
  // Still to arrange. Village deficits are already net of their routes; the
  // wonder's are not, so subtract what you've already got running to it.
  totals.owed = totals.deficit + Math.max(0, totals.wonder - totals.wonderCovered)
  totals.merchantsUsed = shipments.reduce((s, x) => s + x.merchants, 0)
  totals.shipped = shipments.reduce((s, x) => s + x.rate, 0)
  totals.unmet = unmet.reduce((s, x) => s + x.shortfall, 0)

  return { rows, wonders, shipments, unmet, overcommitted, spare, budget, totals }
}

// --- Training supply --------------------------------------------------------
// The same shipping problem as crop, for wood/clay/iron. The difference is where
// the deficit comes from: nothing eats wood by itself, so a village only runs
// short because the units it is queueing cost more than it makes. That makes the
// need a CHOICE — it exists only for villages with a unit assigned — and it is
// measured at FULL queue rate, since the question is what it takes to keep the
// barracks running without a gap.
//
// `balance` is { [villageId]: { wood, clay, iron } } per hour, already net of any
// standing route, computed by the caller (the training demand lives in the
// Production tab). Negative means the village needs that much shipped in.
//
// Merchants are shared with the crop plan and with every resource here: one
// budget, spent in order of biggest need. Two tabs planning independently can
// still double-book the merchants that aren't committed to a route yet — the
// moment a route is entered, `merchantBudget` takes it off both.
export function trainingPlan(villages, balance, routes, tribe, settings) {
  const budget = merchantBudget(villages, routes)
  const spare = {}
  for (const r of WCI) {
    spare[r] = new Map(villages.map((v) => [v.id, Math.max(0, balance[v.id]?.[r] || 0)]))
  }

  const destinations = []
  for (const v of villages) {
    for (const r of WCI) {
      const b = balance[v.id]?.[r] || 0
      if (b < -0.01) destinations.push({ to: v, res: r, need: -b })
    }
  }
  destinations.sort((a, b) => b.need - a.need)

  const shipments = []
  const unmet = []
  for (const d of destinations) {
    const { legs, remaining } = fillDelivery(d.to, d.need, villages, spare[d.res], budget, tribe, settings)
    for (const c of legs) {
      shipments.push({
        from: c.from, to: d.to, res: d.res, rate: c.rate, merchants: c.merchants,
        travel: c.travel, sets: c.sets, interval: c.interval,
        loads: c.loads, loadPerTrip: c.perTrip,
        solo: c.solo && legs.length === 1,
      })
    }
    if (remaining > 0.01) unmet.push({ to: d.to, res: d.res, shortfall: remaining, need: d.need })
  }

  const totals = {
    needed: destinations.reduce((s, d) => s + d.need, 0),
    shipped: shipments.reduce((s, x) => s + x.rate, 0),
    unmet: unmet.reduce((s, x) => s + x.shortfall, 0),
    merchantsUsed: shipments.reduce((s, x) => s + x.merchants, 0),
  }
  return { shipments, unmet, budget, spare, totals }
}

// --- Army ceiling -----------------------------------------------------------
// How many more troops of a given mix can you feed before crop goes negative?
export function armyCeiling(village, troops, settings, mix) {
  const { net } = villageNet(village, troops, settings)
  const cropHeadroom = net.crop
  const mixUpkeep = troops.reduce((sum, t) => {
    const w = mix[t.id] || 0
    return sum + w * effectiveUpkeep(t, village)
  }, 0)
  if (mixUpkeep <= 0) return { batches: Infinity, cropHeadroom }
  return { batches: Math.floor(cropHeadroom / mixUpkeep), cropHeadroom }
}

// Resource-constrained training rate: given net production and a troop mix,
// how many "batches" of that mix can you afford per hour?
export function sustainableRate(village, troops, settings, mix) {
  const { net } = villageNet(village, troops, settings)
  const batchCost = { wood: 0, clay: 0, iron: 0, crop: 0 }
  for (const t of troops) {
    const w = mix[t.id] || 0
    if (!w) continue
    RES_IDS.forEach((r, i) => { batchCost[r] += t.cost[i] * w })
  }
  const limits = {}
  let bottleneck = null
  let minRate = Infinity
  for (const r of RES_IDS) {
    if (batchCost[r] <= 0) { limits[r] = Infinity; continue }
    const rate = Math.max(0, net[r]) / batchCost[r]
    limits[r] = rate
    if (rate < minRate) { minRate = rate; bottleneck = r }
  }
  return { batchesPerHour: minRate, bottleneck, batchCost, limits, net }
}

// Training-time constraint. time = base * speedBase^(level-1), scaled by server.
export function trainTimeSeconds(troopDef, village, settings, bonuses = NO_BONUS) {
  const lvl = troopDef.building === 'barracks' ? village.barracks
    : troopDef.building === 'stable' ? village.stable
    : troopDef.building === 'workshop' ? village.workshop
    : 1
  if (!lvl || lvl < 1) return null
  const factor = Math.pow(settings.trainSpeedBase, lvl - 1)
  const b = troopDef.building
  // Empire-wide fealty/prestige training-time cut, plus the hero's helmet — the
  // helmet only helps the barracks/stable in the village the hero is standing in.
  const empire = bonuses.timeFactor?.[b] ?? 1
  const hero = bonuses.heroVillageId && village.id === bonuses.heroVillageId
    ? (bonuses.heroTimeFactor?.[b] ?? 1)
    : 1
  return (troopDef.baseTrain * factor * empire * hero) / settings.serverSpeed
}

// --- Trade routing ----------------------------------------------------------
// Build a surplus/deficit picture, then greedily match deficits to the cheapest
// (fastest, fewest-merchant) surplus source.
export function buildRoutes(villages, troops, settings, tribe, horizonHours, savedRoutes) {
  // Fold standing routes AND detached-troop upkeep into net first, so
  // suggestions cover only the remaining imbalance and don't double-book
  // merchants already committed.
  const deltas = netDeltas(villages, troops, savedRoutes)
  const committed = committedMerchants(savedRoutes)
  const profiles = villages.map((v) => {
    const { net } = villageNet(v, troops, settings, deltas[v.id])
    return { village: v, net }
  })

  const surpluses = []
  const deficits = []

  for (const p of profiles) {
    for (const r of RES_IDS) {
      const rate = p.net[r]
      const cap = r === 'crop' ? granaryCapacity(p.village, settings.premium) : warehouseCapacity(p.village, settings.premium)
      const cur = p.village.stored?.[r] || 0
      if (rate > 0) {
        // Only counts as surplus if it will actually overflow within the horizon.
        const hrsToFull = (cap - cur) / rate
        const willOverflow = hrsToFull <= horizonHours
        // wasted rate = what spills once full
        surpluses.push({
          village: p.village, res: r, rate, hrsToFull, willOverflow,
          urgency: willOverflow ? 1 / Math.max(hrsToFull, 0.1) : 0,
        })
      } else if (rate < 0) {
        const hrsToEmpty = cur / -rate
        deficits.push({
          village: p.village, res: r, rate: -rate, hrsToEmpty,
          urgency: 1 / Math.max(hrsToEmpty, 0.1),
        })
      }
    }
  }

  // Merchant budget per village, minus any already committed to standing routes.
  const budget = new Map(villages.map((v) => [v.id, Math.max(0, merchantCount(v) - (committed[v.id] || 0))]))
  const routes = []

  // Most urgent deficits first — a village about to starve outranks one that
  // has 40 hours of buffer.
  deficits.sort((a, b) => b.urgency - a.urgency)

  for (const d of deficits) {
    let need = d.rate // resources per hour required
    const candidates = surpluses
      .filter((s) => s.res === d.res && s.village.id !== d.village.id && s.rate > 0)
      .map((s) => {
        const t = travelHours(s.village, d.village, tribe, settings)
        const capPer = merchantCapacity(s.village, tribe, settings)
        // A merchant does a round trip in 2t hours, delivering capPer each time.
        const throughputPerMerchant = capPer / Math.max(2 * t, 0.01)
        return { ...s, travel: t, capPer, throughputPerMerchant }
      })
      // Prefer sources that are overflowing (free resources) and close by.
      .sort((a, b) => (b.willOverflow - a.willOverflow) || (a.travel - b.travel))

    for (const c of candidates) {
      if (need <= 0) break
      const avail = budget.get(c.village.id) || 0
      if (avail <= 0) continue
      const sendable = Math.min(need, c.rate)
      if (sendable <= 0) continue
      const merchantsNeeded = Math.ceil(sendable / c.throughputPerMerchant)
      const merchants = Math.min(merchantsNeeded, avail)
      const delivered = Math.min(sendable, merchants * c.throughputPerMerchant)
      if (delivered <= 0) continue

      routes.push({
        from: c.village,
        to: d.village,
        res: d.res,
        ratePerHour: delivered,
        merchants,
        travel: c.travel,
        loadPerTrip: Math.min(c.capPer, Math.round(delivered * 2 * c.travel / merchants)),
        fromOverflowing: c.willOverflow,
        covers: delivered / d.rate,
      })
      budget.set(c.village.id, avail - merchants)
      c.rate -= delivered
      need -= delivered
    }

    if (need > 0.01) {
      routes.push({
        unmet: true, to: d.village, res: d.res, shortfall: need,
        hrsToEmpty: d.hrsToEmpty,
      })
    }
  }

  return { routes, surpluses, deficits, budget }
}

// --- Parking (troop relocation) as an alternative to crop routes ------------
// A crop deficit is usually just troop upkeep. Instead of shipping crop in with
// merchants, you can march the troops to a crop-surplus village — the upkeep
// moves with them (stationDeltas), closing the gap for zero merchants. This
// only helps CROP: parking doesn't move wood/clay/iron balances.

// Troops physically here that this village owns and could still march out
// (its home army minus whatever it has already parked elsewhere).
function movableTroops(village) {
  const owned = { ...(village.troops || {}) }
  for (const d of village.detachments || []) {
    for (const [id, n] of Object.entries(d.troops || {})) {
      owned[id] = (owned[id] || 0) - (n || 0)
    }
  }
  return owned
}

// For every village running a crop deficit, propose relocating enough of its
// own troops into the best crop-surplus host to cover it. Greedy: fewest units
// (highest per-unit upkeep first), capped by the host's spare crop.
export function parkingSuggestions(villages, troops, settings, tribe, savedRoutes) {
  const deltas = netDeltas(villages, troops, savedRoutes)
  const profiles = villages.map((v) => ({ village: v, net: villageNet(v, troops, settings, deltas[v.id]).net }))
  const cropSpare = new Map(profiles.map((p) => [p.village.id, p.net.crop]))

  // Worst deficit first, and each suggestion CONSUMES the host's spare crop, so
  // the list reads as one plan you can carry out in full rather than a set of
  // alternatives that happen to all point at the same village.
  const hungry = profiles.filter((p) => p.net.crop < 0).sort((a, b) => a.net.crop - b.net.crop)

  const suggestions = []
  for (const p of hungry) {
    const deficit = -p.net.crop
    const avail = movableTroops(p.village)
    // Present troop types by per-unit crop upkeep here, descending.
    const types = troops
      .filter((t) => (avail[t.id] || 0) > 0 && effectiveUpkeep(t, p.village) > 0)
      .sort((a, b) => effectiveUpkeep(b, p.village) - effectiveUpkeep(a, p.village))
    if (types.length === 0) continue

    // Crop-surplus hosts, most spare first, then nearest.
    const hosts = profiles
      .filter((h) => h.village.id !== p.village.id && (cropSpare.get(h.village.id) || 0) > 0)
      .map((h) => ({
        village: h.village,
        spare: cropSpare.get(h.village.id),
        travel: travelHours(p.village, h.village, tribe, settings),
      }))
      .sort((a, b) => b.spare - a.spare || a.travel - b.travel)
    if (hosts.length === 0) continue

    const host = hosts[0]
    const moved = {}
    let relief = 0 // crop freed at the deficit village
    let hostCost = 0 // crop the host takes on (differs if troughs differ)
    for (const t of types) {
      let n = avail[t.id]
      const relPer = effectiveUpkeep(t, p.village)
      const costPer = effectiveUpkeep(t, host.village)
      while (n > 0 && relief < deficit && hostCost + costPer <= host.spare) {
        moved[t.id] = (moved[t.id] || 0) + 1
        relief += relPer
        hostCost += costPer
        n--
      }
      if (relief >= deficit) break
    }
    const units = Object.values(moved).reduce((a, b) => a + b, 0)
    if (units === 0) continue
    cropSpare.set(host.village.id, host.spare - hostCost)

    suggestions.push({
      from: p.village, to: host.village, troops: moved, units,
      relief, hostCost, deficit, travel: host.travel,
      covers: Math.min(1, relief / deficit),
    })
  }
  return suggestions
}

// The game lists villages alphabetically. Anywhere the owner has to FIND a
// village by name — a picker, a per-village table — matches that order so the
// two can be read side by side. Accent-insensitive: Massamá sorts under M.
export function byName(a, b) {
  return (a?.name || '').localeCompare(b?.name || '', undefined, { sensitivity: 'base' })
}

// --- Culture points ---------------------------------------------------------
// Everything here answers ONE question the owner keeps asking himself: to earn
// culture points, is it cheaper to run a celebration or to upgrade a building?
// The common yardstick is RESOURCES PER CP (lower is better). A celebration's
// res/CP is flat — cost ÷ CP granted. A building upgrade is a one-off cost that
// then pays ΔCP EVERY day, so its res/CP falls the longer you hold the empire:
// cost ÷ (ΔCP × horizon). That crossover is the whole decision.

const sum4 = (c) => (c || []).reduce((a, b) => a + b, 0)

// Read a building's level out of the village's imported slot list. Slots are
// { loc, type, lvl }; a village keeps its highest of a given type. 0 if absent.
export function buildingLevel(village, gid) {
  let lvl = 0
  for (const s of village.slots || []) {
    if (s.type === gid) lvl = Math.max(lvl, s.lvl || 0)
  }
  return lvl
}

export function townHallLevel(village) {
  return buildingLevel(village, 24)
}

// Empire-wide culture from the game export. CP is account-wide, accrued per
// village; daily production is the sum too. Villages never imported contribute
// nothing rather than distorting the total.
export function empireCulture(villages) {
  let total = 0
  let production = 0
  for (const v of villages || []) {
    total += v.culturePoints || 0
    production += v.culturePointProduction || 0
  }
  return { total, production }
}

// Given current CP and daily production, when does each still-locked expansion
// slot open? Returns the next slot plus a short lookahead, each with the CP it
// needs and the days away at the current rate. `days` is Infinity when nothing
// is being produced (the honest answer: never, at this rate).
export function expansionOutlook(total, production, ahead = 4) {
  const upcoming = []
  for (let slot = 1; slot <= EXPANSION_CP.length; slot++) {
    const needed = EXPANSION_CP[slot - 1]
    if (needed <= total) continue
    const days = production > 0 ? (needed - total) / production : Infinity
    upcoming.push({ slot, needed, days })
    if (upcoming.length >= ahead) break
  }
  return { total, production, next: upcoming[0] || null, upcoming }
}

// A small celebration grants min(this village's CP/day, 500) for a fixed cost,
// and the village can't run another until it finishes — so throughput is capped
// by the Town Hall's party duration. res/CP is flat (cost ÷ grant); throughput
// only scales how fast that CP arrives, never how much each point costs.
export function smallCelebrationPlan(villageProduction, townHallLevel) {
  const grant = Math.min(villageProduction || 0, SMALL_CELEBRATION.cap)
  const total = sum4(SMALL_CELEBRATION.cost)
  const th = Math.max(1, Math.min(townHallLevel || 0, SMALL_PARTY_SECONDS.length))
  const seconds = SMALL_PARTY_SECONDS[th - 1] || 0
  const perDay = seconds > 0 ? 86400 / seconds : 0
  return {
    grant,
    cost: SMALL_CELEBRATION.cost,
    total,
    resPerCP: grant > 0 ? total / grant : Infinity,
    perDay, // celebrations you can finish in a day at this Town Hall level
    cpPerDay: grant * perDay,
    resPerDay: total * perDay,
    capped: (villageProduction || 0) >= SMALL_CELEBRATION.cap,
  }
}

// A large celebration draws on the WHOLE empire's CP/day (cap 2000) and needs a
// Town Hall of level 10. Same flat res/CP logic, its own longer duration.
export function largeCelebrationPlan(empireProduction, townHallLevel) {
  const available = (townHallLevel || 0) >= LARGE_PARTY_MIN_TOWN_HALL
  const grant = Math.min(empireProduction || 0, LARGE_CELEBRATION.cap)
  const total = sum4(LARGE_CELEBRATION.cost)
  const th = Math.max(1, Math.min(townHallLevel || 0, LARGE_PARTY_SECONDS.length))
  const seconds = LARGE_PARTY_SECONDS[th - 1] || 0
  const perDay = seconds > 0 ? 86400 / seconds : 0
  return {
    available,
    grant,
    cost: LARGE_CELEBRATION.cost,
    total,
    resPerCP: grant > 0 ? total / grant : Infinity,
    perDay,
    cpPerDay: grant * perDay,
    resPerDay: total * perDay,
    capped: (empireProduction || 0) >= LARGE_CELEBRATION.cap,
  }
}

// Running a celebration 24/7 is a continuous resource drain: its one-off cost
// paid once every party length. Returns the per-DAY draw of each resource plus
// the CP it yields, at this Town Hall's throughput. `mode` is 'small' | 'large';
// `cpSource` is the village's CP/day for a small party, the empire's for a large.
// Large returns null below Town Hall 10.
export function celebrationDrain(mode, thLevel, cpSource) {
  const plan = mode === 'large'
    ? largeCelebrationPlan(cpSource, thLevel)
    : smallCelebrationPlan(cpSource, thLevel)
  if (mode === 'large' && !plan.available) return null
  const [w, c, i, cr] = plan.cost
  return {
    mode,
    wood: w * plan.perDay,
    clay: c * plan.perDay,
    iron: i * plan.perDay,
    crop: cr * plan.perDay,
    total: plan.resPerDay,
    cpPerDay: plan.cpPerDay,
  }
}

// The dilemma, resolved — biased toward MAX CP/DAY (owner, 2026-08-24). The goal
// is to unlock expansion slots FAST, and each village is ONE party slot: a large
// party (Town Hall 10+) makes far more CP/day than a small (its grant is the
// whole empire's, not just that village's), so the recommended plan is simply the
// BIGGEST party every village can run. It does NOT scatter cheap smalls.
//
// Crop and wood/clay/iron are handled asymmetrically:
//   - Crop is spent freely — a celebration is one of the only crop BUILD sinks
//     (Kingdoms troops cost no crop), so spare crop otherwise just overflows. The
//     plan is NOT capped by crop; instead it reports the STOLEN TREASURES per day
//     needed to cover its bill — the owner's real large-celeb funding (~5-6 raids'
//     crop = one large party). `treasuresDaily` is what's already coming in.
//   - Wood/clay/iron is what troops also want, so `wciSkew` (0..1) is the
//     Culture↔Army dial: at 1 every village runs its biggest party; below 1 the
//     plan drops the LOWEST-CP parties first until celebrations use no more than
//     that share of empire w/c/i, freeing the rest for troops/buildings.
//
// Reported: `cpFromCelebs`, `partiesCrop` + `treasuresNeeded` to sustain it,
// `wciLeft` for troops, and per-village `cropAfter`.
export function celebrationBudget(villages, troops, settings, treasuresDaily = 0, wciSkew = 1) {
  const empireCP = (villages || []).reduce((a, v) => a + (v.culturePointProduction || 0), 0)
  const treasures = Math.max(0, treasuresDaily || 0)
  const stolen = STOLEN_TREASURE.map((r) => r * treasures)
  const skew = Math.max(0, Math.min(1, wciSkew))
  const lump = (d) => d.wood + d.clay + d.iron // a party's w/c/i, or a village's

  const rows = (villages || []).map((v) => {
    const g = grossProduction(v, settings.premium)
    const th = townHallLevel(v)
    const small = celebrationDrain('small', th, v.culturePointProduction || 0)
    const large = celebrationDrain('large', th, empireCP)
    // The biggest party this village can run: large at Town Hall 10+, else small,
    // else nothing (no CP production to grant).
    const best = large && large.cpPerDay > 0 ? { mode: 'large', ...large }
      : small.cpPerDay > 0 ? { mode: 'small', ...small }
        : null
    return {
      village: v,
      th,
      cropNet: cropBreakdown(v, troops, settings, null).net * 24,
      wci: {
        wood: g.wood * settings.serverSpeed * 24,
        clay: g.clay * settings.serverSpeed * 24,
        iron: g.iron * settings.serverSpeed * 24,
      },
      best,
      mode: best ? best.mode : 'none',
    }
  })

  // Wood/clay/iron the empire makes in a day (fields + stolen); the skew caps the
  // share celebrations may use, the rest reserved for troops.
  const wciTotal = lump({ wood: stolen[0], clay: stolen[1], iron: stolen[2] })
    + rows.reduce((a, r) => a + lump(r.wci), 0)
  const allowance = skew * wciTotal

  // From the max-CP plan (biggest party everywhere), drop the lowest-CP parties
  // until w/c/i use fits the allowance — keeping the strongest CP villages.
  let wciUsed = rows.reduce((a, r) => a + (r.best ? lump(r.best) : 0), 0)
  for (const r of rows.filter((r) => r.best).sort((a, b) => a.best.cpPerDay - b.best.cpPerDay)) {
    if (wciUsed <= allowance) break
    wciUsed -= lump(r.best)
    r.mode = 'none'
  }

  const fieldNetCrop = rows.reduce((a, r) => a + r.cropNet, 0)
  let partiesCrop = 0
  let cpFromCelebs = 0
  const out = rows.map((r) => {
    const drain = r.mode === 'none' ? null : r.best
    partiesCrop += drain?.crop || 0
    cpFromCelebs += drain?.cpPerDay || 0
    return {
      village: r.village,
      th: r.th,
      mode: r.mode,
      drain,
      cropNet: r.cropNet,
      cropAfter: r.cropNet - (drain?.crop || 0),
      wci: r.wci,
      budget: {
        wood: r.wci.wood - (drain?.wood || 0),
        clay: r.wci.clay - (drain?.clay || 0),
        iron: r.wci.iron - (drain?.iron || 0),
      },
    }
  })

  // Treasures/day to keep the empire crop-neutral with the plan running: the crop
  // the parties need beyond what the fields net, over one treasure's crop. Zero if
  // the fields already cover it.
  const treasuresNeeded = STOLEN_TREASURE[3] > 0
    ? Math.max(0, (partiesCrop - fieldNetCrop) / STOLEN_TREASURE[3])
    : 0

  return {
    rows: out.sort((a, b) => byName(a.village, b.village)),
    empireCP,
    stolen,
    fieldNetCrop,
    partiesCrop,
    cropAfter: fieldNetCrop + stolen[3] - partiesCrop,
    treasuresNeeded,
    wciTotal,
    wciUsed,
    wciLeft: wciTotal - wciUsed,
    skew,
    cpFromCelebs,
    parties: out.filter((r) => r.mode !== 'none').length,
    treasuresDaily: treasures,
  }
}

// Cost and CP gain of taking a CP-producing building from one level to another.
// `cost[i]` reaches level i+1, `cp[i]` is the CP/day AT level i+1, so a jump
// from `from` to `to` costs the slice cost[from..to-1] and adds cp[to-1] minus
// whatever it made at `from`. Returns null for an unknown or already-maxed
// building, or a no-op range.
export function cumulativeUpgrade(gid, fromLevel, toLevel) {
  const b = CP_BUILDINGS[gid]
  if (!b) return null
  const maxLevel = b.cp.length
  const from = Math.max(0, fromLevel || 0)
  const to = Math.min(toLevel, maxLevel)
  if (to <= from) return null
  const cost = [0, 0, 0, 0]
  for (let i = from; i < to; i++) {
    for (let r = 0; r < 4; r++) cost[r] += b.cost[i][r]
  }
  const cpNow = from > 0 ? b.cp[from - 1] : 0
  const deltaCP = b.cp[to - 1] - cpNow
  return { gid, name: b.name, fromLevel: from, toLevel: to, cost, total: sum4(cost), deltaCP }
}

// The single next level of a building — the common case for "should I bump this
// one more level for CP?".
export function nextUpgrade(gid, currentLevel) {
  return cumulativeUpgrade(gid, currentLevel, (currentLevel || 0) + 1)
}

// A building upgrade's res/CP is its cost spread over the CP it will make across
// the whole horizon (in days). The longer you'll keep the empire, the cheaper
// each point — this is what a celebration's flat rate is measured against.
export function upgradeResPerCP(total, deltaCP, horizonDays) {
  if (deltaCP <= 0 || horizonDays <= 0) return Infinity
  return total / (deltaCP * horizonDays)
}

// How many days you must hold the empire before an upgrade undercuts a
// celebration of the given flat res/CP. Below this, celebrate; above it, build.
export function upgradeBreakEven(total, deltaCP, celebrationResPerCP) {
  if (deltaCP <= 0 || !Number.isFinite(celebrationResPerCP) || celebrationResPerCP <= 0) return Infinity
  return total / (deltaCP * celebrationResPerCP)
}

export function fmt(n, digits = 0) {
  if (n === Infinity) return '∞'
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

export function fmtHours(h) {
  if (h === null || h === undefined || !Number.isFinite(h)) return '—'
  if (h < 1) return `${Math.round(h * 60)}m`
  const d = Math.floor(h / 24)
  const hr = Math.floor(h % 24)
  const m = Math.round((h % 1) * 60)
  if (d > 0) return `${d}d ${hr}h`
  return `${hr}h ${m}m`
}
