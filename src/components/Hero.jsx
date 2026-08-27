import { RES_IDS, heroProduction, HERO_ITEMS, heroItemValue } from '../gameData'
import { fmt } from '../calc'

// What the equipped helmet does, in words, for the panel note. Only the training-
// time helmets feed the model; the rest are shown but flagged as not wired.
function itemEffectLabel(def, value, serverSpeed) {
  if (def.stat === 'timeBarracks') return `−${value}% barracks training time (hero village)`
  if (def.stat === 'timeStable') return `−${value}% stable training time (hero village)`
  if (def.stat === 'health') return `+${value} HP/day · not modelled`
  if (def.stat === 'culture') return `+${value * (serverSpeed || 1)} culture/day · already in the export`
  return ''
}

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

export default function Hero({ villages, premium, serverSpeed, heroVillageId, heroPoints, heroMode, heroItem, assignHero, setHeroPoints, setHeroMode, setHeroItem }) {
  const hv = villages.find((v) => v.id === heroVillageId)
  const prod = heroProduction(heroPoints, heroMode || 'all')
  const total = RES_IDS.reduce((s, r) => s + prod[r], 0)

  const equipped = heroItemValue(heroItem)
  // Equipping a helmet keeps its current variant/upgrades where sensible; a fresh
  // pick starts at the middle variant (0) with no upgrades.
  const pickItem = (id) => {
    if (!id) return setHeroItem(null)
    setHeroItem({ id, variant: heroItem?.id === id ? (heroItem.variant || 0) : 0, upgrades: heroItem?.id === id ? (heroItem.upgrades || 0) : 0 })
  }
  const patchItem = (patch) => setHeroItem({ id: heroItem.id, variant: heroItem?.variant || 0, upgrades: heroItem?.upgrades || 0, ...patch })

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

      <div className="panel">
        <div className="panel-head">
          <h2>Equipment</h2>
          <span className="spacer" />
          {equipped && <span className="note">{itemEffectLabel(equipped.def, equipped.value, serverSpeed)}</span>}
        </div>
        <div className="row compact">
          <label className="field" style={{ flex: 2 }}>
            <span>Helmet</span>
            <select value={heroItem?.id || ''} onChange={(e) => pickItem(e.target.value || null)}>
              <option value="">— none —</option>
              {HERO_ITEMS.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </label>
          {equipped && (
            <>
              <label className="field fit">
                <span>Variant (roll)</span>
                <select value={heroItem.variant || 0} onChange={(e) => patchItem({ variant: Number(e.target.value) })}>
                  {equipped.def.variants.map((val) => (
                    <option key={val} value={val}>{val > 0 ? `+${val}` : val}</option>
                  ))}
                </select>
              </label>
              <label className="field fit">
                <span>Upgrades</span>
                <input type="number" min="0" value={heroItem.upgrades || 0}
                  onChange={(e) => patchItem({ upgrades: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
              <label className="field fit">
                <span>Effective</span>
                <input type="text" readOnly value={`${equipped.def.base} ${(heroItem.variant || 0) >= 0 ? '+' : '−'} ${Math.abs(heroItem.variant || 0)} + ${heroItem.upgrades || 0} = ${equipped.value}`} />
              </label>
            </>
          )}
        </div>
        {equipped && (equipped.def.stat === 'health' || equipped.def.stat === 'culture') && (
          <div className="note" style={{ marginTop: 8 }}>
            This helmet doesn't change any calculation — only the Infantry and Cavalry helmets (barracks / stable training time) feed the model.
          </div>
        )}
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
