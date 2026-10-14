import { useMemo, useState } from 'react'
import {
  empireCulture, expansionOutlook, smallCelebrationPlan, largeCelebrationPlan,
  nextUpgrade, upgradeResPerCP, upgradeBreakEven, townHallLevel,
  celebrationBudget, cpVillagePlan, byName, fmt,
} from '../calc'
import { CP_BUILDINGS, SMALL_CELEBRATION } from '../cultureData'

// The one question this tab answers: to earn culture points — which unlock the
// expansion slots that let you settle new villages — is it cheaper to run a
// celebration or to upgrade a building? The common yardstick is RESOURCES PER
// CP, lower being better. A celebration's rate is flat (cost ÷ CP granted); a
// building upgrade is a one-off cost that then pays its CP every single day, so
// the longer you'll keep the empire the cheaper each of its points becomes.
// That crossover — and the day it happens — is the whole decision.

const resPerCP = (x) => (Number.isFinite(x) ? `${fmt(x, 1)} res/CP` : '—')
const days = (d) => (Number.isFinite(d) ? `${fmt(d, d < 10 ? 1 : 0)}d` : 'never')

// A single option's tile in the head-to-head. `best` gets the highlight.
function Option({ label, sub, value, cpPerDay, best, unavailable, note }) {
  return (
    <div className={`stat ${best ? 'winner' : ''}`} style={unavailable ? { opacity: 0.5 } : undefined}>
      <div className="k">{label} {best && <span className="chip good">cheapest</span>}</div>
      <div className="v">{unavailable ? '—' : resPerCP(value)}</div>
      <div className="s">
        {unavailable ? note : sub}
        {!unavailable && cpPerDay > 0 && <> · {fmt(cpPerDay)} CP/day</>}
      </div>
    </div>
  )
}

const PARTY = { none: '—', small: 'small', large: 'large' }

export default function CulturePoints({ villages, troops, settings }) {
  // Days you expect to keep investing in the empire — the window over which a
  // building's daily CP gets to pay back its one-off cost. Anchored loosely on
  // the day-111 Wonder unlock, after which fresh villages stop paying off.
  const [horizon, setHorizon] = useState(90)

  // Stolen-treasure raids landing per day — a crop-heavy empire-wide injection
  // that funds large celebrations. Typed in; scales with Kingdom treasures.
  const [treasures, setTreasures] = useState(0)
  // Culture ↔ Army skew: the share of empire wood/clay/iron celebrations may
  // spend (the rest is held for troops/buildings). Crop always funds parties.
  const [skew, setSkew] = useState(100)
  const budget = useMemo(
    () => celebrationBudget(villages, troops, settings, treasures, skew / 100),
    [villages, troops, settings, treasures, skew],
  )

  const empire = useMemo(() => empireCulture(villages), [villages])

  // The export only reports CP that has accrued PER VILLAGE. Celebration grants
  // land on the account's expansion total but not on any village record, so the
  // summed total runs low — for this account by ~47k. There is no account-total
  // field in the payload to read, so the real number (off the game's expansion
  // screen) is typed here when it matters; blank falls back to the sum.
  const [cpOverride, setCpOverride] = useState('')
  const total = cpOverride.trim() !== '' && Number.isFinite(Number(cpOverride))
    ? Number(cpOverride)
    : empire.total

  const outlook = useMemo(
    () => expansionOutlook(total, empire.production),
    [total, empire.production],
  )
  const maxTownHall = useMemo(
    () => villages.reduce((m, v) => Math.max(m, townHallLevel(v)), 0),
    [villages],
  )

  // Best-case small celebration: the village that produces the most CP/day sets
  // the rate, since it fills the 500 cap first. Large draws on the whole empire.
  const bestSmallVillage = useMemo(() => {
    let best = null
    for (const v of villages) {
      if (!best || (v.culturePointProduction || 0) > (best.culturePointProduction || 0)) best = v
    }
    return best
  }, [villages])
  const small = useMemo(
    () => smallCelebrationPlan(bestSmallVillage?.culturePointProduction || 0, townHallLevel(bestSmallVillage || {})),
    [bestSmallVillage],
  )
  const large = useMemo(
    () => largeCelebrationPlan(empire.production, maxTownHall),
    [empire.production, maxTownHall],
  )

  // Every next-level upgrade of a CP-producing building the empire actually has,
  // ranked by res/CP over the horizon. Identical (building, level) upgrades in
  // different villages are the same deal, so they're grouped — the row shows how
  // many villages it applies to.
  const candidates = useMemo(() => {
    const byKey = new Map()
    for (const v of villages) {
      for (const gid of Object.keys(CP_BUILDINGS)) {
        const lvl = (v.slots || []).reduce((m, s) => (s.type === Number(gid) ? Math.max(m, s.lvl || 0) : m), 0)
        // Only buildings the village has (level ≥ 1) and can still upgrade.
        if (lvl < 1) continue
        const up = nextUpgrade(Number(gid), lvl)
        if (!up || up.deltaCP <= 0) continue
        const key = `${gid}:${lvl}`
        if (!byKey.has(key)) byKey.set(key, { ...up, villages: [] })
        byKey.get(key).villages.push(v.name)
      }
    }
    const list = [...byKey.values()]
    for (const c of list) c.rate = upgradeResPerCP(c.total, c.deltaCP, horizon)
    list.sort((a, b) => a.rate - b.rate)
    return list
  }, [villages, horizon])

  const bestUpgrade = candidates[0] || null

  // The celebration to beat is whichever is cheaper per CP right now.
  const celebRate = Math.min(small.resPerCP, large.available ? large.resPerCP : Infinity)

  const options = [
    { kind: 'small', rate: small.resPerCP },
    { kind: 'large', rate: large.available ? large.resPerCP : Infinity },
    { kind: 'upgrade', rate: bestUpgrade ? bestUpgrade.rate : Infinity },
  ]
  const bestKind = options.reduce((a, b) => (b.rate < a.rate ? b : a)).kind

  // --- Cheapest path to a CP target, for one village ------------------------
  // Mid-game the binding question isn't "celebrate or build", it's "what do I
  // build NEXT in this village so its small celebrations stop granting 280".
  // Default to the village with the most CP/day that is still short of the cap
  // — the one where the next resource spent buys the most.
  const [planVillageId, setPlanVillageId] = useState(null)
  const [planTarget, setPlanTarget] = useState(SMALL_CELEBRATION.cap)
  const [planBudget, setPlanBudget] = useState('')
  const planVillage = useMemo(() => {
    // Village ids are uuid STRINGS, but old saves carry numbers — a `<select>`
    // only ever hands back a string, so compare as one.
    const picked = villages.find((v) => String(v.id) === String(planVillageId))
    if (picked) return picked
    let best = null
    for (const v of villages) {
      const cp = v.culturePointProduction || 0
      if (cp >= SMALL_CELEBRATION.cap) continue
      if (!best || cp > (best.culturePointProduction || 0)) best = v
    }
    return best || [...villages].sort(byName)[0] || null
  }, [villages, planVillageId])
  const plan = useMemo(() => {
    if (!planVillage) return null
    const budget = planBudget.trim() !== '' && Number(planBudget) > 0 ? Number(planBudget) : Infinity
    return cpVillagePlan(planVillage, settings, { target: planTarget, budget })
  }, [planVillage, settings, planTarget, planBudget])
  // The build cost in the only currency that matters at four villages: days of
  // this village's own wood/clay/iron, which is what it would otherwise ship to
  // the capital for troops.
  // The headline numbers describe the plan UP TO the target — that's the
  // question. The table then runs a few buys further to show what takes over
  // once the cap is reached (always the Town Hall, for throughput).
  const head = useMemo(() => {
    if (!plan) return null
    const reached = plan.crossedAt !== null && plan.crossedAt >= 0
    const upto = reached ? plan.steps.slice(0, plan.crossedAt + 1) : plan.steps
    const last = upto[upto.length - 1]
    return {
      count: upto.length,
      passive: last ? last.passive : plan.baseline.passive,
      delivered: last ? last.delivered : plan.baseline.delivered,
      th: last ? last.th : plan.baseline.th,
      parties: last ? last.parties : plan.baseline.parties,
      total: last ? last.spent : 0,
      wci: last ? last.spentCost[0] + last.spentCost[1] + last.spentCost[2] : 0,
      reaches: plan.crossedAt !== null,
    }
  }, [plan])
  const planDays = useMemo(() => {
    if (!plan || !planVillage || !head) return 0
    const row = budget.rows.find((r) => r.village.id === planVillage.id)
    const daily = row ? row.wci.wood + row.wci.clay + row.wci.iron : 0
    return daily > 0 ? head.wci / daily : 0
  }, [plan, planVillage, budget, head])
  const visibleSteps = useMemo(() => {
    if (!plan) return []
    if (planBudget.trim() !== '') return plan.steps
    const cut = plan.crossedAt !== null && plan.crossedAt >= 0 ? plan.crossedAt + 7 : 30
    return plan.steps.slice(0, cut)
  }, [plan, planBudget])

  const imported = villages.some((v) => v.culturePoints || v.culturePointProduction || (v.slots || []).length)
  if (!imported) {
    return (
      <div className="empty">
        Import a game export on the Villages tab and Castra will read your culture points,
        daily production and building levels — then weigh celebrations against upgrades here.
      </div>
    )
  }

  return (
    <div className="prod">
      <div className="stats">
        <div className="stat">
          <div className="k">Culture points</div>
          <div className="v">{fmt(total)}</div>
          <div className="s">{cpOverride.trim() !== '' ? 'from the expansion screen' : `${fmt(empire.total)} accrued in villages`}</div>
        </div>
        <div className="stat">
          <div className="k">Production</div>
          <div className="v pos">{fmt(empire.production)}</div>
          <div className="s">CP/day from {villages.length} village{villages.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="k">Next expansion slot</div>
          <div className="v">{outlook.next ? `#${outlook.next.slot}` : '—'}</div>
          <div className="s">
            {outlook.next
              ? <>needs {fmt(outlook.next.needed)} · <b>{days(outlook.next.days)}</b> away</>
              : 'all 50 slots unlocked'}
          </div>
        </div>
        <div className="stat">
          <div className="k">Town Hall</div>
          <div className="v">{maxTownHall || '—'}</div>
          <div className="s">{maxTownHall >= 10 ? 'large celebrations unlocked' : `level 10 unlocks large parties`}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Cheapest culture</h2>
          <span className="spacer" />
          <label className="note" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Horizon
            <input
              type="number" min={1} max={365} value={horizon}
              onChange={(e) => setHorizon(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: 64 }}
            />
            days
          </label>
        </div>
        <div className="stats" style={{ marginBottom: 0 }}>
          <Option
            label="Small celebration"
            best={bestKind === 'small'}
            value={small.resPerCP}
            cpPerDay={small.cpPerDay}
            sub={small.grant > 0
              ? <>grants {fmt(small.grant)} CP{bestSmallVillage ? ` · ${bestSmallVillage.name}` : ''}{small.capped ? '' : ' (below the 500 cap)'}</>
              : 'no CP production yet'}
          />
          <Option
            label="Large celebration"
            best={bestKind === 'large'}
            value={large.resPerCP}
            cpPerDay={large.cpPerDay}
            unavailable={!large.available}
            note="needs a Town Hall at level 10"
            sub={<>grants {fmt(large.grant)} CP{large.capped ? '' : ' (below the 2000 cap)'}</>}
          />
          <Option
            label="Best building upgrade"
            best={bestKind === 'upgrade'}
            value={bestUpgrade ? bestUpgrade.rate : Infinity}
            cpPerDay={0}
            unavailable={!bestUpgrade}
            note="no upgradable CP building found"
            sub={bestUpgrade
              ? <>{bestUpgrade.name} {bestUpgrade.fromLevel}→{bestUpgrade.toLevel} · +{fmt(bestUpgrade.deltaCP)} CP/day · over {horizon}d</>
              : ''}
          />
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Cheapest path to {fmt(planTarget)} CP/day</h2>
          <span className="spacer" />
          <label className="note" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Village
            <select value={planVillage?.id ?? ''} onChange={(e) => setPlanVillageId(e.target.value)}>
              {[...villages].sort(byName).map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </label>
          <label className="note" style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
            Target
            <input
              type="number" min={1} value={planTarget}
              onChange={(e) => setPlanTarget(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: 72 }}
            />
            CP/day
          </label>
          <label className="note" style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
            Budget
            <input
              type="number" min={0} value={planBudget} placeholder="any"
              onChange={(e) => setPlanBudget(e.target.value)}
              style={{ width: 96 }}
            />
            res
          </label>
        </div>
        {!plan ? (
          <div className="hint">Pick a village with imported building levels.</div>
        ) : (
          <>
            <div className="stats">
              <div className="stat">
                <div className="k">Passive CP/day</div>
                <div className="v">
                  {fmt(plan.baseline.passive)} → <b className={head.reaches ? 'pos' : ''}>{fmt(head.passive)}</b>
                </div>
                <div className="s">
                  {head.reaches
                    ? `small celebrations grant the full ${fmt(Math.min(planTarget, SMALL_CELEBRATION.cap))}`
                    : `${fmt(planTarget - head.passive)} short of the target`}
                </div>
              </div>
              <div className="stat">
                <div className="k">Delivered CP/day</div>
                <div className="v pos">
                  {fmt(plan.baseline.delivered)} → {fmt(head.delivered)}
                </div>
                <div className="s">passive + grants at {fmt(head.parties, 2)} parties/day (Town Hall {head.th || '—'})</div>
              </div>
              <div className="stat">
                <div className="k">Build cost</div>
                <div className="v">{fmt(head.total)}</div>
                <div className="s">
                  {head.count} buy{head.count === 1 ? '' : 's'}
                  {planDays > 0 && <> · {fmt(planDays, 1)} days of this village's w/c/i</>}
                </div>
              </div>
              <div className="stat">
                <div className="k">Party upkeep</div>
                <div className="v">{fmt(plan.partyResPerDay)}</div>
                <div className="s">res/day to keep spamming · {fmt(plan.freeSlots)} free slots left</div>
              </div>
            </div>
            {plan.steps.length === 0 ? (
              <div className="hint">
                Nothing left to buy here — every culture building is maxed, locked or blocked by storage.
              </div>
            ) : (
              <table className="grid">
                <thead>
                  <tr>
                    <th>Build</th>
                    <th className="num">Level</th>
                    <th className="num">Cost</th>
                    <th className="num">+CP/day</th>
                    <th className="num">res per CP/day</th>
                    <th className="num">Passive</th>
                    <th className="num">Delivered</th>
                    <th className="num">Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSteps.map((s, i) => (
                    <tr key={`${s.gid}:${s.fromLevel}`} className={i === plan.crossedAt ? 'subtotal' : ''}>
                      <td>
                        {s.name}
                        {s.newBuilding && <> <span className="chip warn">new{s.unknownPrereq ? ' · check' : ''}</span></>}
                        {i === plan.crossedAt && <> <span className="chip good">target</span></>}
                      </td>
                      <td className="num">{s.fromLevel}→{s.toLevel}</td>
                      <td className="num">{fmt(s.total)}</td>
                      <td className="num pos">+{fmt(s.deltaCP)}</td>
                      <td className="num">{fmt(s.rate)}</td>
                      <td className="num">{fmt(s.passive)}</td>
                      <td className="num">{fmt(s.delivered)}</td>
                      <td className="num">{fmt(s.spent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {visibleSteps.length < plan.steps.length && (
              <div className="hint">
                {plan.steps.length - visibleSteps.length} further buy
                {plan.steps.length - visibleSteps.length === 1 ? '' : 's'} not shown — past the target the
                only thing left worth buying is Town Hall throughput. Set a budget to see them all.
              </div>
            )}
            {plan.locked.length > 0 && (
              <div className="hint">
                Locked: {plan.locked.slice(0, 6).map((l) => `${l.name} (needs ${l.missing.join(' + ')})`).join(' · ')}
              </div>
            )}
            {plan.storageBlocked.length > 0 && (
              <div className="hint">
                Storage caps the plan: {plan.storageBlocked.map((s) => (
                  `${s.name} ${s.level} costs ${fmt(Math.max(s.needWarehouse, 0))} of one resource, warehouse holds ${fmt(s.warehouse)}`
                )).join(' · ')}
              </div>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Daily budget</h2>
          <span className="spacer" />
          <label className="note" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Culture
            <input
              type="range" min={0} max={100} step={5} value={skew}
              onChange={(e) => setSkew(Number(e.target.value))}
              style={{ width: 120 }}
            />
            Army · {skew}% w/c/i to parties
          </label>
          <label className="note" style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
            Stolen treasures / day
            <input
              type="number" min={0} value={treasures}
              onChange={(e) => setTreasures(Math.max(0, Number(e.target.value) || 0))}
              style={{ width: 64 }}
            />
          </label>
        </div>
        <div className="stats">
          <div className="stat">
            <div className="k">Celebration CP/day</div>
            <div className="v pos">+{fmt(budget.cpFromCelebs)}</div>
            <div className="s">on top of {fmt(budget.empireCP)} passive</div>
          </div>
          <div className="stat">
            <div className="k">W/C/I for troops</div>
            <div className="v">{fmt(budget.wciLeft)}</div>
            <div className="s">left after parties · {fmt(budget.wciUsed)} to celebrations</div>
          </div>
          <div className="stat">
            <div className="k">Crop for parties</div>
            <div className="v">{fmt(budget.partiesCrop)}</div>
            <div className="s">fields net {fmt(budget.fieldNetCrop)}/day</div>
          </div>
          <div className={`stat ${budget.treasuresNeeded > budget.treasuresDaily ? '' : 'winner'}`}>
            <div className="k">Treasures needed/day</div>
            <div className={`v ${budget.treasuresNeeded > budget.treasuresDaily ? 'neg' : 'pos'}`}>
              {fmt(budget.treasuresNeeded, 1)}
            </div>
            <div className="s">to fund every party · {fmt(budget.treasuresDaily)} entered</div>
          </div>
        </div>
        {budget.empireCP === 0 ? (
          <div className="hint">
            No culture-point production on record — re-import the game export on the Villages
            tab and Castra will recommend which villages celebrate and how much each can still ship.
          </div>
        ) : (
        <table className="grid">
          <thead>
            <tr>
              <th>Village</th>
              <th className="num">Town Hall</th>
              <th>Celebrate</th>
              <th className="num">+CP/day</th>
              <th className="num">Crop net → after</th>
              <th className="num">Wood</th>
              <th className="num">Clay</th>
              <th className="num">Iron</th>
            </tr>
          </thead>
          <tbody>
            {budget.rows.map((r) => (
              <tr key={r.village.id}>
                <td>{r.village.name}</td>
                <td className="num">{r.th || '—'}</td>
                <td>
                  {r.mode === 'none'
                    ? <span className="note">—</span>
                    : <span className={`chip ${r.mode === 'large' ? 'good' : ''}`}>{PARTY[r.mode]}</span>}
                </td>
                <td className="num pos">{r.drain ? `+${fmt(r.drain.cpPerDay)}` : '—'}</td>
                <td className="num">
                  {fmt(r.cropNet)} → <b className={r.cropAfter < 0 ? 'neg' : ''}>{fmt(r.cropAfter)}</b>
                </td>
                <td className="num">{fmt(r.budget.wood)}</td>
                <td className="num">{fmt(r.budget.clay)}</td>
                <td className="num">{fmt(r.budget.iron)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      <div className="split">
        <div className="panel">
          <div className="panel-head">
            <h2>Upgrade candidates</h2>
            <span className="spacer" />
            <span className="note">Best res/CP over {horizon} days first · break-even vs a celebration</span>
          </div>
          {candidates.length === 0 ? (
            <div className="hint">No upgradable CP-producing buildings in the imported villages.</div>
          ) : (
            <table className="grid">
              <thead>
                <tr>
                  <th>Building</th>
                  <th className="num">Level</th>
                  <th className="num">Cost</th>
                  <th className="num">+CP/day</th>
                  <th className="num">res/CP</th>
                  <th className="num">Break-even</th>
                  <th>Villages</th>
                </tr>
              </thead>
              <tbody>
                {candidates.slice(0, 20).map((c) => {
                  const be = upgradeBreakEven(c.total, c.deltaCP, celebRate)
                  const beatsCeleb = c.rate <= celebRate
                  return (
                    <tr key={`${c.gid}:${c.fromLevel}`}>
                      <td>{c.name}</td>
                      <td className="num">{c.fromLevel}→{c.toLevel}</td>
                      <td className="num">{fmt(c.total)}</td>
                      <td className="num pos">+{fmt(c.deltaCP)}</td>
                      <td className={`num ${beatsCeleb ? 'pos' : ''}`}>{fmt(c.rate, 1)}</td>
                      <td className="num">
                        {Number.isFinite(be)
                          ? <span className={beatsCeleb ? 'pos' : 'neg'}>{days(be)}</span>
                          : '—'}
                      </td>
                      <td>
                        {c.villages.length === 1
                          ? c.villages[0]
                          : <span className="chip">{c.villages.length} villages</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Expansion slots</h2>
            <span className="spacer" />
            <label className="note" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Actual CP
              <input
                type="number" min={0} value={cpOverride}
                placeholder={String(Math.round(empire.total))}
                onChange={(e) => setCpOverride(e.target.value)}
                style={{ width: 96 }}
              />
            </label>
            <span className="note">At {fmt(empire.production)} CP/day</span>
          </div>
          {outlook.upcoming.length === 0 ? (
            <div className="hint">All 50 expansion slots are unlocked.</div>
          ) : (
            <table className="grid">
              <thead>
                <tr>
                  <th className="num">Slot</th>
                  <th className="num">CP needed</th>
                  <th className="num">Still to earn</th>
                  <th className="num">At this rate</th>
                </tr>
              </thead>
              <tbody>
                {outlook.upcoming.map((u) => (
                  <tr key={u.slot}>
                    <td className="num">#{u.slot}</td>
                    <td className="num">{fmt(u.needed)}</td>
                    <td className="num">{fmt(u.needed - total)}</td>
                    <td className="num"><b>{days(u.days)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
