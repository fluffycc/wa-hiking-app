import L from 'leaflet'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Trail, ConditionOverall } from '../../domain/types'
import { useUiStore } from '../../state/useUiStore'
import { useTrailStore } from '../../state/useTrailStore'

const PIN_COLOR: Record<ConditionOverall, string> = {
  go:      '#22c55e',
  caution: '#f59e0b',
  avoid:   '#ef4444',
  unknown: '#9ca3af',
}

function createPinIcon(color: string, selected: boolean) {
  const size = selected ? 22 : 15
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      background:${color};
      border:${selected ? '3px solid #1a2e1e' : '2px solid #fff'};
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      cursor:pointer;
    "></div>`,
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function RecenterMap({ trail }: { trail: Trail | null }) {
  const map = useMap()
  if (trail) map.setView([trail.lat, trail.lng], Math.max(map.getZoom(), 11))
  return null
}

export function TrailMap() {
  const { filteredTrails } = useTrailStore()
  const { selectedTrailId, setSelectedTrailId } = useUiStore()
  const selected = filteredTrails.find(t => t.id === selectedTrailId) ?? null

  return (
    <MapContainer
      center={[47.5, -120.5]}
      zoom={7}
      zoomControl={false}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <RecenterMap trail={selected} />
      {filteredTrails.map(trail => (
        <Marker
          key={trail.id}
          position={[trail.lat, trail.lng]}
          icon={createPinIcon(PIN_COLOR[trail.conditions.overall], selectedTrailId === trail.id)}
          eventHandlers={{ click: () => setSelectedTrailId(trail.id) }}
        />
      ))}
    </MapContainer>
  )
}
