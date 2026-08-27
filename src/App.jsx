import { useState } from 'react'
import { useStore } from './store'
import { TRIBES } from './gameData'
import Villages from './components/Villages'
import Hero from './components/Hero'
import Production from './components/Production'
import Crop from './components/Crop'
import Routes from './components/Routes'
import CulturePoints from './components/CulturePoints'
import Reference from './components/Reference'
import Changelog from './components/Changelog'

const TABS = [
  { id: 'villages', label: 'Villages' },
  { id: 'hero', label: 'Hero' },
  { id: 'production', label: 'Production' },
  { id: 'crop', label: 'Crop' },
  { id: 'routes', label: 'Routes' },
  { id: 'culture', label: 'Culture' },
  { id: 'reference', label: 'Reference' },
]

export default function App() {
  const [tab, setTab] = useState('villages')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTribe, setNewTribe] = useState('romans')
  const store = useStore()

  const active = store.servers.find((s) => s.id === store.activeServerId) || store.servers[0]
  const tribeName = (TRIBES[store.settings.tribe] || TRIBES.romans).name

  const submitServer = () => {
    const name = newName.trim() || `${TRIBES[newTribe].name} server`
    store.addServer({ name, tribe: newTribe })
    setNewName('')
    setNewTribe('romans')
    setAdding(false)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>CASTRA</h1>
          <span className="tagline">Travian Kingdoms · {tribeName}</span>
        </div>
        <div className="servers">
          <select
            className="server-select"
            value={store.activeServerId}
            onChange={(e) => store.setActiveServer(e.target.value)}
          >
            {store.servers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button className="btn ghost" onClick={() => setAdding((v) => !v)}>Add server</button>
          <button
            className="btn ghost"
            onClick={() => {
              const name = prompt('Rename server', active.name)
              if (name && name.trim()) store.renameServer(active.id, name.trim())
            }}
          >
            Rename
          </button>
          <button
            className="btn ghost danger"
            onClick={() => {
              if (confirm(`Delete server "${active.name}" and all its villages, routes and hero?`)) {
                store.removeServer(active.id)
              }
            }}
          >
            Remove
          </button>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {adding && (
        <div className="add-server">
          <label className="field">
            <span>Server name</span>
            <input
              type="text"
              value={newName}
              placeholder={`${TRIBES[newTribe].name} server`}
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Tribe (fixed for this server)</span>
            <select value={newTribe} onChange={(e) => setNewTribe(e.target.value)}>
              {Object.entries(TRIBES).map(([id, t]) => (
                <option key={id} value={id}>{t.name}</option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={submitServer}>Create</button>
          <button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}

      {store.migrated && (
        <div className="migration">
          <span>
            Shipped troop data was updated. Your hand-edited values were kept; everything else now
            uses the latest confirmed figures.
          </span>
          <button className="btn ghost" onClick={store.dismissMigration}>
            Dismiss
          </button>
        </div>
      )}

      <main className="content">
        {tab === 'villages' && (
          <Villages
            villages={store.villages}
            troops={store.troops}
            settings={store.settings}
            routes={store.routes}
            bonuses={store.bonuses}
            setVillage={store.setVillage}
            addVillage={store.addVillage}
            importGameExport={store.importGameExport}
            removeVillage={store.removeVillage}
            reorderVillages={store.reorderVillages}
          />
        )}
        {tab === 'hero' && (
          <Hero
            villages={store.villages}
            premium={store.settings.premium}
            serverSpeed={store.settings.serverSpeed}
            heroVillageId={store.heroVillageId}
            heroPoints={store.heroPoints}
            heroMode={store.heroMode}
            heroItem={store.heroItem}
            assignHero={store.assignHero}
            setHeroPoints={store.setHeroPoints}
            setHeroMode={store.setHeroMode}
            setHeroItem={store.setHeroItem}
          />
        )}
        {tab === 'production' && (
          <Production
            villages={store.villages}
            troops={store.troops}
            settings={store.settings}
            routes={store.routes}
            bonuses={store.bonuses}
            setVillage={store.setVillage}
          />
        )}
        {tab === 'crop' && (
          <Crop
            villages={store.villages}
            troops={store.troops}
            settings={store.settings}
            routes={store.routes}
          />
        )}
        {tab === 'routes' && (
          <Routes
            villages={store.villages}
            troops={store.troops}
            settings={store.settings}
            routes={store.routes}
            bonuses={store.bonuses}
            addRoute={store.addRoute}
            updateRoute={store.updateRoute}
            removeRoute={store.removeRoute}
          />
        )}
        {tab === 'culture' && (
          <CulturePoints
            villages={store.villages}
            troops={store.troops}
            settings={store.settings}
          />
        )}
        {tab === 'reference' && (
          <Reference
            settings={store.settings}
            setSettings={store.setSettings}
            prestige={store.prestige}
            setPrestige={store.setPrestige}
            troops={store.troops}
            editTroop={store.editTroop}
            exportJSON={store.exportJSON}
            importJSON={store.importJSON}
            resetAll={store.resetAll}
          />
        )}
      </main>

      <Changelog />
    </div>
  )
}
