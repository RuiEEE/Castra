import { useMemo } from 'react'
import { TRIBES } from '../gameData'
import { cropPlan, routeRates, merchantCount, productionGap, byName, fmt, fmtHours } from '../calc'
import { everyText } from './RouteForm'

// Crop is the only resource that can actually run the empire into the ground,
// because population and troops eat it whether or not you do anything. Two
// separate questions live here and they must not be confused:
//
//   1. Does the empire as a whole make more crop than it eats? If not, no amount
//      of shipping helps — merchants move crop, they don't create it.
//   2. Given that it does, is the crop in the right villages? That's the plan.

const SINK = [
  { key: 'pop', label: 'Population' },
  { key: 'army', label: 'Army' },
  { key: 'wounded', label: 'Healing tent' },
  { key: 'hosted', label: 'Foreign troops' },
]

// How well the routes you've set up cover each crop deficit. The routes
// themselves are entered and listed on the Routes tab — one departure can carry
// several resources, so a route isn't a crop object — but whether the crop ends
// up in the right villages is this tab's question, so the bars stay here.
function CropCoverage({ villages, wonders, routes, raw }) {
  // What each destination still needs once its routes are counted. Villages are
  // measured against the deficit they'd run with NO routes, so a fully covered
  // village still shows why the route exists instead of vanishing.
  const coverage = []
  const inbound = (key) => (routes || [])
    .filter((r) => (r.wwId ? `w:${r.wwId}` : `v:${r.toId}`) === key)
    .reduce((s, r) => s + (routeRates(r).crop || 0), 0)

  const outbound = {}
  for (const r of routes || []) {
    const crop = routeRates(r).crop || 0
    if (crop) outbound[r.fromId] = (outbound[r.fromId] || 0) + crop
  }

  // What a village is ACTUALLY left with once every route runs: what it grows on
  // its own, plus what arrives, minus what it sends away.
  //
  // Counting only one direction is wrong in both directions, and a relay village
  // gets it wrong twice. Massamá grows −7,967, receives 10,000 from Belas and
  // forwards 2,000 to Queluz: it is +33, not the +2,033 that ignoring its
  // outbound route suggests, and it is not over-committed either, which is what
  // ignoring its inbound route suggests. A route is only too big when it takes
  // the source below zero — where the crop came from doesn't matter.
  const balanceOf = (id) => {
    const grows = raw.rows.find((x) => x.village.id === id)?.net ?? 0
    return grows + inbound(`v:${id}`) - (outbound[id] || 0)
  }

  // Bars are only for villages that actually run a deficit. A village that just
  // ships crop out is already spelled out by its own route line, and a bar for
  // it was measuring progress towards a need it doesn't have.
  for (const row of raw.rows) {
    const id = row.village.id
    if (row.net >= 0) continue
    coverage.push({
      key: `v:${id}`,
      name: row.village.name,
      need: -row.net,
      covered: inbound(`v:${id}`),
      sent: outbound[id] || 0,
      balance: balanceOf(id),
    })
  }
  for (const w of wonders) {
    // A wonder grows nothing, so its balance is simply what turns up against
    // what the garrison eats.
    const got = inbound(`w:${w.wwId}`)
    coverage.push({ key: `w:${w.wwId}`, name: w.name, ww: true, need: w.crop, covered: got, sent: 0, balance: got - w.crop })
  }
  coverage.sort((a, b) => a.balance - b.balance)

  if (!coverage.length) return null

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Crop coverage</h2>
        <span className="spacer" />
        <span className="note">Worst position first · routes are on the Routes tab</span>
      </div>
        <div>
          {coverage.map((c) => {
            const ok = c.balance >= 0
            // The bar tracks the need against what the routes NET deliver, so a
            // village that forwards crop on doesn't look fuller than it is.
            const net = c.covered - c.sent
            const pct = c.need > 0
              ? Math.min(100, Math.max(0, net / c.need) * 100)
              : (ok ? 100 : 0)
            return (
              <div key={c.key} style={{ marginBottom: 10 }}>
                <div className="rsub" style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--ink)' }}>{c.name}</span>
                  {c.ww && <span className="chip gold">wonder</span>}
                  <span className="spacer" style={{ flex: 1 }} />
                  <span>
                    {c.need > 0 && <>needs {fmt(c.need)}</>}
                    {c.covered > 0 && <> · <span className="pos">+{fmt(c.covered)} in</span></>}
                    {c.sent > 0 && <> · <span className="neg">−{fmt(c.sent)} out</span></>}
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
        </div>
    </div>
  )
}

export default function Crop({ villages, troops, settings, routes }) {
  const tribe = TRIBES[settings.tribe] || TRIBES.romans

  const plan = useMemo(
    () => cropPlan(villages, troops, settings, tribe, routes),
    [villages, troops, settings, tribe, routes],
  )
  // The same picture with your routes switched off, so coverage can be shown
  // against the deficit a village would run on its own.
  const raw = useMemo(
    () => cropPlan(villages, troops, settings, tribe, []),
    [villages, troops, settings, tribe],
  )
  const { rows, wonders, shipments, unmet, overcommitted, budget, totals } = plan
  const sorted = useMemo(() => [...rows].sort((a, b) => byName(a.village, b.village)), [rows])
  const overIds = new Set(overcommitted.map((o) => o.village.id))
  // "Short" means needs crop shipped in — a village that's only negative because
  // it over-exports isn't short, it's over-committed, and belongs to the fix below.
  const starving = rows.filter((r) => r.net < 0 && !overIds.has(r.village.id))
  const idleMerchants = villages.reduce((s, v) => s + (budget.get(v.id) || 0), 0)
  const totalMerchants = villages.reduce((s, v) => s + merchantCount(v), 0)

  // The empire being in the red is a different problem from crop being in the
  // wrong place, and only the second one has a shipping answer. The wonder
  // garrison counts against you here: that crop leaves the empire for good.
  // Only the part you haven't already got a route for — once a route runs, the
  // crop is already gone from its source's net and counting it twice would
  // double the bill.
  const uncoveredWonder = Math.max(0, totals.wonder - totals.wonderCovered)
  const free = totals.net - uncoveredWonder
  const empireShort = free < 0

  // Every deficit on this page is computed from the field model, which can't see
  // oases. Where the game reports more crop than the model explains, the whole
  // plan is asking for shipments that may not be needed — so say so, and say by
  // how much, rather than letting the numbers look authoritative.
  const missed = useMemo(() => {
    const per = villages
      .map((v) => ({ village: v, g: productionGap(v, settings.premium) }))
      .filter((x) => x.g && x.g.gap.crop > 1)
    return { per, crop: per.reduce((s, x) => s + x.g.gap.crop, 0) }
  }, [villages, settings.premium])

  if (villages.length < 2) {
    return <div className="empty">Add a second village and Castra will balance crop between them.</div>
  }

  return (
    <div className="prod">
      <div className="stats">
        <div className="stat">
          <div className="k">Empire crop</div>
          <div className={`v ${empireShort ? 'neg' : 'pos'}`}>{free > 0 ? '+' : ''}{fmt(free)}</div>
          <div className="s">
            per hour · {fmt(free * 24)}/day
            {totals.wonder > 0 && <> · wonder included</>}
          </div>
        </div>
        <div className="stat">
          <div className="k">Crop to deliver</div>
          <div className={`v ${totals.owed ? 'neg' : 'pos'}`}>{fmt(totals.owed)}</div>
          <div className="s">
            {totals.owed
              ? `${starving.length} village${starving.length === 1 ? '' : 's'} short${totals.wonder ? ` · ${fmt(totals.wonder)} owed to the wonder` : ''}`
              : 'every village feeds itself'}
          </div>
        </div>
        <div className="stat">
          <div className="k">Merchants for the plan</div>
          <div className="v">{fmt(totals.merchantsUsed)}</div>
          <div className="s">of {fmt(totalMerchants)} · {fmt(idleMerchants)} still free</div>
        </div>
        <div className="stat">
          <div className="k">Wonder garrison</div>
          <div className={`v ${uncoveredWonder > 0 ? 'neg' : totals.wonder > 0 ? 'pos' : ''}`}>
            {totals.wonder > 0 ? fmt(totals.wonder) : '—'}
          </div>
          <div className="s">
            {totals.wonder > 0
              ? `${fmt(totals.wonderUnits)} units at ${wonders.length} wonder${wonders.length === 1 ? '' : 's'} · half upkeep, shipped`
              : 'nothing parked at a wonder'}
          </div>
          {/* Whether the garrison is actually being fed is the thing worth
              knowing at a glance — the bill on its own says nothing about
              whether it's under control. */}
          {totals.wonder > 0 && (
            <div className="s" style={{ marginTop: 6 }}>
              {wonders.map((w) => {
                const over = w.covered - w.crop
                return (
                  <div key={w.wwId} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    {wonders.length > 1 && <span>{w.name}</span>}
                    {w.covered <= 0 ? (
                      <span className="chip bad">no route · {fmt(w.crop)} short</span>
                    ) : over >= 0 ? (
                      <span className="chip good">covered · +{fmt(over)} spare</span>
                    ) : (
                      <span className="chip warn">{fmt(w.covered)} routed · {fmt(-over)} short</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {missed.crop > 0 && (
        <div className="alert warn">
          The game reports <b>{fmt(missed.crop)} crop/h more</b> than Castra's fields explain
          across {missed.per.length} village{missed.per.length === 1 ? '' : 's'} —{' '}
          {missed.per
            .slice()
            .sort((a, b) => b.g.gap.crop - a.g.gap.crop)
            .slice(0, 3)
            .map((x) => `${x.village.name} +${fmt(x.g.gap.crop)}`)
            .join(' · ')}
          {missed.per.length > 3 && ' · …'}. Almost certainly annexed oases, which the export
          doesn't carry. Every deficit below is pessimistic by that much until they're entered in
          the Villages editor.
        </div>
      )}

      {overcommitted.length > 0 && (
        <div className="alert warn">
          <b>Over-committed sources</b> — these end crop-negative only because of their own outbound
          routes. Shipping crop back in would be circular; trim the route instead.
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {overcommitted
              .slice()
              .sort((a, b) => b.over - a.over)
              .map((o) => (
                <li key={o.village.id} style={{ marginBottom: 4 }}>
                  {o.fixes.map((f, i) => (
                    <span key={i}>
                      Reduce <b>{o.village.name} → {f.to ? f.to.name : 'route'}</b> by {fmt(f.trim)} crop/h
                      {f.ww && ' (wonder)'}
                      {i < o.fixes.length - 1 ? '; ' : '. '}
                    </span>
                  ))}
                  {o.makeup.length > 0 ? (
                    <span>
                      Make it up:{' '}
                      {o.makeup
                        .map((m) => `${fmt(m.rate)} from ${m.from.name} → ${m.to.name}`)
                        .join(' · ')}
                      {o.makeupUnmet > 0.01 && (
                        <span className="neg"> · {fmt(o.makeupUnmet)} still uncovered</span>
                      )}
                      .
                    </span>
                  ) : o.makeupUnmet > 0.01 ? (
                    <span className="neg">
                      No surplus source for {fmt(o.makeupUnmet)} crop/h — raise crop or free merchants.
                    </span>
                  ) : (
                    <span>The recipient stays positive, so no make-up route is needed.</span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      {empireShort ? (
        <div className="alert bad">
          The empire is {fmt(-free)} crop/h short of what it owes.
          {uncoveredWonder > 0 && <> {fmt(uncoveredWonder)} of that is the wonder garrison, which has no route yet.</>}{' '}
          Merchants can only move crop, not make it, so this gap has to close by raising crop fields,
          annexing a crop oasis, or disbanding troops. Until then you are living off granary stock.
        </div>
      ) : totals.unmet > 0 ? (
        <div className="alert bad">
          There is enough crop empire-wide, but {fmt(totals.unmet)} crop/h of it can't be delivered —
          the merchants aren't there or the surplus is too far away. Build marketplaces in the
          surplus villages, or move the shortfall closer.
        </div>
      ) : totals.owed > 0 ? (
        <div className="alert good">
          Everything is coverable: {fmt(totals.shipped)} crop/h across {shipments.length} route
          {shipments.length === 1 ? '' : 's'} using {fmt(totals.merchantsUsed)} merchant
          {totals.merchantsUsed === 1 ? '' : 's'}.
        </div>
      ) : null}

      <div className="split">
      <div className="panel">
        <div className="panel-head">
          <h2>Where the crop goes</h2>
          <span className="spacer" />
          <span className="note">Gross field output minus every mouth, per village</span>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th>Village</th>
              <th className="num">Gross/h</th>
              {SINK.map((s) => <th key={s.key} className="num">{s.label}</th>)}
              <th className="num">Moved</th>
              <th className="num">Net/h</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.village.id}>
                <td>{r.village.name} {r.village.capital && <span className="chip gold">cap</span>}</td>
                <td className="num">{fmt(r.gross)}</td>
                {SINK.map((s) => (
                  <td key={s.key} className="num">
                    {r[s.key] > 0 ? `−${fmt(r[s.key])}` : <span className="zero">—</span>}
                  </td>
                ))}
                <td className={`num ${r.moved < 0 ? 'neg' : r.moved > 0 ? 'pos' : ''}`}>
                  {r.moved ? `${r.moved > 0 ? '+' : ''}${fmt(r.moved)}` : <span className="zero">—</span>}
                </td>
                <td className={`num ${r.net < 0 ? 'neg' : 'pos'}`}><b>{r.net > 0 ? '+' : ''}{fmt(r.net)}</b></td>
                <td>{r.net < 0 && <span className="chip bad">−{fmt(-r.net * 24)}/day</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><b>Empire</b></td>
              <td className="num"><b>{fmt(totals.gross)}</b></td>
              {SINK.map((s) => <td key={s.key} className="num">−{fmt(totals[s.key])}</td>)}
              <td className="num"><span className="zero">—</span></td>
              <td className={`num ${totals.net < 0 ? 'neg' : 'pos'}`}><b>{totals.net > 0 ? '+' : ''}{fmt(totals.net)}</b></td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <CropCoverage villages={villages} wonders={wonders} routes={routes} raw={raw} />
      <div className="panel">
        <div className="panel-head">
          <h2>What's still missing</h2>
          <span className="spacer" />
          <span className="note">Biggest need first, one village per delivery where possible</span>
        </div>
        {shipments.length === 0 && unmet.length === 0 ? (
          <div className="hint">Nothing to ship — every village feeds itself and nothing is parked at a wonder.</div>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th className="num">Crop/h</th>
                <th className="num">Merchants</th>
                <th className="num">Load/trip</th>
                <th className="num">Departs</th>
                <th className="num">One way</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s, i) => (
                <tr key={i}>
                  <td>{s.from.name}</td>
                  <td>
                    {s.to.name}
                    {s.ww && <span className="chip gold" style={{ marginLeft: 6 }}>wonder</span>}
                    {s.solo && <span className="chip" style={{ marginLeft: 6 }}>covers it alone</span>}
                  </td>
                  <td className="num res-crop">{fmt(s.rate)}</td>
                  <td className="num">{fmt(s.merchants)}{s.sets > 1 && <span className="chip warn" style={{ marginLeft: 6 }}>{s.sets} sets</span>}</td>
                  <td className="num">{fmt(s.loadPerTrip)}</td>
                  <td className="num">{everyText(s.interval)}</td>
                  <td className="num">{fmtHours(s.travel)}</td>
                </tr>
              ))}
              {unmet.map((u, i) => (
                <tr key={`u${i}`}>
                  <td><span className="chip bad">{u.unplaced ? 're-import' : 'no source'}</span></td>
                  <td>{u.to.name}{u.ww && <span className="chip gold" style={{ marginLeft: 6 }}>wonder</span>}</td>
                  <td className="num neg">{fmt(u.shortfall)} short</td>
                  <td className="num" colSpan={4}>
                    {u.unplaced
                      ? 'wonder location unknown until the next game export'
                      : `of ${fmt(u.need)} crop/h needed`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </div>
      </div>
    </div>
  )
}
