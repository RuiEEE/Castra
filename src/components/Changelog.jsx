import { useState } from 'react'

export const VERSION = '1.0.3'

const CHANGELOG = [
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
