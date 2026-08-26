import { useMemo } from 'react'
import { villageNet, fmt } from '../calc'

const RES_COLOR = { wood: '#6f9a5a', clay: '#c67a4a', iron: '#7f8fa6', crop: '#d9b13a' }

export default function EmpireMap({ villages, routes, troops, settings }) {
  const W = 1000, H = 460, PAD = 60

  const geo = useMemo(() => {
    if (villages.length === 0) return null
    const xs = villages.map((v) => v.x)
    const ys = villages.map((v) => v.y)
    let minX = Math.min(...xs), maxX = Math.max(...xs)
    let minY = Math.min(...ys), maxY = Math.max(...ys)
    // Guarantee a sane viewport even with 1 village or a perfectly flat spread.
    const spanX = Math.max(maxX - minX, 10)
    const spanY = Math.max(maxY - minY, 10)
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    const span = Math.max(spanX, spanY) * 1.25
    minX = cx - span / 2; maxX = cx + span / 2
    minY = cy - span / 2; maxY = cy + span / 2

    const sx = (x) => PAD + ((x - minX) / (maxX - minX)) * (W - PAD * 2)
    // Travian y grows north, SVG y grows down — flip it.
    const sy = (y) => H - PAD - ((y - minY) / (maxY - minY)) * (H - PAD * 2)
    return { sx, sy, minX, maxX, minY, maxY, span }
  }, [villages])

  if (!geo || villages.length === 0) {
    return <div className="empty">Add a village with coordinates to see your empire plotted here.</div>
  }

  const live = routes.filter((r) => !r.unmet)

  return (
    <div className="mapwrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img"
        aria-label="Map of your villages with trade routes">
        <defs>
          {Object.entries(RES_COLOR).map(([k, c]) => (
            <marker key={k} id={`arw-${k}`} viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
            </marker>
          ))}
        </defs>

        {/* Coordinate grid — ticks are real map coordinates, not decoration */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const x = PAD + t * (W - PAD * 2)
          const y = PAD + t * (H - PAD * 2)
          const cxv = Math.round(geo.minX + t * (geo.maxX - geo.minX))
          const cyv = Math.round(geo.maxY - t * (geo.maxY - geo.minY))
          return (
            <g key={i}>
              <line x1={x} y1={PAD} x2={x} y2={H - PAD} stroke="#d2b98a" strokeWidth="1" />
              <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#d2b98a" strokeWidth="1" />
              <text x={x} y={H - PAD + 16} fill="#9c8863" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">{cxv}</text>
              <text x={PAD - 8} y={y + 3} fill="#9c8863" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="end">{cyv}</text>
            </g>
          )
        })}

        {/* Trade routes as curved arcs, coloured by resource */}
        {live.map((r, i) => {
          const x1 = geo.sx(r.from.x), y1 = geo.sy(r.from.y)
          const x2 = geo.sx(r.to.x), y2 = geo.sy(r.to.y)
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
          const dx = x2 - x1, dy = y2 - y1
          const len = Math.sqrt(dx * dx + dy * dy) || 1
          // Offset the control point perpendicular so overlapping routes fan out
          const bow = 0.16 * len * (1 + (i % 3) * 0.35)
          const qx = mx - (dy / len) * bow
          const qy = my + (dx / len) * bow
          return (
            <path key={i} d={`M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`}
              fill="none" stroke={RES_COLOR[r.res]}
              strokeWidth={Math.min(1 + Math.log2(1 + r.merchants) * 1.1, 5)}
              strokeOpacity="0.65"
              markerEnd={`url(#arw-${r.res})`} />
          )
        })}

        {/* Villages */}
        {villages.map((v) => {
          const x = geo.sx(v.x), y = geo.sy(v.y)
          const { net } = villageNet(v, troops, settings)
          const starving = net.crop < 0
          const r = v.capital ? 9 : 6
          return (
            <g key={v.id}>
              {starving && <circle cx={x} cy={y} r={r + 6} fill="none" stroke="#b23c2e" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="2 3" />}
              <circle cx={x} cy={y} r={r} fill={v.capital ? '#d4a428' : '#6b4a2b'}
                stroke={starving ? '#b23c2e' : v.capital ? '#9c6f08' : '#4a3218'} strokeWidth="2" />
              <text x={x} y={y - r - 8} fill="#3a2c18" fontSize="11" fontFamily="Cinzel"
                textAnchor="middle" letterSpacing="0.5">{v.name}</text>
              <text x={x} y={y + r + 14} fill="#9c8863" fontSize="9" fontFamily="IBM Plex Mono"
                textAnchor="middle">{v.x}|{v.y}</text>
              <text x={x} y={y + r + 25} fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle"
                fill={starving ? '#b23c2e' : '#4e7d2c'}>
                {net.crop >= 0 ? '+' : ''}{fmt(net.crop)}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="map-legend">
        {Object.entries(RES_COLOR).map(([k, c]) => (
          <span key={k}><i style={{ background: c }} />{k}</span>
        ))}
        <span style={{ color: '#b8860b' }}>● capital</span>
        <span style={{ color: '#b23c2e' }}>◌ crop negative</span>
      </div>
    </div>
  )
}
