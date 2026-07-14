import { GPSPoint } from '../types';

/**
 * Calculates distance in meters between two GPS coordinates using the Haversine formula.
 */
export function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // In meters
}

/**
 * Formats a distance in meters into a readable string (m or km).
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Formats duration in seconds into HH:MM:SS or MM:SS.
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

/**
 * Calculates average speed in km/h given distance in meters and duration in seconds.
 */
export function calculateSpeed(meters: number, seconds: number): number {
  if (seconds <= 0) return 0;
  const km = meters / 1000;
  const hours = seconds / 3600;
  return km / hours;
}

/**
 * Calculates the rough area of a bounding box in square kilometers.
 */
export function getBboxAreaEstimation(sw: [number, number], ne: [number, number]): number {
  const latWidth = getDistance(sw[0], sw[1], ne[0], sw[1]);
  const lngWidth = getDistance(sw[0], sw[1], sw[0], ne[1]);
  const areaM2 = latWidth * lngWidth;
  return areaM2 / 1000000; // In square km
}

/**
 * Formats timestamp to localized string
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Calculates the area of a polygon using flat planar projection.
 * Extremely accurate for localized parcels and forest plots.
 * Coordinates are represented as an array of [lat, lng]
 */
export function calculatePolygonArea(coordinates: [number, number][]): number {
  if (coordinates.length < 3) return 0;
  
  const coords = [...coordinates];
  // Ensure we don't duplicate closed point in sum calculation but closing is good for Shoelace.
  if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
    coords.push(coords[0]);
  }

  // Find average latitude to use as planar projection scale factor
  let sumLat = 0;
  for (let i = 0; i < coords.length; i++) {
    sumLat += coords[i][0];
  }
  const avgLat = (sumLat / coords.length) * Math.PI / 180;

  // Earth Radius in meters
  const R = 6378137;
  
  // Project [lat, lng] to simple mercator-like flat meters
  const points = coords.map(c => {
    const latRad = c[0] * Math.PI / 180;
    const lngRad = c[1] * Math.PI / 180;
    return {
      x: R * lngRad * Math.cos(avgLat),
      y: R * latRad
    };
  });

  // Shoelace Area Formula
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    area += (points[i].x * points[i + 1].y) - (points[i + 1].x * points[i].y);
  }
  
  return Math.abs(area / 2); // returns area in square meters
}

/**
 * Calculates perimeter of a closed polygon in meters.
 */
export function calculatePolygonPerimeter(coordinates: [number, number][]): number {
  if (coordinates.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < coordinates.length; i++) {
    const pt1 = coordinates[i];
    const pt2 = coordinates[(i + 1) % coordinates.length];
    perimeter += getDistance(pt1[0], pt1[1], pt2[0], pt2[1]);
  }
  return perimeter;
}

/**
 * Formats area in m2 into m² or ha
 */
export function formatArea(areaM2: number): string {
  if (areaM2 < 10000) {
    return `${Math.round(areaM2).toLocaleString('vi-VN')} m²`;
  }
  const ha = areaM2 / 10000;
  return `${ha.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
}

/**
 * Simplifies a tracklog coordinate list using a simple distance-based threshold to reduce memory usage by up to 90%.
 */
export function simplifyPoints(points: GPSPoint[], toleranceMeters: number = 3): GPSPoint[] {
  if (points.length <= 2) return points;
  
  const result: GPSPoint[] = [points[0]];
  let lastPoint = points[0];
  
  for (let i = 1; i < points.length - 1; i++) {
    const dist = getDistance(lastPoint.lat, lastPoint.lng, points[i].lat, points[i].lng);
    // Only keep points that are further than toleranceMeters away from the last kept point,
    // or if the point has an altitude change of more than 5 meters (mountain climbing)
    const altitudeChange = Math.abs((points[i].altitude || 0) - (lastPoint.altitude || 0));
    
    if (dist >= toleranceMeters || altitudeChange > 5) {
      result.push(points[i]);
      lastPoint = points[i];
    }
  }
  
  result.push(points[points.length - 1]);
  return result;
}


