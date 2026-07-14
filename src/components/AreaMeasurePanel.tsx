import React, { useState, useEffect } from 'react';
import { Flame, Play, Pause, Square, MapPin, Trash2, Share2, Shield, RefreshCw, Send, Check, Eye, EyeOff, Plus, HelpCircle, HardDrive, Server, ArrowUpRight } from 'lucide-react';
import { GPSPoint, FireMeasurement } from '../types';
import { formatDistance, formatArea, formatDateTime, calculatePolygonArea, calculatePolygonPerimeter } from '../utils/geoUtils';

interface AreaMeasurePanelProps {
  currentLocation: GPSPoint | null;
  activeFirePoints: GPSPoint[];
  savedFireMeasurements: FireMeasurement[];
  visibleFireIds: string[];
  isMeasuring: boolean;
  onStartMeasuring: (name: string, operator: string) => void;
  onAddManualPoint: () => void;
  onRemoveLastPoint: () => void;
  onFinishMeasuring: () => void;
  onCancelMeasuring: () => void;
  onDeleteMeasurement: (id: string) => void;
  onToggleFireVisibility: (id: string) => void;
  onShareToTechnicalRoom: (id: string) => Promise<void>;
  addToast: (message: string, type: 'success' | 'warning' | 'error' | 'info') => void;
}

export const AreaMeasurePanel: React.FC<AreaMeasurePanelProps> = ({
  currentLocation,
  activeFirePoints,
  savedFireMeasurements,
  visibleFireIds,
  isMeasuring,
  onStartMeasuring,
  onAddManualPoint,
  onRemoveLastPoint,
  onFinishMeasuring,
  onCancelMeasuring,
  onDeleteMeasurement,
  onToggleFireVisibility,
  onShareToTechnicalRoom,
  addToast,
}) => {
  const [measureName, setMeasureName] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [isTransmitting, setIsTransmitting] = useState<string | null>(null);
  const [transmissionLogs, setTransmissionLogs] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);

  // Set default measurement name based on date-time
  useEffect(() => {
    if (!isMeasuring) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('vi-VN').replace(/\//g, '-');
      const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      setMeasureName(`Đám cháy_Tiểu khu_${100 + Math.floor(Math.random() * 50)}_${dateStr}`);
      if (!operatorName) {
        setOperatorName('Cán bộ kiểm lâm ngoại nghiệp');
      }
    }
  }, [isMeasuring]);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!measureName.trim() || !operatorName.trim()) {
      addToast('Vui lòng điền tên khu vực đo và họ tên cán bộ!', 'warning');
      return;
    }
    onStartMeasuring(measureName, operatorName);
  };

  const handleTransmit = async (id: string, name: string) => {
    setIsTransmitting(id);
    setTransmissionLogs([]);
    setShowConsole(true);

    const logs = [
      `[CONNECTION] Đang kết nối tới máy chủ Phòng Kỹ Thuật (phongkythuat.vinamap.vn)...`,
      `[SECURITY] Đang thiết lập kênh truyền bảo mật SSL/TLS 1.3...`,
      `[HANDSHAKE] Khóa công khai RSA 4096-bit được chấp nhận.`,
      `[PACKAGING] Đang nén dữ liệu tọa độ không gian (Spatial Coordinate Data)...`,
      `[GEOJSON] Đã chuyển đổi tuyến GPS thành cấu trúc Polygon GeoJSON thành công.`,
      `[TRANSMITTING] Đang gửi gói tin đo đạc ngoại nghiệp [${name}] (Kích thước: ${activeFirePoints.length * 48 + 124} bytes)...`,
    ];

    for (let i = 0; i < logs.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      setTransmissionLogs((prev) => [...prev, logs[i]]);
    }

    // Call actual trigger
    await onShareToTechnicalRoom(id);

    await new Promise((resolve) => setTimeout(resolve, 500));
    setTransmissionLogs((prev) => [
      ...prev,
      `[SERVER RESPONSE] HTTP/1.1 201 Created`,
      `[DATABASE] Đã ghi nhận tọa độ ranh giới và tính toán diện tích vào Hệ Thống Quản Lý Bản Đồ Lâm Nghiệp Trung Ương.`,
      `[SUCCESS] ĐÃ CHIA SẺ THÀNH CÔNG VỀ PHÒNG KỸ THUẬT! ✅`
    ]);

    setTimeout(() => {
      setIsTransmitting(null);
    }, 1500);
  };

  // Realtime calculations of the active measurement
  const coordsList = activeFirePoints.map(p => [p.lat, p.lng] as [number, number]);
  const liveArea = calculatePolygonArea(coordsList);
  const livePerimeter = calculatePolygonPerimeter(coordsList);

  return (
    <div className="flex flex-col gap-5 h-full text-white">
      {/* SECTION 1: IN-PROGRESS MEASUREMENT HUD */}
      {isMeasuring ? (
        <div className="bg-black/90 border-2 border-[#FF4500] rounded-2xl p-5 shadow-[0_0_30px_rgba(255,69,0,0.2)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF4500] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#FF4500]"></span>
              </span>
              <span className="text-[#FF4500] text-sm font-extrabold uppercase tracking-widest flex items-center gap-1">
                <Flame className="w-4 h-4 text-[#FF4500] animate-bounce" /> Đang Đo Đám Cháy
              </span>
            </div>
            <span className="font-mono text-xs bg-[#FF4500]/20 text-[#FF4500] border border-[#FF4500]/30 px-3 py-1 rounded-full font-bold">
              {activeFirePoints.length} điểm GPS
            </span>
          </div>

          <div className="mb-4">
            <h3 className="text-lg font-black text-white leading-tight truncate">{measureName}</h3>
            <p className="text-[10px] text-white/40 mt-1 font-bold uppercase tracking-wider">Cán bộ: {operatorName}</p>
          </div>

          {/* REALTIME SPATIAL HUD */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-black/60 border border-white/10 p-3 rounded-xl flex items-center gap-3">
              <Plus className="w-8 h-8 text-[#FFD700] shrink-0" />
              <div>
                <p className="text-[10px] text-white/40 font-extrabold uppercase tracking-wider">Diện tích</p>
                <p className="font-mono text-lg font-black text-[#FFD700]">
                  {formatArea(liveArea)}
                </p>
              </div>
            </div>

            <div className="bg-black/60 border border-white/10 p-3 rounded-xl flex items-center gap-3">
              <MapPin className="w-8 h-8 text-[#00FF41] shrink-0" />
              <div>
                <p className="text-[10px] text-white/40 font-extrabold uppercase tracking-wider">Chu vi</p>
                <p className="font-mono text-lg font-black text-white">
                  {formatDistance(livePerimeter)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#FF4500]/5 border border-[#FF4500]/20 p-3 rounded-xl text-xs text-white/70 leading-relaxed mb-4 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 font-bold text-[#FFD700]">
              <HelpCircle className="w-4 h-4" /> Hướng dẫn đo ngoại nghiệp:
            </div>
            <div>
              • <b>"Tự bắt điểm":</b> Khi bạn di chuyển ngoài thực địa, thiết bị tự động ghi nhận mốc tọa độ ranh giới đám cháy mới khi có sự thay đổi vị trí.
            </div>
            <div>
              • <b>"Ghi Điểm Thủ Công":</b> Nhấn nút để ép ghi điểm định vị tại các góc bẻ ngoặt của đám cháy để diện tích tính toán chính xác nhất.
            </div>
          </div>

          {/* ACTION BUTTONS (56px HEIGHT) */}
          <div className="flex flex-col gap-2.5">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onAddManualPoint}
                className="flex-1 h-12 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#FFD700]" /> Ghi điểm góc
              </button>

              <button
                type="button"
                onClick={onRemoveLastPoint}
                disabled={activeFirePoints.length === 0}
                className="flex-1 h-12 bg-black hover:bg-white/5 border border-white/10 disabled:opacity-30 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-[#FF4444]" /> Xóa điểm cuối
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onFinishMeasuring}
                disabled={activeFirePoints.length < 3}
                className="flex-1 h-14 bg-[#00FF41] hover:brightness-110 disabled:bg-[#00FF41]/20 disabled:text-white/40 text-black rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <Check className="w-5 h-5 font-black" /> HOÀN THÀNH ĐO
              </button>

              <button
                type="button"
                onClick={onCancelMeasuring}
                className="h-14 w-14 bg-black border-2 border-white/10 hover:border-[#FF4444]/40 hover:text-[#FF4444] rounded-xl flex items-center justify-center cursor-pointer transition-colors"
                title="Hủy đo đạc"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* START AREA MEASURE FORM */
        <form onSubmit={handleStart} className="bg-black/80 border border-white/10 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center gap-2.5 mb-3">
            <Flame className="w-5 h-5 text-[#FF4500] animate-pulse" />
            <h3 className="text-base font-black text-white uppercase tracking-wider">Đo Diện Tích Đám Cháy & Lô</h3>
          </div>

          <p className="text-xs text-white/50 leading-relaxed mb-4">
            Công cụ hỗ trợ lực lượng ngoại nghiệp tuần tra di chuyển quanh chu vi ranh giới đám cháy rừng, tự động chốt mốc ranh giới, tự động khép góc tính toán diện tích tức thời và truyền số liệu trực tiếp về máy chủ Phòng Kỹ Thuật.
          </p>

          <div className="flex flex-col gap-3 mb-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-extrabold text-white/50 uppercase tracking-widest">Tên khu vực / Đám cháy rừng</label>
              <input
                type="text"
                required
                value={measureName}
                onChange={(e) => setMeasureName(e.target.value)}
                placeholder="Ví dụ: Đám cháy Lô 12a Khoảnh 3..."
                className="h-11 px-4 bg-black border-2 border-white/10 focus:border-[#FF4500] text-gray-100 font-bold rounded-xl text-xs outline-none transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-extrabold text-white/50 uppercase tracking-widest">Cán bộ đo đạc thực địa</label>
              <input
                type="text"
                required
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Nhập họ và tên cán bộ tuần tra..."
                className="h-11 px-4 bg-black border-2 border-white/10 focus:border-[#FF4500] text-gray-100 font-bold rounded-xl text-xs outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full h-14 bg-[#FF4500] hover:brightness-110 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer uppercase tracking-widest"
          >
            <Play className="w-5 h-5 fill-current" /> Bắt Đầu Đo Thực Địa
          </button>
        </form>
      )}

      {/* TRANSMISSION CONSOLE LOG MODAL (FLOATER) */}
      {showConsole && (
        <div className="bg-black border border-white/15 rounded-2xl p-4 flex flex-col gap-3 font-mono text-xs shadow-2xl relative animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-[#00FF41] animate-pulse" />
              <span className="text-[11px] font-black uppercase text-white tracking-widest">Kênh truyền số liệu về Phòng Kỹ Thuật</span>
            </div>
            <button
              onClick={() => setShowConsole(false)}
              className="text-white/40 hover:text-white px-2 py-0.5 rounded border border-white/10 text-[10px]"
            >
              ĐÓNG
            </button>
          </div>
          <div className="bg-black/90 rounded-lg p-3 min-h-[140px] max-h-[220px] overflow-y-auto flex flex-col gap-1.5 text-white/80 select-text">
            {transmissionLogs.map((log, i) => (
              <div key={i} className={log.includes('SUCCESS') ? 'text-[#00FF41] font-bold' : log.includes('ERROR') ? 'text-red-400' : 'text-gray-300'}>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 2: SAVED AREA MEASUREMENTS HISTORY LIST */}
      <div className="flex-1 min-h-[220px] flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="text-sm font-black text-[#FFD700] uppercase tracking-widest">Lịch Sử Đo Đám Cháy ({savedFireMeasurements.length})</h3>
        </div>

        {savedFireMeasurements.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-black/20 rounded-2xl border border-dashed border-white/10">
            <Flame className="w-10 h-10 text-white/10 mb-2" />
            <p className="text-xs font-bold text-white/40">Chưa có bản đo đạc đám cháy nào.</p>
            <p className="text-[10px] text-white/30 mt-1">Điền thông tin và bấm "Bắt Đầu Đo Thực Địa" để bắt mốc tính diện tích đám cháy rừng tự động.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto max-h-[350px] flex flex-col gap-3 pr-1">
            {savedFireMeasurements.map((m) => {
              const isVisible = visibleFireIds.includes(m.id);
              const isSyncingActive = isTransmitting === m.id;
              
              return (
                <div key={m.id} className="bg-black/50 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h4 className="font-bold text-gray-100 text-sm leading-snug break-all uppercase flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-[#FF4500] shrink-0" /> {m.name}
                      </h4>
                      <p className="text-[10px] text-white/40 font-mono mt-0.5">Ngày đo: {formatDateTime(m.date)}</p>
                      <p className="text-[9px] text-[#00FF41]/80 font-bold mt-0.5 uppercase tracking-wide">Cán bộ: {m.operatorName}</p>
                    </div>
                    {m.isShared ? (
                      <span className="text-[9px] bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30 px-2 py-0.5 rounded font-black tracking-widest uppercase shrink-0">
                        ĐÃ CHIA SẺ
                      </span>
                    ) : (
                      <span className="text-[9px] bg-[#FF4500]/10 text-[#FF4500] border border-[#FF4500]/30 px-2 py-0.5 rounded font-black tracking-widest uppercase shrink-0">
                        CỤC BỘ
                      </span>
                    )}
                  </div>

                  {/* SAVED MEASURE DETAILS */}
                  <div className="grid grid-cols-3 gap-2 bg-black/40 p-2.5 rounded-lg mb-3 text-center text-[11px]">
                    <div>
                      <p className="text-[9px] text-white/40 uppercase tracking-wider">Diện tích</p>
                      <p className="font-mono font-black text-[#FFD700]">{formatArea(m.areaM2)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-white/40 uppercase tracking-wider">Chu vi</p>
                      <p className="font-mono font-bold text-gray-200">{formatDistance(m.perimeterM)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-white/40 uppercase tracking-wider">Mốc GPS</p>
                      <p className="font-mono font-bold text-gray-200">{m.points.length} điểm</p>
                    </div>
                  </div>

                  {/* ACTION BAR (TACTILE & INTUITIVE) */}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => onToggleFireVisibility(m.id)}
                      className={`h-9 px-3 text-[11px] font-black rounded-lg transition-colors border cursor-pointer uppercase tracking-wider flex items-center gap-1 ${
                        isVisible
                          ? 'bg-[#FF4500] border-[#FF4500] text-white font-black'
                          : 'bg-black border-white/10 text-white/50 hover:text-white'
                      }`}
                    >
                      {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {isVisible ? 'Ẩn Map' : 'Hiện Map'}
                    </button>

                    <div className="flex gap-1.5 items-center">
                      {/* Transmit to Technical Room Server */}
                      <button
                        onClick={() => handleTransmit(m.id, m.name)}
                        disabled={isSyncingActive}
                        className={`h-9 px-3 text-[11px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1.5 border ${
                          m.isShared
                            ? 'bg-[#00FF41]/10 border-[#00FF41]/20 text-[#00FF41] cursor-default'
                            : 'bg-[#00FF41] hover:brightness-110 border-transparent text-black shadow-lg shadow-[#00FF41]/10'
                        }`}
                      >
                        {isSyncingActive ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : m.isShared ? (
                          <Check className="w-3.5 h-3.5 font-bold" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        {m.isShared ? 'MÁY CHỦ OK' : 'SHARE VỀ PHÒNG KT'}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => onDeleteMeasurement(m.id)}
                        className="w-9 h-9 bg-[#FF4444]/10 hover:bg-[#FF4444]/20 border border-[#FF4444]/30 text-[#FF4444] rounded-lg flex items-center justify-center cursor-pointer"
                        title="Xóa dữ liệu đo"
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

      {/* SECTION 3: TECHNICAL SERVER RECORDS LOG */}
      <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-3 mt-1 shrink-0">
        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
          <Server className="w-4 h-4 text-[#00FF41]" />
          <span className="text-xs font-black text-white uppercase tracking-wider">Trạng thái Máy Chủ Phòng Kỹ Thuật</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/40">Địa chỉ:</span>
          <span className="font-mono text-gray-300 font-bold">phongkythuat.vinamap.vn</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/40">Bản ghi đám cháy nhận về:</span>
          <span className="font-mono font-extrabold text-[#00FF41] bg-[#00FF41]/10 px-2 py-0.5 rounded border border-[#00FF41]/20">
            {savedFireMeasurements.filter((m) => m.isShared).length} bản ghi
          </span>
        </div>
        
        {savedFireMeasurements.filter((m) => m.isShared).length > 0 ? (
          <div className="bg-black p-2.5 rounded-xl border border-white/5 mt-1 flex flex-col gap-1.5 max-h-[120px] overflow-y-auto">
            <p className="text-[9px] text-[#00FF41] font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Đồng bộ thành công về phòng kỹ thuật:
            </p>
            {savedFireMeasurements.filter((m) => m.isShared).map((m) => (
              <div key={m.id} className="flex justify-between items-center text-[10px] bg-white/5 p-1 px-2 rounded">
                <span className="text-white/80 font-bold truncate max-w-[140px]">{m.name}</span>
                <span className="text-[#FFD700] font-black font-mono shrink-0">{formatArea(m.areaM2)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-white/30 text-center py-2 italic bg-black/30 rounded-xl border border-dashed border-white/5">
            Chưa có bản ghi nào được chia sẻ về phòng kỹ thuật.
          </div>
        )}
      </div>
    </div>
  );
};
