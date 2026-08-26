import { useMemo, useState } from 'react'
import {
  routeCost, bestRouteCost, routeRates, RESOURCES, MAX_ROUTE_INTERVAL,
  travelHours, merchantCapacity, fmt, fmtHours,
} from '../calc'

export const everyText = (i) => (i > 1 ? `every ${i} h` : 'hourly')

// The one place a trade route is entered by hand. The game export does not carry
// routes, so they're typed the way the game asks for them — a LOAD per resource
// and how often the transport leaves — and stored as per-HOUR rates, because
// that is what every balance figure in the app needs.
//
// ONE route is ONE departure. It can be loaded with several resources at once,
// and they share the merchants: a 500-capacity merchant carrying 400 wood has
// 100 left for crop, so the convoy is sized by the TOTAL load, never per
// resource. Leave a resource blank and it simply isn't in the cart.
//
// `editing` switches it to edit mode: the row's values are loaded in and the
// button saves instead of adding. The caller must remount the form (key on the
// route id) when the selection changes, so the initial state below is re-read.
export default function RouteForm({
  villages, dests, balanceOf, tribe, settings, onAdd, editing, onCancel,
}) {
  const [from, setFrom] = useState(() => String(editing?.fromId ?? villages[0]?.id ?? ''))
  const [to, setTo] = useState(() => (
    editing ? (editing.wwId ? `w:${editing.wwId}` : `v:${editing.toId}`) : dests[dests.length - 1]?.key ?? ''
  ))
  const [every, setEvery] = useState(() => String(editing?.interval || 1))
  // Held as the per-trip load, the way the game asks for it; converted to a
  // per-hour rate only on submit.
  const [loads, setLoads] = useState(() => {
    const rates = routeRates(editing)
    const iv = editing?.interval || 1
    return Object.fromEntries(RESOURCES.map((r) => [
      r, rates[r] ? String(Math.round(rates[r] * iv)) : '',
    ]))
  })

  const source = villages.find((v) => String(v.id) === from)
  const target = dests.find((d) => d.key === to)
  const interval = Math.min(MAX_ROUTE_INTERVAL, Math.max(1, Math.round(Number(every) || 1)))

  const perTrip = Object.fromEntries(RESOURCES.map((r) => [r, Math.max(0, Number(loads[r]) || 0)]))
  const totalPerTrip = RESOURCES.reduce((s, r) => s + perTrip[r], 0)
  const carried = RESOURCES.filter((r) => perTrip[r] > 0)
  const totalRate = totalPerTrip / interval

  // Cost the route being typed, live, so the merchant bill is visible before it
  // is committed — that is the number the marketplace has to cover. Costed on
  // the total, because one cart holds the whole mixed load.
  const preview = useMemo(() => {
    const place = target?.village || target?.wonder
    if (!source || !place || place.id === source.id || totalRate <= 0) return null
    const travel = travelHours(source, place, tribe, settings)
    const capacity = merchantCapacity(source, tribe, settings)
    return {
      travel,
      ...routeCost(travel, capacity, totalRate, interval),
      best: bestRouteCost(travel, capacity, totalRate),
    }
  }, [source, target, totalRate, interval, tribe, settings])

  const submit = (e) => {
    e.preventDefault()
    if (!preview || !target) return
    onAdd({
      fromId: source.id,
      toId: target.village?.id ?? null,
      wwId: target.wonder?.wwId ?? null,
      rates: Object.fromEntries(carried.map((r) => [r, perTrip[r] / interval])),
      interval,
      merchants: preview.merchants,
    })
    if (!editing) setLoads(Object.fromEntries(RESOURCES.map((r) => [r, ''])))
  }

  // While editing, the route's own load is already inside the source's balance,
  // so it has to be added back before the new one is taken off — otherwise the
  // projection charges the village twice for the same shipment.
  const editingRates = editing && editing.fromId === source?.id ? routeRates(editing) : {}
  const projected = source
    ? carried.map((res) => ({
      res,
      left: balanceOf(source.id, res) + (editingRates[res] || 0) - perTrip[res] / interval,
    }))
    : []

  return (
    <form className="row compact" onSubmit={submit} style={{ alignItems: 'flex-end' }}>
      <label className="field">
        <span>From</span>
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          {villages.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>To</span>
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {dests.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      </label>
      {RESOURCES.map((r) => (
        <label className="field fit" key={r}>
          <span className={`res-${r}`}>{r} / trip</span>
          {/* step must stay 1: a load is a whole number of resources and the game
              hands out figures like 359, which a coarser step silently rejects. */}
          <input type="number" min="0" step="1" value={loads[r]} placeholder="—"
            onChange={(e) => setLoads({ ...loads, [r]: e.target.value })}
            style={{ width: 92 }} />
        </label>
      ))}
      <label className="field fit">
        <span>Every (h)</span>
        <input type="number" min="1" max={MAX_ROUTE_INTERVAL} step="1" value={every}
          onChange={(e) => setEvery(e.target.value)} style={{ width: 70 }} />
      </label>
      <button className="btn primary" type="submit" disabled={!preview}>
        {editing ? 'Save route' : 'Add route'}
      </button>
      {editing && (
        <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>
      )}
      {preview && (
        <span className="note">
          {fmtHours(preview.travel)} one way · <b>{fmt(preview.merchants)} merchants</b>{' '}
          ({fmt(totalPerTrip)} per trip{preview.sets > 1 ? `, ${preview.sets} sets` : ''})
          {preview.best.merchants < preview.merchants && (
            <> · <b>{everyText(preview.best.interval)}</b> would cost {fmt(preview.best.merchants)}</>
          )}
        </span>
      )}
      {projected.map((p) => (
        <span key={p.res} className={`note ${p.left < 0 ? 'neg' : ''}`}>
          {source.name} left with{' '}
          <b>{p.left >= 0 ? `+${fmt(p.left)}` : fmt(p.left)} {p.res}/h</b>
        </span>
      ))}
    </form>
  )
}
