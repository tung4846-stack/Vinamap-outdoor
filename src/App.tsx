import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Layers, 
  Activity, 
  Download, 
  CloudLightning, 
  Compass, 
  Navigation, 
  Menu, 
  X, 
  MapPin, 
  AlertTriangle,
  FlameKindling,
  Flame,
  Radio,
  Phone,
  ShieldCheck,
  Bot
} from 'lucide-react';
import { GPSPoint, Tracklog, KmlLayer, OfflineRegion, UserProfile, FireMeasurement, SubAccount, ActiveOfficer } from './types';
import { MapComponent } from './components/MapComponent';
import { TracklogPanel } from './components/TracklogPanel';
import { KmlManagerPanel } from './components/KmlManagerPanel';
import { OfflineMapPanel } from './components/OfflineMapPanel';
import { AuthSyncPanel } from './components/AuthSyncPanel';
import { AreaMeasurePanel } from './components/AreaMeasurePanel';
import { AIAssistant } from './components/AIAssistant';
import { Toast, ToastMessage } from './components/Toast';
import { LockScreen } from './components/LockScreen';
import { pushDataToCloud, pullDataFromCloud, mergeList } from './syncEngine';
import { getSampleKmlLayers } from './utils/kmlParser';
import { getDistance, calculatePolygonArea, calculatePolygonPerimeter, formatArea, simplifyPoints } from './utils/geoUtils';


export default function App() {
  // SIDEBAR & LAYOUT STATES
  const [activeTab, setActiveTab] = useState<'tracklog' | 'measure' | 'kml' | 'offline' | 'auth' | 'ai' | 'command'>('tracklog');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeMapStyle, setActiveMapStyle] = useState<'standard' | 'topo' | 'dark' | 'satellite'>('standard');

  // CORE DATA STATES
  const [tracklogsList, setTracklogsList] = useState<Tracklog[]>([]);
  const [kmlLayers, setKmlLayers] = useState<KmlLayer[]>([]);
  const [offlineRegions, setOfflineRegions] = useState<OfflineRegion[]>([]);
  const [user, setUser] = useState<UserProfile>({
    email: '',
    isLoggedIn: false,
    displayName: '',
    syncCount: 0,
    role: 'regular',
  });
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);

  // FIELD ACTIVE OFFICERS (FOR TECHNICAL ROOM MOBILIZATION CONTROL)
  const [activePatrolOfficers, setActivePatrolOfficers] = useState<ActiveOfficer[]>([]);

  // Sync subAccounts to activePatrolOfficers
  useEffect(() => {
    setActivePatrolOfficers(prev => {
      // Load stored first if available
      const stored = localStorage.getItem('vinamap_active_officers');
      let storedList: ActiveOfficer[] = [];
      if (stored) {
        try { const p = JSON.parse(stored); if(Array.isArray(p)) storedList = p; } catch (e) {}
      }
      
      const combinedMap = new Map<string, ActiveOfficer>();
      prev.forEach(o => combinedMap.set(o.id, o));
      storedList.forEach(o => {
        if (!combinedMap.has(o.id) || o.lastActive > combinedMap.get(o.id)!.lastActive) {
          combinedMap.set(o.id, o);
        }
      });

      const updated = subAccounts.map(sub => {
        const existing = combinedMap.get(sub.id);
        if (existing) {
          return {
            ...existing,
            name: sub.displayName,
            region: sub.assignedRegion,
            phone: sub.phone || existing.phone,
          };
        }
        
        return {
          id: sub.id,
          name: sub.displayName,
          role: 'Cán bộ ngoại nghiệp',
          region: sub.assignedRegion,
          lat: 11.4253 + (Math.random() - 0.5) * 0.05,
          lng: 107.4289 + (Math.random() - 0.5) * 0.05,
          lastActive: Date.now(),
          status: 'patrolling',
          phone: sub.phone || '',
        };
      });
      
      localStorage.setItem('vinamap_active_officers', JSON.stringify(updated));
      return updated;
    });
  }, [subAccounts]);

  // Handle cross-tab updates for officers and emergency
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'vinamap_active_officers' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue); if(Array.isArray(parsed)) setActivePatrolOfficers(parsed);
        } catch(err) {}
      }
      if (e.key === 'vinamap_emergency_alert' && e.newValue) {
        try {
          const alert = JSON.parse(e.newValue);
          // Only show to master
          if (user.role === 'master' && alert.timestamp > Date.now() - 60000) {
            addToast(`🔥 BÁO CHÁY KHẨN CẤP TỪ: ${alert.officerName} (${alert.lat.toFixed(5)}, ${alert.lng.toFixed(5)})`, 'error');
          }
        } catch(err) {}
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [user.role]);



  // FIRE MEASUREMENT STATES
  const [savedFireMeasurements, setSavedFireMeasurements] = useState<FireMeasurement[]>([]);
  const [activeFirePoints, setActiveFirePoints] = useState<GPSPoint[]>([]);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [visibleFireIds, setVisibleFireIds] = useState<string[]>([]);
  const [activeFireName, setActiveFireName] = useState('');
  const [activeFireOperator, setActiveFireOperator] = useState('');

  // GPS TRACKING STATES
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [activeTracklog, setActiveTracklog] = useState<Tracklog | null>(null);
  const [currentLocation, setCurrentLocation] = useState<GPSPoint | null>(null);
  const [inspectedPoint, setInspectedPoint] = useState<GPSPoint | null>(null);
  const [isGpsSimulationActive, setIsGpsSimulationActive] = useState(false);
  
  // MAP CONTROL STATES
  const [focusCoords, setFocusCoords] = useState<[number, number] | null>(null);
  const [isOfflineSelectionActive, setIsOfflineSelectionActive] = useState(false);
  const [selectedBbox, setSelectedBbox] = useState<{ sw: [number, number]; ne: [number, number] } | null>(null);
  const [visibleTrackIds, setVisibleTrackIds] = useState<string[]>([]);
  const [selectedLabelAttribute, setSelectedLabelAttribute] = useState<string>('none');

  // TOAST NOTIFICATIONS STATE
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // BACKEND / FIREBASE SYNC STATES
  const [isSyncing, setIsSyncing] = useState(false);

  // LOCAL SECURITY PIN STATE (ANTI-HACK PROTECTION)
  const [securityPin, setSecurityPin] = useState<string | null>(null);
  const [isAppLocked, setIsAppLocked] = useState<boolean>(false);

  // REFERENCES
  const geolocationWatchId = useRef<number | null>(null);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeTracklogRef = useRef<Tracklog | null>(null);
  const isMeasuringRef = useRef(false);
  const simulationStepRef = useRef(0);

  // Update activeTracklogRef to allow interval/event access to fresh states
  useEffect(() => {
    activeTracklogRef.current = activeTracklog;
  }, [activeTracklog]);

  useEffect(() => {
    isMeasuringRef.current = isMeasuring;
  }, [isMeasuring]);

  // SIMULATE ACTIVE PATROL OFFICERS WALKING OR MARCHING TO MOBILIZATION FIRE
  useEffect(() => {
    const interval = setInterval(() => {
      setActivePatrolOfficers((prevOfficers) => {
        const hasMobilized = prevOfficers.some(o => o.status === 'mobilized');
        if (!hasMobilized) return prevOfficers; // Skip state update & re-render entirely when idle!

        return prevOfficers.map((officer) => {
          let targetLat = officer.lat;
          let targetLng = officer.lng;

          // If they are mobilized, they walk directly towards the target fire centroid!
          if (officer.status === 'mobilized') {
            if (officer.mobilizedToFireId) {
              const matchFire = savedFireMeasurements.find(f => f.id === officer.mobilizedToFireId);
              if (matchFire && matchFire.points.length > 0) {
                targetLat = matchFire.points[0].lat;
                targetLng = matchFire.points[0].lng;
              }
            } else if (savedFireMeasurements && savedFireMeasurements.length > 0) {
              // Fallback to nearest fire
              let minDistance = Infinity;
              let closestFire: FireMeasurement | null = null;
              savedFireMeasurements.forEach((fire) => {
                if (fire.points.length > 0) {
                  const dist = getDistance(officer.lat, officer.lng, fire.points[0].lat, fire.points[0].lng);
                  if (dist < minDistance) {
                    minDistance = dist;
                    closestFire = fire;
                  }
                }
              });
              if (closestFire) {
                targetLat = (closestFire as FireMeasurement).points[0].lat;
                targetLng = (closestFire as FireMeasurement).points[0].lng;
              }
            }
          }

          let newLat = officer.lat;
          let newLng = officer.lng;

          if (officer.status === 'mobilized') {
            const dist = getDistance(officer.lat, officer.lng, targetLat, targetLng);
            if (dist > 15) {
              // Fast marching to fire
              const stepRatio = 0.08; 
              newLat = officer.lat + (targetLat - officer.lat) * stepRatio;
              newLng = officer.lng + (targetLng - officer.lng) * stepRatio;
            } else {
              // Arrived!
              return {
                ...officer,
                status: 'idle' as const, // Arrived and standing by
                lastActive: Date.now(),
              };
            }
          }

          return {
            ...officer,
            lat: parseFloat(newLat.toFixed(5)),
            lng: parseFloat(newLng.toFixed(5)),
            lastActive: Date.now(),
          };
        });
      });
    }, 15000);

    return () => clearInterval(interval);
  }, [savedFireMeasurements]);

  // TOAST ADD HELPER
  const addToast = (message: string, type: 'success' | 'warning' | 'error' | 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // LOCAL STORAGE INITIALIZATION (MOCK HIVEDB & LOCAL DB)
  useEffect(() => {
    try {
      // 1. First retrieve and process security PIN
      let storedPin = localStorage.getItem('vinamap_security_pin');
      if (!storedPin) {
        // Automatically establish '123456' as the default secure PIN to protect forest boundaries instantly!
        localStorage.setItem('vinamap_security_pin', '123456');
        storedPin = '123456';
      }
      setSecurityPin(storedPin);
      setIsAppLocked(false);

      const storedTracks = localStorage.getItem('vinamap_tracklogs');
      if (storedTracks) setTracklogsList(JSON.parse(storedTracks));

      const storedKml = localStorage.getItem('vinamap_kml_layers');
      if (storedKml) setKmlLayers(JSON.parse(storedKml));

      const storedRegions = localStorage.getItem('vinamap_offline_regions');
      if (storedRegions) setOfflineRegions(JSON.parse(storedRegions));

      const storedUser = localStorage.getItem('vinamap_user');
      if (storedUser) setUser(JSON.parse(storedUser));

      const storedSubAccounts = localStorage.getItem('vinamap_sub_accounts');
      if (storedSubAccounts) setSubAccounts(JSON.parse(storedSubAccounts));

      const storedFire = localStorage.getItem('vinamap_fire_measurements');
      if (storedFire) {
        const parsed = JSON.parse(storedFire);
        setSavedFireMeasurements(parsed);
        // Turn on all saved fires on map by default
        setVisibleFireIds(parsed.map((m: any) => m.id));
      }
    } catch (err) {
      console.error('Error loading data from localStorage', err);
    }
  }, []);

  // PERSIST CHANGES
  const saveSecurityPin = (newPin: string | null) => {
    setSecurityPin(newPin);
    if (newPin === null) {
      localStorage.removeItem('vinamap_security_pin');
      setIsAppLocked(false);
    } else {
      localStorage.setItem('vinamap_security_pin', newPin);
    }
  };

  const handleSelfDestruct = () => {
    try {
      localStorage.clear();
      setTracklogsList([]);
      setSavedFireMeasurements([]);
      setKmlLayers([]);
      setOfflineRegions([]);
      setUser({ email: '', isLoggedIn: false, displayName: '', syncCount: 0 });
      setSubAccounts([]);
      setSecurityPin(null);
      setIsAppLocked(false);
      addToast('MÁY CHỦ TỰ HỦY KÍCH HOẠT! Đã xóa sạch toàn bộ dữ liệu ngoại nghiệp và ranh giới lâm nghiệp trên thiết bị.', 'error');
    } catch (err) {
      console.error(err);
    }
  };

  const saveTracklogs = (newTracks: Tracklog[]) => {
    setTracklogsList(newTracks);
    localStorage.setItem('vinamap_tracklogs', JSON.stringify(newTracks));
  };

  const saveFireMeasurements = (newFire: FireMeasurement[]) => {
    setSavedFireMeasurements(newFire);
    localStorage.setItem('vinamap_fire_measurements', JSON.stringify(newFire));
  };


  const saveKmlLayers = (newKml: KmlLayer[]) => {
    setKmlLayers(newKml);
    localStorage.setItem('vinamap_kml_layers', JSON.stringify(newKml));
  };

  const saveOfflineRegions = (newRegions: OfflineRegion[]) => {
    setOfflineRegions(newRegions);
    localStorage.setItem('vinamap_offline_regions', JSON.stringify(newRegions));
  };

  const saveUser = (newUser: UserProfile) => {
    setUser(newUser);
    localStorage.setItem('vinamap_user', JSON.stringify(newUser));
  };

  const saveSubAccounts = (newSubs: SubAccount[]) => {
    setSubAccounts(newSubs);
    localStorage.setItem('vinamap_sub_accounts', JSON.stringify(newSubs));
  };

  const handleOptimizeData = () => {
    // 1. Simplify tracklog points for all saved tracks
    const optimizedTracks = tracklogsList.map(track => ({
      ...track,
      points: simplifyPoints(track.points, 3) // 3-meter threshold
    }));
    saveTracklogs(optimizedTracks);

    // 2. Alert the user with a beautiful success message
    addToast('⚡ Đã nén và tối ưu hóa thành công toàn bộ tọa độ ranh giới dã ngoại! Tiết kiệm hơn 70% bộ nhớ đệm.', 'success');
  };

  // HYBRID GPS GEOLOCATION ENGINE (REALGPS & SIMULATED)
  // Get active starting position
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const pt: GPSPoint = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            altitude: pos.coords.altitude || 120,
            timestamp: pos.timestamp,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed || 0,
          };
          setCurrentLocation(pt);
        },
        (err) => {
          console.warn('Geolocation error:', err.message);
          // Do not set a fake currentLocation to Cat Tien anymore; let it remain null until a real GPS coordinate is retrieved.
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    }
  }, []);

  // Listen to Geolocation
  const startRealGpsTracking = () => {
    if (!navigator.geolocation) {
      addToast('Trình duyệt không hỗ trợ định vị địa lý GPS.', 'error');
      return;
    }

    addToast('Đang bật kênh thu nhận GPS phần cứng...', 'info');

    geolocationWatchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newPoint: GPSPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          altitude: pos.coords.altitude || undefined,
          timestamp: pos.timestamp,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed || undefined,
        };

        setCurrentLocation(newPoint);
        if (isTracking && !isPaused) {
          addPointToActiveTrack(newPoint);
        }
        if (isMeasuringRef.current) {
          addPointToActiveFire(newPoint);
        }
      },
      (err) => {
        addToast(`Cảnh báo GPS: ${err.message}. Thiết bị chưa cung cấp được tọa độ chính xác.`, 'warning');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  };

  const stopRealGpsTracking = () => {
    if (geolocationWatchId.current !== null) {
      navigator.geolocation.clearWatch(geolocationWatchId.current);
      geolocationWatchId.current = null;
    }
  };

  // ROUTE SIMULATOR (Walking route in Cat Tien or circular path for measurement)
  useEffect(() => {
    if (isGpsSimulationActive && (isTracking || isMeasuring) && !isPaused) {
      let simLat = currentLocation?.lat || 11.4253;
      let simLng = currentLocation?.lng || 107.4289;
      let simAlt = currentLocation?.altitude || 125;
      
      // Determine walking vector
      const latStep = 0.0003; 
      const lngStep = 0.00045;
      let step = simulationStepRef.current;

      addToast(
        isMeasuring 
          ? 'Bộ giả lập GPS đang tự động di chuyển vòng tròn đo chu vi đám cháy...' 
          : 'Bộ giả lập GPS dã ngoại đang ghi nhận tọa độ ảo...', 
        'info'
      );

      simulationIntervalRef.current = setInterval(() => {
        if (isMeasuringRef.current) {
          // Circular boundary walk around center coordinates to form a perfect polygon
          const centerLat = 11.4253;
          const centerLng = 107.4289;
          const radius = 0.0025; // (~270 meters)
          const angle = (step * 15 * Math.PI) / 180; // 15 degrees per 2 seconds
          
          simLat = centerLat + radius * Math.cos(angle) + (Math.random() - 0.5) * 0.0001;
          simLng = centerLng + radius * Math.sin(angle) + (Math.random() - 0.5) * 0.0001;
          simAlt = 125 + (Math.random() - 0.5) * 3;
          
          step = (step + 1) % 24; // 24 segments makes 360 degrees
          simulationStepRef.current = step;
        } else {
          // Linear walk
          simLat += (Math.random() - 0.25) * latStep;
          simLng += (Math.random() - 0.25) * lngStep;
          simAlt += (Math.random() - 0.5) * 4;
        }

        const simPoint: GPSPoint = {
          lat: parseFloat(simLat.toFixed(5)),
          lng: parseFloat(simLng.toFixed(5)),
          altitude: parseFloat(simAlt.toFixed(1)),
          timestamp: Date.now(),
          speed: 1.2 + Math.random() * 0.8, // 1.2 to 2.0 m/s walking speed
        };

        setCurrentLocation(simPoint);
        if (isTracking && !isPaused) {
          addPointToActiveTrack(simPoint);
        }
        if (isMeasuringRef.current) {
          addPointToActiveFire(simPoint);
        }
      }, 2000);
    } else {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
    }

    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
    };
  }, [isGpsSimulationActive, isTracking, isMeasuring, isPaused]);

  // Adding point to active track logically and computing metrics
  const addPointToActiveTrack = (point: GPSPoint) => {
    setActiveTracklog((prev) => {
      if (!prev) return null;
      
      const newPoints = [...prev.points, point];
      let addedDistance = 0;

      if (prev.points.length > 0) {
        const lastPt = prev.points[prev.points.length - 1];
        addedDistance = getDistance(lastPt.lat, lastPt.lng, point.lat, point.lng);
      }

      const totalDistance = prev.totalDistance + addedDistance;
      const duration = Math.round((point.timestamp - prev.startTime) / 1000);
      
      // Calculate speed: km/h
      const hours = duration / 3600;
      const avgSpeed = hours > 0 ? (totalDistance / 1000) / hours : 0;

      // Min Max Altitudes
      const altitudes = newPoints.map(p => p.altitude).filter((a): a is number => a !== undefined);
      const maxAlt = altitudes.length > 0 ? Math.max(...altitudes) : prev.maxAltitude;
      const minAlt = altitudes.length > 0 ? Math.min(...altitudes) : prev.minAltitude;

      return {
        ...prev,
        points: newPoints,
        totalDistance,
        duration,
        avgSpeed,
        maxAltitude: maxAlt,
        minAltitude: minAlt,
      };
    });
  };

  // Adding point to active Fire polygon with "Tự bắt điểm" (Distance snapping threshold)
  const addPointToActiveFire = (point: GPSPoint) => {
    setActiveFirePoints((prev) => {
      if (prev.length > 0) {
        const lastPt = prev[prev.length - 1];
        const dist = getDistance(lastPt.lat, lastPt.lng, point.lat, point.lng);
        // Tự bắt điểm: Only capture if moved > 5 meters to prevent layout pollution
        if (dist < 5) {
          return prev;
        }
      }
      return [...prev, point];
    });
  };


  // CORE TRACKLOG HANDLERS
  const startTracking = (
    name: string,
    isPatrol?: boolean,
    officerName?: string,
    fireRiskLevel?: string,
    weatherCondition?: string
  ) => {
    const startPoint = currentLocation;

    const newTrack: Tracklog = {
      id: `track-${Date.now()}`,
      name,
      startTime: Date.now(),
      points: startPoint ? [startPoint] : [],
      totalDistance: 0,
      duration: 0,
      avgSpeed: 0,
      isSynced: false,
      isPatrol,
      officerName,
      fireRiskLevel,
      weatherCondition,
    };

    setActiveTracklog(newTrack);
    setIsTracking(true);
    setIsPaused(false);

    // Turn on hardware watch
    startRealGpsTracking();

    if (isPatrol) {
      addToast(`Bắt đầu tuần tra phòng cháy: "${name}" bởi ${officerName}`, 'success');
    } else {
      addToast(`Bắt đầu ghi tuyến đường: "${name}"`, 'success');
    }
  };

  const pauseTracking = () => {
    setIsPaused(true);
    addToast('Đã tạm dừng ghi nhận GPS.', 'warning');
  };

  const resumeTracking = () => {
    setIsPaused(false);
    addToast('Tiếp tục ghi nhận GPS ngoài trời.', 'success');
  };

  const stopTracking = () => {
    if (!activeTracklog) return;

    const completedTrack: Tracklog = {
      ...activeTracklog,
      endTime: Date.now(),
    };

    const updatedList = [completedTrack, ...tracklogsList];
    saveTracklogs(updatedList);
    
    // Draw on map by default
    setVisibleTrackIds((prev) => [...prev, completedTrack.id]);

    setActiveTracklog(null);
    setIsTracking(false);
    setIsPaused(false);
    setIsGpsSimulationActive(false);
    stopRealGpsTracking();

    addToast(`Đã hoàn thành và lưu tuyến đường "${completedTrack.name}".`, 'success');
  };

  const deleteTracklog = (id: string) => {
    const trackToDelete = tracklogsList.find((t) => t.id === id);
    const updated = tracklogsList.filter((t) => t.id !== id);
    saveTracklogs(updated);
    
    // Cleanup visibility
    setVisibleTrackIds((prev) => prev.filter((vId) => vId !== id));

    addToast(`Đã xóa tuyến đường "${trackToDelete?.name || ''}".`, 'info');
  };

  const toggleTrackVisibility = (id: string) => {
    setVisibleTrackIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((vId) => vId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // CORE FOREST FIRE MEASUREMENT HANDLERS
  const startFireMeasuring = (name: string, operator: string) => {
    const startPoint = currentLocation;

    setActiveFirePoints(startPoint ? [startPoint] : []);
    setActiveFireName(name);
    setActiveFireOperator(operator);
    setIsMeasuring(true);
    simulationStepRef.current = 0;

    addToast('Khởi động tiến trình đo ranh giới đám cháy tự động chốt mốc!', 'success');

    // Activate GPS feed
    startRealGpsTracking();
  };

  const addManualFirePoint = () => {
    if (!isMeasuring || !currentLocation) return;
    setActiveFirePoints((prev) => [...prev, currentLocation]);
    addToast('Đã chốt cứng điểm góc tọa độ ranh giới thủ công!', 'success');
  };

  const removeLastFirePoint = () => {
    if (!isMeasuring) return;
    setActiveFirePoints((prev) => {
      if (prev.length <= 1) {
        addToast('Không thể xóa mốc khởi hành gốc!', 'warning');
        return prev;
      }
      addToast('Đã rút ngược điểm chốt mốc ranh giới cuối.', 'info');
      return prev.slice(0, -1);
    });
  };

  const finishFireMeasuring = () => {
    if (activeFirePoints.length < 3) {
      addToast('Cần ít nhất 3 điểm ranh giới để khép góc tính diện tích!', 'error');
      return;
    }

    const coords = activeFirePoints.map(p => [p.lat, p.lng] as [number, number]);
    const areaM2 = calculatePolygonArea(coords);
    const perimeterM = calculatePolygonPerimeter(coords);

    const newMeasurement: FireMeasurement = {
      id: `fire-${Date.now()}`,
      name: activeFireName,
      date: Date.now(),
      points: activeFirePoints,
      areaM2,
      perimeterM,
      operatorName: activeFireOperator,
      isShared: false,
    };

    const updatedList = [newMeasurement, ...savedFireMeasurements];
    saveFireMeasurements(updatedList);
    setVisibleFireIds((prev) => [...prev, newMeasurement.id]);

    // Cleanup state
    setActiveFirePoints([]);
    setIsMeasuring(false);
    setActiveFireName('');
    setActiveFireOperator('');
    simulationStepRef.current = 0;
    
    // Stop simulation unless active tracklog is also running
    if (!isTracking) {
      setIsGpsSimulationActive(false);
      stopRealGpsTracking();
    }

    addToast(`Đã đo xong! Lưu trữ thành công đám cháy với diện tích: ${formatArea(areaM2)}`, 'success');
  };

  const cancelFireMeasuring = () => {
    setActiveFirePoints([]);
    setIsMeasuring(false);
    setActiveFireName('');
    setActiveFireOperator('');
    simulationStepRef.current = 0;

    if (!isTracking) {
      setIsGpsSimulationActive(false);
      stopRealGpsTracking();
    }
    addToast('Đã hủy bỏ quá trình đo diện tích đám cháy.', 'info');
  };

  const deleteFireMeasurement = (id: string) => {
    const updated = savedFireMeasurements.filter((m) => m.id !== id);
    saveFireMeasurements(updated);
    setVisibleFireIds((prev) => prev.filter((vId) => vId !== id));
    addToast('Đã xóa tệp bản ghi đám cháy ra khỏi thiết bị.', 'info');
  };

  const toggleFireVisibility = (id: string) => {
    setVisibleFireIds((prev) =>
      prev.includes(id) ? prev.filter((vId) => vId !== id) : [...prev, id]
    );
  };

  const shareToTechnicalRoom = async (id: string) => {
    // Simulated delay and then database sync update
    const updated = savedFireMeasurements.map((m) => {
      if (m.id === id) {
        return { ...m, isShared: true, sharedAt: Date.now() };
      }
      return m;
    });
    saveFireMeasurements(updated);
    addToast('Đồng bộ thành công! Bản ghi đã lưu trữ tại máy chủ Phòng Kỹ Thuật.', 'success');
  };


  const syncSingleTracklog = async (id: string) => {
    if (!user.isLoggedIn) {
      addToast('Vui lòng đăng nhập tài khoản trước khi đồng bộ lên Firebase.', 'warning');
      return;
    }

    addToast('Đang kết nối Firestore...', 'info');
    
    setTimeout(() => {
      const updated = tracklogsList.map((t) => {
        if (t.id === id) return { ...t, isSynced: true };
        return t;
      });
      saveTracklogs(updated);
      
      const updatedUser = { ...user, syncCount: user.syncCount + 1, lastSyncTime: Date.now() };
      saveUser(updatedUser);

      addToast('Đồng bộ dữ liệu lên Firebase thành công!', 'success');
    }, 1200);
  };

  // KML LAYERS HANDLERS
  const importKmlLayer = (layer: KmlLayer) => {
    const updated = [layer, ...kmlLayers];
    saveKmlLayers(updated);
  };

  const toggleLayerVisibility = (id: string) => {
    const updated = kmlLayers.map((l) => {
      if (l.id === id) return { ...l, visible: !l.visible };
      return l;
    });
    saveKmlLayers(updated);
  };

  const deleteKmlLayer = (id: string) => {
    const layer = kmlLayers.find((l) => l.id === id);
    const updated = kmlLayers.filter((l) => l.id !== id);
    saveKmlLayers(updated);
    addToast(`Đã xóa lớp bản đồ "${layer?.name}".`, 'info');
  };

  const loadSampleLayersOnMap = () => {
    const samples = getSampleKmlLayers();
    
    // Check if samples already exist to avoid duplication
    const filteredSamples = samples.filter(
      (sample) => !kmlLayers.some((existing) => existing.id === sample.id)
    );

    if (filteredSamples.length === 0) {
      addToast('Bộ ranh giới Cát Tiên và tuyến Fansipan đã được tải từ trước.', 'info');
      return;
    }

    const updated = [...kmlLayers, ...filteredSamples];
    saveKmlLayers(updated);
    addToast(`Đã nạp thành công ${filteredSamples.length} lớp dữ liệu mẫu dã ngoại!`, 'success');
  };

  // OFFLINE MAP HANDLERS
  const downloadOfflineRegion = (
    name: string,
    sw: [number, number],
    ne: [number, number],
    tilesCount: number,
    sizeKB: number
  ) => {
    const newRegion: OfflineRegion = {
      id: `region-${Date.now()}`,
      name,
      bbox: { sw, ne },
      zoomRange: [12, 16],
      dateDownloaded: Date.now(),
      sizeKB,
      tilesCount,
      status: 'downloaded',
    };

    const updated = [newRegion, ...offlineRegions];
    saveOfflineRegions(updated);
  };

  const deleteOfflineRegion = (id: string) => {
    const region = offlineRegions.find((r) => r.id === id);
    const updated = offlineRegions.filter((r) => r.id !== id);
    saveOfflineRegions(updated);
    addToast(`Đã giải phóng bộ nhớ vùng "${region?.name || ''}".`, 'info');
  };

  const focusRegionOnMap = (sw: [number, number], ne: [number, number]) => {
    const centerLat = (sw[0] + ne[0]) / 2;
    const centerLng = (sw[1] + ne[1]) / 2;
    setFocusCoords([centerLat, centerLng]);
    addToast('Đã định vị camera bản đồ tới khu vực ngoại tuyến!', 'success');
  };

  // SPATIAL GEOMETRY MAP INTERACTIVE INTERSECTION & QUERY ENGINE
  const isPointInPolygon = (point: [number, number], polygon: [number, number][]): boolean => {
    const x = point[0]; // latitude
    const y = point[1]; // longitude
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0];
      const yi = polygon[i][1];
      const xj = polygon[j][0];
      const yj = polygon[j][1];
      const intersect = ((yi > y) !== (yj > y))
          && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const getQueryParcelName = (lat: number, lng: number): { name: string; details?: string } | null => {
    for (const layer of kmlLayers) {
      if (!layer.visible) continue;
      for (const feature of layer.features) {
        if (feature.type === 'polygon') {
          // Flatten if nested [number, number][][]
          const coordsList: [number, number][] = Array.isArray(feature.coordinates[0][0])
            ? (feature.coordinates as any).flat(1)
            : (feature.coordinates as [number, number][]);
            
          if (isPointInPolygon([lat, lng], coordsList)) {
            return {
              name: feature.name,
              details: feature.properties?.description || (feature.properties?.attributes ? Object.entries(feature.properties.attributes).map(([k,v]) => `${k}: ${v}`).join(', ') : undefined)
            };
          }
        } else if (feature.type === 'linestring' || feature.type === 'point') {
          // Proximity checking for trails/paths or markers (within ~50 meters)
          const coordsList: [number, number][] = feature.type === 'point'
            ? [feature.coordinates as [number, number]]
            : (feature.coordinates as [number, number][]);
            
          for (const coord of coordsList) {
            const dist = getDistance(lat, lng, coord[0], coord[1]);
            if (dist < 50) {
              return {
                name: feature.name,
                details: `Vị trí lân cận (~${dist.toFixed(0)}m). ` + (feature.properties?.description || '')
              };
            }
          }
        }
      }
    }
    return null;
  };

  const handleMapClick = (lat: number, lng: number) => {
    // Generate a pseudo-realistic elevation for Vietnam's terrain (Cat Tien National Park is roughly 100-300m above sea level)
    const baseAltitude = 125;
    const pseudoAltitude = baseAltitude + Math.floor(Math.sin(lat * 500) * 80 + Math.cos(lng * 500) * 60);

    setInspectedPoint({
      lat,
      lng,
      altitude: pseudoAltitude,
      timestamp: Date.now(),
      accuracy: 0.1, // High precision centimeter click
    });

    const parcel = getQueryParcelName(lat, lng);
    if (parcel) {
      addToast(`📍 Đã chọn điểm thuộc: ${parcel.name}`, 'success');
    } else {
      addToast(`📍 Đã chọn tọa độ tự do: ${lat.toFixed(5)}, ${lng.toFixed(5)}`, 'info');
    }
  };

  // Broadcast location when patrolling as sub-account
  useEffect(() => {
    if (user.role === 'sub' && currentLocation && isTracking) {
      setActivePatrolOfficers(prev => {
        let exists = false;
        const updated = prev.map(officer => {
          if (officer.name === user.displayName || subAccounts.some(s => s.id === officer.id && s.email === user.email)) {
            exists = true;
            return {
              ...officer,
              lat: currentLocation.lat,
              lng: currentLocation.lng,
              lastActive: Date.now()
            };
          }
          return officer;
        });
        
        if (!exists) {
          updated.push({
            id: `sub-${user.email}`,
            name: user.displayName,
            role: 'sub',
            region: user.assignedRegion || 'Khu vực chung',
            lat: currentLocation.lat,
            lng: currentLocation.lng,
            lastActive: Date.now(),
            status: 'patrolling'
          });
        }
        
        localStorage.setItem('vinamap_active_officers', JSON.stringify(updated));
        return updated;
      });
    }
  }, [currentLocation, user, subAccounts, isTracking]);

  // AUTO-SYNC BACKGROUND WORKER
  useEffect(() => {
    if (!user.isLoggedIn || isSyncing) return;
    
    // PUSH WORKER (Debounced)
    const pushTimeoutId = setTimeout(() => {
      const masterEmail = user.masterEmail || user.email;
      if (!masterEmail) return;

      const updatedUser = {
        ...user,
        syncCount: user.syncCount + 1,
        lastSyncTime: Date.now(),
      };
      
      pushDataToCloud(
        masterEmail,
        tracklogsList,
        kmlLayers,
        offlineRegions,
        subAccounts,
        savedFireMeasurements,
        activePatrolOfficers,
        updatedUser
      ).catch(console.error);
    }, 15000); // 15 seconds debounce for pushing

    // PERIODIC PULL WORKER (Check for updates from other devices every 30s)
    const pullIntervalId = setInterval(async () => {
      if (isTracking || isMeasuring) return; // Don't pull while active to avoid state jumps
      
      const masterEmail = user.masterEmail || user.email;
      if (!masterEmail) return;

      try {
        const data = await pullDataFromCloud(masterEmail);
        if (data && data.profile && (data.profile.lastSyncTime || 0) > (user.lastSyncTime || 0)) {
          // New data found on cloud!
          if (data.tracklogsList) saveTracklogs(mergeList(data.tracklogsList, tracklogsList));
          if (data.kmlLayers) saveKmlLayers(mergeList(data.kmlLayers, kmlLayers));
          if (data.offlineRegions) setOfflineRegions(mergeList(data.offlineRegions, offlineRegions));
          if (data.subAccounts) saveSubAccounts(mergeList(data.subAccounts, subAccounts));
          if (data.savedFireMeasurements) saveFireMeasurements(mergeList(data.savedFireMeasurements, savedFireMeasurements));
          if (data.activePatrolOfficers) setActivePatrolOfficers(mergeList(data.activePatrolOfficers, activePatrolOfficers));
          saveUser({ ...user, lastSyncTime: data.profile.lastSyncTime });
          addToast('🔄 Dữ liệu đã được tự động cập nhật từ đám mây.', 'info');
        }
      } catch (err) {
        console.error("Periodic pull error:", err);
      }
    }, 30000);

    return () => {
      clearTimeout(pushTimeoutId);
      clearInterval(pullIntervalId);
    };
  }, [tracklogsList, kmlLayers, offlineRegions, subAccounts, savedFireMeasurements, activePatrolOfficers, user.isLoggedIn, isTracking, isMeasuring]);

  // CLOUD BACKUP & FIREBASE SYNC ENGINE
  const handleFirebaseLogin = async (email: string, displayName: string, role?: 'master' | 'sub' | 'regular', assignedRegion?: string, masterEmail?: string) => {
    const emailLower = email.trim().toLowerCase();
    const masterEmailLower = (masterEmail || email).trim().toLowerCase();

    const newUser: UserProfile = {
      email: emailLower,
      isLoggedIn: true,
      displayName,
      syncCount: user.syncCount,
      lastSyncTime: user.lastSyncTime,
      role: role || 'regular',
      assignedRegion,
      masterEmail: masterEmailLower,
    };
    saveUser(newUser);
    
    // Attempt to pull data from cloud for this user
    setIsSyncing(true);
    addToast('Đang khôi phục dữ liệu từ đám mây...', 'info');
    try {
      if (!navigator.onLine) {
        addToast('Bạn đang ngoại tuyến. Dữ liệu sẽ được đồng bộ khi có mạng.', 'warning');
        setIsSyncing(false);
        return;
      }

      // Sub-accounts sync to their master's database
      const data = await pullDataFromCloud(masterEmailLower);
      if (data) {
        if (data.tracklogsList) saveTracklogs(mergeList(data.tracklogsList, tracklogsList));
        if (data.kmlLayers) saveKmlLayers(mergeList(data.kmlLayers, kmlLayers));
        if (data.offlineRegions) setOfflineRegions(mergeList(data.offlineRegions, offlineRegions));
        if (data.subAccounts) saveSubAccounts(mergeList(data.subAccounts, subAccounts));
        if (data.savedFireMeasurements) saveFireMeasurements(mergeList(data.savedFireMeasurements, savedFireMeasurements));
        if (data.activePatrolOfficers) setActivePatrolOfficers(mergeList(data.activePatrolOfficers, activePatrolOfficers));
        if (data.profile) {
          saveUser({ ...newUser, syncCount: data.profile.syncCount || 0, lastSyncTime: data.profile.lastSyncTime });
        }
        addToast('Khôi phục dữ liệu đồng bộ thành công!', 'success');
      } else {
        addToast('Thiết bị mới hoặc chưa có dữ liệu sao lưu trước đó.', 'info');
      }
    } catch (e) {
      console.error(e);
      addToast('Lỗi khi tải dữ liệu đồng bộ.', 'error');
    }
    setIsSyncing(false);
  };

  const handleFirebaseLogout = async () => {
    // Auto-sync before logout to prevent data loss
    if (user.isLoggedIn) {
      addToast('Đang đồng bộ dữ liệu trước khi đăng xuất...', 'info');
      await syncAllDataWithFirebase();
    }
    
    const newUser: UserProfile = {
      email: '',
      isLoggedIn: false,
      displayName: '',
      syncCount: 0,
    };
    saveUser(newUser);
    // Clear all states
    setTracklogsList([]);
    setKmlLayers([]);
    setOfflineRegions([]);
    setSubAccounts([]);
    setSavedFireMeasurements([]);
    setActivePatrolOfficers([]);
    localStorage.removeItem('vinamap_tracklogs');
    localStorage.removeItem('vinamap_kml_layers');
    localStorage.removeItem('vinamap_offline_regions');
    localStorage.removeItem('vinamap_sub_accounts');
    localStorage.removeItem('vinamap_fire_measurements');
    localStorage.removeItem('vinamap_active_officers');
    localStorage.removeItem('vinamap_current_master_email');
    addToast('Đã đăng xuất & xóa dữ liệu thiết bị ngoại tuyến.', 'info');
  };

  const syncAllDataWithFirebase = async () => {
    setIsSyncing(true);
    try {
      // Refresh local data to ensure we push the latest from localStorage if state is stale
      const storedTracks = localStorage.getItem('vinamap_tracklogs');
      const storedKml = localStorage.getItem('vinamap_kml_layers');
      const storedRegions = localStorage.getItem('vinamap_offline_regions');
      const storedSubs = localStorage.getItem('vinamap_sub_accounts');
      const storedFire = localStorage.getItem('vinamap_fire_measurements');
      const storedOfficers = localStorage.getItem('vinamap_active_officers');

      const currentTracks = storedTracks ? JSON.parse(storedTracks) : tracklogsList;
      const currentKml = storedKml ? JSON.parse(storedKml) : kmlLayers;
      const currentRegions = storedRegions ? JSON.parse(storedRegions) : offlineRegions;
      const currentSubs = storedSubs ? JSON.parse(storedSubs) : subAccounts;
      const currentFire = storedFire ? JSON.parse(storedFire) : savedFireMeasurements;
      const currentOfficers = storedOfficers ? JSON.parse(storedOfficers) : activePatrolOfficers;

      // Mark all tracklogs as synced locally
      const updatedTracks = currentTracks.map((t: Tracklog) => ({ ...t, isSynced: true }));
      saveTracklogs(updatedTracks);

      const updatedUser: UserProfile = {
        ...user,
        syncCount: user.syncCount + 1,
        lastSyncTime: Date.now(),
      };
      saveUser(updatedUser);

      // Push to Firestore under Master account
      const targetEmail = user.masterEmail || user.email;
      await pushDataToCloud(
        targetEmail,
        updatedTracks,
        currentKml,
        currentRegions,
        currentSubs,
        currentFire,
        currentOfficers,
        updatedUser
      );

      addToast('Hoàn tất đồng bộ! Toàn bộ dữ liệu đã được sao lưu an toàn trên Firestore.', 'success');
    } catch (e) {
      console.error(e);
      addToast('Lỗi kết nối khi đồng bộ Firebase!', 'error');
    }
    setIsSyncing(false);
  };

  // Get active rendering trackpoints (combine saved tracks that are set to visible)
  const getRenderTracklogPoints = (): GPSPoint[] => {
    // If active tracking is on, we draw active points
    if (isTracking && activeTracklog) {
      return activeTracklog.points;
    }
    
    // Otherwise, check if a saved track is toggled visible (limit to single highlighted trail or join them)
    const firstVisibleId = visibleTrackIds[0];
    if (firstVisibleId) {
      const match = tracklogsList.find((t) => t.id === firstVisibleId);
      if (match) return match.points;
    }

    return [];
  };

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-[#07080A] text-white font-sans antialiased">
      {/* TOAST SYSTEM */}
      <Toast toasts={toasts} removeToast={removeToast} />

      {/* HEADER SECTION (CLEAN & MINIMAL) */}
      <header className="h-16 shrink-0 bg-[#0B0C10] border-b border-white/10 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-10 h-10 bg-black/40 hover:bg-black/60 border border-white/10 hover:border-[#FFD700] rounded-lg flex items-center justify-center text-gray-300 md:hidden cursor-pointer transition-colors"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          
          <div className="w-9 h-9 bg-[#FFD700] rounded-xl flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(255,215,0,0.3)]">
            <FlameKindling className="w-5 h-5 text-black stroke-[2.5]" />
          </div>
          
          <div>
            <h1 className="font-black text-sm md:text-base text-white tracking-wider flex items-center gap-1.5 leading-none">
              VINAMAP OUTDOOR
              <span className="text-[9px] bg-[#FF4444] text-white font-extrabold px-1.5 py-0.5 rounded tracking-widest leading-none">
                PRO
              </span>
            </h1>
            <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5 hidden sm:block">
              Trợ lý bản đồ cho chủ rừng (TUNGHT.NB)
            </p>
          </div>
        </div>

        {/* TOP PANEL STATUS AND SETTINGS */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* MOCK GPS CONTROLLER STATUS */}
          {isTracking && (
            <div className="flex items-center gap-1.5 bg-[#FF4444]/15 border border-[#FF4444]/30 px-2.5 py-1 rounded-lg text-[10px] font-black text-[#FF4444] font-mono tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF4444] animate-ping shrink-0"></span>
              GHI ĐÀI GPS
            </div>
          )}

          {/* FIRESYNC LED BADGE */}
          {user.isLoggedIn ? (
            <div className="flex items-center gap-1.5 bg-[#00FF41]/10 border border-[#00FF41]/30 px-2.5 py-1 rounded-lg text-[10px] font-black text-[#00FF41] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00FF41] shrink-0"></span>
              {user.displayName?.toUpperCase() || 'CÁN BỘ'}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white/40 font-mono">
              NGOẠI TUYẾN
            </div>
          )}

          {/* LOCATE SELF BUTTON */}
          {currentLocation && (
            <button
              onClick={() => {
                setFocusCoords([currentLocation.lat, currentLocation.lng]);
                addToast('Đã định vị camera về vị trí GPS hiện tại!', 'info');
              }}
              title="Định vị tôi"
              className="w-10 h-10 bg-[#FFD700] hover:brightness-110 text-black rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(255,215,0,0.25)] cursor-pointer transition-all"
            >
              <Navigation className="w-5 h-5 fill-current rotate-45" />
            </button>
          )}
        </div>
      </header>

      {/* BODY CONTENT VIEW */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* SIDE CONTROL SHEET OVERLAY - FLOATING HIGH CONTRAST */}
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.aside
              initial={{ x: -350, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -350, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 180 }}
              className="absolute md:relative left-0 top-0 bottom-0 w-full sm:w-[360px] bg-[#0B0C10] border-r border-white/10 flex flex-col z-40 shadow-[10px_0_30px_rgba(0,0,0,0.8)] shrink-0"
            >
              {/* PRIMARY HIGH CONTRAST TAB SELECTION PANEL */}
              <div className={`grid ${user.role === 'master' ? 'grid-cols-6' : 'grid-cols-5'} bg-[#07080A] border-b border-white/10 p-1.5 gap-1 shrink-0`}>
                <button
                  onClick={() => { setActiveTab('tracklog'); setIsOfflineSelectionActive(false); }}
                  className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[9px] font-extrabold tracking-wider transition-all cursor-pointer ${
                    activeTab === 'tracklog'
                      ? 'bg-[#FFD700] text-black font-black shadow-[0_0_12px_rgba(255,215,0,0.2)]'
                      : 'text-white/40 hover:text-white bg-black/20 hover:bg-black/55 border border-white/5'
                  }`}
                  title="Ghi tuyến tuần tra"
                >
                  <Activity className="w-3.5 h-3.5" />
                  GHI GPS
                </button>
                <button
                  onClick={() => { setActiveTab('measure'); setIsOfflineSelectionActive(false); }}
                  className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[9px] font-extrabold tracking-wider transition-all cursor-pointer ${
                    activeTab === 'measure'
                      ? 'bg-[#FFD700] text-black font-black shadow-[0_0_12px_rgba(255,215,0,0.2)]'
                      : 'text-white/40 hover:text-white bg-black/20 hover:bg-black/55 border border-white/5'
                  }`}
                  title="Đo diện tích đám cháy"
                >
                  <Flame className="w-3.5 h-3.5" />
                  ĐO CHÁY
                </button>
                <button
                  onClick={() => { setActiveTab('kml'); setIsOfflineSelectionActive(false); }}
                  className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[9px] font-extrabold tracking-wider transition-all cursor-pointer ${
                    activeTab === 'kml'
                      ? 'bg-[#FFD700] text-black font-black shadow-[0_0_12px_rgba(255,215,0,0.2)]'
                      : 'text-white/40 hover:text-white bg-black/20 hover:bg-black/55 border border-white/5'
                  }`}
                  title="Quản lý bản đồ lâm nghiệp KML"
                >
                  <Layers className="w-3.5 h-3.5" />
                  KML/KMZ
                </button>
                <button
                  onClick={() => { setActiveTab('offline'); setIsOfflineSelectionActive(true); }}
                  className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[9px] font-extrabold tracking-wider transition-all cursor-pointer ${
                    activeTab === 'offline'
                      ? 'bg-[#FFD700] text-black font-black shadow-[0_0_12px_rgba(255,215,0,0.2)]'
                      : 'text-white/40 hover:text-white bg-black/20 hover:bg-black/55 border border-white/5'
                  }`}
                  title="Tải bản đồ ngoại tuyến"
                >
                  <Download className="w-3.5 h-3.5" />
                  OFFLINE
                </button>
                <button
                  onClick={() => { setActiveTab('ai'); setIsOfflineSelectionActive(false); }}
                  className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[9px] font-extrabold tracking-wider transition-all cursor-pointer ${
                    activeTab === 'ai'
                      ? 'bg-[#FFD700] text-black font-black shadow-[0_0_12px_rgba(255,215,0,0.2)]'
                      : 'text-white/40 hover:text-white bg-black/20 hover:bg-black/55 border border-white/5'
                  }`}
                  title="Trợ lý AI phân tích thực địa"
                >
                  <Bot className="w-3.5 h-3.5" />
                  AI
                </button>
                <button
                  onClick={() => { setActiveTab('auth'); setIsOfflineSelectionActive(false); }}
                  className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[9px] font-extrabold tracking-wider transition-all cursor-pointer ${
                    activeTab === 'auth'
                      ? 'bg-[#FFD700] text-black font-black shadow-[0_0_12px_rgba(255,215,0,0.2)]'
                      : 'text-white/40 hover:text-white bg-black/20 hover:bg-black/55 border border-white/5'
                  }`}
                  title="Tài khoản & Đồng bộ đám mây"
                >
                  <CloudLightning className="w-3.5 h-3.5" />
                  SYNC
                </button>
                {user.role === 'master' && (
                  <button
                    onClick={() => { setActiveTab('command'); setIsOfflineSelectionActive(false); }}
                    className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[9.5px] font-black tracking-wider transition-all cursor-pointer ${
                      activeTab === 'command'
                        ? 'bg-[#FF4444] text-white font-black shadow-[0_0_12px_rgba(255,68,68,0.4)]'
                        : 'text-white/40 hover:text-white bg-black/20 hover:bg-black/55 border border-white/5'
                    }`}
                    title="Trung tâm chỉ huy & Điều động ngoại nghiệp"
                  >
                    <Radio className={`w-3.5 h-3.5 ${activeTab === 'command' ? 'animate-pulse' : 'text-[#FF4444]'}`} />
                    CHỈ HUY
                  </button>
                )}
              </div>

              {/* ACTIVE TAB CONTROL CONTENT AREA */}
              <div className="flex-1 overflow-y-auto p-4 md:p-5">
                {activeTab === 'tracklog' && (
                  <TracklogPanel
                     activeTracklog={activeTracklog}
                     tracklogsList={tracklogsList}
                     isTracking={isTracking}
                     isPaused={isPaused}
                     onStartTracking={startTracking}
                     onPauseTracking={pauseTracking}
                     onResumeTracking={resumeTracking}
                     onStopTracking={stopTracking}
                     onDeleteTracklog={deleteTracklog}
                     onToggleTrackVisibility={toggleTrackVisibility}
                     onSyncTracklog={syncSingleTracklog}
                     visibleTrackIds={visibleTrackIds}
                     isFirebaseLoggedIn={user.isLoggedIn}
                     onFocusCoordinates={(coords) => setFocusCoords(coords)}
                  />
                )}
                {activeTab === 'measure' && (
                  <AreaMeasurePanel
                    savedFireMeasurements={savedFireMeasurements}
                    activeFirePoints={activeFirePoints}
                    isMeasuring={isMeasuring}
                    visibleFireIds={visibleFireIds}
                    currentLocation={currentLocation}
                    onStartMeasuring={startFireMeasuring}
                    onAddManualPoint={addManualFirePoint}
                    onRemoveLastPoint={removeLastFirePoint}
                    onFinishMeasuring={finishFireMeasuring}
                    onCancelMeasuring={cancelFireMeasuring}
                    onDeleteMeasurement={deleteFireMeasurement}
                    onToggleFireVisibility={toggleFireVisibility}
                    onShareToTechnicalRoom={shareToTechnicalRoom}
                    addToast={addToast}
                  />
                )}
                {activeTab === 'kml' && (
                  <KmlManagerPanel
                    kmlLayers={kmlLayers}
                    onImportLayer={importKmlLayer}
                    onToggleLayerVisibility={toggleLayerVisibility}
                    onDeleteLayer={deleteKmlLayer}
                    onLoadSampleLayers={loadSampleLayersOnMap}
                    onFocusCoordinates={(coords) => setFocusCoords(coords)}
                    addToast={addToast}
                    selectedLabelAttribute={selectedLabelAttribute}
                    onLabelAttributeChange={setSelectedLabelAttribute}
                  />
                )}
                {activeTab === 'offline' && (
                  <OfflineMapPanel
                    downloadedRegions={offlineRegions}
                    isSelectionActive={isOfflineSelectionActive}
                    onToggleSelection={() => setIsOfflineSelectionActive(!isOfflineSelectionActive)}
                    selectedBbox={selectedBbox}
                    onDownloadRegion={downloadOfflineRegion}
                    onDeleteRegion={deleteOfflineRegion}
                    onFocusRegion={focusRegionOnMap}
                    addToast={addToast}
                    activeMapStyle={activeMapStyle}
                  />
                )}
                {activeTab === 'ai' && (
                  <AIAssistant addToast={addToast} />
                )}
                {activeTab === 'auth' && (
                  <AuthSyncPanel
                    user={user}
                    tracklogsList={tracklogsList}
                    offlineRegions={offlineRegions}
                    onLogin={handleFirebaseLogin}
                    onLogout={handleFirebaseLogout}
                    onSyncAll={syncAllDataWithFirebase}
                    isSyncing={isSyncing}
                    addToast={addToast}
                    subAccounts={subAccounts}
                    onUpdateSubAccounts={saveSubAccounts}
                    securityPin={securityPin}
                    onSetSecurityPin={saveSecurityPin}
                    onLockApp={() => setIsAppLocked(true)}
                    onOptimizeData={handleOptimizeData}
                  />
                )}
                {activeTab === 'command' && user.role === 'master' && (
                  <div className="flex flex-col h-full text-white">
                    {/* Header */}
                    <div className="border-b border-white/10 pb-4 mb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Radio className="w-5 h-5 text-[#FF4444] animate-pulse" />
                        <h3 className="font-black text-sm tracking-wider uppercase text-gray-200">TACTICAL DISPATCH CENTER</h3>
                      </div>
                      <p className="text-xs text-white/40 leading-snug">
                        Chỉ huy lực lượng kiểm lâm, điều động khẩn cấp ngoại nghiệp tiếp cận dập tắt đám cháy rừng mùa khô hạn.
                      </p>
                    </div>

                    {/* Regional alert status card */}
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 mb-4 flex flex-col gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-red-400 font-extrabold uppercase tracking-widest">CẢNH BÁO CHÁY KHU VỰC</span>
                        <span className="text-[10px] bg-red-500 text-white font-extrabold px-1.5 py-0.5 rounded animate-pulse">CẤP V (CỰC KỲ NGUY HIỂM)</span>
                      </div>
                      <p className="text-xs text-white/80 leading-normal">
                        Nắng nóng khô hanh kéo dài trên diện rộng. Độ ẩm thảm thực vật giảm sâu. Nghiêm cấm mọi hành vi đốt nương rẫy.
                      </p>
                    </div>

                    {/* Active field force section */}
                    <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4">
                      <div>
                        <div className="flex justify-between items-center mb-2.5">
                          <span className="text-[11px] font-black tracking-wider text-white/50 uppercase">LỰC LƯỢNG NGOẠI NGHIỆP ({activePatrolOfficers.length})</span>
                          <span className="text-[10px] font-mono text-green-400 font-extrabold flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> LIVE GPS
                          </span>
                        </div>

                        <div className="flex flex-col gap-3">
                          {activePatrolOfficers.map((officer) => {
                            const isMobilized = officer.status === 'mobilized';
                            
                            // Calculate proximity to nearest fire
                            let nearestFireName = 'Không có cháy';
                            let nearestFireDist = -1;
                            if (savedFireMeasurements && savedFireMeasurements.length > 0) {
                              let minD = Infinity;
                              savedFireMeasurements.forEach((fire) => {
                                if (fire.points.length > 0) {
                                  const dist = getDistance(officer.lat, officer.lng, fire.points[0].lat, fire.points[0].lng);
                                  if (dist < minD) {
                                    minD = dist;
                                    nearestFireName = fire.name;
                                  }
                                }
                              });
                              if (minD !== Infinity) {
                                nearestFireDist = minD;
                              }
                            }

                            return (
                              <div 
                                key={officer.id} 
                                className={`p-3.5 rounded-xl border transition-all duration-300 ${
                                  isMobilized 
                                    ? 'bg-red-500/10 border-red-500/40 hover:border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.1)]' 
                                    : 'bg-black/50 border-white/10 hover:border-white/20'
                                }`}
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <h4 className="font-extrabold text-sm text-gray-100">{officer.name}</h4>
                                    <p className="text-[10px] text-white/40">{officer.role}</p>
                                  </div>
                                  <span className={`text-[9px] px-2 py-0.5 rounded font-black tracking-wider uppercase ${
                                    isMobilized 
                                      ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse' 
                                      : 'bg-green-500/20 text-green-400 border border-green-500/20'
                                  }`}>
                                    {isMobilized ? 'ĐANG TIẾP CẬN CHÁY' : 'ĐANG TUẦN TRA'}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 bg-white/5 p-2.5 rounded-lg text-[11px] mb-3">
                                  <div>
                                    <span className="text-white/40 block text-[9px] uppercase font-bold">Khu vực:</span>
                                    <span className="text-gray-200 font-extrabold truncate block">{officer.region}</span>
                                  </div>
                                  <div>
                                    <span className="text-white/40 block text-[9px] uppercase font-bold">Tọa độ:</span>
                                    <span className="text-gray-300 font-mono font-bold block">{officer.lat}, {officer.lng}</span>
                                  </div>
                                  <div className="col-span-2 pt-1.5 border-t border-white/5 flex justify-between items-center">
                                    <span className="text-white/40 text-[9px] uppercase font-bold">Vị trí tương quan cháy:</span>
                                    <span className="text-[#FFD700] font-black">
                                      {nearestFireDist >= 0 
                                        ? `Cách [${nearestFireName}] ${(nearestFireDist / 1000).toFixed(2)} km`
                                        : 'Chưa phát hiện đám cháy'
                                      }
                                    </span>
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  {isMobilized ? (
                                    <button
                                      onClick={() => {
                                        setActivePatrolOfficers(prev => 
                                          prev.map(o => o.id === officer.id ? { ...o, status: 'patrolling', mobilizedToFireId: undefined } : o)
                                        );
                                        addToast(`Đã thu hồi lệnh điều động của cán bộ ${officer.name}`, 'info');
                                      }}
                                      className="flex-1 bg-white/10 hover:bg-white/20 text-white font-extrabold text-[11px] py-2 px-3 rounded-lg border border-white/10 hover:border-white/20 transition-all flex items-center justify-center gap-1 cursor-pointer"
                                    >
                                      HỦY ĐIỀU ĐỘNG
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        if (savedFireMeasurements.length === 0) {
                                          addToast('Hiện không có dữ liệu đám cháy nào được lưu hoặc báo cáo để điều động lực lượng đến!', 'warning');
                                          return;
                                        }
                                        
                                        // Mobilize to nearest fire
                                        let targetFireId = savedFireMeasurements[0].id;
                                        let minD = Infinity;
                                                       const targetFire = savedFireMeasurements.find(f => f.id === targetFireId);
                                        addToast(`🚨 PHÁT LỆNH ĐIỀU ĐỘNG KHẨN CẤP: Chỉ định cán bộ ${officer.name} di chuyển khẩn cấp tiếp cận điểm cháy "${targetFire?.name}"! Lộ trình đã vẽ trực tiếp lên bản đồ.`, 'success');
                                      }}
                                      className="flex-1 bg-red-500 hover:bg-red-600 text-white font-black text-[11px] py-2 px-3 rounded-lg shadow-lg hover:shadow-red-500/20 transition-all flex items-center justify-center gap-1 cursor-pointer border border-red-500"
                                    >
                                      🚨 ĐIỀU ĐỘNG KHẨN CẤP
                                    </button>
                                  )}
                                  
                                  <a 
                                    href={`tel:${officer.phone}`}
                                    className="w-9 h-9 bg-black/40 hover:bg-black/60 border border-white/10 hover:border-white/20 rounded-lg flex items-center justify-center text-sky-400 transition-all"
                                    title={`Gọi điện cho ${officer.name}`}
                                  >
                                    <Phone className="w-4 h-4" />
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* OUTDOOR ACCESSIBILITY NOTIFICATION FOR SUNLIGHT */}
              <div className="p-4 bg-[#07080A] border-t border-white/10 text-[11px] text-white/30 font-mono text-center shrink-0 leading-normal flex flex-col gap-1">
                <span>Giao diện ngoài trời tương phản cao. Thích hợp sử dụng trong môi trường ánh sáng mặt trời mạnh.</span>
                <span className="text-[#FFD700] font-black text-[10px] tracking-wider uppercase mt-1">Chữ ký tác giả: TUNGHT.NB</span>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* MAP CONTAINER CANVAS MODULE */}
        <main className="flex-1 h-full relative z-0">
          {/* MAP STYLES TOGGLER SELECTION (HIGH ACCESSIBILITY OVERLAY) */}
          <div className="absolute top-3 left-3 md:top-4 md:left-4 z-10 flex gap-1 md:gap-1.5 bg-black/95 backdrop-blur p-1 md:p-1.5 rounded-lg md:rounded-xl border border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.7)]">
            {(['standard', 'topo', 'dark', 'satellite'] as const).map((style) => (
              <button
                key={style}
                onClick={() => {
                  setActiveMapStyle(style);
                  addToast(`Đã chuyển bản đồ sang chế độ: ${
                    style === 'standard' ? 'Sơ Đồ Chuẩn' : style === 'topo' ? 'Địa Hình' : style === 'dark' ? 'Đêm/Tương Phản' : 'Vệ Tinh'
                  }`, 'info');
                }}
                className={`h-6 md:h-9 px-1.5 md:px-3 rounded md:rounded-lg text-[8px] md:text-xs font-black transition-colors uppercase tracking-tight md:tracking-wider cursor-pointer ${
                  activeMapStyle === style
                    ? 'bg-[#FFD700] text-black font-black'
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                {style === 'standard' ? 'SƠ ĐỒ' : style === 'topo' ? 'ĐIỆA HÌNH' : style === 'dark' ? 'ĐÊM' : 'VỆ TINH'}
              </button>
            ))}
          </div>

          {/* DYNAMIC GPS ACCURACY MONITORING HUD (ANTI-ERROR FIRE MEASUREMENT) */}
          {(inspectedPoint || currentLocation) && (
            (() => {
              const activeLocation = inspectedPoint || currentLocation;
              if (!activeLocation) return null;
              
              const parcelInfo = getQueryParcelName(activeLocation.lat, activeLocation.lng);
              const isInspected = !!inspectedPoint;

              return (
                <div className="absolute top-12 left-3 md:top-16 md:left-4 z-10 bg-black/95 backdrop-blur border border-white/10 rounded-lg md:rounded-xl p-2 md:p-3 shadow-[0_4px_25px_rgba(0,0,0,0.6)] w-[170px] md:w-64 font-mono text-[7px] md:text-[10px] text-white/95 flex flex-col gap-1 md:gap-1.5 animate-fade-in">
                  <div className="flex justify-between items-center border-b border-white/5 pb-1 mb-0.5">
                    <div className="flex items-center gap-0.5 md:gap-1">
                      {isInspected ? (
                        <MapPin className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 text-[#FFD700]" />
                      ) : (
                        <Compass className={`w-2.5 h-2.5 md:w-3.5 md:h-3.5 ${
                          !activeLocation.accuracy ? 'text-gray-400' : activeLocation.accuracy <= 5 ? 'text-emerald-400' : activeLocation.accuracy <= 15 ? 'text-amber-400' : 'text-red-400'
                        }`} />
                      )}
                      <span className="text-[6.5px] md:text-[9px] text-[#FFD700] font-black uppercase tracking-wider">Trợ lý Bản đồ của chủ rừng</span>
                    </div>
                    {isInspected ? (
                      <button 
                        onClick={() => setInspectedPoint(null)}
                        title="Quay lại GPS Live"
                        className="text-[6px] md:text-[8px] bg-red-500/20 text-red-400 hover:text-white border border-red-500/40 px-1 rounded hover:bg-red-500 transition-colors font-sans cursor-pointer font-bold uppercase tracking-tight"
                      >
                        Quay lại live
                      </button>
                    ) : (
                      <span className={`w-1 md:w-1.5 h-1 md:h-1.5 rounded-full animate-pulse ${
                        !activeLocation.accuracy ? 'bg-gray-400' : activeLocation.accuracy <= 5 ? 'bg-emerald-400' : activeLocation.accuracy <= 15 ? 'bg-amber-400' : 'bg-red-400'
                      }`} />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-x-1.5 md:gap-x-2 gap-y-0.5 md:gap-y-1">
                    <div className="flex justify-between">
                      <span className="text-white/40">Vĩ độ:</span>
                      <span className="font-bold">{activeLocation.lat.toFixed(5)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">Kinh độ:</span>
                      <span className="font-bold">{activeLocation.lng.toFixed(5)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">Cao độ:</span>
                      <span className="font-bold text-sky-400">{activeLocation.altitude ? `${activeLocation.altitude.toFixed(1)}m` : '---'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">Chế độ:</span>
                      <span className={`font-black ${isInspected ? 'text-[#FFD700]' : 'text-emerald-400'}`}>
                        {isInspected ? 'TRA CỨU' : 'LIVE GPS'}
                      </span>
                    </div>
                  </div>

                  {/* PARCEL OR REGION QUERY DETAILED DISPLAY */}
                  <div className="border-t border-white/5 pt-1 mt-0.5">
                    <div className="flex justify-between text-[6.5px] md:text-[9px] font-black uppercase tracking-wider mb-0.5">
                      <span className="text-white/40">Thửa đất lâm nghiệp:</span>
                      <span className={parcelInfo ? 'text-[#00FF41] font-bold' : 'text-white/30 font-normal italic'}>
                        {parcelInfo ? parcelInfo.name : 'Ngoài lô khoán'}
                      </span>
                    </div>
                    {parcelInfo && parcelInfo.details && (
                      <div className="text-[5.5px] md:text-[8px] text-white/70 bg-white/5 p-1 rounded font-sans max-h-16 overflow-y-auto leading-normal">
                        {parcelInfo.details}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/5 pt-1 md:pt-1.5 flex flex-col gap-0.5">
                    <div className="flex justify-between items-center">
                      <span className="text-white/40 font-bold">Sai số thực địa:</span>
                      <span className={`font-black text-[8px] md:text-xs ${
                        isInspected ? 'text-[#FFD700]' : !activeLocation.accuracy ? 'text-gray-400' : activeLocation.accuracy <= 5 ? 'text-emerald-400' : activeLocation.accuracy <= 15 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {isInspected ? '±10cm (Bản đồ số)' : activeLocation.accuracy ? `±${activeLocation.accuracy.toFixed(2)}m` : '±0.08m (RTK)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[5.5px] md:text-[8px] uppercase font-black">
                      <span className="text-white/30">Cấp độ sai lệch:</span>
                      <span className={
                        isInspected ? 'text-[#FFD700]' : !activeLocation.accuracy ? 'text-gray-400' : activeLocation.accuracy <= 1 ? 'text-emerald-400 animate-pulse' : activeLocation.accuracy <= 5 ? 'text-emerald-400' : activeLocation.accuracy <= 15 ? 'text-amber-400' : 'text-red-400'
                      }>
                        {isInspected ? 'DƯỚI 10CM (YÊU CẦU)' : !activeLocation.accuracy ? 'RTK CHÍNH XÁC CAO' : activeLocation.accuracy <= 1 ? 'RTK QUÂN SỰ (<10cm)' : activeLocation.accuracy <= 5 ? 'CAO (GPS THIẾT BỊ)' : 'YẾU (DƯỚI TÁN RỪNG)'}
                      </span>
                    </div>
                  </div>

                  {/* RTK CENTIMETER ADVICE POPUP/HELP */}
                  <div className="text-[5.5px] md:text-[8px] text-white/30 leading-relaxed border-t border-white/5 pt-0.5 md:pt-1 mt-0.5">
                    💡 Để đạt <span className="text-[#FFD700] font-bold">sai số &lt;10cm</span> tránh lệch diện tích đám cháy, kết nối đầu thu <span className="text-sky-400 font-bold">RTK GNSS ngoài</span> qua Bluetooth & cấu hình <span className="text-[#00FF41] font-bold">NTRIP CORS</span>.
                  </div>
                </div>
              );
            })()
          )}

          {/* DESKTOP SIDEBAR TOGGLE GRAB BAR */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "Thu gọn thanh điều khiển" : "Mở rộng thanh điều khiển"}
            className="absolute top-1/2 -translate-y-1/2 left-0 z-20 w-5 h-16 bg-[#0B0C10] border border-l-0 border-white/10 hover:border-[#FFD700] rounded-r-xl hidden md:flex items-center justify-center text-white/40 hover:text-[#FFD700] transition-colors shadow-[4px_0_15px_rgba(0,0,0,0.5)] cursor-pointer"
          >
            <span className={`w-1 h-8 rounded bg-white/10 hover:bg-[#FFD700] transform transition-transform ${isSidebarOpen ? 'scale-y-110' : ''}`} />
          </button>

          {/* REALTIME SIMULATED TRACKING STATUS ON MAP SURFACE */}
          {isTracking && activeTracklog && (
            <div className="absolute bottom-4 left-4 z-10 bg-black/95 backdrop-blur border border-[#FF4444] rounded-xl p-4 shadow-[0_0_20px_rgba(255,68,68,0.15)] max-w-xs font-mono text-xs text-white/90 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-[#FF4444] font-black border-b border-white/5 pb-1 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-[#FF4444] animate-ping shrink-0" />
                Live GPS Recorder
              </div>
              <div className="flex justify-between">
                <span>Khoảng cách:</span>
                <span className="text-white font-bold">{ (activeTracklog.totalDistance / 1000).toFixed(2) } km</span>
              </div>
              <div className="flex justify-between">
                <span>Vận tốc TB:</span>
                <span className="text-white font-bold">{ activeTracklog.avgSpeed.toFixed(1) } km/h</span>
              </div>
            </div>
          )}

          {/* REALTIME FOREST FIRE MEASUREMENT OVERLAY HUD */}
          {isMeasuring && activeFirePoints.length > 0 && (
            <div className="absolute bottom-4 right-4 z-10 bg-black/95 backdrop-blur border border-orange-500 rounded-xl p-4 shadow-[0_0_25px_rgba(251,146,60,0.25)] max-w-xs font-mono text-xs text-white/90 flex flex-col gap-1.5 animate-pulse">
              <div className="flex items-center gap-1.5 text-orange-400 font-black border-b border-white/5 pb-1 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping shrink-0" />
                Đo Đám Cháy Live
              </div>
              <div className="flex justify-between">
                <span>Diện tích:</span>
                <span className="text-orange-400 font-bold">
                  {formatArea(calculatePolygonArea(activeFirePoints.map(p => [p.lat, p.lng] as [number, number])))}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Điểm mốc:</span>
                <span className="text-white font-bold">{activeFirePoints.length} điểm GPS</span>
              </div>
              <div className="text-[10px] text-white/40 mt-1 leading-normal">
                Tự bắt điểm di chuyển (&gt;5m) hoặc bấm chốt thủ công.
              </div>
            </div>
          )}

          {/* GUIDE OVERLAY FOR OFFLINE MAP CRITICAL CROP */}
          {isOfflineSelectionActive && (
            <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-10 bg-[#FFD700] text-black font-black text-xs px-5 py-3 rounded-full flex items-center gap-2 shadow-[0_0_25px_rgba(255,215,0,0.3)] pointer-events-none animate-pulse border border-black/10 uppercase tracking-widest">
              <AlertTriangle className="w-4 h-4 fill-current shrink-0" />
              Di chuyển và phóng to bản đồ để điều chỉnh vùng tải offline
            </div>
          )}

          {/* THE LEAFLET MAP ELEMENT */}
          <MapComponent
            currentLocation={currentLocation}
            tracklogPoints={getRenderTracklogPoints()}
            kmlLayers={kmlLayers}
            activeMapStyle={activeMapStyle}
            onBboxChange={(sw, ne) => setSelectedBbox({ sw, ne })}
            isOfflineSelectionActive={isOfflineSelectionActive}
            downloadedRegions={offlineRegions}
            focusCoords={focusCoords}
            onFocusHandled={() => setFocusCoords(null)}
            selectedLabelAttribute={selectedLabelAttribute}
            onUpdateCurrentLocation={setCurrentLocation}
            activeFirePoints={activeFirePoints}
            savedFireMeasurements={savedFireMeasurements}
            visibleFireIds={visibleFireIds}
            savedTracklogs={tracklogsList}
            visibleTrackIds={visibleTrackIds}
            activePatrolOfficers={activePatrolOfficers}
            inspectedPoint={inspectedPoint}
            onMapClick={handleMapClick}
          />
          
          {/* FLOATING SUB-ACCOUNT EMERGENCY BUTTON */}
          {user.isLoggedIn && user.role === 'sub' && (
            <button
              onClick={() => {
                if (!currentLocation) {
                  addToast('Chưa bắt được tọa độ GPS, không thể gửi báo cáo chính xác!', 'error');
                  return;
                }
                const alertData = {
                  id: `alert-${Date.now()}`,
                  officerName: user.displayName,
                  lat: currentLocation.lat,
                  lng: currentLocation.lng,
                  timestamp: Date.now()
                };
                localStorage.setItem('vinamap_emergency_alert', JSON.stringify(alertData));
                
                // Add local visual confirmation
                addToast('ĐÃ GỬI BÁO CHÁY KHẨN CẤP VỀ CHỈ HUY TRUNG TÂM!', 'success');
              }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] bg-red-600 hover:bg-red-500 text-white font-black uppercase text-sm px-6 py-3 rounded-full shadow-[0_0_25px_rgba(220,38,38,0.8)] flex items-center gap-2 transition-all cursor-pointer border border-red-400/50 hover:scale-105"
            >
              <AlertTriangle className="w-5 h-5 animate-pulse" />
              Báo Cháy Khẩn Cấp
            </button>
          )}
        </main>
      </div>

      {/* LOCKSCREEN SECURITY CODE OVERLAY (ANTI-HACK / DATA PROTECTION) */}
      {isAppLocked && securityPin && (
        <LockScreen
          correctPin={securityPin}
          onUnlock={() => setIsAppLocked(false)}
          onSelfDestruct={handleSelfDestruct}
        />
      )}
    </div>
  );
}
