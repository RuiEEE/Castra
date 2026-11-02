import { useMemo, useState } from 'react'
import { TRIBES } from '../gameData'
import {
  routeRates, routeTotal, routeCost, routeSchedule, RESOURCES, MAX_ROUTE_INTERVAL,
  wonderTargets, villageBalances, travelHours, merchantCapacity, merchantCount,
  committedMerchants, byName, fmt, fmtHours,
  celebrationReserve, supportSendable, supportRoute, merchantBudget, empireCulture,
} from '../calc'
import { parseTradeRoutes } from '../gameImport'
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

// Import one village's standing routes from the payload the game loads with its
// Marketplace. Everything comes out of the JSON except the departure interval —
// the payload's `merchants` is the convoy per DEPARTURE, so it says nothing
// about how many convoys are in the air at once — so that stays typed, and the
// total commitment is worked out from it.
function RouteImport({ villages, wonders, tribe, settings, routes, addRoute, updateRoute }) {
  const [text, setText] = useState('')
  const [intervals, setIntervals] = useState({})
  const [done, setDone] = useState(null)

  const parsed = useMemo(() => (text.trim() ? parseTradeRoutes(text) : null), [text])

  const rows = useMemo(() => (parsed?.routes || []).map((r, i) => {
    const source = villages.find((v) => v.gameId === r.fromGameId)
    const dest = villages.find((v) => v.gameId === r.toGameId)
    const wonder = wonders.find((w) => String(w.wwId) === r.toGameId)
    const interval = Math.min(MAX_ROUTE_INTERVAL, Math.max(1, Math.round(Number(intervals[i]) || 1)))
    // Travel comes from the payload — an exact figure, where the model only has
    // distance ÷ merchant speed. `merchants` is one convoy, so the marketplace
    // has to cover one per set that's in the air at the same time.
    const sets = routeSchedule(r.travel, interval).sets
    const existing = routes.find((x) => (r.gameId && x.gameRouteId === r.gameId)
      || (source && x.fromId === source.id
        && (dest ? x.toId === dest.id : wonder && x.wwId === wonder.wwId)))
    return {
      ...r, key: i, source, dest, wonder, interval, sets, existing,
      merchantsTotal: r.merchants * sets,
      // What the model would have said the leg takes, as a check on merchant speed.
      modelTravel: source && (dest || wonder) ? travelHours(source, dest || wonder, tribe, settings) : null,
      // Only a running route is a real shipment. Every route confirmed running
      // reports status 1, so anything else is left out — a paused route booked
      // as live would spend merchants and crop the village never sends.
      skip: !source || (!dest && !wonder) || r.status !== 1,
    }
  }), [parsed, villages, wonders, routes, intervals, tribe, settings])

  const usable = rows.filter((r) => !r.skip)
  // The payload times every leg exactly, so a systematic gap against the model
  // means the merchant speed in Settings is wrong for this server.
  const speedCheck = useMemo(() => {
    const ok = usable.filter((r) => r.modelTravel > 0 && r.travel > 0)
    if (!ok.length) return null
    const ratio = ok.reduce((s, r) => s + r.modelTravel / r.travel, 0) / ok.length
    return Math.abs(ratio - 1) > 0.02 ? ratio : null
  }, [usable])

  const apply = () => {
    for (const r of usable) {
      const route = {
        gameRouteId: r.gameId,
        fromId: r.source.id,
        toId: r.dest?.id ?? null,
        wwId: r.wonder?.wwId ?? null,
        rates: Object.fromEntries(RESOURCES.filter((res) => r.loads[res] > 0)
          .map((res) => [res, r.loads[res] / r.interval])),
        interval: r.interval,
        merchants: r.merchantsTotal,
      }
      if (r.existing) updateRoute(r.existing.id, route)
      else addRoute(route)
    }
    setDone({ added: usable.filter((r) => !r.existing).length, updated: usable.filter((r) => r.existing).length })
    setText('')
    setIntervals({})
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Import from the game</h2>
        <span className="spacer" />
        <span className="note">One marketplace at a time — the routes belong to that village</span>
      </div>
      <div className="hint" style={{ marginBottom: 8 }}>
        With the browser's network inspector recording, open a village's Marketplace in game and
        copy the response that contains <code>Collection:TradeRoute</code>. It carries the loads,
        the destination and the exact travel time. It does <strong>not</strong> carry the departure
        interval, so set that per route below.
      </div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setDone(null) }}
        rows={5}
        spellCheck={false}
        placeholder='Paste the response body here — {"cache": [ … ]}'
        style={{ fontFamily: 'var(--mono)', fontSize: 13, resize: 'vertical' }}
      />
      {parsed?.error && <div className="alert bad" style={{ marginTop: 10 }}>{parsed.error}</div>}
      {rows.length > 0 && (
        <table className="grid" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>From</th><th>To</th>
              {RESOURCES.map((r) => <th key={r} className="num">{r}/trip</th>)}
              <th className="num">Every (h)</th><th className="num">Merchants</th><th className="num">One way</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  {r.source?.name || <span className="chip bad">village not imported yet</span>}
                </td>
                <td>
                  {r.dest?.name || r.wonder?.name || r.toName}
                  {r.wonder && <span className="chip gold" style={{ marginLeft: 6 }}>wonder</span>}
                  {!r.dest && !r.wonder && <span className="chip bad" style={{ marginLeft: 6 }}>not one of yours</span>}
                  {r.status !== 1 && (
                    <span className="chip bad" style={{ marginLeft: 6 }}
                      title={`The game reports status ${r.status} for this route, not the 1 a running route shows — skipped, so it doesn't spend merchants you're not actually using`}>
                      {r.existing ? 'not running — remove the one already listed' : 'not running — skipped'}
                    </span>
                  )}
                  {r.existing && r.status === 1 && <span className="chip" style={{ marginLeft: 6 }}>already listed — will update</span>}
                </td>
                {RESOURCES.map((res) => (
                  <td key={res} className={`num ${r.loads[res] ? `res-${res}` : ''}`}>
                    {r.loads[res] ? fmt(r.loads[res]) : '—'}
                  </td>
                ))}
                <td className="num">
                  <input type="number" min="1" max={MAX_ROUTE_INTERVAL} step="1"
                    value={intervals[r.key] ?? '1'}
                    onChange={(e) => setIntervals({ ...intervals, [r.key]: e.target.value })}
                    style={{ width: 64 }} />
                </td>
                <td className="num">
                  {fmt(r.merchantsTotal)}
                  <span className="rsub"> {fmt(r.merchants)}/trip{r.sets > 1 ? ` × ${r.sets} sets` : ''}</span>
                </td>
                <td className="num">{fmtHours(r.travel)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {speedCheck && (
        <div className="alert" style={{ marginTop: 10 }}>
          The game times these legs {ratioText(speedCheck)} than the model does. Merchant speed in
          Reference is {fmt(tribe.merchantSpeed * settings.serverSpeed)} fields/h; these routes imply{' '}
          <strong>{fmt(Math.round(tribe.merchantSpeed * settings.serverSpeed * speedCheck))} fields/h</strong>.
        </div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary fit" type="button" onClick={apply} disabled={usable.length === 0}>
          Import {usable.length > 0 ? `${usable.length} route${usable.length === 1 ? '' : 's'}` : 'routes'}
        </button>
        <button className="btn ghost fit" type="button" onClick={() => { setText(''); setIntervals({}); setDone(null) }}>Clear</button>
      </div>
      {done && (
        <div className="alert good" style={{ marginTop: 10 }}>
          {done.added} added{done.updated > 0 ? `, ${done.updated} updated` : ''}.
        </div>
      )}
    </div>
  )
}

// One click per support village: the route that ships everything it can spare to
// the village that trains the army.
//
// The sizing is deliberately one-sided. A support village keeps a celebration
// running back to back — one party every `partyHours`, plus a tenth so it can
// still train a few units of its own — and everything left over goes on the
// road, crop included, because an offensive village trains 24/7 while still
// levelling its own fields and never has too much. So this panel never asks
// what the destination needs; it only asks what the source can let go of.
//
// A village below Town Hall 10 is not a shipper. It has not reached its final
// state and needs its own production for its fields and buildings, so it is
// listed apart rather than routed from.
function SupportRoutes({ villages, settings, routes, tribe, balances, addRoute, updateRoute }) {
  const [picked, setPicked] = useState({})
  const [done, setDone] = useState(null)

  const offensive = useMemo(() => villages.filter((v) => v.offensive), [villages])
  const empireCP = useMemo(() => empireCulture(villages).production, [villages])
  // What each marketplace still has free, before this panel's own route is
  // replaced — a route being redrawn hands its merchants back first.
  const budgets = useMemo(() => merchantBudget(villages, routes), [villages, routes])

  const rows = useMemo(() => {
    if (!offensive.length) return []
    return [...villages].filter((v) => !v.offensive).sort(byName).map((v) => {
      const reserve = celebrationReserve(v, settings, empireCP)
      // Nearest offensive village by default: the closest leg moves the most
      // per merchant. Any of them can be chosen per row.
      const options = [...offensive].sort((a, b) => travelHours(v, a, tribe, settings) - travelHours(v, b, tribe, settings))
      const target = offensive.find((o) => String(o.id) === String(picked[v.id])) || options[0]
      const existing = routes.find((r) => r.fromId === v.id && r.toId === target.id)
      const sendable = supportSendable(balances[v.id], reserve, existing ? routeRates(existing) : {})
      const budget = (budgets.get(v.id) || 0) + (existing?.merchants || 0)
      return {
        v, reserve, target, options, existing, sendable, budget,
        plan: reserve.growing ? null : supportRoute(v, target, sendable, budget, tribe, settings),
      }
    })
  }, [villages, offensive, routes, balances, settings, tribe, empireCP, picked, budgets])

  const shippers = rows.filter((r) => !r.reserve.growing)
  const growing = rows.filter((r) => r.reserve.growing)
  const ready = shippers.filter((r) => r.plan && !r.plan.blocked)

  const commit = (list) => {
    for (const row of list) {
      const route = {
        fromId: row.v.id,
        toId: row.target.id,
        wwId: null,
        rates: row.plan.rates,
        interval: row.plan.interval,
        merchants: row.plan.merchants,
      }
      if (row.existing) updateRoute(row.existing.id, route)
      else addRoute(route)
    }
    setDone({
      added: list.filter((r) => !r.existing).length,
      updated: list.filter((r) => r.existing).length,
    })
  }

  if (!offensive.length) {
    return (
      <div className="panel">
        <div className="panel-head"><h2>Support → offensive</h2></div>
        <div className="empty">
          No offensive village marked yet. Open the one that trains your army and tick
          <strong> Offensive</strong> — support villages ship there.
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Support → offensive</h2>
        <span className="spacer" />
        {ready.length > 1 && (
          <button className="btn" type="button" onClick={() => commit(ready)}>
            Set up all {ready.length}
          </button>
        )}
      </div>
      {shippers.length === 0 ? (
        <div className="empty">No support village has reached Town Hall 10 yet.</div>
      ) : (
        <table className="grid">
          <thead>
            <tr>
              <th>Support village</th><th>Ships to</th>
              <th className="num">Celebration</th><th className="num">Reserved /day</th>
              {RESOURCES.map((r) => <th key={r} className="num">{r}/h</th>)}
              <th className="num">Merchants</th><th />
            </tr>
          </thead>
          <tbody>
            {shippers.map(({ v, reserve, target, options, existing, sendable, plan, budget }) => (
              <tr key={v.id}>
                <td>
                  {v.name}
                  {v.capital && <span className="chip gold" style={{ marginLeft: 6 }}>cap</span>}
                </td>
                <td>
                  {options.length > 1 ? (
                    <select value={target.id} onChange={(e) => setPicked({ ...picked, [v.id]: e.target.value })}>
                      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  ) : target.name}
                  {plan && <span className="rsub"> {fmtHours(plan.travel)} one way</span>}
                </td>
                <td className="num">
                  {reserve.mode === 'large' ? 'large' : 'small'}
                  <span className="rsub"> every {fmtHours(reserve.partyHours)}</span>
                </td>
                <td className="num">
                  {fmt(reserve.total)}
                  <span className="rsub"> + {fmt(reserve.perDay.crop)} crop</span>
                </td>
                {RESOURCES.map((res) => (
                  <td key={res} className={`num ${sendable.per[res] > 0 ? `res-${res}` : ''}`}>
                    {sendable.per[res] > 0 ? (
                      <>
                        {fmt(sendable.per[res])}
                        {plan && !plan.blocked && (
                          <span className="rsub"> {fmt(Math.round((plan.rates[res] || 0) * plan.interval))}/trip</span>
                        )}
                      </>
                    ) : '—'}
                  </td>
                ))}
                <td className="num">
                  {plan && !plan.blocked ? (
                    <>
                      {fmt(plan.merchants)}
                      <span className="rsub"> {everyText(plan.interval)}</span>
                      {plan.capped && (
                        <span className="chip bad" style={{ marginLeft: 6 }}
                          title={`The whole surplus wants ${fmt(plan.wanted)} merchants; ${v.name} has ${fmt(budget)} free, so the load is cut to fit`}>
                          {fmt(plan.wanted - plan.merchants)} short
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="chip bad" title={plan ? `Needs ${fmt(plan.wanted)} merchants, ${fmt(budget)} free` : undefined}>
                      {plan ? 'no merchants free' : 'nothing spare'}
                    </span>
                  )}
                </td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn ghost" type="button"
                    disabled={!plan || plan.blocked}
                    onClick={() => commit([{ v, target, existing, plan }])}>
                    {existing ? 'Update route' : 'Set up route'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {growing.length > 0 && (
        <div className="note" style={{ marginTop: 10 }}>
          Still growing, keeping their own production:{' '}
          {growing.map((r) => `${r.v.name} (Town Hall ${r.reserve.th})`).join(' · ')}
        </div>
      )}
      {done && (
        <div className="alert good" style={{ marginTop: 10 }}>
          {done.added} route{done.added === 1 ? '' : 's'} set up
          {done.updated > 0 ? `, ${done.updated} updated` : ''}. Now set the same up in game.
        </div>
      )}
    </div>
  )
}

const ratioText = (ratio) => `${fmt(Math.round(Math.abs(ratio - 1) * 100))}% ${ratio > 1 ? 'faster' : 'slower'}`

export default function Routes({ villages, troops, settings, routes, bonuses, addRoute, updateRoute, removeRoute }) {
  const tribe = TRIBES[settings.tribe] || TRIBES.romans
  const [editingId, setEditingId] = useState(null)
  const [showImport, setShowImport] = useState(false)

  const ordered = useMemo(() => [...villages].sort(byName), [villages])
  const wonders = useMemo(() => wonderTargets(villages, troops), [villages, troops])
  const dests = useMemo(() => destOptions(villages, wonders), [villages, wonders])

  // A village's real position is what it makes, minus what its queues burn and
  // its troops eat, plus what arrives and minus what it sends away. A route is
  // only too big when it takes its SOURCE below zero; where the resource came
  // from doesn't matter, which is what lets a relay village work.
  const balances = useMemo(
    () => villageBalances(villages, troops, settings, routes, bonuses),
    [villages, troops, settings, routes, bonuses],
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
          <div className="s">imported per marketplace, or typed by hand</div>
        </div>
        <div className="stat">
          <div className="k">Merchants committed</div>
          <div className={`v ${usedMerchants > totalMerchants ? 'neg' : ''}`}>{fmt(usedMerchants)}</div>
          <div className="s">of {fmt(totalMerchants)} · {fmt(Math.max(0, totalMerchants - usedMerchants))} still free</div>
        </div>
      </div>

      <SupportRoutes
        villages={villages} settings={settings} routes={list} tribe={tribe}
        balances={balances} addRoute={addRoute} updateRoute={updateRoute}
      />

      <div className="panel-head">
        <h2>Routes</h2>
        <span className="spacer" />
        <button className="btn" onClick={() => setShowImport((s) => !s)}>
          {showImport ? 'Close import' : 'Import routes'}
        </button>
      </div>

      {showImport && (
        <RouteImport
          villages={ordered} wonders={wonders} tribe={tribe} settings={settings}
          routes={list} addRoute={addRoute} updateRoute={updateRoute}
        />
      )}

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
