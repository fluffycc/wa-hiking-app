import { useCallback, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polygon, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet'
import type { Trail } from '../../domain/types'
import { useUiStore } from '../../state/useUiStore'
import { useTrailStore } from '../../state/useTrailStore'

const WASHINGTON_BOUNDS: LatLngBoundsExpression = [
  [45.35, -125.1],
  [49.2, -116.75],
]

const WASHINGTON_OUTLINE: LatLngExpression[] = [
  [45.55, -124.02],
  [46.26, -124.09],
  [46.72, -124.04],
  [47.35, -124.32],
  [48.16, -124.73],
  [48.37, -124.72],
  [48.50, -124.45],
  [48.40, -123.22],
  [48.78, -123.03],
  [49.00, -123.32],
  [49.00, -116.92],
  [45.55, -116.92],
  [45.55, -124.02],
]

const MAP_MASK: LatLngExpression[][] = [
  [
    [-90, -180],
    [-90, 180],
    [90, 180],
    [90, -180],
  ],
  WASHINGTON_OUTLINE,
]

const PIN_COLORS = {
  go: '#22c55e',
  closed: '#ef4444',
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

function getPinColor(trail: Trail): string {
  if (trailHasClosure(trail)) return PIN_COLORS.closed
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
    }, 150)
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
      minZoom={6}
      maxZoom={14}
      maxBounds={WASHINGTON_BOUNDS}
      maxBoundsViscosity={0.85}
      preferCanvas
      fadeAnimation={false}
      markerZoomAnimation={false}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        keepBuffer={2}
        updateWhenIdle
        updateInterval={200}
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <Polygon
        positions={MAP_MASK}
        interactive={false}
        pathOptions={{ color: 'transparent', fillColor: '#f8f6f1', fillOpacity: 1, stroke: false }}
      />
      <Polyline
        positions={WASHINGTON_OUTLINE}
        interactive={false}
        pathOptions={{ color: '#2f5d46', opacity: 0.65, weight: 1.5 }}
      />
      <ViewportTrailLoader />
      <RecenterMap trail={selected} />
      {filteredTrails.map(trail => (
        <CircleMarker
          key={trail.id}
          center={[trail.lat, trail.lng]}
          radius={selectedTrailId === trail.id ? 9 : 6}
          pathOptions={{
            color: selectedTrailId === trail.id ? '#1a2e1e' : '#ffffff',
            fillColor: getPinColor(trail),
            fillOpacity: 1,
            opacity: 1,
            weight: selectedTrailId === trail.id ? 3 : 2,
          }}
          eventHandlers={{ click: () => setSelectedTrailId(trail.id) }}
        />
      ))}
    </MapContainer>
  )
}
