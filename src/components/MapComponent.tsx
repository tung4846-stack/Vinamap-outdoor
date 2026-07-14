import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { Navigation, Compass, Loader2 } from 'lucide-react';
import { GPSPoint, KmlLayer, OfflineRegion, FireMeasurement, Tracklog, ActiveOfficer } from '../types';
import { formatDistance, formatArea, formatDateTime, formatDuration } from '../utils/geoUtils';

// Fix default marker icon issues in Leaflet bundler
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// CUSTOM TILE LAYER FOR OFFLINE SUPPORT
const OfflineTileLayer = L.TileLayer.extend({
  createTile: function(coords: any, done: any) {
    const tile = document.createElement('img');
    const url = this.getTileUrl(coords);
    
    // Use Cache API to serve tiles offline
    caches.open('vinamap-tiles-v1').then(cache => {
      cache.match(url).then(response => {
        if (response) {
          response.blob().then(blob => {
            const objectUrl = URL.createObjectURL(blob);
            tile.src = objectUrl;
            // Clean up object URL when tile is unloaded to prevent memory leaks
            L.DomEvent.on(tile, 'load', () => {
              // We don't revoke immediately because it might still be needed for painting
            });
          });
        } else {
          // If not in cache, try network
          tile.src = url;
        }
      });
    });

    L.DomEvent.on(tile, 'load', L.Util.bind((this as any)._tileOnLoad, this, done, tile));
    L.DomEvent.on(tile, 'error', L.Util.bind((this as any)._tileOnError, this, done, tile));

    return tile;
  }
});

const createOfflineTileLayer = (url: string, options: any) => {
  return new (OfflineTileLayer as any)(url, options);
};

interface MapComponentProps {
  currentLocation: GPSPoint | null;
  tracklogPoints: GPSPoint[];
  kmlLayers: KmlLayer[];
  activeMapStyle: 'standard' | 'topo' | 'dark' | 'satellite';
  onBboxChange?: (sw: [number, number], ne: [number, number]) => void;
  isOfflineSelectionActive: boolean;
  downloadedRegions: OfflineRegion[];
  focusCoords: [number, number] | null;
  onFocusHandled: () => void;
  selectedLabelAttribute?: string;
  onUpdateCurrentLocation?: (location: GPSPoint) => void;
  
  // NEW PROPS FOR FIRE MEASUREMENT
  activeFirePoints?: GPSPoint[];
  savedFireMeasurements?: FireMeasurement[];
  visibleFireIds?: string[];

  // EXTENDED PATROL & MOBILIZATION PROPS
  savedTracklogs?: Tracklog[];
  visibleTrackIds?: string[];
  activePatrolOfficers?: ActiveOfficer[];

  // CLICK ACTION & INSPECTION PROPS
  inspectedPoint?: GPSPoint | null;
  onMapClick?: (lat: number, lng: number) => void;
}

const MAP_TILE_URLS = {
  standard: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  topo: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};

const MAP_TILE_ATTRIBUTIONS = {
  standard: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  topo: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  dark: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  satellite: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
};

export const MapComponent: React.FC<MapComponentProps> = ({
  currentLocation,
  tracklogPoints,
  kmlLayers,
  activeMapStyle,
  onBboxChange,
  isOfflineSelectionActive,
  downloadedRegions,
  focusCoords,
  onFocusHandled,
  selectedLabelAttribute = 'none',
  onUpdateCurrentLocation,
  activeFirePoints = [],
  savedFireMeasurements = [],
  visibleFireIds = [],
  savedTracklogs = [],
  visibleTrackIds = [],
  activePatrolOfficers = [],
  inspectedPoint = null,
  onMapClick,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  
  // Layer groups for active updates
  const gpsMarkerRef = useRef<L.Marker | null>(null);
  const gpsAccuracyCircleRef = useRef<L.Circle | null>(null);
  const trackPolylineRef = useRef<L.Polyline | null>(null);
  const kmlLayersGroupRef = useRef<L.FeatureGroup | null>(null);
  const kmlLabelsGroupRef = useRef<L.LayerGroup | null>(null);
  const kmlLabelsDataRef = useRef<{lat: number, lng: number, text: string}[]>([]);
  const downloadedRegionsGroupRef = useRef<L.FeatureGroup | null>(null);
  const bboxSelectorRectangleRef = useRef<L.Rectangle | null>(null);
  const inspectedMarkerRef = useRef<L.Marker | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // References for fire measurements
  const activeFirePolygonRef = useRef<L.Polygon | null>(null);
  const activeFireMarkersGroupRef = useRef<L.FeatureGroup | null>(null);
  const savedFirePolygonsGroupRef = useRef<L.FeatureGroup | null>(null);

  // Keep onMapClick fresh inside map closure using a Ref
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);


  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Default fallback: Cat Tien National Park, Vietnam
    let initialLat = 11.4253;
    let initialLng = 107.4289;
    let initialZoom = 13;

    // Check if we can center to a better location immediately on load to avoid hardcoded defaults
    if (currentLocation) {
      initialLat = currentLocation.lat;
      initialLng = currentLocation.lng;
      initialZoom = 14;
    } else if (savedTracklogs && savedTracklogs.length > 0) {
      // Find the first point of the most recent saved tracklog
      const lastTrack = savedTracklogs[savedTracklogs.length - 1];
      if (lastTrack.points && lastTrack.points.length > 0) {
        initialLat = lastTrack.points[0].lat;
        initialLng = lastTrack.points[0].lng;
        initialZoom = 14;
      }
    }

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: initialZoom,
      zoomControl: false, // We'll place zoom control at the bottom right
      preferCanvas: true, // Render vectors via Canvas rather than SVG to optimize performance dramatically
    });

    // Toggle a class based on zoom level to hide dense labels at lower zoom levels and prevent lag
    const handleZoomClasses = () => {
      const z = map.getZoom();
      const container = map.getContainer();
      container.classList.remove('leaflet-zoom-low', 'leaflet-zoom-medium', 'leaflet-zoom-high');
      if (z < 14) {
        container.classList.add('leaflet-zoom-low');
      } else if (z >= 14 && z < 16) {
        container.classList.add('leaflet-zoom-medium');
      } else {
        container.classList.add('leaflet-zoom-high');
      }
    };
    map.on('zoomend', handleZoomClasses);
    handleZoomClasses(); // Initial run

    // Add zoom control manually
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    tileLayerRef.current = createOfflineTileLayer(MAP_TILE_URLS[activeMapStyle], {
      attribution: MAP_TILE_ATTRIBUTIONS[activeMapStyle],
      maxZoom: 19,
    }).addTo(map);

    // Initialize groups
    kmlLayersGroupRef.current = L.featureGroup().addTo(map);
    kmlLabelsGroupRef.current = L.layerGroup().addTo(map);
    downloadedRegionsGroupRef.current = L.featureGroup().addTo(map);

    mapRef.current = map;

    // Set up click listener on map to allow custom coordinates inspection
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onMapClickRef.current) {
        onMapClickRef.current(e.latlng.lat, e.latlng.lng);
      }
    });

    // Track bounding box changes for offline selection
    const handleMove = () => {
      if (onBboxChange) {
        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        onBboxChange([sw.lat, sw.lng], [ne.lat, ne.lng]);
      }
    };

    map.on('move', handleMove);
    map.on('zoomend', handleMove);

    // Initial trigger
    handleMove();

    return () => {
      map.off('move', handleMove);
      map.off('zoomend', handleMove);
      map.off('zoomend', handleZoomClasses);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync Map Style (Tiles URL and attributions)
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    tileLayerRef.current.setUrl(MAP_TILE_URLS[activeMapStyle]);
    // Force updating attribution
    mapRef.current.attributionControl.remove();
    mapRef.current.attributionControl = L.control.attribution({
      prefix: false,
    }).addTo(mapRef.current);
    tileLayerRef.current.options.attribution = MAP_TILE_ATTRIBUTIONS[activeMapStyle];
    tileLayerRef.current.addEventParent(mapRef.current);
  }, [activeMapStyle]);

  // Focus Coordinate Changes
  useEffect(() => {
    if (focusCoords && mapRef.current) {
      mapRef.current.setView(focusCoords, 14, { animate: true });
      onFocusHandled();
    }
  }, [focusCoords, onFocusHandled]);

  // Proactively auto-center to the active GPS position or recent tracklog once when they become available after mount
  const hasInitialCenteredRef = useRef(false);
  useEffect(() => {
    if (!mapRef.current) return;
    if (hasInitialCenteredRef.current) return;

    if (currentLocation) {
      mapRef.current.setView([currentLocation.lat, currentLocation.lng], 14, { animate: true });
      hasInitialCenteredRef.current = true;
    } else if (savedTracklogs && savedTracklogs.length > 0) {
      const lastTrack = savedTracklogs[savedTracklogs.length - 1];
      if (lastTrack.points && lastTrack.points.length > 0) {
        const lastPt = lastTrack.points[0];
        mapRef.current.setView([lastPt.lat, lastPt.lng], 14, { animate: true });
        hasInitialCenteredRef.current = true;
      }
    }
  }, [currentLocation, savedTracklogs]);

  // Sync GPS Live Marker
  useEffect(() => {
    if (!mapRef.current) return;

    if (currentLocation) {
      const position: L.LatLngExpression = [currentLocation.lat, currentLocation.lng];

      // Custom high-visibility cursor for GPS
      const gpsIcon = L.divIcon({
        className: 'custom-gps-icon',
        html: `
          <div class="relative w-4 h-4 flex items-center justify-center">
            <div class="absolute w-3 h-3 bg-[#FF4444] rounded-full border border-white shadow-md z-10 animate-pulse"></div>
            <div class="gps-pulse-ring"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      if (!gpsMarkerRef.current) {
        gpsMarkerRef.current = L.marker(position, { icon: gpsIcon }).addTo(mapRef.current);
      } else {
        gpsMarkerRef.current.setLatLng(position);
      }

      // Draw GPS Accuracy circle
      if (currentLocation.accuracy !== undefined) {
        // Red / Orange if accuracy is poor, green/blue if accuracy is high
        const color = currentLocation.accuracy <= 5 ? '#3B82F6' : currentLocation.accuracy <= 15 ? '#F59E0B' : '#EF4444';
        const fillOpacity = currentLocation.accuracy <= 5 ? 0.15 : 0.08;

        if (!gpsAccuracyCircleRef.current) {
          gpsAccuracyCircleRef.current = L.circle(position, {
            radius: currentLocation.accuracy,
            color: color,
            weight: 1,
            fillColor: color,
            fillOpacity: fillOpacity,
            interactive: false
          }).addTo(mapRef.current);
        } else {
          gpsAccuracyCircleRef.current.setLatLng(position);
          gpsAccuracyCircleRef.current.setRadius(currentLocation.accuracy);
          gpsAccuracyCircleRef.current.setStyle({ color: color, fillColor: color, fillOpacity: fillOpacity });
        }
      } else {
        if (gpsAccuracyCircleRef.current) {
          gpsAccuracyCircleRef.current.remove();
          gpsAccuracyCircleRef.current = null;
        }
      }
    } else {
      if (gpsMarkerRef.current) {
        gpsMarkerRef.current.remove();
        gpsMarkerRef.current = null;
      }
      if (gpsAccuracyCircleRef.current) {
        gpsAccuracyCircleRef.current.remove();
        gpsAccuracyCircleRef.current = null;
      }
    }
  }, [currentLocation]);

  // Sync Clicked/Inspected Point Marker
  useEffect(() => {
    if (!mapRef.current) return;

    if (inspectedPoint) {
      const pos: L.LatLngExpression = [inspectedPoint.lat, inspectedPoint.lng];

      const customIcon = L.divIcon({
        className: 'custom-inspected-icon',
        html: `
          <div class="relative w-8 h-8 flex items-center justify-center">
            <!-- Pulsing outer gold ring -->
            <div class="absolute w-6 h-6 rounded-full border-2 border-[#FFD700] animate-ping bg-[#FFD700]/20"></div>
            <!-- Pin shape or concentric circles -->
            <div class="w-5 h-5 bg-[#FFD700] rounded-full border-2 border-white shadow-lg flex items-center justify-center text-[10px] text-black font-black">📍</div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      if (!inspectedMarkerRef.current) {
        inspectedMarkerRef.current = L.marker(pos, { icon: customIcon }).addTo(mapRef.current);
      } else {
        inspectedMarkerRef.current.setLatLng(pos);
      }
    } else {
      if (inspectedMarkerRef.current) {
        inspectedMarkerRef.current.remove();
        inspectedMarkerRef.current = null;
      }
    }
  }, [inspectedPoint]);

  // Sync Active Tracklog Polyline
  useEffect(() => {
    if (!mapRef.current) return;

    const latLngs = tracklogPoints.map((pt) => [pt.lat, pt.lng] as L.LatLngExpression);

    if (latLngs.length > 1) {
      if (!trackPolylineRef.current) {
        // High visibility red line with thick casing
        trackPolylineRef.current = L.polyline(latLngs, {
          color: '#FF4444',
          weight: 6,
          opacity: 0.9,
          lineJoin: 'round',
        }).addTo(mapRef.current);
      } else {
        trackPolylineRef.current.setLatLngs(latLngs);
      }
    } else {
      if (trackPolylineRef.current) {
        trackPolylineRef.current.remove();
        trackPolylineRef.current = null;
      }
    }
  }, [tracklogPoints]);

  // Sync Bounding Box Selection for Offline Download
  useEffect(() => {
    if (!mapRef.current) return;

    if (isOfflineSelectionActive) {
      const updateRectangle = () => {
        if (!mapRef.current) return;
        const bounds = mapRef.current.getBounds();
        
        // Shrink bounds slightly to display inner crop rectangle clearly
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        
        const padLat = (ne.lat - sw.lat) * 0.1;
        const padLng = (ne.lng - sw.lng) * 0.1;
        
        const innerSw = L.latLng(sw.lat + padLat, sw.lng + padLng);
        const innerNe = L.latLng(ne.lat - padLat, ne.lng - padLng);
        const innerBounds = L.latLngBounds(innerSw, innerNe);

        if (!bboxSelectorRectangleRef.current) {
          bboxSelectorRectangleRef.current = L.rectangle(innerBounds, {
            color: '#FFD700', // Gold
            weight: 3,
            fillColor: '#FFD700',
            fillOpacity: 0.15,
            dashArray: '8, 8',
          }).addTo(mapRef.current);
        } else {
          bboxSelectorRectangleRef.current.setBounds(innerBounds);
        }

        if (onBboxChange) {
          onBboxChange([innerSw.lat, innerSw.lng], [innerNe.lat, innerNe.lng]);
        }
      };

      updateRectangle();
      mapRef.current.on('move', updateRectangle);
      mapRef.current.on('zoomend', updateRectangle);

      return () => {
        if (mapRef.current) {
          mapRef.current.off('move', updateRectangle);
          mapRef.current.off('zoomend', updateRectangle);
        }
        if (bboxSelectorRectangleRef.current) {
          bboxSelectorRectangleRef.current.remove();
          bboxSelectorRectangleRef.current = null;
        }
      };
    } else {
      if (bboxSelectorRectangleRef.current) {
        bboxSelectorRectangleRef.current.remove();
        bboxSelectorRectangleRef.current = null;
      }
    }
  }, [isOfflineSelectionActive]);

  // Sync Downloaded Offline Regions Bounding Boxes
  useEffect(() => {
    if (!mapRef.current || !downloadedRegionsGroupRef.current) return;

    downloadedRegionsGroupRef.current.clearLayers();

    downloadedRegions.forEach((region) => {
      const bounds = L.latLngBounds(region.bbox.sw, region.bbox.ne);
      const rect = L.rectangle(bounds, {
        color: '#00FF41', // Neon green
        weight: 1.5,
        fillColor: '#00FF41',
        fillOpacity: 0.05,
      });

      // Bind tooltips with region details
      rect.bindTooltip(`<b>${region.name}</b><br/>${(region.sizeKB / 1024).toFixed(2)} MB`, {
        permanent: false,
        direction: 'center',
        className: 'bg-black/95 border border-white/10 text-white px-2 py-1 text-xs font-sans font-bold rounded shadow-lg opacity-90',
      });

      rect.addTo(downloadedRegionsGroupRef.current!);
    });
  }, [downloadedRegions]);

  // Sync Active Fire Measurement Polygon & Nodes
  useEffect(() => {
    if (!mapRef.current) return;

    if (!activeFireMarkersGroupRef.current) {
      activeFireMarkersGroupRef.current = L.featureGroup().addTo(mapRef.current);
    }
    activeFireMarkersGroupRef.current.clearLayers();

    const coords = activeFirePoints.map((pt) => [pt.lat, pt.lng] as L.LatLngExpression);

    if (coords.length >= 2) {
      if (!activeFirePolygonRef.current) {
        activeFirePolygonRef.current = L.polygon(coords, {
          color: '#FF4500', // Neon Orange-Red
          weight: 3.5,
          dashArray: '6, 6',
          fillColor: '#FF4500',
          fillOpacity: 0.25,
        }).addTo(mapRef.current);
      } else {
        activeFirePolygonRef.current.setLatLngs(coords);
      }

      // Draw interactive circle markers for each GPS point
      activeFirePoints.forEach((pt, index) => {
        const marker = L.circleMarker([pt.lat, pt.lng], {
          radius: 5,
          color: '#FFFFFF',
          weight: 1.5,
          fillColor: '#FF4500',
          fillOpacity: 1,
        });
        marker.bindTooltip(`Điểm #${index + 1}`, { 
          direction: 'top', 
          className: 'bg-black text-white px-2 py-0.5 text-[9px] font-bold rounded border border-white/10' 
        });
        marker.addTo(activeFireMarkersGroupRef.current!);
      });
    } else {
      if (activeFirePolygonRef.current) {
        activeFirePolygonRef.current.remove();
        activeFirePolygonRef.current = null;
      }
    }
  }, [activeFirePoints]);

  // Sync Saved Fire Measurements Polygons
  useEffect(() => {
    if (!mapRef.current) return;

    if (!savedFirePolygonsGroupRef.current) {
      savedFirePolygonsGroupRef.current = L.featureGroup().addTo(mapRef.current);
    }
    savedFirePolygonsGroupRef.current.clearLayers();

    savedFireMeasurements.forEach((m) => {
      const isVisible = visibleFireIds.includes(m.id);
      if (!isVisible) return;

      const coords = m.points.map((pt) => [pt.lat, pt.lng] as L.LatLngExpression);
      if (coords.length >= 3) {
        const poly = L.polygon(coords, {
          color: m.isShared ? '#00FF41' : '#FF4500', // Green if transmitted, Orange-Red if local
          weight: 3,
          fillColor: m.isShared ? '#00FF41' : '#FF4500',
          fillOpacity: m.isShared ? 0.2 : 0.3,
        });

        const formattedArea = formatArea(m.areaM2);
        const formattedPerimeter = formatDistance(m.perimeterM);
        const dateStr = formatDateTime(m.date);

        // Tooltip displaying details on map
        poly.bindTooltip(
          `🌳 <b>${m.name}</b><br/>🔥 Diện tích: <span style="color:#FFD700; font-weight:800;">${formattedArea}</span>`,
          {
            permanent: true,
            direction: 'center',
            className: 'custom-fire-tooltip',
            interactive: false,
          }
        );

        // Full popup detailing
        poly.bindPopup(`
          <div class="p-4 font-sans text-white w-[260px]">
            <h4 class="text-sm font-black border-b border-white/10 pb-2 mb-2 uppercase flex items-center gap-2" style="color: ${m.isShared ? '#00FF41' : '#FF4500'};">
              <span>${m.isShared ? '🟢' : '🔥'}</span>
              <span>${m.name}</span>
            </h4>
            <div class="flex flex-col gap-2 text-xs">
              <div class="flex justify-between items-center"><span class="text-white/50 font-bold">Diện tích:</span><span class="text-[#FFD700] font-black text-sm bg-white/5 px-2 py-0.5 rounded">${formattedArea}</span></div>
              <div class="flex justify-between"><span class="text-white/50 font-medium">Chu vi khu vực:</span><span class="text-gray-200 font-bold font-mono">${formattedPerimeter}</span></div>
              <div class="flex justify-between"><span class="text-white/50 font-medium">Cán bộ đo:</span><span class="text-gray-300 font-extrabold">${m.operatorName}</span></div>
              <div class="flex justify-between"><span class="text-white/50 font-medium">Thời gian đo:</span><span class="text-gray-400 font-mono">${dateStr}</span></div>
              <div class="flex justify-between pt-2 border-t border-white/5 items-center"><span class="text-white/40 text-[10px] uppercase font-bold">Trạng thái:</span><span class="${m.isShared ? 'text-[#00FF41]' : 'text-[#FFD700]'} font-extrabold uppercase tracking-wider text-[10px] bg-white/5 px-1.5 py-0.5 rounded">${m.isShared ? 'Đã gửi máy chủ P.Kỹ thuật' : 'Lưu cục bộ ngoại nghiệp'}</span></div>
            </div>
          </div>
        `, { className: 'high-contrast-popup' });

        poly.addTo(savedFirePolygonsGroupRef.current!);
      }
    });
  }, [savedFireMeasurements, visibleFireIds]);

  // Sync Saved Tracklogs Polylines (For Multiple Track Display)
  const savedTracksGroupRef = useRef<L.FeatureGroup | null>(null);
  useEffect(() => {
    if (!mapRef.current) return;

    if (!savedTracksGroupRef.current) {
      savedTracksGroupRef.current = L.featureGroup().addTo(mapRef.current);
    }
    savedTracksGroupRef.current.clearLayers();

    if (!savedTracklogs) return;

    savedTracklogs.forEach((track) => {
      const isVisible = visibleTrackIds?.includes(track.id);
      if (!isVisible) return;

      const coords = track.points.map((pt) => [pt.lat, pt.lng] as L.LatLngTuple);
      if (coords.length >= 2) {
        const poly = L.polyline(coords, {
          color: track.isPatrol ? '#F97316' : '#3B82F6', // Orange for Patrol, Blue for Regular
          weight: 4,
          opacity: 0.85,
          dashArray: track.isPatrol ? '2, 6' : undefined, // Dashed line for dry season patrols!
        });

        poly.bindTooltip(
          `<b>🏃 Lộ trình: ${track.name}</b><br/>
           👤 Cán bộ: <span style="color:#00FF41;font-weight:700;">${track.officerName || 'Kiểm lâm viên'}</span><br/>
           📏 Cự ly: ${formatDistance(track.totalDistance)}`,
          {
            direction: 'top',
            className: 'custom-map-label-tooltip',
          }
        );

        // Details Popup
        poly.bindPopup(`
          <div class="p-4 font-sans text-white w-[260px]">
            <h4 class="text-sm font-black border-b border-white/10 pb-2 mb-2 uppercase flex items-center gap-2" style="color: ${track.isPatrol ? '#F97316' : '#3B82F6'};">
              <span>${track.isPatrol ? '🔥' : '🏃'}</span>
              <span>${track.name}</span>
            </h4>
            <div class="flex flex-col gap-2 text-xs">
              <div class="flex justify-between"><span class="text-white/50 font-medium">Hành trình:</span><span class="text-white font-bold">${track.isPatrol ? 'Tuần tra mùa nắng' : 'Dã ngoại thường niên'}</span></div>
              <div class="flex justify-between"><span class="text-white/50 font-medium">Cự ly:</span><span class="text-[#FFD700] font-black">${formatDistance(track.totalDistance)}</span></div>
              <div class="flex justify-between"><span class="text-white/50 font-medium">Cán bộ thực hiện:</span><span class="text-[#00FF41] font-bold">${track.officerName || 'Ngoại nghiệp'}</span></div>
              ${track.isPatrol ? `
                <div class="flex justify-between"><span class="text-white/50 font-medium">Cấp cháy rừng:</span><span class="text-red-400 font-bold">${track.fireRiskLevel || 'Cấp V'}</span></div>
                <div class="flex justify-between"><span class="text-white/50 font-medium">Thời tiết:</span><span class="text-gray-300">${track.weatherCondition || 'Nắng khô'}</span></div>
              ` : ''}
              <div class="flex justify-between"><span class="text-white/50 font-medium">Vận tốc TB:</span><span class="text-gray-200 font-mono">${track.avgSpeed.toFixed(1)} km/h</span></div>
              <div class="flex justify-between"><span class="text-white/50 font-medium">Thời lượng:</span><span class="text-gray-300 font-mono">${formatDuration(track.duration)}</span></div>
            </div>
          </div>
        `, { className: 'high-contrast-popup' });

        poly.addTo(savedTracksGroupRef.current!);
      }
    });
  }, [savedTracklogs, visibleTrackIds]);

  // Sync Active Patrol Officers and Mobilization lines
  const patrolOfficersGroupRef = useRef<L.FeatureGroup | null>(null);
  const mobilizationLinesGroupRef = useRef<L.FeatureGroup | null>(null);
  useEffect(() => {
    if (!mapRef.current) return;

    if (!patrolOfficersGroupRef.current) {
      patrolOfficersGroupRef.current = L.featureGroup().addTo(mapRef.current);
    }
    patrolOfficersGroupRef.current.clearLayers();

    if (!mobilizationLinesGroupRef.current) {
      mobilizationLinesGroupRef.current = L.featureGroup().addTo(mapRef.current);
    }
    mobilizationLinesGroupRef.current.clearLayers();

    if (!activePatrolOfficers) return;

    activePatrolOfficers.forEach((officer) => {
      // Choose Icon Color and pulse style based on status
      const isMobilized = officer.status === 'mobilized';
      
      const officerIcon = L.divIcon({
        className: 'custom-officer-marker',
        html: `
          <div class="relative flex items-center justify-center">
            <!-- Pulsing outer ring -->
            <div class="absolute w-8 h-8 rounded-full border-2 ${
              isMobilized 
                ? 'border-red-500 animate-ping bg-red-500/20' 
                : 'border-emerald-400 animate-pulse bg-emerald-400/20'
            }"></div>
            <!-- Core solid circle with SVG of a person or custom outline -->
            <div class="w-6 h-6 rounded-full flex items-center justify-center shadow-lg border border-white font-bold text-[9px] text-white z-10" style="background-color: ${
              isMobilized ? '#FF4444' : '#10B981'
            };">
              ${isMobilized ? '🚨' : '💂'}
            </div>
            <!-- Text badge for officer name -->
            <div class="absolute -bottom-6 left-1/2 transform -translate-x-1/2 bg-black/95 border border-white/10 text-white text-[9px] font-bold px-1 py-0.5 rounded whitespace-nowrap shadow-sm">
              ${officer.name.split(' ').pop()} (${officer.region})
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([officer.lat, officer.lng], { icon: officerIcon });

      // Build Popup with Tactical Info
      let closestFireText = 'Không có báo động cháy';
      if (savedFireMeasurements && savedFireMeasurements.length > 0) {
        // Find nearest fire center
        let minDistance = Infinity;
        let nearestFireName = '';
        
        savedFireMeasurements.forEach((fire) => {
          if (fire.points.length > 0) {
            const fireCenter = fire.points[0]; // Simple centroid approximation
            const dist = L.latLng(officer.lat, officer.lng).distanceTo(L.latLng(fireCenter.lat, fireCenter.lng));
            if (dist < minDistance) {
              minDistance = dist;
              nearestFireName = fire.name;
            }
          }
        });

        if (minDistance !== Infinity) {
          closestFireText = `Cách đám cháy [<b>${nearestFireName}</b>]: <span class="text-[#FFD700] font-bold">${(minDistance / 1000).toFixed(2)} km</span>`;
        }
      }

      const popupHtml = `
        <div class="p-3.5 font-sans text-white w-[260px]">
          <h4 class="text-sm font-black border-b border-white/10 pb-1.5 mb-2 flex items-center gap-1.5">
            <span class="text-base">${isMobilized ? '🚨' : '🟢'}</span>
            <span class="text-white">${officer.name}</span>
          </h4>
          <div class="flex flex-col gap-1.5 text-xs">
            <div class="flex justify-between"><span class="text-white/40">Vai trò:</span><span class="text-gray-200 font-semibold">${officer.role}</span></div>
            <div class="flex justify-between"><span class="text-white/40">Khu vực phụ trách:</span><span class="text-[#00FF41] font-bold">${officer.region}</span></div>
            <div class="flex justify-between"><span class="text-white/40">Trạng thái:</span><span class="${
              isMobilized ? 'text-red-400 font-black animate-pulse' : 'text-emerald-400 font-bold'
            }">${isMobilized ? 'ĐIỀU ĐỘNG KHẨN CẤP' : 'Đang tuần tra mùa khô'}</span></div>
            ${officer.phone ? `<div class="flex justify-between"><span class="text-white/40">Liên hệ:</span><span class="text-sky-400 font-mono font-bold">${officer.phone}</span></div>` : ''}
            <div class="border-t border-white/5 pt-1.5 mt-1 text-[11px] text-white/80">
              📍 ${closestFireText}
            </div>
            <div class="text-[9px] text-white/30 font-mono mt-1 text-right">
              Cập nhật: ${new Date(officer.lastActive).toLocaleTimeString('vi-VN')}
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { className: 'high-contrast-popup' });
      marker.addTo(patrolOfficersGroupRef.current!);

      // Draw Direct Dispatch Mobilization Line if officer is mobilized
      if (isMobilized) {
        let targetCoords: L.LatLngTuple | null = null;
        
        if (officer.mobilizedToFireId) {
          const matchFire = savedFireMeasurements.find(f => f.id === officer.mobilizedToFireId);
          if (matchFire && matchFire.points.length > 0) {
            targetCoords = [matchFire.points[0].lat, matchFire.points[0].lng];
          }
        } else if (savedFireMeasurements && savedFireMeasurements.length > 0) {
          // Fallback to closest fire
          let minDistance = Infinity;
          let closestFire: FireMeasurement | null = null;
          savedFireMeasurements.forEach((fire) => {
            if (fire.points.length > 0) {
              const dist = L.latLng(officer.lat, officer.lng).distanceTo(L.latLng(fire.points[0].lat, fire.points[0].lng));
              if (dist < minDistance) {
                minDistance = dist;
                closestFire = fire;
              }
            }
          });
          if (closestFire) {
            targetCoords = [(closestFire as FireMeasurement).points[0].lat, (closestFire as FireMeasurement).points[0].lng];
          }
        }

        if (targetCoords) {
          const mLine = L.polyline([[officer.lat, officer.lng], targetCoords], {
            color: '#FF4444',
            weight: 3,
            opacity: 0.8,
            dashArray: '5, 8',
          });

          mLine.bindTooltip('🚨 Lực lượng di chuyển tiếp ứng dập lửa', {
            sticky: true,
            className: 'bg-red-900 border border-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow'
          });

          mLine.addTo(mobilizationLinesGroupRef.current!);
        }
      }
    });
  }, [activePatrolOfficers, savedFireMeasurements]);


  // High-performance KML Labels Culling (Virtualization)
  const updateKmlLabels = useCallback(() => {
    if (!mapRef.current || !kmlLabelsGroupRef.current) return;
    const map = mapRef.current;
    
    kmlLabelsGroupRef.current.clearLayers();
    
    // Cull if zoomed out too far to prevent clutter & lag
    if (map.getZoom() < 13) return;

    const bounds = map.getBounds().pad(0.1);
    
    kmlLabelsDataRef.current.forEach(lbl => {
      if (bounds.contains([lbl.lat, lbl.lng])) {
        const icon = L.divIcon({
          html: `<div class="custom-map-label-div">${lbl.text}</div>`,
          className: 'custom-map-label-wrapper',
          iconSize: undefined
        });
        L.marker([lbl.lat, lbl.lng], { icon, interactive: false }).addTo(kmlLabelsGroupRef.current!);
      }
    });
  }, []);

  // Sync KML Labels on map movement
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.on('moveend', updateKmlLabels);
    map.on('zoomend', updateKmlLabels);
    return () => {
      map.off('moveend', updateKmlLabels);
      map.off('zoomend', updateKmlLabels);
    };
  }, [updateKmlLabels]);

  // Sync KML Overlays
  useEffect(() => {
    if (!mapRef.current || !kmlLayersGroupRef.current) return;

    kmlLayersGroupRef.current.clearLayers();
    kmlLabelsDataRef.current = [];

    let shouldFitBounds = false;
    const boundsToFit = L.latLngBounds([]);

    kmlLayers.forEach((layer) => {
      if (!layer.visible) return;

      layer.features.forEach((feature) => {
        let leafletLayer: L.Layer | null = null;

        if (feature.type === 'polygon') {
          leafletLayer = L.polygon(feature.coordinates as L.LatLngExpression[], {
            color: feature.properties.color || '#FFD700',
            fillColor: feature.properties.fillColor || 'rgba(255, 215, 0, 0.2)',
            weight: 3,
            fillOpacity: 0.3,
          });
          
          // Expand bounds
          (feature.coordinates as [number, number][]).forEach((coord) => {
            boundsToFit.extend(coord);
          });
          shouldFitBounds = true;

        } else if (feature.type === 'linestring') {
          leafletLayer = L.polyline(feature.coordinates as L.LatLngExpression[], {
            color: feature.properties.color || '#EF4444',
            weight: 4,
            opacity: 0.8,
          });

          // Expand bounds
          (feature.coordinates as [number, number][]).forEach((coord) => {
            boundsToFit.extend(coord);
          });
          shouldFitBounds = true;

        } else if (feature.type === 'point') {
          const pointCoords = feature.coordinates[0] as [number, number];
          const customMarkerIcon = L.divIcon({
            className: 'custom-poi-marker',
            html: `
              <div class="flex items-center justify-center relative">
                <div class="w-8 h-8 rounded-full flex items-center justify-center shadow-lg border border-white" style="background-color: ${feature.properties.color || '#FFD700'}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="10" r="3"/>
                    <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/>
                  </svg>
                </div>
                <div class="absolute -bottom-6 left-1/2 transform -translate-x-1/2 bg-black/95 border border-white/10 text-[#FFD700] text-[10px] font-bold px-1 py-0.5 rounded whitespace-nowrap shadow-sm animate-fade-in">
                  ${feature.name}
                </div>
              </div>
            `,
            iconSize: [32, 40],
            iconAnchor: [16, 20],
          });

          leafletLayer = L.marker(pointCoords, { icon: customMarkerIcon });
          boundsToFit.extend(pointCoords);
          shouldFitBounds = true;
        }

        if (leafletLayer) {
          // Calculate high-performance dynamic label points
          if (selectedLabelAttribute !== 'none') {
            let labelText = '';
            if (selectedLabelAttribute === 'name') {
              labelText = feature.name;
            } else if (feature.properties.attributes && feature.properties.attributes[selectedLabelAttribute] !== undefined) {
              labelText = String(feature.properties.attributes[selectedLabelAttribute]);
            }

            if (labelText && labelText.trim() !== '') {
              let centerLat = 0, centerLng = 0;
              
              if (feature.type === 'polygon') {
                const coords = feature.coordinates as [number, number][];
                coords.forEach(c => { centerLat += c[0]; centerLng += c[1]; });
                centerLat /= coords.length;
                centerLng /= coords.length;
              } else if (feature.type === 'linestring') {
                const coords = feature.coordinates as [number, number][];
                const midIndex = Math.floor(coords.length / 2);
                centerLat = coords[midIndex][0];
                centerLng = coords[midIndex][1];
              } else {
                const coord = feature.coordinates as [number, number];
                centerLat = coord[0];
                centerLng = coord[1];
              }
              
              kmlLabelsDataRef.current.push({
                lat: centerLat,
                lng: centerLng,
                text: labelText
              });
            }
          }

          // Single Click: Dynamically generate and open popup to save massive amount of memory
          leafletLayer.on('click', (e: L.LeafletMouseEvent) => {
            if (onMapClickRef.current) {
              onMapClickRef.current(e.latlng.lat, e.latlng.lng);
            }

            // Generate key-value attributes list only when clicked
            let attributesHtml = '';
            if (feature.properties.attributes && Object.keys(feature.properties.attributes).length > 0) {
              attributesHtml = `
                <div class="mt-2 border-t border-white/10 pt-1.5 flex flex-col gap-0.5 max-h-[150px] overflow-y-auto pr-1">
                  <table class="w-full text-[9px] border-collapse">
                    <tbody>
                      ${Object.entries(feature.properties.attributes)
                        .map(([key, val]) => `
                          <tr class="border-b border-white/5 last:border-0 hover:bg-white/5">
                            <td class="py-0.5 font-bold text-white/40 pr-2 align-top break-words max-w-[80px]">${key}</td>
                            <td class="py-0.5 text-[#00FF41] font-semibold text-right break-words max-w-[120px]">${val}</td>
                          </tr>
                        `).join('')}
                    </tbody>
                  </table>
                </div>
              `;
            }

            const popupHtml = `
              <div class="font-sans max-w-[240px] text-white/90 p-0.5">
                <h4 class="font-bold text-xs text-[#FFD700] mb-0.5 border-b border-white/5 pb-0.5">${feature.name}</h4>
                <p class="text-[10px] text-white/70 leading-relaxed">${feature.properties.description || 'Không có mô tả chi tiết.'}</p>
                ${attributesHtml}
                <div class="mt-1.5 pt-1 border-t border-white/5 text-[8px] text-gray-500 font-mono">
                  Kiểu: ${feature.type === 'polygon' ? 'Vùng Đa Giác' : feature.type === 'linestring' ? 'Cung Tuyến' : 'Điểm POI'}
                </div>
              </div>
            `;

            L.popup({
              className: 'high-contrast-popup',
              maxWidth: 260,
            })
            .setLatLng(e.latlng)
            .setContent(popupHtml)
            .openOn(mapRef.current!);
          });

          leafletLayer.addTo(kmlLayersGroupRef.current!);
        }
      });
    });

    // Auto fit bounds to show KML layer on load
    if (shouldFitBounds && boundsToFit.isValid()) {
      mapRef.current.fitBounds(boundsToFit, { padding: [40, 40] });
    }

    // Trigger initial label render
    setTimeout(updateKmlLabels, 100);

  }, [kmlLayers, selectedLabelAttribute, updateKmlLabels]);

  const handleLocateDevice = () => {
    if (!navigator.geolocation) {
      alert('Thiết bị hoặc trình duyệt của bạn không hỗ trợ định vị GPS.');
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pt: GPSPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          altitude: pos.coords.altitude || undefined,
          timestamp: pos.timestamp,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed || undefined,
        };

        if (onUpdateCurrentLocation) {
          onUpdateCurrentLocation(pt);
        }

        if (mapRef.current) {
          mapRef.current.flyTo([pt.lat, pt.lng], 16, {
            animate: true,
            duration: 1.5,
          });
        }
        setIsLocating(false);
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        setIsLocating(false);
        // Fallback to existing currentLocation if available
        if (currentLocation && mapRef.current) {
          mapRef.current.flyTo([currentLocation.lat, currentLocation.lng], 16, {
            animate: true,
            duration: 1.5,
          });
        } else {
          alert(`Không thể lấy vị trí GPS từ thiết bị của bạn: ${err.message}`);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="w-full h-full relative">
      {/* Actual Map Leaflet container */}
      <div id="leaflet-map-element" ref={mapContainerRef} className="w-full h-full bg-gray-900 z-0" />
      
      {/* GPS Locate Float Button */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 animate-fade-in">
        <button
          onClick={handleLocateDevice}
          disabled={isLocating}
          type="button"
          title="Định vị và di chuyển tới vị trí của bạn"
          className={`w-12 h-12 rounded-2xl bg-black/95 backdrop-blur border-2 flex items-center justify-center transition-all shadow-[0_4px_20px_rgba(0,0,0,0.6)] cursor-pointer group active:scale-95 ${
            isLocating 
              ? 'border-[#00FF41] animate-pulse' 
              : 'border-white/10 hover:border-[#FFD700] hover:shadow-[0_0_15px_rgba(255,215,0,0.3)]'
          }`}
        >
          {isLocating ? (
            <Loader2 className="w-5 h-5 text-[#00FF41] animate-spin" />
          ) : (
            <Navigation className="w-5 h-5 text-white group-hover:text-[#FFD700] transition-colors" />
          )}
        </button>
      </div>

      {/* Styles Injection for High Contrast Popups */}
      <style>{`
        .high-contrast-popup .leaflet-popup-content-wrapper {
          background-color: rgba(0, 0, 0, 0.95);
          color: #ffffff;
          border: 1px solid #FFD700;
          border-radius: 12px;
          box-shadow: 0 15px 25px -5px rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
        }
        .high-contrast-popup .leaflet-popup-tip {
          background-color: rgba(0, 0, 0, 0.95);
          border-left: 1px solid #FFD700;
          border-bottom: 1px solid #FFD700;
        }

        /* LIGHTWEIGHT HIGH-PERFORMANCE LABELS (VIRTUALIZED) */
        .custom-map-label-wrapper {
          pointer-events: none !important;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .custom-map-label-div {
          background-color: rgba(10, 11, 15, 0.85) !important;
          border: 1px solid rgba(255, 215, 0, 0.6) !important;
          color: #ffffff !important;
          border-radius: 4px !important;
          opacity: 0.9 !important;
          letter-spacing: 0.02em;
          white-space: nowrap;
          font-weight: 700 !important;
          
          /* Center exactly on the coordinate */
          transform: translate(-50%, -50%);
          
          /* Hardware Acceleration */
          will-change: transform;
          contain: layout paint;
          
          /* Dynamic sizing will be controlled based on zoom, but since we cull <13 we can just style it nicely */
          font-size: 8.5px !important;
          padding: 1.5px 4px !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4) !important;
        }
        
        .leaflet-zoom-high .custom-map-label-div {
          font-size: 10px !important;
          padding: 2px 5px !important;
        }

        .leaflet-zoom-low .custom-fire-tooltip {
          font-size: 6px !important;
          padding: 0px 2px !important;
          border: 1px solid rgba(255, 69, 0, 0.3) !important;
          background-color: rgba(15, 5, 2, 0.5) !important;
          box-shadow: none !important;
        }

        /* 2. Medium zoom (14 <= zoom < 16): Render ultra-compact, feather-light labels */
        .leaflet-zoom-medium .custom-fire-tooltip {
          font-size: 8px !important;
          padding: 1.5px 4px !important;
          border: 1px solid rgba(255, 69, 0, 0.5) !important;
          box-shadow: none !important;
        }
        
        /* Optimize entire tooltip pane for GPU composition */
        .leaflet-tooltip-pane, .leaflet-marker-pane {
          will-change: transform;
        }

        /* 3. High zoom (zoom >= 16): Render full detail readable labels */
        .leaflet-zoom-high .custom-fire-tooltip {
          font-size: 9.5px !important;
          padding: 2px 6px !important;
          font-weight: bold !important;
          border: 1px solid #FF4500 !important;
          box-shadow: 0 2px 5px rgba(255, 69, 0, 0.2) !important;
        }

        .custom-fire-tooltip {
          background-color: rgba(15, 5, 2, 0.85) !important;
          border: 1px solid #FF4500 !important;
          color: #ffffff !important;
          pointer-events: none !important;
          opacity: 0.9 !important;
          border-radius: 6px !important;
          will-change: transform;
          contain: paint style;
          transition: none !important;
          animation: none !important;
        }
        .custom-fire-tooltip::before {
          display: none !important;
        }
      `}</style>
    </div>
  );
};
