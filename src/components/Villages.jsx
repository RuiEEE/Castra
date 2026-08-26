import { useState } from 'react'
import {
  RES_IDS, fieldLevelMax, OASIS_STEPS, oasisMaxTroops,
  VILLAGE_LAYOUTS, detectLayout,
  maxOases, newOasis, WW_UPKEEP_FACTOR, WOUNDED_UPKEEP_FACTOR, BUILDING_CATALOG, buildingName,
} from '../gameData'
import { parseGameExport } from '../gameImport'
import {
  villageNet, grossProduction, fieldLevels,
  warehouseCapacity, granaryCapacity, netDeltas, stationDeltas, countsUpkeep, wonderSupport,
  troopCount, troopUpkeep, healCost, fmt,
} from '../calc'

// The Healing Tent queues its work in the same structure the Barracks uses.
const HEALING_TENT = 46

// Queue finish times are absolute, so a snapshot taken at import simply elapses:
// anything in the past has already landed.
function untilText(unixSeconds) {
  const secs = unixSeconds - Date.now() / 1000
  if (secs <= 0) return 'done'
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

function Num({ value, onChange, ...rest }) {
  return (
    <input type="number" value={value ?? 0}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      {...rest} />
  )
}

// --- Summary card (collapsed view) -----------------------------------------
function VillageCard({
  v, troops, settings, station, delta, ww, onOpen,
  onDragStart, onDragOver, onDrop, onDragEnd, dragging, dragOver,
}) {
  // Two different questions, so both numbers are shown. `own` is where the
  // village stands before a single merchant runs — the figure to fix with
  // fields, oases or fewer troops. `net` is what it actually ends the hour
  // with once every standing route has run, which is what decides starvation.
  const gross = grossProduction(v, settings.premium)
  const { net: own } = villageNet(v, troops, settings, station)
  const { net } = villageNet(v, troops, settings, delta)
  const starving = net.crop < 0

  return (
    <div
      className={`vcard ${v.capital ? 'capital' : ''} ${starving ? 'alarm' : ''} ${dragging ? 'dragging' : ''} ${dragOver ? 'dragover' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="vcard-head">
        <span className="grip" title="Drag to reorder" aria-hidden="true">⠿</span>
        <span style={{ fontFamily: 'Cinzel', fontSize: 15, flex: 1, color: 'var(--wood-brown)' }}>{v.name}</span>
        {v.capital
          ? <span className="crown">CAPITAL</span>
          : v.kind === 'city' && <span className="crown">CITY</span>}
        <span className="coord">{v.x}|{v.y}</span>
        <button className="btn ghost" onClick={onOpen} style={{ padding: '4px 10px' }}>Edit</button>
      </div>

      <div className="rrow">
        {RES_IDS.map((r) => {
          const before = own[r]
          const after = net[r]
          const moved = after - before
          const sign = (n) => (n > 0 ? '+' : '')
          const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero')
          return (
            <div className="rcell" key={r}>
              <div className="rlabel">{r}</div>
              <div className={`rnet ${tone(before)}`}>{sign(before)}{fmt(before)}</div>
              {/* Only worth the space when a route actually changes it. */}
              {Math.abs(moved) > 0.01 && (
                <div className={`rmoved ${tone(after)}`} title="net once standing trade routes have run">
                  → {sign(after)}{fmt(after)}
                </div>
              )}
              <div className="rsub">{fmt(gross[r])} gross</div>
              <div className="rsub">{sign(after)}{fmt(after * 24)}/day</div>
            </div>
          )
        })}
      </div>

      {ww && ww.crop > 0 && (
        <div className="alert">
          {fmt(ww.units)} troops at the World Wonder — ship <strong>{fmt(ww.crop)} crop/h</strong>
          {' '}({fmt(ww.crop * 24)}/day) there to feed them. Not counted in net crop above.
        </div>
      )}
    </div>
  )
}

// Every building whose level feeds a calculation, and where that level lands on
// the village model. Keyed by the game's own buildingType so an imported slot
// binds to the right field — mirrors the table in gameImport.js.
const MODELLED_BUILDINGS = [
  { type: 5, field: 'buildings.sawmill', max: 5, res: 'wood' },
  { type: 6, field: 'buildings.brickyard', max: 5, res: 'clay' },
  { type: 7, field: 'buildings.ironFoundry', max: 5, res: 'iron' },
  { type: 8, field: 'buildings.grainMill', max: 5, res: 'crop' },
  { type: 9, field: 'buildings.bakery', max: 5, res: 'crop' },
  { type: 10, field: 'warehouses', list: true, res: 'wood' },
  { type: 11, field: 'granaries', list: true, res: 'crop' },
  { type: 17, field: 'marketplace' },
  { type: 18, field: 'embassy', max: 20 },
  { type: 19, field: 'barracks' },
  { type: 20, field: 'stable' },
  { type: 21, field: 'workshop' },
  { type: 28, field: 'tradeOffice' },
  { type: 41, field: 'troughLevel' },
]
const MODELLED_BY_TYPE = new Map(MODELLED_BUILDINGS.map((b) => [b.type, b]))

// `index` only matters for the list fields — a village can hold several
// warehouses, and they sit in the array in the same slot order as the export.
function levelOf(v, spec, index = 0) {
  if (spec.list) return (Array.isArray(v[spec.field]) ? v[spec.field] : [])[index] || 0
  const [group, leaf] = spec.field.split('.')
  return leaf ? (v[group] || {})[leaf] || 0 : v[group] || 0
}

function levelPatch(v, spec, index, lvl) {
  const n = Math.max(0, spec.max ? Math.min(lvl, spec.max) : lvl)
  if (spec.list) {
    const cur = Array.isArray(v[spec.field]) ? [...v[spec.field]] : []
    while (cur.length <= index) cur.push(0)
    cur[index] = n
    return { [spec.field]: cur }
  }
  const [group, leaf] = spec.field.split('.')
  return leaf ? { [group]: { ...(v[group] || {}), [leaf]: n } } : { [group]: n }
}

// The whole village, one row per building. Levels the model uses stay editable
// and write back; the rest are shown as the export left them, so the panel is a
// complete picture without having to switch to the game.
function BuildingList({ v, onEdit }) {
  // Resource fields are types 1-4 and have their own editor; type 0 is an empty
  // build slot. Slot order is preserved so the nth warehouse here is the nth in
  // the model's array.
  const standing = (v.slots || []).filter((s) => s.type > 4)

  // No export for this village yet — fall back to the fields the model needs so
  // a hand-entered village is still editable.
  if (!standing.length) {
    return (
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {MODELLED_BUILDINGS.map((spec) => (
          <label className="field" key={spec.type} style={{ minWidth: 130 }}>
            <span className={spec.res ? `res-${spec.res}` : undefined}>{buildingName(spec.type)}</span>
            <Num
              value={levelOf(v, spec)}
              max={spec.max}
              onChange={(n) => onEdit(levelPatch(v, spec, 0, n))}
            />
          </label>
        ))}
      </div>
    )
  }

  const seen = new Map()
  const rows = standing.map((s) => {
    const index = seen.get(s.type) || 0
    seen.set(s.type, index + 1)
    return { ...s, spec: MODELLED_BY_TYPE.get(s.type), index }
  })
  rows.sort((a, b) => buildingName(a.type).localeCompare(buildingName(b.type)) || a.loc - b.loc)

  return (
    <div className="blist">
      {rows.map((r) => {
        const unsure = !BUILDING_CATALOG[r.type]?.ok
        return (
          <div className={`blist-row${r.spec ? ' is-modelled' : ''}`} key={r.loc}>
            <span
              className="blist-name"
              title={unsure ? 'Name inferred from the building id — unconfirmed for Kingdoms' : undefined}
            >
              {buildingName(r.type)}{unsure ? '?' : ''}
            </span>
            <span className="blist-slot">{r.loc}</span>
            {r.spec ? (
              <Num
                value={levelOf(v, r.spec, r.index)}
                max={r.spec.max}
                aria-label={`${buildingName(r.type)} level`}
                onChange={(n) => onEdit(levelPatch(v, r.spec, r.index, n))}
              />
            ) : (
              <span className="blist-lvl">{r.lvl}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Another player's troops standing here. They are not ours, but in Kingdoms the
// host feeds them, so they land on this village's crop bill without appearing in
// any of the troop boxes. Comes from the export; not editable.
function HostedBill({ v, troops }) {
  const hosted = troops.filter((t) => (v.hosted?.[t.id] || 0) > 0)
  if (!hosted.length) return null
  const crop = countsUpkeep(v.hosted, troops, v)

  return (
    <div className="troopbill">
      <div>
        <strong>Foreign troops</strong> —{' '}
        {hosted.map((t) => `${fmt(v.hosted[t.id])} ${t.name}`).join(', ')}. Another player's,
        stationed here; in Kingdoms the host pays:{' '}
        <span className="res-crop">+{fmt(Math.round(crop))} crop/h</span>. Not part of your army.
      </div>
    </div>
  )
}

// The Healing Tent is its own thing, deliberately kept out of the army: these
// units can't move and can't defend. They are closer to a build queue — crop
// goes in, and resources bring them back.
function HealingTent({ v, troops }) {
  // Two disjoint groups. `wounded` are idle: still injured, still eating, and
  // waiting for you to pay. The tent's queue holds the ones already paid for —
  // the export moves them out of the wounded stacks and into a healing queue, so
  // Belas can show 253 wounded and 1,210 already on their way back.
  const hurt = troops.filter((t) => (v.wounded?.[t.id] || 0) > 0)
  const healing = (v.trainQueue || []).filter((q) => q.building === HEALING_TENT)
  if (!hurt.length && !healing.length) return null

  const crop = countsUpkeep(v.wounded, troops, v) * WOUNDED_UPKEEP_FACTOR
  const total = hurt.reduce((s, t) => s + v.wounded[t.id], 0)
  const bill = healCost(v.wounded, troops)
  const returning = healing.reduce((s, q) => s + q.count, 0)
  const short = (id) => troops.find((t) => t.id === id)?.short || id

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Healing tent</h2>
        <span className="spacer" />
        <span className="note">
          {fmt(total)} wounded · <span className="res-crop">{fmt(Math.round(crop))} crop/h</span>
          {returning > 0 && ` · ${fmt(returning)} returning`}
        </span>
      </div>
      {hurt.length > 0 && (
        <>
          <div className="row">
            {hurt.map((t) => (
              <label className="field" key={t.id} style={{ minWidth: 80 }}>
                <span title={t.name}>{t.short}</span>
                <span className="blist-lvl">{fmt(v.wounded[t.id])}</span>
              </label>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="note">Heal them all for</span>
            {RES_IDS.filter((r) => bill[r] > 0).map((r) => (
              <span className={`chip res-${r}`} key={r}>{fmt(bill[r])} {r}</span>
            ))}
          </div>
        </>
      )}
      {healing.length > 0 && (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="note">Already healing</span>
          {healing.map((q, i) => (
            <span className="chip" key={i}>{fmt(q.count)} {short(q.unit)} · {untilText(q.done)}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// Everything the village has under construction or in training, straight from
// the export. A snapshot: the finish times are absolute, so they just run down.
function Queues({ v, troops }) {
  const build = v.buildQueue || []
  const training = (v.trainQueue || []).filter((q) => q.building !== HEALING_TENT)
  if (!build.length && !training.length) return null
  const running = build.filter((b) => !b.planned)
  const planned = build.filter((b) => b.planned)

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Queues</h2>
        <span className="spacer" />
        <span className="note">
          {running.length} building · {planned.length} planned · {fmt(training.reduce((s, q) => s + q.count, 0))} units training
        </span>
      </div>
      {running.map((b) => (
        <div className="blist-row" key={`b${b.loc}-${b.done}`}>
          <span className="blist-name">{buildingName(b.type)}</span>
          <span className="blist-slot">{b.loc}</span>
          <span className="blist-lvl">{untilText(b.done)}</span>
        </div>
      ))}
      {training.map((q, i) => (
        <div className="blist-row" key={`t${i}`}>
          <span className="blist-name">
            {fmt(q.count)} {troops.find((t) => t.id === q.unit)?.name || q.unit}
            <span className="blist-slot"> in {buildingName(q.building)}</span>
          </span>
          <span className="blist-lvl">{untilText(q.done)}</span>
        </div>
      ))}
      {planned.length > 0 && (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="note">Master builder</span>
          {planned.map((b, i) => (
            <span className="chip" key={i}>{buildingName(b.type)} · {b.loc}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Full-page editor -------------------------------------------------------
function VillageEditor({ v, villages, troops, settings, delta, onEdit, onRemove, onBack }) {
  const gross = grossProduction(v, settings.premium)
  const { net, upkeep } = villageNet(v, troops, settings, delta)
  const maxLvl = fieldLevelMax(v)
  const oases = Array.isArray(v.oases) ? v.oases : []
  const detachments = Array.isArray(v.detachments) ? v.detachments : []
  const others = villages.filter((o) => o.id !== v.id)

  // The army is deployable units only — the healing tent is tracked separately
  // and never counted here. So the whole army is either standing in this village
  // or parked in another one.
  const parkedAway = {}
  for (const d of detachments) for (const t of troops) parkedAway[t.id] = (parkedAway[t.id] || 0) + (d.troops?.[t.id] || 0)
  const ownedTotal = troopCount(v)
  const parkedTotal = troops.reduce((s, t) => s + (parkedAway[t.id] || 0), 0)
  const readyTotal = ownedTotal - parkedTotal
  const overCommitted = troops.filter((t) => (parkedAway[t.id] || 0) > (v.troops?.[t.id] || 0))

  const setCount = (r, n) => {
    const cur = fieldLevels(v.fields, r)
    const size = Math.max(0, Math.min(n, 24))
    const next = cur.slice(0, size)
    while (next.length < size) next.push(0)
    onEdit({ fields: { ...(v.fields || {}), [r]: next } })
  }
  const setAll = (r, lvl) => {
    const cur = fieldLevels(v.fields, r)
    onEdit({ fields: { ...(v.fields || {}), [r]: cur.map(() => lvl) } })
  }
  const setOne = (r, i, lvl) => {
    const cur = [...fieldLevels(v.fields, r)]
    cur[i] = lvl
    onEdit({ fields: { ...(v.fields || {}), [r]: cur } })
  }

  // Oases: a list, each with 1–2 resource slots. Bonuses stack across oases.
  const oasisLimit = maxOases(v.embassy)
  const patchOases = (next) => onEdit({ oases: next })
  const addOasis = () => patchOases([...oases, newOasis()])
  const removeOasis = (oi) => patchOases(oases.filter((_, i) => i !== oi))
  const setOasisPct = (oi, pct) => patchOases(oases.map((o, i) => (i === oi ? { ...o, pct } : o)))
  const setOasisFlat = (oi, flat) => patchOases(oases.map((o, i) => (i === oi ? { ...o, flat } : o)))
  const editSlot = (oi, si, patch) => patchOases(oases.map((o, i) => {
    if (i !== oi) return o
    const slots = (o.slots || []).map((s, j) => (j === si ? { ...s, ...patch } : s))
    return { ...o, slots }
  }))
  const addSlot = (oi) => patchOases(oases.map((o, i) => (
    i === oi ? { ...o, slots: [...(o.slots || []), { res: 'crop' }] } : o
  )))
  const removeSlot = (oi, si) => patchOases(oases.map((o, i) => (
    i === oi ? { ...o, slots: (o.slots || []).filter((_, j) => j !== si) } : o
  )))

  // Detachments: troops this village owns but parks in another. Their crop
  // upkeep moves to the host village (calc.stationDeltas).
  const patchDetach = (next) => onEdit({ detachments: next })
  const addDetach = () => patchDetach([
    ...detachments,
    { toId: others[0]?.id ?? null, ww: others.length === 0, troops: {} },
  ])
  const removeDetach = (di) => patchDetach(detachments.filter((_, i) => i !== di))
  // 'ww' means a World Wonder village — not one of yours, so no host id.
  const setDetachTo = (di, value) => patchDetach(detachments.map((d, i) => (
    i === di ? { ...d, ww: value === 'ww', toId: value === 'ww' ? null : value } : d
  )))
  const setDetachTroop = (di, tid, n) => patchDetach(detachments.map((d, i) => (
    i === di ? { ...d, troops: { ...d.troops, [tid]: n } } : d
  )))

  const layoutId = detectLayout(v.fields)
  const applyLayout = (id) => {
    const preset = VILLAGE_LAYOUTS.find((l) => l.id === id)
    if (!preset || !preset.fields) return
    const next = {}
    RES_IDS.forEach((r, i) => {
      const cur = fieldLevels(v.fields, r)
      const size = preset.fields[i]
      const arr = cur.slice(0, size)
      while (arr.length < size) arr.push(0)
      next[r] = arr
    })
    onEdit({ fields: next })
  }

  return (
    <>
      <div className="panel-head">
        <button className="btn ghost fit" onClick={onBack}>← Villages</button>
        <h2 style={{ marginLeft: 6 }}>{v.name || 'Village'}</h2>
        {v.capital && <span className="crown">CAPITAL</span>}
        <span className="spacer" />
        <button className="btn primary fit" onClick={onBack}>Done</button>
      </div>

      <div className="content">
        <div className="panel">
          <div className="panel-head"><h2>Identity</h2></div>
          <div className="row compact">
            <label className="field" style={{ flex: 2 }}>
              <span>Name</span>
              <input value={v.name} onChange={(e) => onEdit({ name: e.target.value })} />
            </label>
            <label className="field"><span>X</span><Num value={v.x} onChange={(x) => onEdit({ x })} /></label>
            <label className="field"><span>Y</span><Num value={v.y} onChange={(y) => onEdit({ y })} /></label>
            <label className="field"><span>Population</span><Num value={v.population} onChange={(population) => onEdit({ population })} /></label>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label className="field fit">
              <span>Type</span>
              <select value={v.kind || 'village'} onChange={(e) => onEdit({ kind: e.target.value })}>
                <option value="village">Village — fields max 10</option>
                <option value="city">City — fields max 12</option>
              </select>
            </label>
            <label className="field fit" style={{ display: 'flex', gap: 8, alignItems: 'center', alignSelf: 'flex-end' }}>
              <input type="checkbox" checked={!!v.capital} onChange={(e) => onEdit({ capital: e.target.checked })} />
              <span>Capital (uncapped)</span>
            </label>
          </div>
        </div>

        <div className="panel-pair">
        <div className="panel">
          <div className="panel-head">
            <h2>Resource fields</h2>
            <label className="field fit" style={{ marginLeft: 12 }}>
              <span>Layout</span>
              <select value={layoutId} onChange={(e) => applyLayout(e.target.value)}>
                {VILLAGE_LAYOUTS.map((l) => (
                  <option key={l.id} value={l.id} disabled={l.id === 'custom'}>{l.label}</option>
                ))}
              </select>
            </label>
            <span className="spacer" />
            <span className="note">max level {maxLvl}{v.capital ? ' (uncapped)' : ''}</span>
          </div>
          <div className="hint" style={{ marginBottom: 10 }}>
            Gross now:{RES_IDS.map((r) => (
              <span key={r} className={`res-${r}`} style={{ marginLeft: 8 }}>{fmt(gross[r])} {r}/h</span>
            ))}
          </div>
          {RES_IDS.map((r) => {
            const levels = fieldLevels(v.fields, r)
            return (
              <div className="fieldblock" key={r}>
                <div className="fieldblock-head">
                  <span className={`res-${r}`} style={{ textTransform: 'capitalize', fontWeight: 600, minWidth: 52 }}>{r}</span>
                  <label className="field fit"><span>fields</span>
                    <Num value={levels.length} onChange={(n) => setCount(r, n)} style={{ width: 70 }} />
                  </label>
                  <label className="field fit"><span>set all</span>
                    <input type="number" placeholder="lvl" style={{ width: 70 }}
                      onChange={(e) => e.target.value !== '' && setAll(r, Number(e.target.value))} />
                  </label>
                </div>
                <div className="fieldgrid">
                  {levels.map((lvl, i) => (
                    <Num key={i} value={lvl} max={maxLvl} onChange={(n) => setOne(r, i, n)} aria-label={`${r} field ${i + 1}`} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Oases</h2></div>
          <div className="fieldblock-head" style={{ margin: '0 0 6px', justifyContent: 'space-between' }}>
            <span className="hint" style={{ margin: 0 }}>Bonuses stack across oases.</span>
            <button className="btn ghost fit" onClick={addOasis} disabled={oases.length >= oasisLimit}>
              + Add oasis ({oases.length}/{oasisLimit})
            </button>
          </div>
          {oasisLimit === 0 && (
            <div className="hint">Embassy level 0 — build an embassy (L1/L10/L20 → 1/2/3 oases).</div>
          )}
          {oases.map((o, oi) => {
            const maxT = oasisMaxTroops(o.pct || 0)
            return (
              <div className="fieldblock" key={oi}>
                <div className="fieldblock-head" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="rsub">Oasis {oi + 1}</span>
                    <select value={o.pct || 0} onChange={(e) => setOasisPct(oi, Number(e.target.value))} style={{ width: 74 }}>
                      {OASIS_STEPS.map((p) => <option key={p} value={p}>{p}%</option>)}
                    </select>
                    <span className="rsub">+</span>
                    <Num value={o.flat} max={maxT || undefined} aria-label="stationed-troop flat" style={{ width: 74 }}
                      onChange={(n) => setOasisFlat(oi, Math.max(0, maxT ? Math.min(n, maxT) : n))} />
                    <span className="rsub">troops, on each resource{maxT ? ` (up to ${maxT})` : ''}</span>
                  </div>
                  <button className="btn ghost fit" title="Remove oasis" onClick={() => removeOasis(oi)}>✕</button>
                </div>
                <div className="row">
                  {(o.slots || []).map((s, si) => (
                    <div className="field fit" key={si}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select value={s.res} onChange={(e) => editSlot(oi, si, { res: e.target.value })} style={{ width: 88 }}>
                          {RES_IDS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        {(o.slots || []).length > 1 && (
                          <button className="btn ghost fit" title="Remove resource" onClick={() => removeSlot(oi, si)}>✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {(o.slots || []).length < 2 && (
                    <button className="btn ghost fit" style={{ alignSelf: 'flex-start' }} onClick={() => addSlot(oi)}>+ resource</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Buildings</h2>
            <span className="spacer" />
            <span className="note">
              storage <span className="res-wood">{fmt(warehouseCapacity(v, settings.premium))}</span>
              {' · '}<span className="res-crop">{fmt(granaryCapacity(v, settings.premium))}</span>
            </span>
          </div>
          <BuildingList v={v} onEdit={onEdit} />
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Troops stationed</h2>
            <span className="spacer" />
            <span className="note">{fmt(upkeep)} crop/h upkeep · net crop {fmt(net.crop)}/h</span>
          </div>
          <HostedBill v={v} troops={troops} />
          <div className="row">
            {troops.map((t) => {
              const owned = v.troops?.[t.id] || 0
              const away = parkedAway[t.id] || 0
              return (
                <label className="field" key={t.id} style={{ minWidth: 80 }}>
                  <span title={t.name}>{t.short}</span>
                  <Num value={v.troops?.[t.id]} onChange={(n) => onEdit({ troops: { ...v.troops, [t.id]: n } })} />
                  {away > 0 && (
                    <span className={`rsub ${away > owned ? 'neg' : ''}`} style={{ marginTop: 2 }}>
                      {fmt(owned - away)} here · {fmt(away)} away
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </div>

        <HealingTent v={v} troops={troops} />

        <Queues v={v} troops={troops} />

        <div className="panel">
          <div className="panel-head">
            <h2>Detachments</h2>
            <span className="spacer" />
            <span className="note">
              army {fmt(ownedTotal)} · parked away {fmt(parkedTotal)} · here {fmt(readyTotal)}
            </span>
            <button className="btn ghost fit" style={{ marginLeft: 12 }} onClick={addDetach}>
              + Park troops elsewhere
            </button>
          </div>
          {overCommitted.length > 0 && (
            <div className="alert bad" style={{ marginBottom: 8 }}>
              Over-committed: you've parked more {overCommitted.map((t) => t.short).join(', ')} than
              this village owns. Lower the detachment counts or raise the army above.
            </div>
          )}
          {detachments.map((d, di) => {
            // At a World Wonder the garrison eats half upkeep and gets no trough
            // discount — and it eats crop you have to ship there, not produce.
            const full = countsUpkeep(d.troops, troops, {})
            const up = d.ww
              ? full * WW_UPKEEP_FACTOR
              : countsUpkeep(d.troops, troops, others.find((o) => o.id === d.toId) || v)
            return (
              <div className="fieldblock" key={di}>
                <div className="fieldblock-head" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <label className="field fit">
                    <span>Parked in</span>
                    <select value={d.ww ? 'ww' : (d.toId ?? '')} onChange={(e) => setDetachTo(di, e.target.value)}>
                      {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      <option value="ww">World Wonder (half upkeep, shipped)</option>
                    </select>
                  </label>
                  <span className="note" style={{ alignSelf: 'flex-end' }}>
                    {d.ww
                      ? `${fmt(up)} crop/h to ship to the WW (half of ${fmt(full)})`
                      : `${fmt(up)} crop/h → host`}
                  </span>
                  <button className="btn ghost fit" title="Remove detachment" onClick={() => removeDetach(di)}>✕</button>
                </div>
                <div className="row">
                  {troops.map((t) => (
                    <label className="field" key={t.id} style={{ minWidth: 80 }}>
                      <span title={t.name}>{t.short}</span>
                      <Num value={d.troops?.[t.id]} onChange={(n) => setDetachTroop(di, t.id, n)} />
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn ghost danger" onClick={onRemove}>Delete village</button>
          <button className="btn primary" onClick={onBack}>Done</button>
        </div>
      </div>
    </>
  )
}

export default function Villages({ villages, troops, settings, routes, setVillage, addVillage, importGameExport, removeVillage, reorderVillages }) {
  const [editingId, setEditingId] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [paste, setPaste] = useState('')
  const [result, setResult] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)

  // Troops stationed elsewhere move their crop bill with them whether or not a
  // merchant ever runs, so that belongs in the BEFORE-routes figure. Only
  // routeDeltas is what a trade route adds on top.
  const stations = stationDeltas(villages, troops)
  const deltas = netDeltas(villages, troops, routes)
  const editing = villages.find((v) => v.id === editingId)
  if (editing) {
    return (
      <VillageEditor
        v={editing} villages={villages} troops={troops} settings={settings} delta={deltas[editing.id]}
        onEdit={(patch) => setVillage(editing.id, patch)}
        onRemove={() => { removeVillage(editing.id); setEditingId(null) }}
        onBack={() => setEditingId(null)}
      />
    )
  }

  // The game export is a single JSON blob covering every village at once.
  const applyExport = (text) => {
    const { villages: parsed, wonderUnits, error } = parseGameExport(text, settings.tribe)
    if (error) {
      setResult({ error })
      return
    }
    // Mirror the store's matching: game id first, then name for villages that
    // have never been imported. Otherwise a village renamed in-game reads as new.
    const gameIds = new Set(villages.map((v) => v.gameId).filter(Boolean))
    const names = new Set(villages.filter((v) => !v.gameId).map((v) => v.name.trim().toLowerCase()))
    const isKnown = (p) => gameIds.has(p.gameId) || names.has(p.name.trim().toLowerCase())
    const created = parsed.filter((p) => !isKnown(p)).map((p) => p.name)
    // Oases aren't in the export. Anywhere the game reports more output than the
    // imported fields and bonus buildings account for, an oasis is missing.
    const needsOasis = parsed
      .filter((p) => {
        if (!p.reported || !p.fields) return false
        const ours = grossProduction(p, settings.premium)
        return RES_IDS.some((r) => p.reported[r] - ours[r] > Math.max(20, p.reported[r] * 0.02))
      })
      .map((p) => p.name)
    importGameExport(parsed)
    setResult({
      count: parsed.length,
      created,
      updated: parsed.filter(isKnown).map((p) => p.name),
      wonderUnits,
      needsOasis,
    })
  }

  const totals = RES_IDS.reduce((acc, r) => {
    acc[r] = villages.reduce((s, v) => s + villageNet(v, troops, settings).net[r], 0)
    return acc
  }, {})
  const totalTroops = villages.reduce((s, v) => s + troopCount(v), 0)
  const totalUpkeep = villages.reduce((s, v) => s + troopUpkeep(v, troops), 0)
  const ww = wonderSupport(villages, troops)

  // Empire-wide queue snapshot: units training in the Barracks/Stable/Workshop
  // (grouped by building), wounded sitting idle in the hospital, and the ones
  // already paid to heal (the Healing Tent queues under building 46).
  const queued = villages.reduce((acc, v) => {
    for (const q of v.trainQueue || []) {
      if (q.building === HEALING_TENT) acc.healing += q.count
      else {
        acc.training += q.count
        acc.byBuilding[q.building] = (acc.byBuilding[q.building] || 0) + q.count
      }
    }
    for (const id in v.wounded || {}) acc.wounded += v.wounded[id]
    return acc
  }, { training: 0, healing: 0, wounded: 0, byBuilding: {} })
  const trainingBreak = Object.entries(queued.byBuilding)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${BUILDING_CATALOG[type]?.short || buildingName(Number(type))} ${fmt(n)}`)
    .join(' · ')

  return (
    <>
      <div className="stats">
        {RES_IDS.map((r) => (
          <div className="stat" key={r}>
            <div className="k">Net {r} / hour</div>
            <div className={`v ${totals[r] > 0 ? 'pos' : totals[r] < 0 ? 'neg' : 'zero'}`}>
              {totals[r] > 0 ? '+' : ''}{fmt(totals[r])}
            </div>
            <div className="s">{fmt(totals[r] * 24)} per day</div>
          </div>
        ))}
        <div className="stat">
          <div className="k">Standing army</div>
          <div className="v">{fmt(totalTroops)}</div>
          <div className="s">{fmt(totalUpkeep)} crop/h upkeep</div>
        </div>
        {queued.training > 0 && (
          <div className="stat">
            <div className="k">In training</div>
            <div className="v">{fmt(queued.training)}</div>
            <div className="s">{trainingBreak}</div>
          </div>
        )}
        {(queued.wounded > 0 || queued.healing > 0) && (
          <div className="stat">
            <div className="k">Hospital</div>
            <div className="v">{fmt(queued.wounded)}</div>
            <div className="s">{fmt(queued.wounded)} wounded · {fmt(queued.healing)} healing</div>
          </div>
        )}
        {ww.crop > 0 && (
          <div className="stat">
            <div className="k">World Wonder support</div>
            <div className="v neg">{fmt(ww.crop)} crop/h</div>
            <div className="s">{fmt(ww.units)} troops there · ship {fmt(ww.crop * 24)}/day</div>
          </div>
        )}
      </div>

      <div className="panel-head">
        <h2>Villages</h2>
        <span className="note">{villages.length} settled</span>
        <span className="spacer" />
        <button className="btn" onClick={() => setShowImport((s) => !s)}>
          {showImport ? 'Close import' : 'Import data'}
        </button>
        <button className="btn primary" onClick={addVillage}>Add village</button>
      </div>

      {showImport && (
        <div className="panel">
          <div className="panel-head"><h2>Import from the game</h2></div>
          <div className="hint" style={{ marginBottom: 8 }}>
            Open the game with the browser's network inspector recording, reload, and find the
            request to <code>?c=player&amp;a=getAll</code>. Save or copy its response and drop it in
            here. It carries every village at once: coordinates, population, all field and building
            levels, the whole army — wounded and foreign troops included — and where each stack is
            parked, down to troops sitting in a World Wonder. Nothing is sent anywhere; the file is
            read in this page. Villages are matched on the game's own id, so renaming one in-game
            still updates it in place. Oases are the only thing the export doesn't carry, so those
            stay hand-entered — and re-importing never overwrites them.
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <input
              type="file"
              accept=".json,.txt,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                file.text().then(applyExport).catch(() => setResult({ error: 'Could not read that file.' }))
                e.target.value = ''
              }}
            />
          </div>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder="Or paste the JSON response here. Large exports are easier to load with the file picker above."
            style={{ fontFamily: 'var(--mono)', fontSize: 13, resize: 'vertical' }}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary fit" onClick={() => applyExport(paste)} disabled={!paste.trim()}>Apply</button>
            <button className="btn ghost fit" onClick={() => { setPaste(''); setResult(null) }}>Clear</button>
            <span className="spacer" />
          </div>
          {result?.error && (
            <div className="alert bad" style={{ marginTop: 10 }}>{result.error}</div>
          )}
          {result && !result.error && (
            <div className="alert good" style={{ marginTop: 10 }}>
              Imported {result.count} village{result.count === 1 ? '' : 's'}:
              {' '}{result.updated.length} updated
              {result.created.length > 0 && `, ${result.created.length} created (${result.created.join(', ')})`}.
              {result.wonderUnits > 0 && ` ${fmt(result.wonderUnits)} troops found in a World Wonder.`}
              {result.count === 0 && ' No villages found — check this is the getAll response.'}
            </div>
          )}
          {result?.needsOasis?.length > 0 && (
            <div className="alert" style={{ marginTop: 10 }}>
              These produce more than their fields explain, so their oases still need entering by
              hand — the export doesn't carry them: <strong>{result.needsOasis.join(', ')}</strong>.
            </div>
          )}
        </div>
      )}

      {villages.length === 0 ? (
        <div className="empty">No villages yet. Add one to start.</div>
      ) : (
        <div className="vgrid">
          {villages.map((v) => (
            <VillageCard
              key={v.id} v={v} troops={troops} settings={settings}
              station={stations[v.id]} delta={deltas[v.id]}
              ww={ww.byVillage[v.id]}
              onOpen={() => setEditingId(v.id)}
              dragging={dragId === v.id}
              dragOver={overId === v.id && dragId !== v.id}
              onDragStart={(e) => { setDragId(v.id); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overId !== v.id) setOverId(v.id) }}
              onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== v.id) reorderVillages(dragId, v.id); setDragId(null); setOverId(null) }}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
            />
          ))}
        </div>
      )}
    </>
  )
}
