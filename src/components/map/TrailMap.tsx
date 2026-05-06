import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet'
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

function RecenterMap({ selectedTrail }: { selectedTrail: Trail | null }) {
  const map = useMap()
  if (selectedTrail) {
    map.setView([selectedTrail.lat, selectedTrail.lng], Math.max(map.getZoom(), 11))
  }
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
      className="w-full h-full"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <RecenterMap selectedTrail={selected} />
      {filteredTrails.map(trail => (
        <CircleMarker
          key={trail.id}
          center={[trail.lat, trail.lng]}
          radius={selectedTrailId === trail.id ? 11 : 8}
          pathOptions={{
            fillColor: PIN_COLOR[trail.conditions.overall],
            color: selectedTrailId === trail.id ? '#1a2e1e' : '#fff',
            weight: selectedTrailId === trail.id ? 3 : 2,
            fillOpacity: 0.92,
          }}
          eventHandlers={{ click: () => setSelectedTrailId(trail.id) }}
        />
      ))}
    </MapContainer>
  )
}
