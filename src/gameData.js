// ---------------------------------------------------------------------------
// GAME DATA — TRAVIAN KINGDOMS (Romans)
//
// `src` marks provenance for every unit:
//   'kingdoms'  — confirmed from support.kingdoms.com / verified in-game
//   't4'        — Travian Legends fallback, NOT yet confirmed for Kingdoms
//   'user'      — the owner typed it; most authoritative, never overwrite
// All ten Roman units are now 'kingdoms'-confirmed (costs and stats).
//
// STRUCTURAL NOTE: in Kingdoms, training cost is Wood/Clay/Iron ONLY. Crop is
// an upkeep cost, not a build cost — every confirmed Kingdoms unit page lists
// exactly three resources. T4 charged crop up front; Kingdoms does not. Units
// keep a 4th cost slot so the model stays general; it's just 0 for Kingdoms.
//
// Combat stats (attack, def-inf, def-cav, speed, carry, crop) for ALL Roman
// units are confirmed from the official Kingdoms troop specifications table:
// https://support.kingdoms.com/en/articles/109-troop-specifications
// Every one matched the T4 figures previously shipped.
//
// Siege weapons (rams, catapults) count as INFANTRY in combat calculations.
//
// The spec table and article pages disagreed on Senator/Settler speed (4/5 vs
// 8/10). Confirmed in-game: Senator 8, Settler 10. Conflict flags dropped.
//
// `baseTrain` (seconds at 1x, level-1 building) is confirmed: every value here
// matches Travian.Config.troopConfig on the live server. The per-building-level
// reduction is still a guess — see settings.trainSpeedBase.
//
// Everything is editable at runtime in the Reference tab.
// ---------------------------------------------------------------------------

export const ROMAN_TROOPS = [
  {
    id: 'legionnaire', name: 'Legionnaire', short: 'Legio',
    cost: [75, 50, 100, 0], upkeep: 1, speed: 6, carry: 50,
    att: 40, defInf: 35, defCav: 50, unitType: 'infantry',
    building: 'barracks', baseTrain: 1600,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'praetorian', name: 'Praetorian', short: 'Praet',
    cost: [80, 100, 160, 0], upkeep: 1, speed: 5, carry: 20,
    att: 30, defInf: 65, defCav: 35, unitType: 'infantry',
    building: 'barracks', baseTrain: 1760,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'imperian', name: 'Imperian', short: 'Imper',
    cost: [100, 110, 140, 0], upkeep: 1, speed: 7, carry: 50,
    att: 70, defInf: 40, defCav: 25, unitType: 'infantry',
    building: 'barracks', baseTrain: 1920,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'eq_legati', name: 'Equites Legati', short: 'Scout',
    cost: [100, 140, 10, 0], upkeep: 2, speed: 16, carry: 0,
    att: 0, defInf: 20, defCav: 10, unitType: 'cavalry',
    building: 'stable', baseTrain: 1360,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'eq_imperatoris', name: 'Equites Imperatoris', short: 'EI',
    cost: [350, 260, 180, 0], upkeep: 3, speed: 14, carry: 100,
    att: 120, defInf: 65, defCav: 50, unitType: 'cavalry',
    building: 'stable', baseTrain: 2640,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'eq_caesaris', name: 'Equites Caesaris', short: 'EC',
    cost: [280, 340, 600, 0], upkeep: 4, speed: 10, carry: 70,
    att: 180, defInf: 80, defCav: 105, unitType: 'cavalry',
    building: 'stable', baseTrain: 3520,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    // Siege counts as INFANTRY in Kingdoms combat calculations.
    id: 'ram', name: 'Battering Ram', short: 'Ram',
    cost: [700, 180, 400, 0], upkeep: 3, speed: 4, carry: 0,
    att: 60, defInf: 30, defCav: 75, unitType: 'infantry',
    building: 'workshop', baseTrain: 4600,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'fire_catapult', name: 'Fire Catapult', short: 'Cata',
    cost: [690, 1000, 400, 0], upkeep: 6, speed: 3, carry: 0,
    att: 75, defInf: 60, defCav: 10, unitType: 'infantry',
    building: 'workshop', baseTrain: 9000,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    // Speed confirmed in-game as 8 (the Senator article page value, not the
    // spec table's 4). Research cost (not modelled): 15880 / 13800 / 36400.
    id: 'senator', name: 'Senator', short: 'Sen',
    cost: [30750, 27200, 45000, 0], upkeep: 5, speed: 8, carry: 0,
    att: 50, defInf: 40, defCav: 30, unitType: 'infantry',
    building: 'residence', baseTrain: 90700,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    // Speed confirmed in-game as 10 (the Settler article page value, not the
    // spec table's 5).
    id: 'settler', name: 'Settler', short: 'Settl',
    cost: [3500, 3000, 4500, 0], upkeep: 1, speed: 10, carry: 3000,
    att: 0, defInf: 80, defCav: 80, unitType: 'infantry',
    building: 'residence', baseTrain: 26900,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
]

// Gaul units, confirmed from support.kingdoms.com (collection 48 unit pages).
// Row order = the game export's per-tribe unit keys 1..10. `baseTrain` is NOT
// published on those pages, so it is 0/unconfirmed here — fill it from a real
// export's UnitQueue, exactly as the Roman values were. The Horse Drinking
// Trough is Roman-only, so Gaul cavalry always eat their full listed upkeep.
export const GAUL_TROOPS = [
  {
    id: 'phalanx', name: 'Phalanx', short: 'Phal',
    cost: [85, 100, 50, 0], upkeep: 1, speed: 7, carry: 35,
    att: 15, defInf: 40, defCav: 50, unitType: 'infantry',
    building: 'barracks', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'swordsman', name: 'Swordsman', short: 'Sword',
    cost: [95, 60, 140, 0], upkeep: 1, speed: 6, carry: 45,
    att: 65, defInf: 35, defCav: 20, unitType: 'infantry',
    building: 'barracks', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    // Mounted scout — cavalry, trained in the Stable.
    id: 'pathfinder', name: 'Pathfinder', short: 'Path',
    cost: [140, 110, 20, 0], upkeep: 2, speed: 17, carry: 0,
    att: 0, defInf: 20, defCav: 10, unitType: 'cavalry',
    building: 'stable', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'theutates_thunder', name: 'Theutates Thunder', short: 'TT',
    cost: [200, 280, 130, 0], upkeep: 2, speed: 19, carry: 75,
    att: 90, defInf: 25, defCav: 40, unitType: 'cavalry',
    building: 'stable', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'druidrider', name: 'Druidrider', short: 'Druid',
    cost: [300, 270, 190, 0], upkeep: 2, speed: 16, carry: 35,
    att: 45, defInf: 115, defCav: 55, unitType: 'cavalry',
    building: 'stable', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'haeduan', name: 'Haeduan', short: 'Haed',
    cost: [300, 380, 440, 0], upkeep: 3, speed: 13, carry: 65,
    att: 140, defInf: 60, defCav: 165, unitType: 'cavalry',
    building: 'stable', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    // Siege counts as INFANTRY in combat.
    id: 'ram', name: 'Ram', short: 'Ram',
    cost: [750, 370, 220, 0], upkeep: 3, speed: 4, carry: 0,
    att: 50, defInf: 30, defCav: 105, unitType: 'infantry',
    building: 'workshop', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'trebuchet', name: 'Trebuchet', short: 'Treb',
    cost: [590, 1200, 400, 0], upkeep: 6, speed: 3, carry: 0,
    att: 70, defInf: 45, defCav: 10, unitType: 'infantry',
    building: 'workshop', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'chieftain', name: 'Chieftain', short: 'Chief',
    cost: [30750, 45400, 31000, 0], upkeep: 4, speed: 10, carry: 0,
    att: 40, defInf: 50, defCav: 50, unitType: 'infantry',
    building: 'residence', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'settler', name: 'Settler', short: 'Settl',
    cost: [3000, 4000, 3000, 0], upkeep: 1, speed: 10, carry: 3000,
    att: 0, defInf: 80, defCav: 80, unitType: 'infantry',
    building: 'residence', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
]

// Teuton units, confirmed from support.kingdoms.com (collection 48 unit pages).
// Row order = the game export's per-tribe unit keys 1..10. `baseTrain` is 0/
// unconfirmed (not published) — fill from a real export's UnitQueue.
export const TEUTON_TROOPS = [
  {
    id: 'clubswinger', name: 'Clubswinger', short: 'Club',
    cost: [85, 65, 30, 0], upkeep: 1, speed: 7, carry: 60,
    att: 40, defInf: 20, defCav: 5, unitType: 'infantry',
    building: 'barracks', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'spearfighter', name: 'Spearfighter', short: 'Spear',
    cost: [125, 50, 65, 0], upkeep: 1, speed: 7, carry: 40,
    att: 10, defInf: 35, defCav: 60, unitType: 'infantry',
    building: 'barracks', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'axefighter', name: 'Axefighter', short: 'Axe',
    cost: [80, 65, 130, 0], upkeep: 1, speed: 6, carry: 50,
    att: 60, defInf: 30, defCav: 30, unitType: 'infantry',
    building: 'barracks', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    // Teuton scout goes on foot — infantry, trained in the Barracks.
    id: 'scout', name: 'Scout', short: 'Scout',
    cost: [140, 80, 30, 0], upkeep: 1, speed: 9, carry: 0,
    att: 0, defInf: 10, defCav: 5, unitType: 'infantry',
    building: 'barracks', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'paladin', name: 'Paladin', short: 'Pala',
    cost: [330, 170, 200, 0], upkeep: 2, speed: 10, carry: 110,
    att: 55, defInf: 100, defCav: 40, unitType: 'cavalry',
    building: 'stable', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'teutonic_knight', name: 'Teutonic Knight', short: 'TK',
    cost: [280, 320, 260, 0], upkeep: 3, speed: 9, carry: 80,
    att: 150, defInf: 50, defCav: 75, unitType: 'cavalry',
    building: 'stable', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    // Siege counts as INFANTRY in combat.
    id: 'ram', name: 'Ram', short: 'Ram',
    cost: [800, 150, 250, 0], upkeep: 3, speed: 4, carry: 0,
    att: 65, defInf: 30, defCav: 80, unitType: 'infantry',
    building: 'workshop', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'catapult', name: 'Catapult', short: 'Cata',
    cost: [660, 900, 370, 0], upkeep: 6, speed: 3, carry: 0,
    att: 50, defInf: 60, defCav: 10, unitType: 'infantry',
    building: 'workshop', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'chief', name: 'Chief', short: 'Chief',
    cost: [35500, 26600, 25000, 0], upkeep: 4, speed: 8, carry: 0,
    att: 40, defInf: 60, defCav: 40, unitType: 'infantry',
    building: 'residence', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
  {
    id: 'settler', name: 'Settler', short: 'Settl',
    cost: [4000, 3500, 3200, 0], upkeep: 1, speed: 10, carry: 3000,
    att: 10, defInf: 80, defCav: 80, unitType: 'infantry',
    building: 'residence', baseTrain: 0,
    src: 'kingdoms', statSrc: 'kingdoms',
  },
]

export const SRC_LABEL = {
  kingdoms: 'Confirmed from Kingdoms support docs',
  t4: 'Legends (T4) fallback — unconfirmed for Kingdoms',
  user: 'You set this by hand',
}

// Building type ids as used by the game's own `getAll` payload. `ok: true`
// means the meaning was verified against the owner's account (an effect value
// matched something we already knew — merchant count, storage capacity, field
// production, healing capacity). The rest follow the well-known Travian id
// order and are unconfirmed for Kingdoms; correct them when you see the real
// building in-game.
export const BUILDING_CATALOG = {
  1: { name: 'Woodcutter', short: 'WD', res: 'wood', ok: true },
  2: { name: 'Clay Pit', short: 'CL', res: 'clay', ok: true },
  3: { name: 'Iron Mine', short: 'IR', res: 'iron', ok: true },
  4: { name: 'Cropland', short: 'CR', res: 'crop', ok: true },
  5: { name: 'Sawmill', short: 'Saw', res: 'wood', ok: true },
  6: { name: 'Brickyard', short: 'Brk', res: 'clay', ok: true },
  7: { name: 'Iron Foundry', short: 'Fnd', res: 'iron', ok: true },
  8: { name: 'Grain Mill', short: 'Mill', res: 'crop', ok: true },
  9: { name: 'Bakery', short: 'Bake', res: 'crop', ok: true },
  10: { name: 'Warehouse', short: 'Ware', ok: true },
  11: { name: 'Granary', short: 'Gran', ok: true },
  13: { name: 'Smithy', short: 'Smith' },
  14: { name: 'Tournament Square', short: 'Tourn' },
  15: { name: 'Main Building', short: 'Main', ok: true },
  16: { name: 'Rally Point', short: 'Rally' },
  17: { name: 'Marketplace', short: 'Market', ok: true },
  18: { name: 'Embassy', short: 'Emb', ok: true },
  19: { name: 'Barracks', short: 'Brks', ok: true },
  20: { name: 'Stable', short: 'Stbl', ok: true },
  21: { name: 'Workshop', short: 'Wkshp', ok: true },
  22: { name: 'Academy', short: 'Acad' },
  23: { name: 'Cranny', short: 'Cran' },
  24: { name: 'Town Hall', short: 'Hall' },
  25: { name: 'Residence', short: 'Res' },
  26: { name: 'Palace', short: 'Pal' },
  28: { name: 'Trade Office', short: 'Trade', ok: true },
  31: { name: 'City Wall', short: 'Wall' },
  41: { name: 'Horse Drinking Trough', short: 'Trough', ok: true },
  42: { name: 'Building 42', short: '42' },
  // Heals wounded troops. Its `effect` is [training-time %, healing capacity]
  // and the second value matched the village's own healingTentCapacity. Wounded
  // stacks queue here, which is why it shows up in the game's UnitQueue.
  46: { name: 'Healing Tent', short: 'Heal', ok: true },
}

export const buildingName = (type) => BUILDING_CATALOG[type]?.name || `Building ${type}`

// The village centre runs from location 19; 1-18 are the resource fields.
// Three centre slots hold the same building in every village the owner has.
export const CENTRE_FIRST_SLOT = 19
export const FIXED_SLOTS = { 27: 'Main Building', 32: 'Rally Point', 33: 'City Wall' }

// Troops stationed in a World Wonder village eat half their normal crop upkeep.
// The WW isn't your village, so that crop is not produced by your empire — it
// has to be shipped in. See calc.wonderSupport.
export const WW_UPKEEP_FACTOR = 0.5

// Troops recovering in the Healing Tent eat half their normal crop upkeep.
// Confirmed from the owner's export: every wounded stack's reported upkeep was
// exactly half the stack's normal cost.
export const WOUNDED_UPKEEP_FACTOR = 0.5

// Healing a wounded unit costs half what training it costs (owner, in-game).
// That is the whole appeal of the tent: the unit comes back for half price.
export const HEAL_COST_FACTOR = 0.5

export const TRIBES = {
  romans: {
    name: 'Romans',
    merchantCapacity: 500,
    merchantSpeed: 16,
    tradeOfficeBonusPerLevel: 0.20,
    troops: ROMAN_TROOPS,
  },
  // Merchant capacity/speed and trade-office bonus are the classic-Travian values;
  // NOT yet confirmed from the Kingdoms support docs. Correct if the game differs.
  gauls: { name: 'Gauls', merchantCapacity: 750, merchantSpeed: 24, tradeOfficeBonusPerLevel: 0.10, troops: GAUL_TROOPS },
  teutons: { name: 'Teutons', merchantCapacity: 1000, merchantSpeed: 12, tradeOfficeBonusPerLevel: 0.10, troops: TEUTON_TROOPS },
}

export const RESOURCES = [
  { id: 'wood', name: 'Wood' },
  { id: 'clay', name: 'Clay' },
  { id: 'iron', name: 'Iron' },
  { id: 'crop', name: 'Crop' },
]

export const RES_IDS = ['wood', 'clay', 'iron', 'crop']

export const DEFAULT_SETTINGS = {
  tribe: 'romans',
  serverSpeed: 1,
  // COM2 reports worldRadius: 60 in Travian.Config. Toroidal wrap depends on this.
  mapRadius: 60,
  wrapMap: true,
  // Trade Office bonus per level is a TRIBE constant now (TRIBES[tribe]), not a
  // per-server setting — calc.merchantCapacity reads it from the tribe.
  popEatsCrop: true,
  trainSpeedBase: 0.9,
  premium: false, // account-wide gold bonus: +25% production & storage capacity
  // Fealty level for THIS world (loyalty to your kingdom). Grows over time and
  // reduces troop cost / training time / healing cost — see calc.fealtyBonus.
  fealty: 0,
}

// Hero equipment (Travian Kingdoms). A helmet slot; each helmet family has three
// tiers, unlocked as the game progresses. ONLY the training-time helmets change
// any number the app computes — Infantry cuts Barracks time, Cavalry cuts Stable
// time, and only in the village the hero is standing in. Health and Culture
// helmets are catalogued for completeness but deliberately NOT wired: hero health
// isn't modelled, and culture CP already arrives on the game export (adding it
// here would double-count it on the Culture tab).
//
// A dropped helmet rolls a variant offset on its base value (usually one of
// -2..+2 for training/health, larger steps for culture), and each upgrade adds
// one more point. So a worst-roll Helmet of the Archon (base 20, variant -2)
// with a single upgrade gives -19% Barracks training time. `stat` is what it
// touches: timeBarracks / timeStable (% training time), health (HP/day), or
// culture (CP/day, multiplied by server speed).
export const HERO_ITEMS = [
  { id: 'regeneration',  name: 'Helmet of Regeneration',      family: 'health',   tier: 1, stat: 'health',      base: 10,  variants: [-2, -1, 0, 1, 2] },
  { id: 'health',        name: 'Helmet of Health',           family: 'health',   tier: 2, stat: 'health',      base: 15,  variants: [-2, -1, 0, 1, 2] },
  { id: 'healing',       name: 'Helmet of Healing',          family: 'health',   tier: 3, stat: 'health',      base: 20,  variants: [-2, -1, 0, 1, 2] },
  { id: 'gladiator',     name: 'Helmet of the Gladiator',    family: 'culture',  tier: 1, stat: 'culture',     base: 50,  variants: [-20, -10, 0, 10, 20] },
  { id: 'tribune',       name: 'Helmet of the Tribune',      family: 'culture',  tier: 2, stat: 'culture',     base: 200, variants: [-50, -25, 0, 25, 50] },
  { id: 'consul',        name: 'Helmet of the Consul',       family: 'culture',  tier: 3, stat: 'culture',     base: 800, variants: [-200, -100, 0, 100, 200] },
  { id: 'horseman',      name: 'Helmet of the Horseman',     family: 'cavalry',  tier: 1, stat: 'timeStable',   base: 10,  variants: [-2, -1, 0, 1, 2] },
  { id: 'cavalry',       name: 'Helmet of the Cavalry',      family: 'cavalry',  tier: 2, stat: 'timeStable',   base: 15,  variants: [-2, -1, 0, 1, 2] },
  { id: 'heavy_cavalry', name: 'Helmet of the Heavy Cavalry', family: 'cavalry', tier: 3, stat: 'timeStable',   base: 20,  variants: [-2, -1, 0, 1, 2] },
  { id: 'mercenary',     name: 'Helmet of the Mercenary',    family: 'infantry', tier: 1, stat: 'timeBarracks', base: 10,  variants: [-2, -1, 0, 1, 2] },
  { id: 'warrior',       name: 'Helmet of the Warrior',      family: 'infantry', tier: 2, stat: 'timeBarracks', base: 15,  variants: [-2, -1, 0, 1, 2] },
  { id: 'archon',        name: 'Helmet of the Archon',       family: 'infantry', tier: 3, stat: 'timeBarracks', base: 20,  variants: [-2, -1, 0, 1, 2] },
]

export const heroItemDef = (id) => HERO_ITEMS.find((h) => h.id === id) || null

// Effective magnitude of an equipped helmet: base + variant offset + upgrades.
// Returns { def, value } or null when nothing is equipped / the id is unknown.
export function heroItemValue(equipped) {
  if (!equipped) return null
  const def = heroItemDef(equipped.id)
  if (!def) return null
  return { def, value: def.base + (equipped.variant || 0) + (equipped.upgrades || 0) }
}

// Max resource-field level by village kind. Capital is effectively uncapped;
// the production table tops out at 20, so use that as the practical ceiling.
export const FIELD_LEVEL_MAX = { village: 10, city: 12, capital: 20 }

export function fieldLevelMax(village) {
  if (village.capital) return FIELD_LEVEL_MAX.capital
  return FIELD_LEVEL_MAX[village.kind] || FIELD_LEVEL_MAX.village
}

// Oasis bonus tiers: each % tier allows a matching number of stationed troops,
// whose count is added as flat production (50 per 5%).
export const OASIS_STEPS = [0, 5, 10, 15, 20, 25]
export const oasisMaxTroops = (pct) => pct * 10

// Embassy level gates how many oases a village can annex: 1 at L1, 2 at L10,
// 3 at L20.
export function maxOases(embassy) {
  const l = embassy || 0
  if (l >= 20) return 3
  if (l >= 10) return 2
  if (l >= 1) return 1
  return 0
}

// An oasis has ONE bonus percentage AND one stationed-troop flat production,
// both shared across its 1–2 resources (the same troops garrison the oasis, and
// the % is a single tier). Slots carry only the resource id.
export function newOasis() {
  return { pct: 25, flat: 0, slots: [{ res: 'crop' }] }
}

// Hero resource production (owner-confirmed): every resource has a base of 20,
// plus each attribute point adds 20 to one chosen resource, or 5 to each when
// split evenly across all four. mode = 'all' | 'wood' | 'clay' | 'iron' | 'crop'.
export const HERO_BASE = 20
export const HERO_PER_POINT_SINGLE = 20
export const HERO_PER_POINT_SPLIT = 5

export function heroProduction(points, mode) {
  const p = Math.max(0, points || 0)
  const out = { wood: HERO_BASE, clay: HERO_BASE, iron: HERO_BASE, crop: HERO_BASE }
  if (mode === 'all') {
    for (const r of RES_IDS) out[r] += p * HERO_PER_POINT_SPLIT
  } else if (out[mode] != null) {
    out[mode] += p * HERO_PER_POINT_SINGLE
  }
  return out
}

// Warehouse & Granary share one capacity table (owner-confirmed in-game).
// Index = building level; level 0 = the starting baseline before any upgrade.
// Premium (gold bonus) adds +25% capacity.
export const STORAGE_CAPACITY = [
  800, 1200, 1700, 2300, 3100, 4000, 5000, 6300, 7700, 9600, 12000,
  14400, 18000, 22000, 26000, 32000, 38000, 45000, 55000, 66000, 80000,
]
export const STORAGE_LEVEL_MAX = STORAGE_CAPACITY.length - 1

export function storageBase(level) {
  const l = Math.max(0, Math.min(level || 0, STORAGE_LEVEL_MAX))
  return STORAGE_CAPACITY[l]
}

export function storageCapacity(level, premium) {
  return Math.floor(storageBase(level) * (premium ? 1.25 : 1))
}

// A village can hold several warehouses/granaries (uncommon but valid). Sum the
// individual base capacities, then apply premium once to the total.
export function totalCapacity(levels, premium) {
  const base = (levels || []).reduce((s, l) => s + storageBase(l), 0)
  return Math.floor(base * (premium ? 1.25 : 1))
}

// Field layouts (wood-clay-iron-crop counts, always summing to 18). `fields`
// order matches RES_IDS. Custom keeps whatever counts the owner set by hand.
export const VILLAGE_LAYOUTS = [
  { id: 'standard', label: 'Standard · 4-4-4-6', fields: [4, 4, 4, 6] },
  { id: '9c', label: '9-cropper · 3-3-3-9', fields: [3, 3, 3, 9] },
  { id: '15c', label: '15-cropper · 1-1-1-15', fields: [1, 1, 1, 15] },
  { id: 'custom', label: 'Custom', fields: null },
]

export function detectLayout(fields) {
  const counts = RES_IDS.map((r) => {
    const f = fields?.[r]
    if (Array.isArray(f)) return f.length
    if (f && typeof f === 'object') return f.count || 0
    return 0
  })
  const match = VILLAGE_LAYOUTS.find((l) => l.fields && l.fields.every((n, i) => n === counts[i]))
  return match ? match.id : 'custom'
}

export function emptyVillage(n = 1) {
  return {
    id: crypto.randomUUID(),
    name: `Village ${n}`,
    x: 0,
    y: 0,
    capital: false,
    kind: 'village', // 'village' (fields max 10) | 'city' (max 12); capital is uncapped
    population: 0,
    // Culture points: account-wide totals, accrued per village. Filled by the
    // game export; the Culture Points tab sums them empire-wide.
    culturePoints: 0,
    culturePointProduction: 0, // this village's CP/day (incl. city + hero bonus)
    // Production is computed from field levels + bonuses (see calc.grossProduction).
    // Each resource holds an array of individual field levels (length = field count).
    fields: {
      wood: [0, 0, 0, 0],
      clay: [0, 0, 0, 0],
      iron: [0, 0, 0, 0],
      crop: [0, 0, 0, 0, 0, 0],
    },
    buildings: { sawmill: 0, brickyard: 0, ironFoundry: 0, grainMill: 0, bakery: 0 },
    embassy: 0, // gates annexable oases: L1→1, L10→2, L20→3
    // Each annexed oasis carries 1–2 resource slots (single / resource+crop /
    // double-crop). Bonuses stack across oases — see calc.grossProduction.
    oases: [],
    hero: { wood: 0, clay: 0, iron: 0, crop: 0 },
    // Each is an array of building levels — a village can have more than one.
    // Capacity is derived via calc.warehouseCapacity()/granaryCapacity().
    warehouses: [0],
    granaries: [0],
    marketplace: 0,
    tradeOffice: 0,
    barracks: 0,
    stable: 0,
    workshop: 0,
    troughLevel: 0,
    // Every slot the game reported, as { loc, type, lvl } — locations 1-18 are
    // the resource fields, 19+ the village centre, type 0 an empty slot. Purely
    // informational: the fields above are what the calculations read. Filled by
    // the game-export import; empty otherwise.
    slots: [],
    // Snapshots taken at import time, so their finish times are absolute unix
    // seconds and simply elapse. buildQueue: { loc, type, planned, done };
    // trainQueue: { building, unit, count, perUnit, done }.
    buildQueue: [],
    trainQueue: [],
    troops: {},
    // The Healing Tent, tracked apart from `troops`: these can't move or defend
    // and only return by spending resources. They eat half upkeep meanwhile.
    wounded: {},
    // Another player's troops stationed here. Not part of your army, but in
    // Kingdoms the host feeds them, so they cost this village crop.
    hosted: {},
    // Troops this village owns but has parked in another village. Each entry is
    // { toId, troops: {troopId: count} }; their crop upkeep counts against the
    // host, not here. See calc.stationDeltas.
    detachments: [],
    // Empire Production planner: which unit each training building is set to
    // train. A village runs its barracks, stable and workshop at the same time,
    // so this is one troop id per building (or null when a building is idle).
    produces: { barracks: null, stable: null, workshop: null },
  }
}
