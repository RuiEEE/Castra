import { useMemo, useState } from 'react'
import { RES_IDS } from '../gameData'
import {
  villageNet, sustainableRate, armyCeiling, trainTimeSeconds,
  effectiveUpkeep, troopCount, netDeltas, fmt, fmtHours,
} from '../calc'

export default function Army({ villages, troops, settings, routes, mix, setMix }) {
  const [scope, setScope] = useState('all')
  const [days, setDays] = useState(14)

  const scoped = scope === 'all' ? villages : villages.filter((v) => v.id === scope)

  // Aggregate the scoped villages into one virtual economy.
  const pooled = useMemo(() => {
    const deltas = netDeltas(villages, troops, routes, settings)
    const prod = { wood: 0, clay: 0, iron: 0, crop: 0 }
    let barracks = 0, stable = 0, trough = 0
    for (const v of scoped) {
      const { net } = villageNet(v, troops, settings, deltas[v.id])
      for (const r of RES_IDS) prod[r] += net[r]
      barracks = Math.max(barracks, v.barracks)
      stable = Math.max(stable, v.stable)
      trough = Math.max(trough, v.troughLevel)
    }
    return {
      id: 'pooled', name: 'pooled', x: 0, y: 0,
      production: { wood: prod.wood / settings.serverSpeed, clay: prod.clay / settings.serverSpeed, iron: prod.iron / settings.serverSpeed, crop: prod.crop / settings.serverSpeed },
      stored: { wood: 0, clay: 0, iron: 0, crop: 0 },
      warehouse: 1e9, granary: 1e9, population: 0,
      barracks, stable, troughLevel: trough, troops: {}, marketplace: 0, tradeOffice: 0,
    }
  }, [scoped, troops, settings, routes])

  const rate = sustainableRate(pooled, troops, settings, mix)
  const ceiling = armyCeiling(pooled, troops, settings, mix)

  const batchUpkeep = troops.reduce((s, t) => s + (mix[t.id] || 0) * effectiveUpkeep(t, pooled), 0)
  const batchSize = troops.reduce((s, t) => s + (mix[t.id] || 0), 0)

  // Growth is limited by resources. Crop headroom isn't a hard stop — you can
  // train past it and go crop-negative (buy/raid crop, or starve short-term), so
  // we keep projecting and just flag the day upkeep overtakes crop production.
  const projection = useMemo(() => {
    const out = []
    let cumulative = 0
    let cropLeft = rate.net.crop
    const stepHours = 24
    for (let d = 1; d <= days; d++) {
      const built = Math.max(0, rate.batchesPerHour * stepHours)
      cumulative += built
      cropLeft -= built * batchUpkeep
      out.push({ day: d, built, cumulative, troops: cumulative * batchSize, cropLeft, walled: cropLeft < 0 })
    }
    return out
  }, [rate, batchUpkeep, batchSize, days])

  const wall = projection.find((p) => p.walled)
  const current = scoped.reduce((s, v) => s + troopCount(v), 0)

  // Training throughput ceiling from building levels
  const trainCap = useMemo(() => {
    let perHour = Infinity
    for (const t of troops) {
      const w = mix[t.id] || 0
      if (!w) continue
      const secs = trainTimeSeconds(t, pooled, settings)
      if (!secs) return { perHour: 0, missing: t.name }
      const unitsPerHour = 3600 / secs
      perHour = Math.min(perHour, unitsPerHour / w)
    }
    return { perHour }
  }, [troops, mix, pooled, settings])

  const realRate = Math.min(rate.batchesPerHour, trainCap.perHour ?? Infinity)
  const limitedBy = trainCap.perHour < rate.batchesPerHour ? 'training queue' : `${rate.bottleneck} production`

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h2>Troop mix</h2>
          <span className="note">This is one batch's recipe — a ratio, not a daily amount</span>
          <span className="spacer" />
          <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ width: 'auto' }}>
            <option value="all">All villages pooled</option>
            {villages.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="row">
          {troops.map((t) => (
            <label className="field" key={t.id} style={{ minWidth: 76 }}>
              <span title={t.name}>{t.short}</span>
              <input type="number" min="0" value={mix[t.id] || 0}
                onChange={(e) => setMix({ ...mix, [t.id]: Number(e.target.value) || 0 })} />
            </label>
          ))}
        </div>
        <div className="hint" style={{ marginTop: 10 }}>
          Batch cost:{' '}
          {RES_IDS.map((r) => (
            <span key={r} className={`res-${r}`} style={{ marginRight: 10 }}>{fmt(rate.batchCost[r])} {r}</span>
          ))}
          · {fmt(batchUpkeep)} crop/h upkeep · <b>{fmt(batchSize)} units/batch</b>
        </div>
        <div className="hint" style={{ marginTop: 6, color: 'var(--dim)' }}>
          Output below is <b>batches/day × {fmt(batchSize)}</b>. To read one troop directly, set that
          unit to 1 and the rest to 0 — then batches/day = units/day.
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="k">Sustainable rate</div>
          <div className="v">{fmt(realRate * 24, 1)}</div>
          <div className="s">batches/day · limited by {limitedBy}</div>
        </div>
        <div className="stat">
          <div className="k">Crop headroom</div>
          <div className={`v ${ceiling.cropHeadroom < 0 ? 'neg' : 'pos'}`}>{fmt(ceiling.cropHeadroom)}</div>
          <div className="s">crop/h spare right now</div>
        </div>
        <div className="stat">
          <div className="k">Army ceiling</div>
          <div className="v">{fmt(ceiling.batches * batchSize)}</div>
          <div className="s">more units before crop hits zero</div>
        </div>
        <div className="stat">
          <div className="k">Standing army</div>
          <div className="v">{fmt(current)}</div>
          <div className="s">in scope</div>
        </div>
      </div>

      {ceiling.cropHeadroom < 0 && (
        <div className="alert bad">
          You are already crop-negative in this scope. Nothing new can be fed — raise crop fields, take a crop oasis, or disband before training more.
        </div>
      )}
      {wall && (
        <div className="alert">
          Around day {wall.day}, standing upkeep overtakes crop production — past roughly {fmt(ceiling.batches * batchSize)} new
          units you're feeding from stores or bought crop, not fields. Fine in bursts; to hold this army
          long-term grow crop (fields, a crop oasis, or an inbound crop route).
        </div>
      )}
      {trainCap.perHour < rate.batchesPerHour && (
        <div className="alert">
          Your barracks/stable can't keep up with your economy. You're banking resources you can't spend — upgrade training buildings or add a second training village.
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>Growth projection</h2>
          <span className="spacer" />
          <label className="field fit" style={{ minWidth: 100 }}>
            <span>Horizon (days)</span>
            <input type="number" min="1" max="120" value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} />
          </label>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th>Day</th>
              <th className="num">Batches built</th>
              <th className="num">Cumulative units</th>
              <th className="num">Crop left/h</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {projection.filter((_, i) => i < 3 || i % Math.ceil(projection.length / 8) === 0 || i === projection.length - 1).map((p) => (
              <tr key={p.day}>
                <td>{p.day}</td>
                <td className="num">{fmt(p.built, 1)}</td>
                <td className="num">{fmt(p.troops)}</td>
                <td className={`num ${p.cropLeft < 0 ? 'neg' : ''}`}>{fmt(p.cropLeft)}</td>
                <td>{p.walled && <span className="chip bad">crop-negative</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Per-resource limits</h2>
          <span className="note">Batches per hour each resource alone could fund</span>
        </div>
        <table className="grid">
          <thead>
            <tr><th>Resource</th><th className="num">Net/hour</th><th className="num">Cost per batch</th><th className="num">Batches/h</th><th /></tr>
          </thead>
          <tbody>
            {RES_IDS.map((r) => (
              <tr key={r}>
                <td className={`res-${r}`}>{r}</td>
                <td className="num">{fmt(rate.net[r])}</td>
                <td className="num">{fmt(rate.batchCost[r])}</td>
                <td className="num">{fmt(rate.limits[r], 2)}</td>
                <td>{rate.bottleneck === r && <span className="chip bad">bottleneck</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="hint" style={{ marginTop: 10 }}>
          The bottleneck is what to fix first. Everything above it is surplus you should be trading away
          or spending on buildings.
        </div>
      </div>
    </>
  )
}
