import { useMemo, useState } from 'react'
import { TRIBES } from '../gameData'
import {
  routeRates, routeTotal, routeCost, RESOURCES, wonderTargets, villageBalances,
  travelHours, merchantCapacity, merchantCount, committedMerchants, byName, fmt, fmtHours,
} from '../calc'
import RouteForm, { everyText } from './RouteForm'

// Every standing trade route in the empire, all four resources in one place.
//
// They live on their own tab because ONE route is ONE departure and a single
// departure can be loaded with several resources at once — so a route is not a
// crop thing or a wood thing and can't belong to the Crop or Production tab.
// The Crop and Production tabs still answer "what's still missing"; this one
// answers "what have I already set up, and what is it costing me".
//
// Castra can't read routes — the game export doesn't carry them — so this is
// the one place manual entry is still correct.

// A destination is either one of your villages or a World Wonder, which has no
// village record, only a tile. One option list covers both.
function destOptions(villages, wonders) {
  return [
    ...[...villages].sort(byName).map((v) => ({ key: `v:${v.id}`, label: v.name, village: v })),
    ...wonders.map((w) => ({ key: `w:${w.wwId}`, label: w.name, wonder: w })),
  ]
}

export default function Routes({ villages, troops, settings, routes, addRoute, updateRoute, removeRoute }) {
  const tribe = TRIBES[settings.tribe] || TRIBES.romans
  const [editingId, setEditingId] = useState(null)

  const ordered = useMemo(() => [...villages].sort(byName), [villages])
  const wonders = useMemo(() => wonderTargets(villages, troops), [villages, troops])
  const dests = useMemo(() => destOptions(villages, wonders), [villages, wonders])

  // A village's real position is what it makes, minus what its queues burn and
  // its troops eat, plus what arrives and minus what it sends away. A route is
  // only too big when it takes its SOURCE below zero; where the resource came
  // from doesn't matter, which is what lets a relay village work.
  const balances = useMemo(
    () => villageBalances(villages, troops, settings, routes),
    [villages, troops, settings, routes],
  )
  const balanceOf = (id, res) => balances[id]?.[res] ?? 0

  const list = routes || []
  // Listed alphabetically by source village, then destination — same as every
  // other per-village list in the app (owner: that's how Travian shows them).
  const srcName = (r) => villages.find((v) => v.id === r.fromId)?.name || ''
  const dstName = (r) => (r.wwId ? wonders.find((w) => w.wwId === r.wwId)?.name : villages.find((v) => v.id === r.toId)?.name) || ''
  const sorted = useMemo(
    () => [...list].sort((a, b) => byName({ name: srcName(a) }, { name: srcName(b) }) || byName({ name: dstName(a) }, { name: dstName(b) })),
    [list, villages, wonders],
  )
  const editing = list.find((r) => r.id === editingId) || null
  const committed = committedMerchants(routes)
  const totalMerchants = villages.reduce((s, v) => s + merchantCount(v), 0)
  const usedMerchants = list.reduce((s, r) => s + (r.merchants || 0), 0)

  return (
    <div>
      <div className="stats">
        <div className="stat">
          <div className="k">Standing routes</div>
          <div className="v">{fmt(list.length)}</div>
          <div className="s">entered by hand · the export doesn't carry them</div>
        </div>
        <div className="stat">
          <div className="k">Merchants committed</div>
          <div className={`v ${usedMerchants > totalMerchants ? 'neg' : ''}`}>{fmt(usedMerchants)}</div>
          <div className="s">of {fmt(totalMerchants)} · {fmt(Math.max(0, totalMerchants - usedMerchants))} still free</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>{editing ? 'Edit route' : 'Add a route'}</h2>
          <span className="spacer" />
          <span className="note">One departure, one convoy — load as many resources as you like</span>
        </div>
        <RouteForm
          key={editingId || 'new'}
          villages={ordered} dests={dests} balanceOf={balanceOf}
          tribe={tribe} settings={settings}
          editing={editing}
          onCancel={() => setEditingId(null)}
          onAdd={(r) => {
            if (editingId) { updateRoute(editingId, r); setEditingId(null) } else addRoute(r)
          }}
        />
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Standing routes</h2>
        </div>
        {list.length === 0 ? (
          <div className="empty">No routes yet. Add the ones you've set up in game above.</div>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>From</th><th>To</th>
                {RESOURCES.map((r) => <th key={r} className="num">{r}/h</th>)}
                <th className="num">Merchants</th><th className="num">Departs</th>
                <th className="num">One way</th><th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const rates = routeRates(r)
                const src = villages.find((v) => v.id === r.fromId)
                const dst = r.wwId ? wonders.find((w) => w.wwId === r.wwId) : villages.find((v) => v.id === r.toId)
                const travel = src && dst ? travelHours(src, dst, tribe, settings) : null
                // Costed on the TOTAL load: one cart carries the whole mix, so
                // 400 wood + 300 crop is 700 against a 500-capacity merchant.
                const cost = travel != null
                  ? routeCost(travel, merchantCapacity(src, tribe, settings), routeTotal(r), r.interval || 1)
                  : null
                // Which resources this route pushes its source into the red on.
                const over = src
                  ? RESOURCES.filter((res) => (rates[res] || 0) > 0 && balanceOf(src.id, res) < -0.5)
                  : []
                // Against the village's WHOLE commitment — every route it runs
                // spends from the same marketplace.
                const shortMerchants = src ? (committed[src.id] || 0) - merchantCount(src) : 0
                return (
                  <tr key={r.id} className={r.id === editingId ? 'editing' : undefined}>
                    <td>
                      {src?.name || '—'}
                      {over.map((res) => (
                        <span key={res} className="chip bad" style={{ marginLeft: 6 }}
                          title={`${src.name} ends up ${fmt(-balanceOf(src.id, res))} ${res}/h in the red once its queues and every route it sends and receives are counted`}>
                          {fmt(-balanceOf(src.id, res))} {res} over
                        </span>
                      ))}
                    </td>
                    <td>
                      {dst?.name || <span className="chip bad">gone</span>}
                      {r.wwId && <span className="chip gold" style={{ marginLeft: 6 }}>wonder</span>}
                    </td>
                    {RESOURCES.map((res) => (
                      <td key={res} className={`num ${rates[res] ? `res-${res}` : ''}`}>
                        {rates[res] ? (
                          <>
                            {fmt(rates[res])}
                            <span className="rsub"> {fmt(Math.round(rates[res] * (r.interval || 1)))}/trip</span>
                          </>
                        ) : '—'}
                      </td>
                    ))}
                    <td className="num">
                      {fmt(r.merchants || cost?.merchants || 0)}
                      {shortMerchants > 0 && (
                        <span className="chip bad" style={{ marginLeft: 6 }}
                          title={`${src.name} has ${merchantCount(src)} merchants but ${fmt(committed[src.id])} are committed across all its routes`}>
                          {fmt(shortMerchants)} missing
                        </span>
                      )}
                    </td>
                    <td className="num">
                      {everyText(r.interval || 1)}
                      {cost && <span className="rsub"> {fmt(cost.perTrip)} total</span>}
                    </td>
                    <td className="num">{travel != null ? fmtHours(travel) : '—'}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn ghost" type="button"
                        onClick={() => setEditingId(r.id === editingId ? null : r.id)}>
                        {r.id === editingId ? 'Editing' : 'Edit'}
                      </button>{' '}
                      <button className="btn ghost danger" type="button" onClick={() => removeRoute(r.id)}>Remove</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
