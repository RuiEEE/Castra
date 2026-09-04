import { useMemo, useState } from 'react'
import { RES_IDS, TRIBES } from '../gameData'
import {
  buildRoutes, villageNet, merchantCapacity, merchantCount,
  travelHours, netDeltas, committedMerchants, parkingSuggestions, fmt, fmtHours,
} from '../calc'
import EmpireMap from './EmpireMap'

export default function Trade({ villages, troops, settings, routes, addRoute, removeRoute, parkTroops }) {
  const [horizon, setHorizon] = useState(24)
  const tribe = TRIBES[settings.tribe]

  const byId = useMemo(() => new Map(villages.map((v) => [v.id, v])), [villages])
  const deltas = useMemo(() => netDeltas(villages, troops, routes, settings), [villages, troops, routes, settings])

  const { routes: suggestions } = useMemo(
    () => buildRoutes(villages, troops, settings, tribe, horizon, routes),
    [villages, troops, settings, tribe, horizon, routes]
  )

  const live = suggestions.filter((r) => !r.unmet)
  const unmet = suggestions.filter((r) => r.unmet)

  // Crop deficits can also be closed by marching the troops to a crop-surplus
  // village instead of shipping crop — zero merchants. Suggested alongside routes.
  const parking = useMemo(
    () => parkingSuggestions(villages, troops, settings, tribe, routes),
    [villages, troops, settings, tribe, routes]
  )
  const troopName = (id) => troops.find((t) => t.id === id)?.name || id
  const parkList = (map) =>
    Object.entries(map).map(([id, n]) => `${n} ${troopName(id)}`).join(', ')
  const park = (p) => parkTroops(p.from.id, p.to.id, p.troops)

  const totalMerchants = villages.reduce((s, v) => s + merchantCount(v), 0)
  const committed = useMemo(() => committedMerchants(routes), [routes])
  const usedMerchants = Object.values(committed).reduce((s, n) => s + n, 0)

  // Recompute the in-game parameters for a saved route (travel + load/trip).
  const routeParams = (r) => {
    const from = byId.get(r.fromId)
    const to = byId.get(r.toId)
    if (!from || !to) return null
    const travel = travelHours(from, to, tribe, settings)
    const capPer = merchantCapacity(from, tribe, settings)
    const loadPerTrip = r.merchants
      ? Math.min(capPer, Math.round(r.rate * 2 * travel / r.merchants))
      : 0
    return { from, to, travel, loadPerTrip }
  }

  const setUp = (r) => addRoute({ fromId: r.from.id, toId: r.to.id, res: r.res, rate: r.ratePerHour, merchants: r.merchants })

  return (
    <>
      <div className="stats">
        <div className="stat">
          <div className="k">Merchants</div>
          <div className="v">{usedMerchants}<span style={{ color: 'var(--dim)', fontSize: 15 }}> / {totalMerchants}</span></div>
          <div className="s">committed to standing routes</div>
        </div>
        <div className="stat">
          <div className="k">Active routes</div>
          <div className="v">{routes.length}</div>
          <div className="s">running every hour</div>
        </div>
        <div className="stat">
          <div className="k">Suggested</div>
          <div className="v">{live.length}</div>
          <div className="s">{unmet.length} uncovered deficit{unmet.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="k">Horizon</div>
          <div className="v">{horizon}h</div>
          <div className="s">
            <input type="range" min="4" max="96" value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))} style={{ width: '100%', marginTop: 4 }} />
          </div>
        </div>
      </div>

      <div className="panel" style={{ padding: 0, border: 'none' }}>
        <EmpireMap villages={villages} routes={suggestions} troops={troops} settings={settings} />
      </div>

      {routes.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h2>Active routes</h2>
            <span className="note">Set up in game — folded into every net figure below</span>
          </div>
          <table className="grid">
            <thead>
              <tr>
                <th>From</th><th>To</th><th>Res</th>
                <th className="num">Rate/h</th><th className="num">Merchants</th>
                <th className="num">Load/trip</th><th className="num">One way</th><th />
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => {
                const p = routeParams(r)
                return (
                  <tr key={r.id}>
                    <td>{p ? p.from.name : '—'}</td>
                    <td>{p ? p.to.name : '—'}</td>
                    <td className={`res-${r.res}`}>{r.res}</td>
                    <td className="num">{fmt(r.rate)}</td>
                    <td className="num">{r.merchants}</td>
                    <td className="num">{p ? fmt(p.loadPerTrip) : '—'}</td>
                    <td className="num">{p ? fmtHours(p.travel) : '—'}</td>
                    <td><button className="btn ghost fit" title="Remove route" onClick={() => removeRoute(r.id)}>✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>Suggested routes</h2>
          <span className="note">Remaining deficits, covered from the nearest overflowing surplus first</span>
        </div>
        {live.length === 0 ? (
          <div className="empty">
            No routes needed — every village covers its own consumption once active routes are counted.
            Routes appear when one village runs a deficit that another can cover.
          </div>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>From</th><th>To</th><th>Res</th>
                <th className="num">Rate/h</th><th className="num">Merchants</th>
                <th className="num">Load/trip</th><th className="num">One way</th>
                <th className="num">Covers</th><th /><th />
              </tr>
            </thead>
            <tbody>
              {live.map((r, i) => (
                <tr key={i}>
                  <td>{r.from.name}</td>
                  <td>{r.to.name}</td>
                  <td className={`res-${r.res}`}>{r.res}</td>
                  <td className="num">{fmt(r.ratePerHour)}</td>
                  <td className="num">{r.merchants}</td>
                  <td className="num">{fmt(r.loadPerTrip)}</td>
                  <td className="num">{fmtHours(r.travel)}</td>
                  <td className="num">{fmt(r.covers * 100)}%</td>
                  <td>{r.fromOverflowing && <span className="chip gold">free</span>}</td>
                  <td><button className="btn primary fit" onClick={() => setUp(r)}>Set up</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {live.some((r) => r.fromOverflowing) && (
          <div className="alert good" style={{ marginTop: 12 }}>
            Routes marked <b>free</b> pull from villages that would overflow anyway within {horizon}h.
            Those are pure gain — hit <b>Set up</b> to program them in game and record them here.
          </div>
        )}
      </div>

      {parking.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h2>Relocate troops instead</h2>
            <span className="note">Close a crop deficit by parking the army in a surplus village — zero merchants</span>
          </div>
          <table className="grid">
            <thead>
              <tr>
                <th>From</th><th>Park in</th><th>Troops</th>
                <th className="num">Crop freed/h</th><th className="num">March</th>
                <th className="num">Covers</th><th /><th />
              </tr>
            </thead>
            <tbody>
              {parking.map((p, i) => (
                <tr key={i}>
                  <td>{p.from.name}</td>
                  <td>{p.to.name}</td>
                  <td>{parkList(p.troops)}</td>
                  <td className="num">{fmt(p.relief)}</td>
                  <td className="num">{fmtHours(p.travel)}</td>
                  <td className="num">{fmt(p.covers * 100)}%</td>
                  <td><span className="chip gold">0 merchants</span></td>
                  <td><button className="btn primary fit" onClick={() => park(p)}>Park</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="alert good" style={{ marginTop: 12 }}>
            Parking moves crop upkeep to the host — no merchants, but the troops sit there until you
            march them home. Compare with the crop routes above; often it's the cheaper fix.
          </div>
        </div>
      )}

      {unmet.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h2>Uncovered deficits</h2></div>
          {unmet.map((r, i) => (
            <div className="alert bad" key={i}>
              <b>{r.to.name}</b> is short {fmt(r.shortfall)} {r.res}/h with no surplus village able to
              cover it — stores empty in {fmtHours(r.hrsToEmpty)}. Either no village has spare {r.res},
              or the ones that do are out of merchants.
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>Balance matrix</h2>
          <span className="note">Net per hour after upkeep</span>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th>Village</th>
              {RES_IDS.map((r) => <th key={r} className="num">{r}</th>)}
              <th className="num">Merchants</th>
              <th className="num">Capacity</th>
            </tr>
          </thead>
          <tbody>
            {villages.map((v) => {
              const { net } = villageNet(v, troops, settings, deltas[v.id])
              return (
                <tr key={v.id}>
                  <td>{v.name} {v.capital && <span className="chip gold">cap</span>}</td>
                  {RES_IDS.map((r) => (
                    <td key={r} className={`num ${net[r] > 0 ? 'pos' : net[r] < 0 ? 'neg' : 'zero'}`}>
                      {net[r] > 0 ? '+' : ''}{fmt(net[r])}
                    </td>
                  ))}
                  <td className="num">{merchantCount(v)}</td>
                  <td className="num">{fmt(merchantCapacity(v, tribe, settings))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {villages.length > 1 && (
        <div className="panel">
          <div className="panel-head">
            <h2>Travel times</h2>
            <span className="note">One way, {tribe.merchantSpeed * settings.serverSpeed} fields/h</span>
          </div>
          <table className="grid">
            <thead>
              <tr><th /> {villages.map((v) => <th key={v.id} className="num">{v.name}</th>)}</tr>
            </thead>
            <tbody>
              {villages.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  {villages.map((b) => (
                    <td key={b.id} className="num">
                      {a.id === b.id ? <span className="zero">—</span> : fmtHours(travelHours(a, b, tribe, settings))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
