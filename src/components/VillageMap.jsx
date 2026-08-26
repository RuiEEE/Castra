import { BUILDING_CATALOG, buildingName, FIXED_SLOTS } from '../gameData'

// A schematic of the village as the game lays it out: the 18 resource fields
// (locations 1-18) around the outside, the village centre (19 onward) inside.
//
// The game doesn't ship pixel coordinates for slots, only a location number, so
// this is a faithful *ordering* rather than a replica of the in-game picture.
// Every village the owner has runs 19-40 with a few carrying 41-43, which is
// exactly the 25 inner cells of a 7x7 grid.

// Perimeter cells, clockwise from the top-left, corners left out and one cell
// dropped from the top and bottom edges — 18 slots for 18 fields.
const FIELD_CELLS = [
  [1, 2], [1, 3], [1, 5], [1, 6],
  [2, 7], [3, 7], [4, 7], [5, 7], [6, 7],
  [7, 6], [7, 5], [7, 3], [7, 2],
  [6, 1], [5, 1], [4, 1], [3, 1], [2, 1],
]

const CENTRE_ROWS = 5

function cellStyle(row, col) {
  return { gridRow: row, gridColumn: col }
}

export default function VillageMap({ v }) {
  const slots = Array.isArray(v.slots) ? v.slots : []
  if (!slots.length) return null

  const byLoc = new Map(slots.map((s) => [s.loc, s]))
  const fields = []
  for (let loc = 1; loc <= 18; loc++) fields.push(byLoc.get(loc) || null)

  // Centre slots start at 19 and fill the inner grid in location order.
  const centre = slots.filter((s) => s.loc >= 19).sort((a, b) => a.loc - b.loc)
  const built = centre.filter((s) => s.type).length

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Village</h2>
        <span className="spacer" />
        <span className="note">{built}/{centre.length} centre slots built</span>
      </div>
      <div className="vmap">
        {fields.map((s, i) => {
          const [row, col] = FIELD_CELLS[i]
          const info = s ? BUILDING_CATALOG[s.type] : null
          const res = info?.res
          return (
            <div
              key={`f${i}`}
              className={`vmap-tile vmap-field${res ? ` vmap-${res}` : ''}`}
              style={cellStyle(row, col)}
              title={s ? `${buildingName(s.type)} — level ${s.lvl} (slot ${s.loc})` : `Slot ${i + 1}`}
            >
              <span className="vmap-lvl">{s ? s.lvl : '—'}</span>
            </div>
          )
        })}

        {centre.slice(0, CENTRE_ROWS * CENTRE_ROWS).map((s, i) => {
          const row = 2 + Math.floor(i / CENTRE_ROWS)
          const col = 2 + (i % CENTRE_ROWS)
          const info = BUILDING_CATALOG[s.type]
          const empty = !s.type
          const fixed = FIXED_SLOTS[s.loc]
          return (
            <div
              key={`c${s.loc}`}
              className={`vmap-tile vmap-slot${empty ? ' is-empty' : ''}${fixed ? ' is-fixed' : ''}`}
              style={cellStyle(row, col)}
              title={
                empty
                  ? `Slot ${s.loc} — empty`
                  : `${buildingName(s.type)} — level ${s.lvl} (slot ${s.loc})`
              }
            >
              {empty ? (
                <span className="vmap-empty">·</span>
              ) : (
                <>
                  <span className="vmap-name">{info?.short || s.type}</span>
                  <span className="vmap-lvl">{s.lvl}</span>
                </>
              )}
            </div>
          )
        })}
      </div>
      <div className="hint" style={{ marginTop: 8 }}>
        Fields outside, village centre inside — slot order as the game reports it, not its
        exact on-screen positions. Hover any tile for the building and level.
      </div>
    </div>
  )
}
