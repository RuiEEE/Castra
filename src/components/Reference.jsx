import { RES_IDS, TRIBES, SRC_LABEL } from '../gameData'

function SrcChip({ src, label }) {
  if (src === 'user') return <span className="chip good" title={SRC_LABEL.user}>yours</span>
  if (src === 'kingdoms') return <span className="chip good" title={SRC_LABEL.kingdoms}>{label || 'confirmed'}</span>
  return <span className="chip warn" title={SRC_LABEL.t4}>T4 guess</span>
}

export default function Reference({
  settings, setSettings, troops, editTroop,
  exportJSON, importJSON, resetAll,
}) {
  const editCost = (t, i, val) => {
    const cost = [...t.cost]
    cost[i] = Number(val) || 0
    editTroop(t.id, 'cost', cost)
  }

  const unconfirmed = troops.filter((t) => t.src === 't4')
  const conflicted = troops.filter((t) => t.conflict)
  const tribe = TRIBES[settings.tribe] || TRIBES.romans

  return (
    <>
      <div className="panel">
        <div className="panel-head"><h2>World</h2></div>
        <div className="row compact">
          <label className="field">
            <span>Tribe</span>
            <input type="text" value={tribe.name} readOnly title="Tribe is fixed when the server is created" />
          </label>
          <label className="field">
            <span>Server speed</span>
            <input type="number" min="1" step="1" value={settings.serverSpeed}
              onChange={(e) => setSettings({ serverSpeed: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          <label className="field">
            <span>Map radius</span>
            <input type="number" value={settings.mapRadius}
              onChange={(e) => setSettings({ mapRadius: Number(e.target.value) || 0 })} />
          </label>
          <label className="field">
            <span>Trade office /lvl</span>
            <input type="number" step="0.01" value={tribe.tradeOfficeBonusPerLevel} readOnly
              title={`${tribe.name} merchant capacity ${tribe.merchantCapacity} · speed ${tribe.merchantSpeed} fields/h`} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <label className="field fit" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={settings.wrapMap} onChange={(e) => setSettings({ wrapMap: e.target.checked })} />
            <span style={{ margin: 0 }}>Map wraps at edges</span>
          </label>
          <label className="field fit" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={settings.popEatsCrop} onChange={(e) => setSettings({ popEatsCrop: e.target.checked })} />
            <span style={{ margin: 0 }}>Population eats crop (1/pop/h)</span>
          </label>
          <label className="field fit" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={settings.premium} onChange={(e) => setSettings({ premium: e.target.checked })} />
            <span style={{ margin: 0 }}>Premium — account-wide +25% production &amp; storage</span>
          </label>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Troop reference</h2>
          <span className="spacer" />
          <span className="note">
            costs {troops.length - unconfirmed.length}/{troops.length} · stats {troops.length}/{troops.length} confirmed
          </span>
        </div>

        <div className="alert good" style={{ marginBottom: 8 }}>
          <b>All combat stats confirmed</b> from the official Kingdoms troop specifications table —
          attack, defence, speed, carry, and crop upkeep for every unit. Kingdoms charges <b>no crop</b>
          to train: cost is wood/clay/iron only, and crop is upkeep alone. Siege weapons count as
          <b> infantry</b> in combat calculations.
        </div>
        {unconfirmed.length > 0 && (
          <div className="alert" style={{ marginBottom: 8 }}>
            <b>Costs still Legends (T4):</b> {unconfirmed.map((t) => t.name).join(', ')} — Kingdoms
            doesn't publish these two. Every Kingdoms cost that has been checked ran below its T4
            equivalent, so treat them as pessimistic until you overwrite them from the Academy.
          </div>
        )}
        {conflicted.length > 0 && (
          <div className="alert" style={{ marginBottom: 12 }}>
            <b>Kingdoms docs contradict themselves</b> on {conflicted.map((t) => t.name).join(' and ')} speed.
            The troop specifications table says {conflicted.map((t) => `${t.short} ${t.speed}`).join(', ')};
            their individual article pages say 8 and 10. Using the spec table. Only affects travel time
            for those units — check in game if you care.
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="grid">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Cost src</th>
                <th>Stats src</th>
                {RES_IDS.map((r) => <th key={r} className="num">{r}</th>)}
                <th className="num">Crop/h</th>
                <th className="num">Att</th>
                <th className="num">Def inf</th>
                <th className="num">Def cav</th>
                <th className="num">Speed</th>
                <th className="num">Carry</th>
              </tr>
            </thead>
            <tbody>
              {troops.map((t) => (
                <tr key={t.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {t.name}{' '}
                    {t.conflict && <span className="chip bad" title="Kingdoms docs disagree on this value">conflict</span>}
                  </td>
                  <td><SrcChip src={t.src} /></td>
                  <td><SrcChip src={t.statSrc} /></td>
                  {t.cost.map((c, i) => (
                    <td className="num" key={i}>
                      <input type="number" value={c} onChange={(e) => editCost(t, i, e.target.value)}
                        style={{ width: 66, textAlign: 'right' }}
                        title={RES_IDS[i] === 'crop' ? 'Kingdoms charges no crop to train — leave at 0 unless yours differs' : undefined} />
                    </td>
                  ))}
                  <td className="num">
                    <input type="number" value={t.upkeep} onChange={(e) => editTroop(t.id, 'upkeep', Number(e.target.value) || 0)}
                      style={{ width: 46, textAlign: 'right' }} />
                  </td>
                  {['att', 'defInf', 'defCav', 'speed', 'carry'].map((f) => (
                    <td className="num" key={f}>
                      <input type="number" value={t[f]} onChange={(e) => editTroop(t.id, f, Number(e.target.value) || 0)}
                        style={{ width: f === 'carry' ? 58 : 50, textAlign: 'right' }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Data</h2></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={exportJSON}>Export JSON</button>
          <label className="btn" style={{ display: 'inline-block' }}>
            Import JSON
            <input type="file" accept="application/json" style={{ display: 'none' }}
              onChange={(e) => e.target.files[0] && importJSON(e.target.files[0])} />
          </label>
          <button className="btn danger" onClick={() => {
            if (confirm('Delete all villages, troops, and settings? Export first if you want a copy.')) resetAll()
          }}>Reset everything</button>
        </div>
      </div>
    </>
  )
}
