import { RES_IDS, heroProduction } from '../gameData'
import { fmt } from '../calc'

// The hero occupies one village and adds flat resource production there. Every
// resource has a base of 20; each attribute point adds 20 to a single chosen
// resource, or 5 to each when split evenly. Premium (+25%) applies afterwards,
// same as field/oasis production (handled in calc.grossProduction).
const MODES = [
  { id: 'all', label: 'Split evenly (all resources)' },
  { id: 'wood', label: 'All → Wood' },
  { id: 'clay', label: 'All → Clay' },
  { id: 'iron', label: 'All → Iron' },
  { id: 'crop', label: 'All → Crop' },
]

export default function Hero({ villages, premium, heroVillageId, heroPoints, heroMode, assignHero, setHeroPoints, setHeroMode }) {
  const hv = villages.find((v) => v.id === heroVillageId)
  const prod = heroProduction(heroPoints, heroMode || 'all')
  const total = RES_IDS.reduce((s, r) => s + prod[r], 0)

  return (
    <div className="content">
      <div className="panel">
        <div className="panel-head"><h2>Hero</h2></div>
        <div className="row compact">
          <label className="field" style={{ flex: 2 }}>
            <span>Assigned village</span>
            <select value={heroVillageId || ''} onChange={(e) => assignHero(e.target.value || null)}>
              <option value="">— none —</option>
              {villages.map((v) => (
                <option key={v.id} value={v.id}>{v.name || 'Village'}</option>
              ))}
            </select>
          </label>
          <label className="field fit">
            <span>Resource points</span>
            <input type="number" value={heroPoints ?? 0}
              onChange={(e) => setHeroPoints(e.target.value === '' ? 0 : Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Allocation</span>
            <select value={heroMode || 'all'} onChange={(e) => setHeroMode(e.target.value)}>
              {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {!hv ? (
        <div className="empty">Assign the hero to a village to apply its production.</div>
      ) : (
        <div className="panel">
          <div className="panel-head">
            <h2>Production — {hv.name || 'Village'}</h2>
            <span className="spacer" />
            <span className="note">total {fmt(total)}/h{premium ? ` · ×1.25 premium → ${fmt(total * 1.25)}/h` : ''}</span>
          </div>
          <div className="rrow">
            {RES_IDS.map((r) => (
              <div className="rcell" key={r}>
                <div className={`rlabel res-${r}`} style={{ textTransform: 'capitalize' }}>{r}</div>
                <div className={`rnet res-${r}`}>{fmt(prod[r])}</div>
                {premium && <div className="rsub">→ {fmt(prod[r] * 1.25)}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
