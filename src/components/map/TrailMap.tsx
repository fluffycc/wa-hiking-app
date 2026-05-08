import L from 'leaflet'
import { useCallback, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Trail } from '../../domain/types'
import { useUiStore } from '../../state/useUiStore'
import { useTrailStore } from '../../state/useTrailStore'

const PIN_COLORS = {
  go: '#22c55e',
  caution: '#f59e0b',
  closed: '#ef4444',
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

function alertIsActive(alert: NonNullable<Trail['alerts']>[number]): boolean {
  return !alert.expiresISO || new Date(alert.expiresISO) > new Date()
}

function textSuggestsClosure(value?: string): boolean {
  return !!value && /\b(closed|closure|impassable|not accessible|no access|blocked)\b/i.test(value)
}

function textSuggestsRoadCaution(value?: string): boolean {
  return !!value && /\b(rough|pothole|rutted|washout|washed out|high clearance|4x4|chains|advisory)\b/i.test(value)
}

function trailHasClosure(trail: Trail): boolean {
  const activeAlerts = trail.alerts?.filter(alertIsActive) ?? []

  return (
    activeAlerts.some(alert => alert.type === 'closure' || textSuggestsClosure(alert.message)) ||
    textSuggestsClosure(trail.access.notes) ||
    textSuggestsClosure(trail.roadCondition?.notes) ||
    trail.conditions.notes.some(textSuggestsClosure)
  )
}

function trailHasCaution(trail: Trail): boolean {
  const activeAlerts = trail.alerts?.filter(alertIsActive) ?? []
  const roadCondition = trail.roadCondition?.condition

  return (
    trail.conditions.overall === 'caution' ||
    trail.conditions.overall === 'avoid' ||
    trail.conditions.snow !== 'none' ||
    trail.conditions.mud === 'heavy' ||
    ['rough', 'high_clearance', '4x4_only'].includes(trail.access.level) ||
    roadCondition === 'rough' ||
    roadCondition === 'very_rough' ||
    textSuggestsRoadCaution(trail.access.notes) ||
    textSuggestsRoadCaution(trail.roadCondition?.notes) ||
    activeAlerts.some(alert => alert.type === 'warning' || textSuggestsRoadCaution(alert.message))
  )
}

function getPinColor(trail: Trail): string {
  if (trailHasClosure(trail)) return PIN_COLORS.closed
  if (trailHasCaution(trail)) return PIN_COLORS.caution
  if (trail.conditions.overall === 'go') return PIN_COLORS.go
  return PIN_COLORS.unknown
}

function RecenterMap({ trail }: { trail: Trail | null }) {
  const map = useMap()
  const lastTrailIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!trail) {
      lastTrailIdRef.current = null
      return
    }

    if (lastTrailIdRef.current === trail.id) return
    lastTrailIdRef.current = trail.id
    map.setView([trail.lat, trail.lng], Math.max(map.getZoom(), 11))
  }, [map, trail])

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
          icon={createPinIcon(getPinColor(trail), selectedTrailId === trail.id)}
          eventHandlers={{ click: () => setSelectedTrailId(trail.id) }}
        />
      ))}
    </MapContainer>
  )
}
