import React, { useState, useEffect } from 'react';
import { Play, Pause, Square, MapPin, Trash2, Download, CloudLightning, Activity, Clock, Compass, ShieldCheck, Sun, AlertTriangle } from 'lucide-react';
import { Tracklog } from '../types';
import { formatDistance, formatDuration, formatDateTime, calculateSpeed } from '../utils/geoUtils';

interface TracklogPanelProps {
  activeTracklog: Tracklog | null;
  tracklogsList: Tracklog[];
  isTracking: boolean;
  isPaused: boolean;
  onStartTracking: (
    name: string,
    isPatrol?: boolean,
    officerName?: string,
    fireRiskLevel?: string,
    weatherCondition?: string
  ) => void;
  onPauseTracking: () => void;
  onResumeTracking: () => void;
  onStopTracking: () => void;
  onDeleteTracklog: (id: string) => void;
  onToggleTrackVisibility: (id: string) => void;
  onSyncTracklog: (id: string) => void;
  visibleTrackIds: string[];
  isFirebaseLoggedIn: boolean;
  currentUserDisplayName?: string;
  onFocusCoordinates?: (coords: [number, number]) => void;
}

export const TracklogPanel: React.FC<TracklogPanelProps> = ({
  activeTracklog,
  tracklogsList,
  isTracking,
  isPaused,
  onStartTracking,
  onPauseTracking,
  onResumeTracking,
  onStopTracking,
  onDeleteTracklog,
  onToggleTrackVisibility,
  onSyncTracklog,
  visibleTrackIds,
  isFirebaseLoggedIn,
  currentUserDisplayName = '',
  onFocusCoordinates,
}) => {
  const [newTrackName, setNewTrackName] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);

  // PATROL METADATA STATES
  const [isPatrol, setIsPatrol] = useState(true);
  const [officerName, setOfficerName] = useState('');
  const [fireRiskLevel, setFireRiskLevel] = useState('Cấp V (Cực kỳ nguy hiểm)');
  const [weatherCondition, setWeatherCondition] = useState('Nắng nóng, hanh khô kéo dài');

  // Set default name and officer name
  useEffect(() => {
    if (!isTracking) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('vi-VN').replace(/\//g, '-');
      const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      setNewTrackName(`Tuần_Tra_${dateStr}_${timeStr}`);
      setOfficerName(currentUserDisplayName || 'Kiểm lâm ngoại nghiệp');
    }
  }, [isTracking, currentUserDisplayName]);

  // Handle active track timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTracking && !isPaused) {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else if (!isTracking) {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [isTracking, isPaused]);

  // Sync elapsed time from active tracklog to ensure accuracy
  useEffect(() => {
    if (activeTracklog) {
      setElapsedTime(activeTracklog.duration);
    }
  }, [activeTracklog]);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrackName.trim()) return;
    onStartTracking(
      newTrackName,
      isPatrol,
      isPatrol ? officerName : undefined,
      isPatrol ? fireRiskLevel : undefined,
      isPatrol ? weatherCondition : undefined
    );
  };

  const handleExport = (track: Tracklog, format: 'gpx' | 'kml') => {
    let content = '';
    let mimeType = '';
    let extension = '';

    if (format === 'gpx') {
      content = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="VinaMap Outdoor" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${track.name}</name>
    <time>${new Date(track.startTime).toISOString()}</time>
    <desc>GPS Tracklog xuất bản từ ứng dụng VinaMap Outdoor</desc>
  </metadata>
  <trk>
    <name>${track.name}</name>
    <trkseg>${track.points
      .map(
        (p) => `
      <trkpt lat="${p.lat}" lon="${p.lng}">
        ${p.altitude !== undefined ? `<ele>${p.altitude}</ele>` : ''}
        <time>${new Date(p.timestamp).toISOString()}</time>
      </trkpt>`
      )
      .join('')}
    </trkseg>
  </trk>
</gpx>`;
      mimeType = 'application/gpx+xml';
      extension = 'gpx';
    } else {
      content = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${track.name}</name>
    <description>GPS Tracklog từ ứng dụng dã ngoại VinaMap</description>
    <Style id="yellowLineGreenPoly">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>${track.name}</name>
      <styleUrl>#yellowLineGreenPoly</styleUrl>
      <LineString>
        <extrude>1</extrude>
        <tessellate>1</tessellate>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
          ${track.points.map((p) => `${p.lng},${p.lat},${p.altitude || 0}`).join('\n          ')}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
      mimeType = 'application/vnd.google-earth.kml+xml';
      extension = 'kml';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${track.name.toLowerCase().replace(/\s+/g, '_')}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* SECTION 1: ACTIVE LOCATOR STATUS */}
      {isTracking && activeTracklog ? (
        <div className="bg-black/90 border-2 border-[#FF4444] rounded-2xl p-5 text-gray-100 shadow-[0_0_30px_rgba(255,68,68,0.15)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF4444] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#FF4444]"></span>
              </span>
              <span className="text-[#FF4444] text-sm font-extrabold uppercase tracking-widest">Đang Ghi Tuyến Đường</span>
            </div>
            <span className="font-mono text-xs bg-[#FF4444]/20 text-[#FF4444] border border-[#FF4444]/30 px-3 py-1 rounded-full font-bold">
              {activeTracklog.points.length} điểm GPS
            </span>
          </div>

          <h3 className="text-xl font-black text-white leading-tight mb-4 truncate">{activeTracklog.name}</h3>

          {/* REALTIME METRICS - HIGH CONTRAST */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-black/60 border border-white/10 p-3 rounded-xl flex items-center gap-3">
              <Clock className="w-8 h-8 text-[#FFD700] shrink-0" />
              <div>
                <p className="text-[10px] text-white/40 font-extrabold uppercase tracking-wider">Thời gian</p>
                <p className="font-mono text-base font-black text-white">{formatDuration(elapsedTime)}</p>
              </div>
            </div>

            <div className="bg-black/60 border border-white/10 p-3 rounded-xl flex items-center gap-3">
              <Compass className="w-8 h-8 text-[#00FF41] shrink-0" />
              <div>
                <p className="text-[10px] text-white/40 font-extrabold uppercase tracking-wider">Quãng đường</p>
                <p className="font-mono text-base font-black text-white">{formatDistance(activeTracklog.totalDistance)}</p>
              </div>
            </div>

            <div className="bg-black/60 border border-white/10 p-3 rounded-xl flex items-center gap-3">
              <Activity className="w-8 h-8 text-sky-400 shrink-0" />
              <div>
                <p className="text-[10px] text-white/40 font-extrabold uppercase tracking-wider">Vận tốc TB</p>
                <p className="font-mono text-base font-black text-white">
                  {calculateSpeed(activeTracklog.totalDistance, elapsedTime).toFixed(1)} km/h
                </p>
              </div>
            </div>

            <div className="bg-black/60 border border-white/10 p-3 rounded-xl flex items-center gap-3">
              <MapPin className="w-8 h-8 text-[#FF4444] shrink-0" />
              <div>
                <p className="text-[10px] text-white/40 font-extrabold uppercase tracking-wider">Độ cao ước tính</p>
                <p className="font-mono text-base font-black text-white">
                  {activeTracklog.points[activeTracklog.points.length - 1]?.altitude?.toFixed(0) || '120'} m
                </p>
              </div>
            </div>
          </div>

          {/* CONTROL ACTIONS (56px HEIGHT) */}
          <div className="flex gap-3">
            {isPaused ? (
              <button
                onClick={onResumeTracking}
                className="flex-1 h-14 bg-[#FFD700] hover:brightness-110 text-black rounded-xl font-black text-base flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <Play className="w-6 h-6 fill-current" /> TIẾP TỤC
              </button>
            ) : (
              <button
                onClick={onPauseTracking}
                className="flex-1 h-14 bg-[#FFD700] hover:brightness-110 text-black rounded-xl font-black text-base flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <Pause className="w-6 h-6 fill-current" /> TẠM DỪNG
              </button>
            )}

            <button
              onClick={onStopTracking}
              className="flex-1 h-14 bg-white hover:bg-white/90 text-black border-2 border-transparent rounded-xl font-black text-base flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
            >
              <Square className="w-6 h-6 fill-current" /> KẾT THÚC
            </button>
          </div>
        </div>
      ) : (
        /* START TRACKING FORM */
        <form onSubmit={handleStart} className="bg-black/80 border border-white/10 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-white/5 pb-3">
            <Activity className="w-5 h-5 text-[#FF4444]" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Cấu Hình Lộ Trình Ghi GPS</h3>
          </div>

          {/* PATROL TYPE TOGGLE BUTTONS */}
          <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
            <button
              type="button"
              onClick={() => setIsPatrol(true)}
              className={`py-2 rounded-lg text-[11px] font-bold uppercase transition-all cursor-pointer ${
                isPatrol
                  ? 'bg-[#FFD700] text-black font-black shadow-md'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              Tuần Tra Mùa Khô
            </button>
            <button
              type="button"
              onClick={() => setIsPatrol(false)}
              className={`py-2 rounded-lg text-[11px] font-bold uppercase transition-all cursor-pointer ${
                !isPatrol
                  ? 'bg-white/15 text-white font-black'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              Ghi Thường Niên
            </button>
          </div>

          {/* BASIC ROUTE NAME */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-white/50">Tên tuyến tuần tra / lộ trình</label>
            <input
              type="text"
              value={newTrackName}
              onChange={(e) => setNewTrackName(e.target.value)}
              placeholder="Nhập tên tuyến đường dã ngoại..."
              className="h-11 px-3 bg-black border border-white/10 focus:border-[#FFD700] text-gray-100 font-bold rounded-xl text-xs outline-none transition-colors"
            />
          </div>

          {/* CONDITIONAL PATROL METADATA SECTION */}
          {isPatrol && (
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3 flex flex-col gap-3 animate-fade-in">
              <div className="flex items-center gap-1.5 text-orange-400 font-black text-[10px] uppercase tracking-wider border-b border-orange-500/10 pb-1.5">
                <Sun className="w-3.5 h-3.5 shrink-0" />
                Thông số tuần tra mùa nắng khô
              </div>

              {/* OFFICER NAME */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-white/40">Cán bộ thực hiện</label>
                <input
                  type="text"
                  value={officerName}
                  onChange={(e) => setOfficerName(e.target.value)}
                  placeholder="Họ tên kiểm lâm ngoại nghiệp..."
                  className="h-10 px-3 bg-black border border-white/10 focus:border-[#FFD700] text-gray-100 font-bold rounded-lg text-xs outline-none"
                />
              </div>

              {/* RISK SELECTION AND WEATHER */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-white/40">Cấp dự báo cháy</label>
                  <select
                    value={fireRiskLevel}
                    onChange={(e) => setFireRiskLevel(e.target.value)}
                    className="h-10 px-2 bg-black border border-white/10 text-orange-400 font-bold rounded-lg text-[11px] outline-none"
                  >
                    <option value="Cấp I (Ít nguy cơ)">Cấp I (Rất thấp)</option>
                    <option value="Cấp II (Trung bình)">Cấp II (Thấp)</option>
                    <option value="Cấp III (Cao)">Cấp III (Trung bình)</option>
                    <option value="Cấp IV (Nguy hiểm)">Cấp IV (Nguy cơ)</option>
                    <option value="Cấp V (Cực kỳ nguy hiểm)">Cấp V (Thảm họa)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-white/40">Thời tiết hiện trạng</label>
                  <select
                    value={weatherCondition}
                    onChange={(e) => setWeatherCondition(e.target.value)}
                    className="h-10 px-2 bg-black border border-white/10 text-gray-300 font-bold rounded-lg text-[11px] outline-none"
                  >
                    <option value="Nắng nóng, hanh khô">Nắng hanh</option>
                    <option value="Nắng gay gắt, độ ẩm cực thấp">Khô kiệt</option>
                    <option value="Gió mạnh Lào khô rát">Gió phơn khô</option>
                    <option value="Mây rải rác, nhiệt độ dịu nhẹ">Dịu mát</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full h-12 bg-[#FF4444] hover:brightness-110 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg hover:shadow-red-500/10 transition-all cursor-pointer uppercase tracking-widest"
          >
            <Play className="w-4 h-4 fill-current shrink-0" /> Bắt đầu hành trình
          </button>
        </form>
      )}

      {/* SECTION 2: TRACKLOG HISTORY LIST */}
      <div className="flex-1 min-h-[220px] flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="text-sm font-black text-[#FFD700] uppercase tracking-widest">Danh Sách Tracklog Đã Lưu ({tracklogsList.length})</h3>
        </div>

        {tracklogsList.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-black/20 rounded-2xl border border-dashed border-white/10">
            <Activity className="w-10 h-10 text-white/20 mb-2" />
            <p className="text-xs font-bold text-white/40">Chưa có tuyến đường nào được ghi.</p>
            <p className="text-[10px] text-white/30 mt-1">Ấn nút "Bắt đầu ghi GPS" phía trên để thu thập dữ liệu di chuyển dã ngoại.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto max-h-[350px] flex flex-col gap-3 pr-1">
            {tracklogsList.map((track) => {
              const isVisible = visibleTrackIds.includes(track.id);
              return (
                <div key={track.id} className="bg-black/50 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <h4 className="font-bold text-gray-100 text-sm leading-none break-all">{track.name}</h4>
                        {track.isPatrol && (
                          <span className="text-[8px] bg-orange-500/20 text-orange-400 font-extrabold px-1.5 py-0.5 rounded border border-orange-500/30 flex items-center gap-0.5 leading-none">
                            <Sun className="w-2.5 h-2.5" /> TUẦN TRA KHÔ HẠN
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-white/40 font-mono">{formatDateTime(track.startTime)}</p>
                    </div>
                    {track.isSynced ? (
                      <span className="text-[9px] bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30 px-2 py-0.5 rounded font-black tracking-widest uppercase">
                        ĐÃ SYNC
                      </span>
                    ) : (
                      <span className="text-[9px] bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/30 px-2 py-0.5 rounded font-black tracking-widest uppercase">
                        CỤC BỘ
                      </span>
                    )}
                  </div>

                  {/* PATROL INFO ACCORDION IF APPLICABLE */}
                  {track.isPatrol && (
                    <div className="mt-1.5 mb-2.5 px-2.5 py-2 bg-white/5 rounded-lg border border-white/5 text-[11px] text-white/70 flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span className="text-white/40">Cán bộ:</span>
                        <span className="text-[#00FF41] font-semibold">{track.officerName || 'Kiểm lâm viên'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">Nguy cơ cháy:</span>
                        <span className="text-orange-400 font-semibold">{track.fireRiskLevel || 'Cấp V (Cực kỳ nguy hiểm)'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">Thời tiết:</span>
                        <span className="text-white/80">{track.weatherCondition || 'Nắng nóng kéo dài'}</span>
                      </div>
                    </div>
                  )}

                  {/* MINI TRACK STATS */}
                  <div className="grid grid-cols-3 gap-2 bg-black/40 p-2 rounded-lg mb-3 text-center text-[11px]">
                    <div>
                      <p className="text-[9px] text-white/40 uppercase tracking-wider">Cự ly</p>
                      <p className="font-mono font-bold text-[#FFD700]">{formatDistance(track.totalDistance)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-white/40 uppercase tracking-wider">Thời lượng</p>
                      <p className="font-mono font-bold text-[#FFD700]">{formatDuration(track.duration)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-white/40 uppercase tracking-wider">Tốc độ TB</p>
                      <p className="font-mono font-bold text-[#FFD700]">{track.avgSpeed.toFixed(1)} km/h</p>
                    </div>
                  </div>

                  {/* ACTION BAR (TACTILE & INTUITIVE) */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onToggleTrackVisibility(track.id)}
                        className={`h-9 px-2.5 text-[10px] font-black rounded-lg transition-colors border cursor-pointer uppercase tracking-wider ${
                          isVisible
                            ? 'bg-[#FFD700] border-[#FFD700] text-black font-black'
                            : 'bg-black border-white/10 text-white/50 hover:text-white'
                        }`}
                      >
                        {isVisible ? 'ẨN TRÊN MAP' : 'HIỆN TRÊN MAP'}
                      </button>

                      {track.points && track.points.length > 0 && onFocusCoordinates && (
                        <button
                          onClick={() => {
                            const firstPt = track.points[0];
                            onFocusCoordinates([firstPt.lat, firstPt.lng]);
                          }}
                          title="Định vị chuyến đi này trên bản đồ"
                          className="h-9 px-2.5 bg-[#00FF41]/15 hover:bg-[#00FF41]/25 border border-[#00FF41]/35 text-[#00FF41] rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95 text-[10px] font-black uppercase tracking-wider font-sans"
                        >
                          <MapPin className="w-3 h-3 text-[#00FF41] animate-pulse" /> ĐỊNH VỊ
                        </button>
                      )}
                    </div>

                    <div className="flex gap-1.5">
                      {/* Export GPX */}
                      <button
                        onClick={() => handleExport(track, 'gpx')}
                        title="Xuất tệp GPX"
                        className="w-9 h-9 bg-black hover:bg-black/80 text-white/80 rounded-lg flex items-center justify-center border border-white/10 cursor-pointer"
                      >
                        <Download className="w-4 h-4 text-sky-400" />
                      </button>

                      {/* Export KML */}
                      <button
                        onClick={() => handleExport(track, 'kml')}
                        title="Xuất tệp KML"
                        className="w-9 h-9 bg-black hover:bg-black/80 text-white/80 rounded-lg flex items-center justify-center border border-white/10 cursor-pointer text-[10px] font-black font-mono text-[#00FF41]"
                      >
                        KML
                      </button>

                      {/* Cloud Sync */}
                      <button
                        onClick={() => onSyncTracklog(track.id)}
                        disabled={track.isSynced}
                        title={track.isSynced ? 'Đã đồng bộ lên Firebase' : 'Đồng bộ lên Firebase'}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                          track.isSynced
                            ? 'bg-[#00FF41]/10 border-[#00FF41]/20 text-[#00FF41] cursor-default'
                            : isFirebaseLoggedIn
                            ? 'bg-black hover:bg-black/85 border-white/10 text-[#FFD700]'
                            : 'bg-black/40 border-white/5 text-white/20 cursor-not-allowed'
                        }`}
                      >
                        <CloudLightning className="w-4 h-4" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => onDeleteTracklog(track.id)}
                        className="w-9 h-9 bg-[#FF4444]/10 hover:bg-[#FF4444]/20 border border-[#FF4444]/30 text-[#FF4444] rounded-lg flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
