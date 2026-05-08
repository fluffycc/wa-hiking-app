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

function alertIsTrailClosure(alert: NonNullable<Trail['alerts']>[number]): boolean {
  if (alert.source?.toLowerCase() === 'wsdot') return false
  return alert.type === 'closure' || textSuggestsClosure(alert.message)
}

function trailHasClosure(trail: Trail): boolean {
  const activeAlerts = trail.alerts?.filter(alertIsActive) ?? []

  return (
    activeAlerts.some(alertIsTrailClosure) ||
    trail.conditions.notes.some(textSuggestsClosure)
  )
}

function trailHasSignificantSnow(trail: Trail): boolean {
  return trail.conditions.snow === 'significant'
}

function getPinColor(trail: Trail): string {
  if (trailHasClosure(trail)) return PIN_COLORS.closed
  if (trailHasSignificantSnow(trail)) return PIN_COLORS.caution
  return PIN_COLORS.go
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
  const lastViewportKeyRef = useRef<string | null>(null)

  const loadCurrentBounds = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)

    timerRef.current = window.setTimeout(() => {
      const bounds = map.getBounds()
      const nextBounds = {
        north: Number(bounds.getNorth().toFixed(2)),
        south: Number(bounds.getSouth().toFixed(2)),
        east:  Number(bounds.getEast().toFixed(2)),
        west:  Number(bounds.getWest().toFixed(2)),
      }
      const viewportKey = [
        map.getZoom(),
        nextBounds.north,
        nextBounds.south,
        nextBounds.east,
        nextBounds.west,
      ].join(':')

      if (lastViewportKeyRef.current === viewportKey) return
      lastViewportKeyRef.current = viewportKey

      void loadTrails(nextBounds)
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
