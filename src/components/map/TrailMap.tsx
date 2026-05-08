import L from 'leaflet'
import { useCallback, useEffect, useRef } from 'react'
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

function ViewportTrailLoader() {
  const map = useMap()
  const loadTrails = useTrailStore(s => s.loadTrails)
  const timerRef = useRef<number | null>(null)

  const loadCurrentBounds = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)

    timerRef.current = window.setTimeout(() => {
      const bounds = map.getBounds()
      void loadTrails({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east:  bounds.getEast(),
        west:  bounds.getWest(),
      })
    }, 250)
  }, [loadTrails, map])

  useEffect(() => {
    loadCurrentBounds()
    map.on('moveend zoomend', loadCurrentBounds)

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      map.off('moveend zoomend', loadCurrentBounds)
    }
  }, [loadCurrentBounds, map])

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
      <ViewportTrailLoader />
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
