import { useState } from 'react'

export const VERSION = '1.0.7'

const CHANGELOG = [
  {
    version: '1.0.7',
    changes: [
      'Culture tab: "Cheapest path to 500 CP/day" works out the exact build order for a village — every next level of every culture building ranked by resources per CP/day delivered, then bought greedily until the small celebration grant is capped.',
      'The Town Hall is priced on both of its payoffs: its own culture points and the extra parties per day it unlocks, which is why it only becomes worth climbing once the village is already at the cap.',
      'The plan respects what the game does: build prerequisites, buildings that exclude each other, free centre slots, and the warehouse level — a level the warehouse cannot hold is flagged instead of planned.',
    ],
  },
  {
    version: '1.0.6',
    changes: [
      'Great Barracks and Great Stable — a city\'s second infantry/cavalry queue is now a producer of its own on the Production tab, with its own level and training time.',
      'Units trained in a great building cost 3× the normal resources, so the ledger, the shipping plan and the merchant budget all account for them.',
    ],
  },
  {
    version: '1.0.5',
    changes: [
      'Production tab: "Cheapest barracks upgrade" ranks every infantry-training village by how many resources the next barracks level costs per extra unit/day, with the wood/clay/iron/crop to ship.',
    ],
  },
  {
    version: '1.0.4',
    changes: [
      'Routes tab: import a village\'s standing routes straight from the game — paste the response the client loads with its Marketplace and every route comes in with its loads, destination and travel time.',
      'The departure interval is the one thing that payload does not carry, so it is still typed per route on import.',
    ],
  },
  {
    version: '1.0.3',
    changes: [
      'Fealty level 20 now cuts troop crop consumption by 4% — applied to your own troops (including the healing tent) in every crop balance.',
    ],
  },
  {
    version: '1.0.2',
    changes: [
      'Fixed hero production when all points go to one resource — the base 20 of each resource now goes to the chosen one (2,080 crop/h at 100 points, was 2,020).',
    ],
  },
  {
    version: '1.0.1',
    changes: [
      'Hero equipment: Helmet of the Archon reduces barracks training time in the hero village.',
      'Fealty bonus — enter your kingdom fealty level to cut troop cost, training time and healing.',
      'Prestige bonus — enter your account prestige level for its extra cost and time reductions.',
    ],
  },
  {
    version: '1.0.0',
    changes: [
      'First release. Local-only dashboard for Travian Kingdoms — no backend, data stays in your browser.',
      'Multi-server and multi-tribe (Romans, Gauls, Teutons).',
      'Import your empire from the game export in one file.',
      'Villages, Hero, Production, Crop, Routes, Culture and Reference tabs.',
      'Crop balancing, merchant route planning and training-cost distribution across villages.',
    ],
  },
]

export default function Changelog() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <footer className="footer">
        <span className="footer-brand">Castra v{VERSION}</span>
        <button className="footer-link" onClick={() => setOpen(true)}>Changelog</button>
      </footer>

      {open && (
        <div className="scrim" onClick={() => setOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <h2>Changelog</h2>
              <span className="spacer" />
              <button className="btn ghost" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div className="changelog">
              {CHANGELOG.map((rel) => (
                <div key={rel.version} className="changelog-release">
                  <h3>v{rel.version}</h3>
                  <ul>
                    {rel.changes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
