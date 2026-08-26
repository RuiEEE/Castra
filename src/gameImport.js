// ---------------------------------------------------------------------------
// GAME EXPORT PARSER
//
// Reads the JSON body of the game's own `?c=player&a=getAll` response, copied
// by hand out of the browser's network inspector. Nothing here talks to the
// network — it is a pure function over text the owner pastes or picks as a file.
//
// The response is a cache push: { cache: [{ name, data }, ...] }, where `name`
// is either `Type:id` or `Collection:Type:parentId` and a collection's `data`
// holds its own nested `cache` array. Two entries matter:
//
//   Collection:Village:<playerId>   one record per village — name, coordinates,
//                                   population, isMainVillage, isTown
//   Collection:Building:<villageId> every building AND resource field, each with
//                                   buildingType, locationId and lvl
//   Collection:Troops:<kind>:<vid>  every stack, with the village that owns it,
//                                   where it is standing, and who feeds it
//
// Troop stacks carry three village ids and they mean different things:
//   villageId          who owns the troops (army counts against this village)
//   villageIdLocation  where they are physically standing
//   villageIdSupply    who pays their crop upkeep
// `villageIdSupply` is the one that matters for food. Verified against the
// game's own per-village `supplyTroops` total: a stack sitting in another of
// your villages is fed by that host, and a stack sent to a World Wonder is fed
// by the Wonder — off your books entirely, exactly as calc models it.
//
// Resource fields are buildings too: types 1-4 at locations 1-18. The village
// centre is locations 19-40, with a few villages carrying 41-43. Three centre
// slots are fixed in every village: 27 Main Building, 32 Rally Point, 33 Wall.
// The building types below were verified against the owner's own account (the
// Marketplace effect matched the reported merchant count, the Trade Office
// effect matched merchant carry, and field `effect` values matched
// calc.FIELD_PRODUCTION exactly).
// ---------------------------------------------------------------------------

import { TRIBES } from './gameData'

// buildingType -> resource, for the 18 field slots.
const FIELD_TYPES = { 1: 'wood', 2: 'clay', 3: 'iron', 4: 'crop' }

// buildingType -> where the level lands on our village model. `list: true`
// means a village can have several and we keep every level (warehouses,
// granaries); everything else keeps the highest.
const BUILDING_TYPES = {
  5: { key: 'buildings.sawmill' },
  6: { key: 'buildings.brickyard' },
  7: { key: 'buildings.ironFoundry' },
  8: { key: 'buildings.grainMill' },
  9: { key: 'buildings.bakery' },
  10: { key: 'warehouses', list: true },
  11: { key: 'granaries', list: true },
  17: { key: 'marketplace' },
  18: { key: 'embassy' },
  19: { key: 'barracks' },
  20: { key: 'stable' },
  21: { key: 'workshop' },
  28: { key: 'tradeOffice' },
  41: { key: 'troughLevel' },
}

// The `units` map is keyed 1..10 in the tribe's own unit order (11 is the hero,
// which we don't model). The order is derived straight from each tribe's troop
// table so it can never drift from the stats. Which tribe's order to use is
// decided by the ACTIVE server — the export itself carries no tribe field.
// NOTE (unverified): this assumes a Gaul/Teuton export keys its units 1..10 like
// the Romans do, not with a global offset (e.g. 21..30). Confirm against a real
// non-Roman export; if offset, normalise the key before indexing.
const UNIT_ORDERS = Object.fromEntries(
  Object.entries(TRIBES).map(([k, t]) => [k, t.troops.map((u) => u.id)]),
)
const unitOrderFor = (tribe) => UNIT_ORDERS[tribe] || UNIT_ORDERS.romans

const num = (x) => {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

// Collect every { name, data } entry anywhere in the payload. Collections nest
// their members in `data.cache`, and a hand-copied blob may be the whole
// response, a bare `cache` array, or a single entry — walking handles all three.
function collectEntries(node, out = [], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return out
  if (Array.isArray(node)) {
    for (const item of node) collectEntries(item, out, depth + 1)
    return out
  }
  if (typeof node.name === 'string' && node.data && typeof node.data === 'object') {
    out.push(node)
  }
  if (Array.isArray(node.cache)) collectEntries(node.cache, out, depth + 1)
  if (node.data && Array.isArray(node.data.cache)) collectEntries(node.data.cache, out, depth + 1)
  return out
}

// Fields arrive one row per slot; group them by resource in location order so
// the array length equals the village's field count for that resource.
function fieldsFromRows(rows) {
  const slots = { wood: [], clay: [], iron: [], crop: [] }
  for (const row of rows) {
    const res = FIELD_TYPES[row.type]
    if (res) slots[res].push(row)
  }
  const fields = {}
  for (const res of Object.keys(slots)) {
    fields[res] = slots[res]
      .sort((a, b) => a.location - b.location)
      .map((row) => row.lvl)
  }
  return fields
}

// `complete` means the export carried the village's whole building list, so a
// type that never appears really is absent and should be zeroed. On a partial
// cache push we leave those keys alone instead of wiping good data.
function buildingsFromRows(rows, complete) {
  // Every occupied slot, keyed by its position in the village. Locations 1-18
  // are the resource fields and 19+ the village centre, so this is enough to
  // draw the village. Type 0 is an empty build slot and is kept as such.
  const patch = {
    buildings: {},
    slots: rows
      .map(({ location, type, lvl }) => ({ loc: location, type, lvl }))
      .sort((a, b) => a.loc - b.loc),
  }
  if (complete) {
    for (const spec of Object.values(BUILDING_TYPES)) {
      if (spec.list) patch[spec.key] = []
      else {
        const [group, leaf] = spec.key.split('.')
        if (leaf) patch.buildings[leaf] = 0
        else patch[group] = 0
      }
    }
  }
  for (const row of rows) {
    const spec = BUILDING_TYPES[row.type]
    if (!spec) continue
    if (spec.list) {
      patch[spec.key] = [...(patch[spec.key] || []), row.lvl]
      continue
    }
    const [group, leaf] = spec.key.split('.')
    if (leaf) patch.buildings[leaf] = Math.max(patch.buildings[leaf] || 0, row.lvl)
    else patch[group] = Math.max(patch[group] || 0, row.lvl)
  }
  for (const key of ['warehouses', 'granaries']) {
    // The editor expects at least one entry; a village always has the slot even
    // at level 0. Kept in slot order — capacity is a sum, and the editor binds
    // its nth row to the nth entry.
    if (patch[key] && !patch[key].length) patch[key] = [0]
  }
  return patch
}

// `units` arrives as { "1": "82", "2": "212" } — sometimes as a plain array.
// `order` is the active tribe's unit order (index 0 = unit key "1").
function unitsToTroops(units, order) {
  const out = {}
  if (!units) return out
  const entries = Array.isArray(units)
    ? units.map((v, i) => [String(i + 1), v])
    : Object.entries(units)
  for (const [key, value] of entries) {
    const id = order[Number(key) - 1]
    const n = num(value)
    if (id && n > 0) out[id] = (out[id] || 0) + n
  }
  return out
}

const addTroops = (target, add) => {
  for (const [id, n] of Object.entries(add)) target[id] = (target[id] || 0) + n
}

// A village id IS its map tile, packed as two 15-bit halves offset by 16384
// (row stride 32768). Owner-confirmed: 535642123 → (11, −38) = Terrugem. Lets us
// place a village we don't own — a World Wonder — without any extra request.
function tileCoords(id) {
  const n = num(id)
  if (!n) return {}
  return { x: (n & 0x7fff) - 16384, y: (n >> 15) - 16384 }
}

// Split every stack the player owns into the army each village owns and the
// detachments it has parked elsewhere. `mine` maps game villageId -> our patch.
function assignTroops(stacks, mine, order) {
  // Stacks are pushed under several collections (stationary / moving /
  // elsewhere), so the same troopId can appear more than once.
  const seen = new Set()
  for (const stack of stacks) {
    if (seen.has(stack.troopId)) continue
    seen.add(stack.troopId)
    const troops = unitsToTroops(stack.units, order)
    if (!Object.keys(troops).length) continue

    const owner = mine[stack.villageId]
    if (!owner) {
      // Someone else's troops. In Kingdoms the host village feeds them, so they
      // cost us crop without joining our army. Oasis animals are the exception:
      // the game reports them at zero upkeep, which is what we key off.
      const host = mine[stack.villageIdSupply]
      if (host && num(stack.supplyTroops) > 0) addTroops(host.hosted, troops)
      continue
    }

    // The healing tent is not the army. Wounded units can't move, can't defend,
    // and only come back by spending resources, so they're tracked apart from
    // `troops` — which always means "deployable". They stand at home.
    if (stack.status === 'wounded') {
      addTroops(owner.wounded, troops)
      continue
    }

    // The army belongs to its home village wherever it stands.
    addTroops(owner.troops, troops)

    const host = mine[stack.villageIdSupply]
    if (host === owner) continue // fed at home, nothing to detach
    if (host) {
      // Keyed by the game's village id; the caller swaps these for our own ids
      // once every village exists.
      owner.detachments.push({ toGameId: stack.villageIdSupply, troops })
    } else if (stack.villageIdSupply === stack.villageIdLocation) {
      // Fed by a village we don't own, at the place they're standing: a World
      // Wonder. That crop never touches our books — it becomes a shipment, so
      // we need somewhere to send it. The village id IS the map tile, which
      // decodes to coordinates without owning the village.
      owner.detachments.push({ ww: true, wwId: stack.villageIdLocation, ...tileCoords(stack.villageIdLocation), troops })
    }
    // Otherwise they're away supporting someone else but still fed from home,
    // so the upkeep correctly stays on the owner and no detachment is needed.
  }
}

// BuildingQueue splits its work by queue: 1 is the village centre, 2 is the
// resource fields, and 4 is the Master Builder's plan. Only 1 and 2 are actually
// running — a planned entry is unpaid and its `finished` is a placeholder used
// for ordering, sometimes already in the past, so it is not an ETA.
const PLANNED_QUEUE = '4'

function buildQueueRows(d) {
  const out = []
  for (const [queue, list] of Object.entries(d.queues || {})) {
    const planned = queue === PLANNED_QUEUE
    for (const item of list || []) {
      out.push({
        loc: num(item.locationId),
        type: num(item.buildingType),
        planned,
        done: planned ? 0 : num(item.finished),
      })
    }
  }
  return out.sort((a, b) => Number(a.planned) - Number(b.planned) || a.done - b.done)
}

// UnitQueue groups by the building doing the work, so the Healing Tent (46)
// shows up here alongside the Barracks and Stable — healing is queued like
// training. Zero-count rows are leftovers of an emptied queue.
function trainQueueRows(d, order) {
  const out = []
  const groups = d.buildingTypes
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) return out
  for (const [building, list] of Object.entries(groups)) {
    for (const item of list || []) {
      const count = num(item.count)
      const unit = order[num(item.unitType) - 1]
      if (count <= 0 || !unit) continue
      out.push({
        building: num(building),
        unit,
        count,
        perUnit: num(item.durationPerUnit),
        done: num(item.timeFinishedLast),
      })
    }
  }
  return out.sort((a, b) => a.done - b.done)
}

// Merge detachments that point at the same host so the editor shows one row per
// destination rather than one per stack.
function mergeDetachments(list) {
  const byKey = new Map()
  for (const d of list) {
    // Wonders are keyed by their tile, not lumped together: they're separate
    // delivery addresses, and a village can be garrisoning more than one.
    const key = d.ww ? `ww:${d.wwId}` : d.toGameId
    if (!byKey.has(key)) {
      byKey.set(key, d.ww
        ? { ww: true, wwId: d.wwId, x: d.x, y: d.y, troops: {} }
        : { toGameId: d.toGameId, troops: {} })
    }
    addTroops(byKey.get(key).troops, d.troops)
  }
  return [...byKey.values()]
}

// Parse a pasted game export into village patches. Never throws: a bad or
// unrecognised blob comes back as { villages: [], error }.
export function parseGameExport(text, tribe = 'romans') {
  const order = unitOrderFor(tribe)
  let root
  try {
    root = JSON.parse(text)
  } catch {
    return { villages: [], error: 'Not valid JSON — copy the whole response body, braces included.' }
  }

  const entries = collectEntries(root)
  if (!entries.length) {
    return { villages: [], error: 'No cache entries found. This should be the response to ?c=player&a=getAll.' }
  }

  // buildings and fields, keyed by villageId
  const rowsByVillage = {}
  for (const entry of entries) {
    if (!/^Building:/.test(entry.name)) continue
    const d = entry.data
    const vid = String(d.villageId || '')
    if (!vid) continue
    ;(rowsByVillage[vid] ||= []).push({
      type: num(d.buildingType),
      location: num(d.locationId),
      lvl: num(d.lvl),
    })
  }

  // Construction and training queues, one entry per village.
  const queues = {}
  for (const entry of entries) {
    const build = /^BuildingQueue:(\d+)/.exec(entry.name)
    if (build) (queues[build[1]] ||= {}).buildQueue = buildQueueRows(entry.data)
    const train = /^UnitQueue:(\d+)/.exec(entry.name)
    if (train) (queues[train[1]] ||= {}).trainQueue = trainQueueRows(entry.data, order)
  }

  const villages = []
  const mine = {}
  for (const entry of entries) {
    if (!/^Village:/.test(entry.name)) continue
    const d = entry.data
    const vid = String(d.villageId || '')
    const rows = rowsByVillage[vid] || []
    const patch = {
      gameId: vid,
      name: String(d.name || '').trim(),
      population: num(d.population),
      // Culture points are account-wide but the game accrues and produces them
      // per village; the Culture Points tab sums them. `culturePointProduction`
      // is the village's CP/day, already including its city and hero bonuses.
      culturePoints: num(d.culturePoints),
      culturePointProduction: num(d.culturePointProduction),
      capital: !!d.isMainVillage,
      kind: d.isTown ? 'city' : 'village',
      troops: {},
      wounded: {},
      hosted: {},
      detachments: [],
    }
    if (d.coordinates) {
      patch.x = num(d.coordinates.x)
      patch.y = num(d.coordinates.y)
    }
    // The game's own hourly output, kept aside for a sanity check rather than
    // stored: oases aren't in this payload, so a village that out-produces what
    // its fields explain is one whose oases still need entering by hand.
    // Wood/clay/iron are gross; crop is already net of population and troops.
    if (d.production) {
      patch.reported = {
        wood: num(d.production[1]),
        clay: num(d.production[2]),
        iron: num(d.production[3]),
        crop: num(d.production[4]) + num(d.supplyBuildings) + num(d.supplyTroops),
      }
    }
    if (rows.length) {
      const fields = fieldsFromRows(rows)
      // A village always has exactly 18 field slots. Seeing all 18 is the signal
      // that this is a full export rather than a partial cache push, which would
      // otherwise blank the village's production.
      const complete = Object.values(fields).reduce((s, a) => s + a.length, 0) === 18
      if (complete) patch.fields = fields
      Object.assign(patch, buildingsFromRows(rows, complete))
    }
    Object.assign(patch, { buildQueue: [], trainQueue: [] }, queues[vid])
    if (!patch.name) continue
    patch.buildingCount = rows.length
    villages.push(patch)
    mine[vid] = patch
  }

  if (!villages.length) {
    return { villages: [], error: 'No villages in this response. Look for the request that returns Collection:Village.' }
  }

  const stacks = entries.filter((e) => /^Troops:/.test(e.name)).map((e) => e.data)
  assignTroops(stacks, mine, order)
  let wonderUnits = 0
  for (const v of villages) {
    v.detachments = mergeDetachments(v.detachments)
    for (const d of v.detachments) {
      if (d.ww) wonderUnits += Object.values(d.troops).reduce((a, b) => a + b, 0)
    }
  }

  return { villages, stackCount: stacks.length, wonderUnits, error: null }
}
