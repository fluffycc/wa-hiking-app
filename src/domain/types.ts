// ─── Enums / Unions ──────────────────────────────────────────────────────────

export type WARegion =
  | 'Olympic Peninsula'
  | 'North Cascades'
  | 'Central Cascades'
  | 'Snoqualmie Region'
  | 'South Cascades'
  | 'Eastern Washington'
  | 'Puget Sound & Islands'
  | 'Southwest Washington'

export type Difficulty   = 'Easy' | 'Moderate' | 'Hard' | 'Strenuous'
export type RouteType    = 'Loop' | 'OutAndBack' | 'PointToPoint'
export type LandOwner    = 'DNR' | 'WDFW' | 'StateParks' | 'USFS' | 'NPS' | 'County' | 'City' | 'Other'
export type Confidence   = 'high' | 'medium' | 'low'

export type ParkingPassType  = 'free' | 'discover_pass' | 'nw_forest_pass' | 'national_park_fee' | 'unknown'
export type AccessLevel      = 'sedan_ok' | 'rough' | 'high_clearance' | '4x4_only' | 'unknown'
export type ConditionOverall = 'go' | 'caution' | 'avoid' | 'unknown'

// ─── Trail ───────────────────────────────────────────────────────────────────

export interface Trail {
  id: string
  name: string
  region: WARegion
  lat: number
  lng: number
  miles: number
  elevationGainFt: number
  difficulty: Difficulty
  routeType: RouteType
  landOwner: LandOwner
  parking: {
    type: ParkingPassType
    notes?: string
    confidence: Confidence
  }
  access: {
    level: AccessLevel
    notes?: string
    confidence: Confidence
  }
  conditions: {
    overall: ConditionOverall
    snow: 'none' | 'patchy' | 'significant'
    mud: 'dry' | 'some' | 'heavy'
    bugs: 'none' | 'some' | 'bad'
    weatherHint?: string
    lastUpdatedISO?: string
    notes: string[]
  }
}

// ─── Feedback ────────────────────────────────────────────────────────────────

export type FeedbackType = 'bug' | 'feature' | 'data' | 'general'

export interface AppFeedback {
  id: string
  type: FeedbackType
  message: string
  trailId?: string
  url?: string
  userAgent?: string
  createdAt: string // ISO 8601
}

export interface FeedbackPayload {
  type: FeedbackType
  message: string
  trailId?: string
  url: string
  userAgent: string
  createdAt: string
}
