import { useMemo, useState } from 'react'
import { TRIBES, buildingName } from '../gameData'
import {
  WCI, grossProduction, troopCount, routeDeltas, routeRates, wonderTargets,
  merchantCount, trainingPlan, villageProducers, trainingLevel,
  TRAINABLE_BUILDINGS, byName, fmt, fmtHours,
} from '../calc'
import { everyText } from './RouteForm'

function sumRows(rows) {
  const t = {
    units: 0, selfFunded: 0, funded: 0,
    made: { wood: 0, clay: 0, iron: 0 },
    cost: { wood: 0, clay: 0, iron: 0 },
    moved: { wood: 0, clay: 0, iron: 0 },
    left: { wood: 0, clay: 0, iron: 0 },
  }
  for (const row of rows) {
    t.units += row.unitsDay
    t.selfFunded += row.selfFunded || 0
    t.funded += row.funded || 0
    for (const r of WCI) {
      t.made[r] += row.made[r]
      t.cost[r] += row.cost[r]
      t.moved[r] += row.moved[r]
      t.left[r] += row.left[r]
    }
  }
  return t
}

function trainLabel(secs) {
  if (!secs) return '—'
  if (secs < 90) return `${Math.round(secs)}s`
  if (secs < 5400) return `${fmt(secs / 60, 1)}m`
  return `${fmt(secs / 3600, 1)}h`
}

// Building metadata for the producing table: the game's own type id (so the name
// comes from BUILDING_CATALOG) and the troop class the owner thinks in.
const BUILDING_GID = { barracks: 19, stable: 20, workshop: 21 }
const BUILDING_CLASS = { barracks: 'Infantry', stable: 'Cavalry', workshop: 'Siege' }

export default function Production({ villages, troops, settings, routes, setVillage }) {
  const tribe = TRIBES[settings.tribe] || TRIBES.romans
  const trainable = useMemo(() => troops.filter((t) => TRAINABLE_BUILDINGS.includes(t.building)), [troops])
  // Every per-village list on this tab reads in the game's own order.
  const ordered = useMemo(() => [...villages].sort(byName), [villages])

  // Free-trade assumption: pool every village's wood/clay/iron. Trade routes just
  // move these around internally, so the empire total is what actually caps output.
  // Crop is deliberately ignored — Kingdoms charges no crop to TRAIN, only to feed.
  const supply = useMemo(() => {
    const s = { wood: 0, clay: 0, iron: 0 }
    for (const v of villages) {
      const g = grossProduction(v, settings.premium)
      for (const r of WCI) s[r] += (g[r] || 0) * settings.serverSpeed
    }
    return s
  }, [villages, settings])

  // One entry per (village, training building) with a unit assigned — a village
  // running its barracks, stable and workshop at once shows up three times.
  const producers = useMemo(
    () => villages.flatMap((v) => villageProducers(v, troops, settings).map((p) => ({ v, ...p }))),
    [villages, troops, settings],
  )
  const producingCount = useMemo(() => new Set(producers.map((p) => p.v.id)).size, [producers])

  const demand = useMemo(() => {
    const d = { wood: 0, clay: 0, iron: 0 }
    for (const p of producers) for (const r of WCI) d[r] += p.demand[r]
    return d
  }, [producers])

  // How far the empire's raw-resource income covers full training throughput.
  // ratio < 1 → a resource caps you below what the buildings could pump out.
  const { ratio, bottleneck } = useMemo(() => {
    let ratio = Infinity
    let bottleneck = null
    for (const r of WCI) {
      if (demand[r] <= 0) continue
      const x = supply[r] / demand[r]
      if (x < ratio) { ratio = x; bottleneck = r }
    }
    return { ratio, bottleneck }
  }, [supply, demand])

  const resourceLimited = ratio < 1 && bottleneck
  const scale = resourceLimited ? ratio : 1
  const fullPerDay = producers.reduce((s, p) => s + p.perDay, 0)
  const achievablePerDay = fullPerDay * scale
  const standing = villages.reduce((s, v) => s + troopCount(v), 0)

  // Same output, grouped by unit instead of by village — several villages can train the same unit.
  const byUnit = useMemo(() => {
    const map = new Map()
    for (const p of producers) {
      const cur = map.get(p.def.id) || { id: p.def.id, name: p.def.name, perDay: 0 }
      cur.perDay += p.perDay * scale
      map.set(p.def.id, cur)
    }
    return [...map.values()].sort((a, b) => b.perDay - a.perDay)
  }, [producers, scale])

  // Per-village accounting, per HOUR and at FULL queue rate. Full rate is the
  // point: the question this tab answers is what it takes to keep a barracks
  // running without a gap, not what happens if you ship nothing.
  //
  //   own = what the village makes, minus what its own queues burn
  //   net = own, plus what standing routes bring in and minus what they take out
  //
  // Non-producers have no cost, so they are pure income into the pool — which is
  // exactly what makes them the sources for the plan below.
  const deltas = useMemo(() => routeDeltas(routes), [routes])
  const rows = useMemo(() => {
    return ordered.map((v) => {
      const g = grossProduction(v, settings.premium)
      const ps = producers.filter((x) => x.v.id === v.id)
      const made = {}
      const cost = { wood: 0, clay: 0, iron: 0 }
      const moved = {}
      const own = {}
      const net = {}
      for (const r of WCI) {
        made[r] = (g[r] || 0) * settings.serverSpeed
        cost[r] = ps.reduce((s, p) => s + p.demand[r], 0)
        moved[r] = deltas[v.id]?.[r] || 0
        own[r] = made[r] - cost[r]
        net[r] = own[r] + moved[r]
      }
      const unitsDay = ps.reduce((s, p) => s + p.perDay, 0)
      // Units/day from its OWN production alone, and from its production plus
      // whatever the routes bring in. With several units in flight the resources
      // fund them in proportion, so scale the full throughput by the tightest
      // resource ratio — neither figure can exceed what the buildings can train.
      let selfFunded = null
      let funded = null
      const short = []
      if (ps.length > 0) {
        let sf = Infinity
        let fd = Infinity
        for (const r of WCI) {
          if (cost[r] > 0) {
            sf = Math.min(sf, made[r] / cost[r])
            fd = Math.min(fd, (made[r] + moved[r]) / cost[r])
          }
          if (net[r] < -0.5) short.push(r)
        }
        selfFunded = Math.floor(unitsDay * Math.min(1, sf))
        funded = Math.floor(unitsDay * Math.min(1, fd))
      }
      return { v, defs: ps.map((p) => p.def), unitsDay, made, cost, moved, own, net, selfFunded, funded, short }
    })
  }, [ordered, producers, deltas, settings])

  // The shipping problem, using the same route machinery the Crop tab uses: a
  // step-function merchant cost, any whole-hour departure interval, and a source
  // preference of solo-coverer → fewest merchants → nearest.
  const balance = useMemo(() => Object.fromEntries(rows.map((row) => [row.v.id, row.net])), [rows])
  const plan = useMemo(
    () => trainingPlan(ordered, balance, routes, tribe, settings),
    [ordered, balance, routes, tribe, settings],
  )

  // Wood/clay/iron already flowing to a World Wonder on a standing route. Nothing
  // FORCES you to feed a wonder's construction — unlike the crop its garrison
  // eats, there is no computed requirement — so this is never a deficit to plan
  // against, only a shipment to keep visible. The source village already carries
  // the cost in its ledger (routeDeltas debits it), but the wonder has no row of
  // its own, so surface what it's receiving here, the way the Crop tab does.
  const wonders = useMemo(() => wonderTargets(villages, troops), [villages, troops])
  const wonderInbound = useMemo(() => {
    const out = []
    for (const w of wonders) {
      for (const res of WCI) {
        const amt = (routes || []).reduce(
          (s, r) => s + (r.wwId === w.wwId ? (routeRates(r)[res] || 0) : 0), 0,
        )
        if (amt > 0.01) out.push({ key: `${w.wwId}:${res}`, name: w.name, res, inbound: amt })
      }
    }
    return out
  }, [wonders, routes])
  const wonderTotal = useMemo(() => {
    const t = { wood: 0, clay: 0, iron: 0 }
    for (const c of wonderInbound) t[c.res] += c.inbound
    return t
  }, [wonderInbound])
  const wonderTotalAll = WCI.reduce((s, r) => s + wonderTotal[r], 0)

  // Daily figures for the ledger; the tables above and the plan work per hour.
  const ledger = useMemo(() => rows.map((row) => ({
    ...row,
    made: Object.fromEntries(WCI.map((r) => [r, row.made[r] * 24])),
    cost: Object.fromEntries(WCI.map((r) => [r, row.cost[r] * 24])),
    moved: Object.fromEntries(WCI.map((r) => [r, row.moved[r] * 24])),
    left: Object.fromEntries(WCI.map((r) => [r, row.net[r] * 24])),
  })), [rows])

  // Split the ledger: villages that burn resources training, and villages that
  // only feed the pool. Their subtotals are the two halves of the empire balance.
  const { producing, supplying, producingTotals, supplyingTotals, totals } = useMemo(() => {
    const producing = ledger.filter((row) => row.defs.length > 0)
    const supplying = ledger.filter((row) => row.defs.length === 0)
    return {
      producing,
      supplying,
      producingTotals: sumRows(producing),
      supplyingTotals: sumRows(supplying),
      totals: sumRows(ledger),
    }
  }, [ledger])

  // Coverage, per village and resource: the deficit it runs on its OWN
  // production against what the routes net deliver. A village that forwards
  // resources on doesn't look fuller than it is, because `net` counts both
  // directions — a relay breaks any one-directional check.
  const coverage = useMemo(() => {
    const out = []
    for (const row of rows) {
      for (const r of WCI) {
        if (row.own[r] >= -0.01) continue
        out.push({
          key: `${row.v.id}:${r}`, name: row.v.name, res: r,
          need: -row.own[r],
          inbound: Math.max(0, row.moved[r]),
          outbound: Math.max(0, -row.moved[r]),
          balance: row.net[r],
        })
      }
    }
    return out.sort((a, b) => a.balance - b.balance)
  }, [rows])

  const idleMerchants = villages.reduce((s, v) => s + (plan.budget.get(v.id) || 0), 0)
  const totalMerchants = villages.reduce((s, v) => s + merchantCount(v), 0)
  // The empire being short of a resource is a production problem, not a shipping
  // one — merchants move resources, they don't make them. Only once the empire
  // total is positive does WHERE the resource sits become answerable by routes.
  const empireShort = WCI.filter((r) => supply[r] - demand[r] < -0.01)

  const setProduces = (v, building, unitId) =>
    setVillage(v.id, { produces: { ...(v.produces || {}), [building]: unitId || null } })

  // A building's selector shows once it's "on" — either it already has a unit,
  // or the owner enabled it here. Enabling reveals an empty selector; the ✕ turns
  // it back off, clearing any assignment. Idle buildings stay collapsed to a chip.
  const [enabled, setEnabled] = useState(() => new Set())
  const enable = (v, building) => setEnabled((s) => new Set(s).add(`${v.id}:${building}`))
  const disable = (v, building) => {
    setEnabled((s) => { const n = new Set(s); n.delete(`${v.id}:${building}`); return n })
    setProduces(v, building, '')
  }

  return (
    <div className="prod">
      <div className="prod-top">
      <div className="panel">
        <div className="panel-head">
          <h2>Producing villages</h2>
          <span className="note">Assign each training building the unit it maxes smithy on</span>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th>Village</th>
              <th>Training buildings</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((v) => {
              // Only buildings the village actually has (or already has a unit on,
              // so a level-0 mistake stays visible) can produce.
              const available = TRAINABLE_BUILDINGS.filter(
                (b) => trainingLevel(v, b) >= 1 || v.produces?.[b],
              )
              if (available.length === 0) return null
              return (
                <tr key={v.id}>
                  <td>{v.name} {v.capital && <span className="chip gold">cap</span>}</td>
                  <td>
                    {/* All of a village's buildings sit side by side: an active one
                        is a tile with its selector + throughput, an idle one collapses
                        to a "+ Cavalry" chip that reveals the selector when clicked. */}
                    <div className="build-row">
                      {available.map((building) => {
                        const on = v.produces?.[building] || enabled.has(`${v.id}:${building}`)
                        if (!on) {
                          return (
                            <button type="button" key={building} className="chip toggle" onClick={() => enable(v, building)}>
                              + {BUILDING_CLASS[building]}
                            </button>
                          )
                        }
                        const p = producers.find((x) => x.v.id === v.id && x.building === building)
                        const opts = trainable.filter((t) => t.building === building)
                        return (
                          <div className="build-tile" key={building}>
                            <div className="btop">
                              <span className="btitle">{buildingName(BUILDING_GID[building])} {trainingLevel(v, building) || 0}</span>
                              <select value={v.produces?.[building] || ''} onChange={(e) => setProduces(v, building, e.target.value)} className="bselect">
                                <option value="">—</option>
                                {opts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                              <button type="button" className="linkx" title={`Stop training ${BUILDING_CLASS[building].toLowerCase()} here`} onClick={() => disable(v, building)}>✕</button>
                            </div>
                            {p && p.missing && <span className="chip bad">no {building}</span>}
                            {p && !p.missing && (
                              <span className="bstat">
                                {trainLabel(p.secs)} · {fmt(p.perDay)}/day{resourceLimited ? ` · ${fmt(p.perDay * scale)} real` : ''}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {producers.some((p) => p.missing) && (
          <div className="alert bad" style={{ marginTop: 12 }}>
            A building is set to produce a unit it can't build — its level is 0.
            Build the training building or clear the assignment.
          </div>
        )}
      </div>

      {producers.length === 0 ? (
        <div className="empty">
          No producing villages yet. Set a unit in the table above and Castra will pool every
          village's resources against your total training throughput.
        </div>
      ) : (
        <div className="prod-side">
        <div className="stats">
          <div className="stat">
            <div className="k">Empire output</div>
            <div className="v">{fmt(achievablePerDay)}</div>
            <div className="s">units/day across {producingCount} village{producingCount === 1 ? '' : 's'}</div>
          </div>
          <div className="stat">
            <div className="k">Limited by</div>
            <div className={`v ${resourceLimited ? 'neg' : 'pos'}`}>{resourceLimited ? bottleneck : 'buildings'}</div>
            <div className="s">{resourceLimited ? `${fmt((1 - ratio) * 100)}% throughput lost to ${bottleneck}` : 'resources cover full training queues'}</div>
          </div>
          <div className="stat">
            <div className="k">To ship / hour</div>
            <div className={`v ${plan.totals.needed ? 'neg' : 'pos'}`}>{fmt(plan.totals.needed)}</div>
            <div className="s">
              {plan.totals.needed
                ? `to keep every queue full · ${fmt(plan.totals.unmet)} undeliverable`
                : 'every village funds its own queue'}
            </div>
          </div>
          <div className="stat">
            <div className="k">Merchants for the plan</div>
            <div className="v">{fmt(plan.totals.merchantsUsed)}</div>
            <div className="s">of {fmt(totalMerchants)} · {fmt(idleMerchants)} still free</div>
          </div>
          <div className="stat">
            <div className="k">Standing army</div>
            <div className="v">{fmt(standing)}</div>
            <div className="s">units owned empire-wide</div>
          </div>
          <div className="stat">
            <div className="k">To wonder / hour</div>
            <div className={`v ${wonderTotalAll > 0 ? 'pos' : ''}`}>{wonderTotalAll > 0 ? fmt(wonderTotalAll) : '—'}</div>
            <div className="s">
              {wonderTotalAll > 0
                ? WCI.filter((r) => wonderTotal[r] > 0).map((r) => `${fmt(wonderTotal[r])} ${r}`).join(' · ')
                : 'no resources shipped to a wonder'}
            </div>
          </div>
        </div>
          {resourceLimited && (
            <div className="alert">
              Buildings could pump {fmt(fullPerDay)} units/day but {bottleneck} only funds {fmt(achievablePerDay)}.
              Add a {bottleneck}-favoured village or trade for {bottleneck}.
            </div>
          )}
          {!resourceLimited && fullPerDay > 0 && (
            <div className="alert good">
              Resources outrun your queues — banking {WCI.filter((r) => supply[r] - demand[r] > 0).map((r) => `${fmt(supply[r] - demand[r])} ${r}`).join(', ')}/h.
              Room to upgrade barracks/stable levels or add a producer.
            </div>
          )}
        </div>
      )}
      </div>

      {producers.length > 0 && (
        <>
          <div className="panel-pair">
          <div className="panel">
            <div className="panel-head">
              <h2>Resource budget</h2>
              <span className="note">Income vs full training queues</span>
            </div>
            <table className="grid">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th className="num">Income/h</th>
                  <th className="num">Demand/h (max)</th>
                  <th className="num">Balance/h</th>
                  <th className="num">Covers</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {WCI.map((r) => {
                  const bal = supply[r] - demand[r]
                  const covers = demand[r] > 0 ? supply[r] / demand[r] : Infinity
                  return (
                    <tr key={r}>
                      <td className={`res-${r}`}>{r}</td>
                      <td className="num">{fmt(supply[r])}</td>
                      <td className="num">{fmt(demand[r])}</td>
                      <td className={`num ${bal < 0 ? 'neg' : 'pos'}`}>{bal > 0 ? '+' : ''}{fmt(bal)}</td>
                      <td className="num">{covers === Infinity ? '—' : `${fmt(covers * 100)}%`}</td>
                      <td>{bottleneck === r && <span className="chip bad">bottleneck</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Daily output</h2>
              <span className="note">Units/day by type at real throughput</span>
            </div>
            <table className="grid">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th className="num">Units/day</th>
                </tr>
              </thead>
              <tbody>
                {byUnit.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td className="num">{fmt(u.perDay)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><b>Total</b></td>
                  <td className="num"><b>{fmt(achievablePerDay)}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
          </div>

          {empireShort.length > 0 && (
            <div className="alert bad">
              The empire makes less {empireShort.join(' and ')} than full queues burn
              ({empireShort.map((r) => `${fmt(demand[r] - supply[r])} ${r}/h`).join(' · ')}).
              Merchants can only move resources, not make them, so no route closes this — it takes
              more fields, a bonus building, or a shorter queue.
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h2>What's still missing</h2>
              <span className="spacer" />
              <span className="note">Biggest need first, one village per delivery where possible</span>
            </div>
            {plan.shipments.length === 0 && plan.unmet.length === 0 && wonderInbound.length === 0 ? (
              <div className="hint">Nothing to ship — every producing village funds its own queue.</div>
            ) : (
              <div className="split">
                {(plan.shipments.length > 0 || plan.unmet.length > 0) && (
                <table className="grid">
                  <thead>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th>Res</th>
                      <th className="num">Per hour</th>
                      <th className="num">Merchants</th>
                      <th className="num">Load/trip</th>
                      <th className="num">Departs</th>
                      <th className="num">One way</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.shipments.map((s, i) => (
                      <tr key={i}>
                        <td>{s.from.name}</td>
                        <td>
                          {s.to.name}
                          {s.solo && <span className="chip" style={{ marginLeft: 6 }}>covers it alone</span>}
                        </td>
                        <td className={`res-${s.res}`}>{s.res}</td>
                        <td className={`num res-${s.res}`}>{fmt(s.rate)}</td>
                        <td className="num">
                          {fmt(s.merchants)}
                          {s.sets > 1 && <span className="chip warn" style={{ marginLeft: 6 }}>{s.sets} sets</span>}
                        </td>
                        <td className="num">{fmt(s.loadPerTrip)}</td>
                        <td className="num">{everyText(s.interval)}</td>
                        <td className="num">{fmtHours(s.travel)}</td>
                      </tr>
                    ))}
                    {plan.unmet.map((u, i) => (
                      <tr key={`u${i}`}>
                        <td><span className="chip bad">no source</span></td>
                        <td>{u.to.name}</td>
                        <td className={`res-${u.res}`}>{u.res}</td>
                        <td className="num neg">{fmt(u.shortfall)} short</td>
                        <td className="num" colSpan={4}>of {fmt(u.need)} {u.res}/h needed</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}

                {(coverage.length > 0 || wonderInbound.length > 0) && (
                  <div>
                    {coverage.map((c) => {
                      const ok = c.balance >= -0.01
                      const net = c.inbound - c.outbound
                      const pct = Math.min(100, Math.max(0, net / c.need) * 100)
                      return (
                        <div key={c.key} style={{ marginBottom: 10 }}>
                          <div className="rsub" style={{ display: 'flex', gap: 8 }}>
                            <span style={{ color: 'var(--ink)' }}>{c.name}</span>
                            <span className={`res-${c.res}`}>{c.res}</span>
                            <span className="spacer" style={{ flex: 1 }} />
                            <span>
                              needs {fmt(c.need)}
                              {c.inbound > 0 && <> · <span className="pos">+{fmt(c.inbound)} in</span></>}
                              {c.outbound > 0 && <> · <span className="neg">−{fmt(c.outbound)} out</span></>}
                            </span>
                            <span className={ok ? 'pos' : 'neg'} style={{ minWidth: 92, textAlign: 'right' }}>
                              {ok ? `+${fmt(c.balance)} spare` : `${fmt(-c.balance)} short`}
                            </span>
                          </div>
                          <div className="bar cover">
                            <span style={{ width: `${pct}%`, background: ok ? 'var(--good)' : 'var(--gold)' }} />
                          </div>
                        </div>
                      )
                    })}
                    {/* A wonder isn't a village and runs no deficit, so there's no
                        "short" — just what your routes are already shipping in to
                        build it. */}
                    {wonderInbound.map((c) => (
                      <div key={c.key} style={{ marginBottom: 10 }}>
                        <div className="rsub" style={{ display: 'flex', gap: 8 }}>
                          <span style={{ color: 'var(--ink)' }}>{c.name}</span>
                          <span className="chip gold">wonder</span>
                          <span className={`res-${c.res}`}>{c.res}</span>
                          <span className="spacer" style={{ flex: 1 }} />
                          <span className="pos">+{fmt(c.inbound)} in</span>
                        </div>
                        <div className="bar cover">
                          <span style={{ width: '100%', background: 'var(--good)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Per-village daily ledger</h2>
              <span className="note">At full queues: what they cost, what routes bring, what's left</span>
            </div>
            <table className="grid">
              <thead>
                <tr>
                  <th rowSpan={2}>Village</th>
                  <th rowSpan={2} className="num">Units/day</th>
                  <th rowSpan={2} className="num">Self-funded</th>
                  <th rowSpan={2} className="num">With routes</th>
                  {WCI.map((r) => <th key={r} colSpan={3} className={`num res-${r}`} style={{ textAlign: 'center' }}>{r}</th>)}
                </tr>
                <tr>
                  {WCI.map((r) => [
                    <th key={`${r}c`} className="num">cost</th>,
                    <th key={`${r}m`} className="num">routes</th>,
                    <th key={`${r}l`} className="num">left</th>,
                  ])}
                </tr>
              </thead>
              {[
                { key: 'producing', label: 'Producing', note: 'training queues burn resources here', rows: producing, sub: producingTotals },
                { key: 'supplying', label: 'Supplying', note: 'no unit assigned — pure income into the pool', rows: supplying, sub: supplyingTotals },
              ].map((group) => group.rows.length > 0 && (
                <tbody key={group.key}>
                  <tr className="section">
                    <td colSpan={13}>
                      {group.label} <span className="zero">· {group.rows.length} village{group.rows.length === 1 ? '' : 's'} · {group.note}</span>
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.v.id}>
                      <td>
                        {row.v.name}
                        {row.defs.map((d) => <span key={d.id} className="chip" style={{ marginLeft: 6 }}>{d.short}</span>)}
                        {row.short.length > 0 && <span className="chip bad" style={{ marginLeft: 6 }}>needs {row.short.join('/')}</span>}
                      </td>
                      <td className="num">{row.unitsDay > 0 ? fmt(row.unitsDay) : <span className="zero">—</span>}</td>
                      <td className={`num ${row.selfFunded != null && row.selfFunded < row.unitsDay - 0.5 ? 'neg' : ''}`}>
                        {row.selfFunded != null ? fmt(row.selfFunded) : <span className="zero">—</span>}
                      </td>
                      <td className={`num ${row.funded != null && row.funded < row.unitsDay - 0.5 ? 'neg' : 'pos'}`}>
                        {row.funded != null ? fmt(row.funded) : <span className="zero">—</span>}
                      </td>
                      {WCI.map((r) => [
                        <td key={`${r}c`} className="num">{row.cost[r] > 0 ? fmt(row.cost[r]) : <span className="zero">—</span>}</td>,
                        <td key={`${r}m`} className={`num ${row.moved[r] < 0 ? 'neg' : row.moved[r] > 0 ? 'pos' : ''}`}>
                          {row.moved[r] ? `${row.moved[r] > 0 ? '+' : ''}${fmt(row.moved[r])}` : <span className="zero">—</span>}
                        </td>,
                        <td key={`${r}l`} className={`num ${row.left[r] < 0 ? 'neg' : 'pos'}`}>{row.left[r] > 0 ? '+' : ''}{fmt(row.left[r])}</td>,
                      ])}
                    </tr>
                  ))}
                  <tr className="subtotal">
                    <td>{group.label} subtotal</td>
                    <td className="num">{group.sub.units > 0 ? fmt(group.sub.units) : <span className="zero">—</span>}</td>
                    <td className="num">{group.sub.units > 0 ? fmt(group.sub.selfFunded) : <span className="zero">—</span>}</td>
                    <td className="num">{group.sub.units > 0 ? fmt(group.sub.funded) : <span className="zero">—</span>}</td>
                    {WCI.map((r) => [
                      <td key={`${r}c`} className="num">{group.sub.cost[r] > 0 ? fmt(group.sub.cost[r]) : <span className="zero">—</span>}</td>,
                      <td key={`${r}m`} className={`num ${group.sub.moved[r] < 0 ? 'neg' : group.sub.moved[r] > 0 ? 'pos' : ''}`}>
                        {group.sub.moved[r] ? `${group.sub.moved[r] > 0 ? '+' : ''}${fmt(group.sub.moved[r])}` : <span className="zero">—</span>}
                      </td>,
                      <td key={`${r}l`} className={`num ${group.sub.left[r] < 0 ? 'neg' : 'pos'}`}>{group.sub.left[r] > 0 ? '+' : ''}{fmt(group.sub.left[r])}</td>,
                    ])}
                  </tr>
                </tbody>
              ))}
              <tfoot>
                <tr>
                  <td><b>Empire</b></td>
                  <td className="num"><b>{fmt(totals.units)}</b></td>
                  <td className="num"><b>{fmt(totals.selfFunded)}</b></td>
                  <td className="num"><b>{fmt(totals.funded)}</b></td>
                  {WCI.map((r) => [
                    <td key={`${r}c`} className="num">{fmt(totals.cost[r])}</td>,
                    <td key={`${r}m`} className="num"><span className="zero">—</span></td>,
                    <td key={`${r}l`} className={`num ${totals.left[r] < 0 ? 'neg' : 'pos'}`}><b>{totals.left[r] > 0 ? '+' : ''}{fmt(totals.left[r])}</b></td>,
                  ])}
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
