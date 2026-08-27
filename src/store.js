import { useEffect, useState, useCallback } from 'react'
import { DEFAULT_SETTINGS, TRIBES, emptyVillage, RES_IDS, heroProduction } from './gameData'
import { trainingBonuses } from './calc'

const KEY = 'castra.state.v1'

// Bump when the shipped troop table changes in a way that should override
// stale saved copies.
//   v2 — corrected Kingdoms costs (no crop in training cost)
//   v3 — all combat stats confirmed from the official Kingdoms spec table;
//        Ram/Catapult/Settler costs corrected; Senator/Settler speed conflicts flagged
//   v4 — Legionnaire (75/50/100) & Equites Legati (100/140/10) costs confirmed
//        from Kingdoms; Senator speed→8, Settler speed→10 confirmed in-game,
//        conflict flags dropped. All 10 Roman units now fully confirmed.
//   v5 — mapRadius default 200 → 60 (COM2 worldRadius). Saved settings that
//        still hold the old default get corrected.
//   v6 — `wounded` is no longer a subset of `troops`. Saves written before this
//        counted the healing tent inside the army; split it back out once.
//   v7 — multi-server. The whole account state (settings, villages, troops, mix,
//        routes, hero) is now one entry in a `servers` array so several game
//        worlds — each its own tribe — coexist. Old flat saves wrap into servers[0].
//   v8 — a village trains its barracks, stable and workshop at once, so
//        `village.produces` went from one unit id to { barracks, stable, workshop }.
//        Old single-id saves move the unit onto its own building's slot.
const DATA_VERSION = 8

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// Keep the user's own edits to a unit, but take new shipped values for any
// unit they never touched. `editedFields` tracks what they changed by hand.
function mergeTroops(saved, shipped) {
  if (!saved) return shipped
  return shipped.map((s) => {
    const old = saved.find((t) => t.id === s.id)
    if (!old || !old.editedFields?.length) return s
    const keep = {}
    for (const f of old.editedFields) keep[f] = old[f]
    return { ...s, ...keep, editedFields: old.editedFields }
  })
}

const EMPTY_HERO = { wood: 0, clay: 0, iron: 0, crop: 0 }

// Older villages stored oasis bonuses as a per-resource `oasis` object. The
// editor now uses an `oases` list, so convert once: each nonzero resource
// becomes a single-slot oasis. Embassy is bumped to cover the count so the
// oases aren't stuck below their annexation limit.
function embassyForCount(n) {
  if (n >= 3) return 20
  if (n >= 2) return 10
  if (n >= 1) return 1
  return 0
}

// Normalize an oasis to the shared shape: { pct, flat, slots:[{res}] }. Older
// oases kept pct/flat per slot; collapse to the oasis's highest slot value.
function normalizeOasis(o) {
  const slots = (o?.slots || []).map((s) => ({ res: s.res }))
  const pct = o?.pct != null ? o.pct : Math.max(0, ...(o?.slots || []).map((s) => s.pct || 0))
  const flat = o?.flat != null ? o.flat : Math.max(0, ...(o?.slots || []).map((s) => s.flat || 0))
  return { pct, flat, slots }
}

// Before v6 the importer added wounded units to `troops` as well as `wounded`,
// so the army count included the healing tent. Subtract them once. Version-gated
// because it is not idempotent.
function splitWounded(v) {
  if (!v.wounded || !v.troops) return v
  const troops = { ...v.troops }
  for (const [id, n] of Object.entries(v.wounded)) {
    troops[id] = Math.max(0, (troops[id] || 0) - (n || 0))
  }
  return { ...v, troops }
}

// `produces` used to be one unit id; a village now trains in several buildings
// at once, so it's a { barracks, stable, workshop } map. Move a legacy id onto
// its own building's slot. Idempotent — an already-migrated map passes through.
function migrateProduces(produces) {
  const empty = { barracks: null, stable: null, workshop: null }
  if (produces && typeof produces === 'object') return { ...empty, ...produces }
  if (!produces) return empty
  for (const tribe of Object.values(TRIBES)) {
    const def = tribe.troops.find((t) => t.id === produces)
    if (def && def.building in empty) return { ...empty, [def.building]: produces }
  }
  return empty
}

function migrateVillage(v) {
  const produces = migrateProduces(v.produces)
  const workshop = v.workshop || 0
  // Premium is now account-wide (settings), not per-village. Stored resources
  // are no longer tracked at all — they change too fast to be worth saving.
  if (Array.isArray(v.oases)) {
    const { premium, stored, allBuildings, ...rest } = v
    return { ...rest, workshop, produces, oases: v.oases.map(normalizeOasis) }
  }
  const oases = []
  if (v.oasis) {
    for (const r of RES_IDS) {
      const o = v.oasis[r]
      if (o && ((o.pct || 0) > 0 || (o.flat || 0) > 0)) {
        oases.push({ pct: o.pct || 0, flat: o.flat || 0, slots: [{ res: r }] })
      }
    }
  }
  const { oasis, premium, stored, allBuildings, ...rest } = v
  return { ...rest, workshop, produces, oases, embassy: Math.max(v.embassy || 0, embassyForCount(oases.length)) }
}

const migrateVillages = (list, fromVersion = 1) =>
  (list || []).map((v) => migrateVillage(fromVersion < 6 ? splitWounded(v) : v))

// A route used to carry one resource (`res` + `rate`); it now carries a `rates`
// map, because one departure can be loaded with several. Idempotent, so it needs
// no version gate — a route that already has `rates` is passed straight through.
const migrateRoute = (r) => {
  if (r.rates) return r
  const { res, rate, ...rest } = r
  return { ...rest, rates: res ? { [res]: rate || 0 } : {} }
}
const migrateRoutes = (list) => (list || []).map(migrateRoute)

// If premium wasn't a setting yet, inherit it from any village that had it on.
const inheritPremium = (settings, villages) =>
  settings?.premium ?? (villages || []).some((v) => v.premium)

// mapRadius shipped as 200 before the real world size was known. Only override
// a saved value that's still that old default — a hand-set radius is kept.
function migrateSettings(saved, villages) {
  const s = {
    ...DEFAULT_SETTINGS,
    ...saved,
    premium: inheritPremium(saved, villages),
  }
  if (saved?.mapRadius === 200) s.mapRadius = DEFAULT_SETTINGS.mapRadius
  return s
}

// A fresh server: one capital village, the tribe's shipped troop table, and a
// sensible starting mix for Romans (other tribes start empty — their unit ids
// differ). `name` defaults to the tribe name; the owner renames it to the world.
function emptyServer(tribe = 'romans', name) {
  const t = TRIBES[tribe] || TRIBES.romans
  return {
    id: crypto.randomUUID(),
    name: name || t.name,
    settings: { ...DEFAULT_SETTINGS, tribe },
    villages: [{ ...emptyVillage(1), capital: true }],
    troops: t.troops,
    mix: tribe === 'romans' ? { imperian: 1, eq_caesaris: 1 } : {},
    routes: [],
    heroVillageId: null,
    heroPoints: 0,
    heroMode: 'all',
    // The hero's equipped helmet: { id, variant, upgrades } or null. Only the
    // training-time helmets feed the model — see gameData.HERO_ITEMS.
    heroItem: null,
  }
}

// Bring one server slice up to the current data version. Used both for a real
// `servers` entry and for wrapping an old flat save into servers[0].
function migrateServer(raw, fromVersion) {
  const settings = migrateSettings(raw.settings, raw.villages)
  const shipped = (TRIBES[settings.tribe] || TRIBES.romans).troops
  const stale = fromVersion < DATA_VERSION
  return {
    id: raw.id || crypto.randomUUID(),
    name: raw.name || TRIBES[settings.tribe]?.name || 'Server 1',
    settings,
    villages: migrateVillages(raw.villages, fromVersion),
    troops: stale ? mergeTroops(raw.troops, shipped) : (raw.troops || shipped),
    mix: raw.mix || {},
    routes: migrateRoutes(raw.routes),
    heroVillageId: raw.heroVillageId ?? null,
    heroPoints: raw.heroPoints ?? 0,
    heroMode: raw.heroMode ?? 'all',
    heroItem: raw.heroItem ?? null,
  }
}

function freshState() {
  const srv = emptyServer('romans')
  return { dataVersion: DATA_VERSION, servers: [srv], activeServerId: srv.id, migrated: false, prestige: 0 }
}

// Turn a raw saved (or imported) blob into live state. Handles both the new
// `servers` shape and the old flat one, which is wrapped into a single server.
function hydrate(saved) {
  if (!saved) return freshState()
  const fromVersion = saved.dataVersion || 1
  const stale = fromVersion < DATA_VERSION
  let servers
  if (Array.isArray(saved.servers)) {
    servers = saved.servers.map((srv) => migrateServer(srv, fromVersion))
  } else {
    servers = [migrateServer(saved, fromVersion)]
  }
  if (!servers.length) return freshState()
  const activeServerId = servers.some((s) => s.id === saved.activeServerId)
    ? saved.activeServerId
    : servers[0].id
  // Prestige is a LOBBY (account-wide) level, so it sits at the top level, not
  // inside a server. Older saves don't have it — default to 0.
  const prestige = Math.max(0, Number(saved.prestige) || 0)
  return { dataVersion: DATA_VERSION, servers, activeServerId, migrated: stale, prestige }
}

const initial = () => hydrate(load())

// Write the hero's computed production into its assigned village, zeroing the
// contribution everywhere else (the hero can only be in one village). Operates
// on a single server.
function recomputeHero(srv) {
  const prod = heroProduction(srv.heroPoints, srv.heroMode)
  return {
    ...srv,
    villages: srv.villages.map((v) => ({
      ...v,
      hero: v.id === srv.heroVillageId ? prod : EMPTY_HERO,
    })),
  }
}

export function useStore() {
  const [state, setState] = useState(initial)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch (e) {
      console.error('Could not save to localStorage:', e)
    }
  }, [state])

  // Every village/route/hero/troop action edits the ACTIVE server only. This
  // helper maps `fn` over that one server and leaves the rest untouched.
  const updateActive = useCallback((fn) => {
    setState((s) => ({
      ...s,
      servers: s.servers.map((srv) => (srv.id === s.activeServerId ? fn(srv) : srv)),
    }))
  }, [])

  const setSettings = useCallback((patch) => {
    updateActive((srv) => ({ ...srv, settings: { ...srv.settings, ...patch } }))
  }, [updateActive])

  const setVillage = useCallback((id, patch) => {
    updateActive((srv) => ({
      ...srv,
      villages: srv.villages.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }))
  }, [updateActive])

  const addVillage = useCallback(() => {
    updateActive((srv) => ({ ...srv, villages: [...srv.villages, emptyVillage(srv.villages.length + 1)] }))
  }, [updateActive])

  const addVillageWith = useCallback((patch) => {
    updateActive((srv) => ({
      ...srv,
      villages: [...srv.villages, { ...emptyVillage(srv.villages.length + 1), ...patch }],
    }))
  }, [updateActive])

  // Apply a whole parsed game export in one go. Has to be atomic: detachments
  // reference other villages by the game's id, and those targets can be villages
  // this very import is creating, so the ids only settle once every village
  // exists. Matching is by name, like the other paste importers.
  const importGameExport = useCallback((patches) => {
    updateActive((srv) => {
      const villages = [...srv.villages]
      const idByGameId = {}

      for (const patch of patches) {
        // `reported` is kept, not dropped: it is the game's own hourly output, so
        // unlike the field model it already contains the oases the export doesn't
        // list. Holding on to it is what lets the app show where its own model is
        // short instead of quietly under-reporting production.
        const { gameId, detachments, buildingCount, ...rest } = patch
        // Match on the game's own village id first, so a village renamed
        // in-game updates in place instead of arriving as a duplicate. The name
        // fallback is what lets a first import adopt hand-entered villages.
        let i = villages.findIndex((v) => v.gameId && v.gameId === gameId)
        if (i < 0) {
          i = villages.findIndex(
            (v) => !v.gameId && v.name.trim().toLowerCase() === patch.name.trim().toLowerCase(),
          )
        }
        // Only the keys the export actually carries get overwritten. Anything
        // the game doesn't report — oases above all — is left alone, so it is
        // entered by hand once and survives every later re-import.
        if (i >= 0) villages[i] = { ...villages[i], ...rest, gameId }
        else villages.push({ ...emptyVillage(villages.length + 1), ...rest, gameId })
        idByGameId[gameId] = villages[i >= 0 ? i : villages.length - 1].id
      }

      // Second pass: now every village has an id, swap game ids for ours. A
      // detachment whose host isn't one of our villages is dropped rather than
      // left dangling.
      for (const patch of patches) {
        const id = idByGameId[patch.gameId]
        const i = villages.findIndex((v) => v.id === id)
        villages[i] = {
          ...villages[i],
          detachments: (patch.detachments || [])
            // A wonder isn't one of our villages, so instead of an id it keeps
            // the map tile it was imported with — that's what makes it routable.
            .map((d) => (d.ww
              ? { ww: true, wwId: d.wwId, x: d.x, y: d.y, troops: d.troops }
              : { toId: idByGameId[d.toGameId], troops: d.troops }))
            .filter((d) => d.ww || d.toId),
        }
      }

      return { ...srv, villages }
    })
  }, [updateActive])

  const removeVillage = useCallback((id) => {
    updateActive((srv) => ({ ...srv, villages: srv.villages.filter((v) => v.id !== id) }))
  }, [updateActive])

  // Drag-and-drop reorder: pull `fromId` out and reinsert it at `toId`'s slot.
  // Order is display-only; nothing derived depends on it.
  const reorderVillages = useCallback((fromId, toId) => {
    updateActive((srv) => {
      if (fromId === toId) return srv
      const from = srv.villages.findIndex((v) => v.id === fromId)
      const to = srv.villages.findIndex((v) => v.id === toId)
      if (from < 0 || to < 0) return srv
      const villages = [...srv.villages]
      const [moved] = villages.splice(from, 1)
      villages.splice(to, 0, moved)
      return { ...srv, villages }
    })
  }, [updateActive])

  const setTroops = useCallback((troops) => updateActive((srv) => ({ ...srv, troops })), [updateActive])

  // Record which fields were hand-edited so a future data update won't clobber
  // them. A field the user has corrected is more trustworthy than anything we ship.
  const editTroop = useCallback((id, field, value) => {
    updateActive((srv) => ({
      ...srv,
      troops: srv.troops.map((t) => {
        if (t.id !== id) return t
        const editedFields = Array.from(new Set([...(t.editedFields || []), field]))
        return { ...t, [field]: value, editedFields, src: field === 'cost' ? 'user' : t.src }
      }),
    }))
  }, [updateActive])

  const dismissMigration = useCallback(() => setState((s) => ({ ...s, migrated: false })), [])
  const setMix = useCallback((mix) => updateActive((srv) => ({ ...srv, mix })), [updateActive])

  // Standing trade routes the owner has set up in game. Each ships a fixed
  // hourly rate between two villages; their effect folds into every net figure.
  const addRoute = useCallback((route) => {
    updateActive((srv) => ({
      ...srv,
      routes: [...(srv.routes || []), { id: `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`, ...route }],
    }))
  }, [updateActive])
  const updateRoute = useCallback((id, route) => {
    updateActive((srv) => ({
      ...srv,
      routes: (srv.routes || []).map((r) => (r.id === id ? { ...r, ...route } : r)),
    }))
  }, [updateActive])
  const removeRoute = useCallback((id) => {
    updateActive((srv) => ({ ...srv, routes: (srv.routes || []).filter((r) => r.id !== id) }))
  }, [updateActive])

  // Park a troop count-map from one village into another (a crop-upkeep move,
  // the merchant-free alternative to a trade route). Merges into an existing
  // detachment to the same host so counts accumulate rather than duplicate.
  const parkTroops = useCallback((fromId, toId, troopsMap) => {
    updateActive((srv) => ({
      ...srv,
      villages: srv.villages.map((v) => {
        if (v.id !== fromId) return v
        const detachments = [...(v.detachments || [])]
        const idx = detachments.findIndex((d) => d.toId === toId)
        if (idx >= 0) {
          const merged = { ...detachments[idx].troops }
          for (const [id, n] of Object.entries(troopsMap)) merged[id] = (merged[id] || 0) + n
          detachments[idx] = { ...detachments[idx], troops: merged }
        } else {
          detachments.push({ toId, troops: { ...troopsMap } })
        }
        return { ...v, detachments }
      }),
    }))
  }, [updateActive])

  // The hero lives in exactly one village; production is derived from points +
  // mode and always lands in the assigned village only.
  const assignHero = useCallback((villageId) => {
    updateActive((srv) => recomputeHero({ ...srv, heroVillageId: villageId }))
  }, [updateActive])

  const setHeroPoints = useCallback((heroPoints) => {
    updateActive((srv) => recomputeHero({ ...srv, heroPoints }))
  }, [updateActive])

  const setHeroMode = useCallback((heroMode) => {
    updateActive((srv) => recomputeHero({ ...srv, heroMode }))
  }, [updateActive])

  // The equipped helmet lives on the active server (the hero belongs to a world).
  const setHeroItem = useCallback((heroItem) => {
    updateActive((srv) => ({ ...srv, heroItem }))
  }, [updateActive])

  // Prestige is account-wide, so it edits the top-level state, not a server.
  const setPrestige = useCallback((prestige) => {
    setState((s) => ({ ...s, prestige: Math.max(0, Number(prestige) || 0) }))
  }, [])

  // --- Server management -------------------------------------------------
  // A server is one game world with its own tribe, fixed at creation. Adding
  // one switches to it; removing the active one falls back to the first left.
  const addServer = useCallback(({ name, tribe }) => {
    setState((s) => {
      const srv = emptyServer(tribe, name)
      return { ...s, servers: [...s.servers, srv], activeServerId: srv.id }
    })
  }, [])

  const removeServer = useCallback((id) => {
    setState((s) => {
      const servers = s.servers.filter((srv) => srv.id !== id)
      if (!servers.length) {
        const srv = emptyServer('romans')
        return { ...s, servers: [srv], activeServerId: srv.id }
      }
      const activeServerId = s.activeServerId === id ? servers[0].id : s.activeServerId
      return { ...s, servers, activeServerId }
    })
  }, [])

  const renameServer = useCallback((id, name) => {
    setState((s) => ({ ...s, servers: s.servers.map((srv) => (srv.id === id ? { ...srv, name } : srv)) }))
  }, [])

  const setActiveServer = useCallback((id) => {
    setState((s) => (s.servers.some((srv) => srv.id === id) ? { ...s, activeServerId: id } : s))
  }, [])

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `castra-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [state])

  const importJSON = useCallback((file) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        setState({ ...hydrate(parsed), migrated: false })
      } catch {
        alert('That file is not valid Castra data. Export one first to see the expected shape.')
      }
    }
    reader.readAsText(file)
  }, [])

  const resetAll = useCallback(() => {
    localStorage.removeItem(KEY)
    setState(freshState())
  }, [])

  const active = state.servers.find((srv) => srv.id === state.activeServerId) || state.servers[0]

  // Kingdom training multipliers, recomputed whenever fealty (per world),
  // prestige (account-wide) or the equipped helmet change. Passed to the calc
  // functions that price training so cost/time/heal reflect them everywhere.
  const bonuses = trainingBonuses(active.settings, state.prestige, active.heroVillageId, active.heroItem)

  return {
    // Top-level multi-server state
    dataVersion: state.dataVersion,
    migrated: state.migrated,
    servers: state.servers,
    activeServerId: state.activeServerId,
    prestige: state.prestige,
    // The active server's data, flattened so existing tabs read it as before.
    settings: active.settings,
    villages: active.villages,
    troops: active.troops,
    mix: active.mix,
    routes: active.routes,
    heroVillageId: active.heroVillageId,
    heroPoints: active.heroPoints,
    heroMode: active.heroMode,
    heroItem: active.heroItem,
    bonuses,
    // Actions
    setSettings, setVillage, addVillage, addVillageWith, importGameExport, removeVillage, reorderVillages,
    setTroops, editTroop, setMix, exportJSON, importJSON, resetAll, dismissMigration,
    assignHero, setHeroPoints, setHeroMode, setHeroItem, setPrestige,
    addRoute, updateRoute, removeRoute, parkTroops,
    addServer, removeServer, renameServer, setActiveServer,
  }
}
