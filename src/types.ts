export interface GPSPoint {
  lat: number;
  lng: number;
  altitude?: number;
  timestamp: number;
  accuracy?: number;
  speed?: number; // m/s
}

export interface Tracklog {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  points: GPSPoint[];
  totalDistance: number; // in meters
  duration: number; // in seconds
  avgSpeed: number; // in km/h
  maxAltitude?: number; // in meters
  minAltitude?: number; // in meters
  notes?: string;
  isSynced: boolean;
  officerName?: string;
  patrolType?: string;
  fireRiskLevel?: string;
  weatherCondition?: string;
  isPatrol?: boolean;
}

export interface KmlFeature {
  id: string;
  name: string;
  type: 'polygon' | 'linestring' | 'point';
  coordinates: [number, number][] | [number, number][][]; // [lat, lng] array or array of arrays
  properties: {
    name?: string;
    description?: string;
    color?: string;
    fillColor?: string;
    [key: string]: any;
  };
}

export interface KmlLayer {
  id: string;
  name: string;
  fileName: string;
  features: KmlFeature[];
  visible: boolean;
  importedAt: number;
}

export interface OfflineRegion {
  id: string;
  name: string;
  bbox: {
    sw: [number, number]; // [lat, lng]
    ne: [number, number]; // [lat, lng]
  };
  zoomRange: [number, number];
  dateDownloaded: number;
  sizeKB: number;
  tilesCount: number;
  status: 'downloaded' | 'downloading' | 'failed';
}

export interface UserProfile {
  email: string;
  isLoggedIn: boolean;
  displayName: string;
  syncCount: number;
  lastSyncTime?: number;
  role?: 'master' | 'sub' | 'regular';
  assignedRegion?: string;
  masterEmail?: string;
}

export interface SubAccount {
  id: string;
  email: string;
  displayName: string;
  password?: string;
  assignedRegion: string;
  phone?: string;
  createdAt: number;
  syncCount: number;
}


export interface FireMeasurement {
  id: string;
  name: string;
  date: number;
  points: GPSPoint[];
  areaM2: number;
  perimeterM: number;
  notes?: string;
  isShared: boolean;
  sharedAt?: number;
  operatorName: string;
}

export interface ActiveOfficer {
  id: string;
  name: string;
  role: string;
  region: string;
  lat: number;
  lng: number;
  lastActive: number;
  status: 'idle' | 'patrolling' | 'mobilized';
  mobilizedToFireId?: string;
  phone?: string;
}
