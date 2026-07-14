/**
 * Utility for handling offline map tiles using the Cache Storage API.
 */

const CACHE_NAME = 'vinamap-tiles-v1';

/**
 * Normalizes tile URLs for caching.
 */
export const getTileUrl = (template: string, x: number, y: number, z: number): string => {
  return template
    .replace('{x}', x.toString())
    .replace('{y}', y.toString())
    .replace('{z}', z.toString())
    .replace('{s}', 'a'); // Default sub-domain
};

/**
 * Downloads a list of tiles for a given bounding box and zoom range.
 */
export const downloadTiles = async (
  template: string,
  sw: [number, number],
  ne: [number, number],
  minZoom: number,
  maxZoom: number,
  onProgress?: (progress: number, text: string) => void
): Promise<number> => {
  const cache = await caches.open(CACHE_NAME);
  let downloadedCount = 0;
  
  // Calculate total tiles first
  let totalTiles = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const swTile = latLngToTile(sw[0], sw[1], z);
    const neTile = latLngToTile(ne[0], ne[1], z);
    
    const minX = Math.min(swTile.x, neTile.x);
    const maxX = Math.max(swTile.x, neTile.x);
    const minY = Math.min(swTile.y, neTile.y);
    const maxY = Math.max(swTile.y, neTile.y);
    
    totalTiles += (maxX - minX + 1) * (maxY - minY + 1);
  }

  onProgress?.(0, `Bắt đầu tải ${totalTiles} mảnh bản đồ...`);

  for (let z = minZoom; z <= maxZoom; z++) {
    const swTile = latLngToTile(sw[0], sw[1], z);
    const neTile = latLngToTile(ne[0], ne[1], z);
    
    const minX = Math.min(swTile.x, neTile.x);
    const maxX = Math.max(swTile.x, neTile.x);
    const minY = Math.min(swTile.y, neTile.y);
    const maxY = Math.max(swTile.y, neTile.y);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const url = getTileUrl(template, x, y, z);
        
        try {
          // Check if already in cache
          const cached = await cache.match(url);
          if (!cached) {
            const response = await fetch(url, { mode: 'cors' });
            if (response.ok) {
              await cache.put(url, response);
            }
          }
          downloadedCount++;
          
          if (onProgress && downloadedCount % 5 === 0) {
            const progress = Math.round((downloadedCount / totalTiles) * 100);
            onProgress(progress, `Đang tải: ${downloadedCount}/${totalTiles} (Zoom ${z})`);
          }
        } catch (err) {
          console.error(`Failed to download tile: ${url}`, err);
        }
      }
    }
  }

  onProgress?.(100, `Hoàn tất tải ${downloadedCount} mảnh bản đồ.`);
  return downloadedCount;
};

/**
 * Helper to convert LatLng to Tile coordinates.
 */
function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

/**
 * Clears all cached tiles.
 */
export const clearTileCache = async () => {
  return caches.delete(CACHE_NAME);
};

/**
 * Fetches a tile, trying cache first then network.
 */
export const fetchTile = async (url: string): Promise<string> => {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(url);
  if (cachedResponse) {
    const blob = await cachedResponse.blob();
    return URL.createObjectURL(blob);
  }
  return url; // Return original URL if not cached
};
