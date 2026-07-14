import React, { useState, useEffect } from 'react';
import { Download, Globe, Trash2, Map, CheckCircle, Smartphone, Sliders, Play, X } from 'lucide-react';
import { OfflineRegion } from '../types';
import { getBboxAreaEstimation, formatDateTime } from '../utils/geoUtils';
import { downloadTiles } from '../utils/tileUtils';

interface OfflineMapPanelProps {
  downloadedRegions: OfflineRegion[];
  isSelectionActive: boolean;
  onToggleSelection: () => void;
  selectedBbox: {
    sw: [number, number];
    ne: [number, number];
  } | null;
  onDownloadRegion: (name: string, sw: [number, number], ne: [number, number], tilesCount: number, sizeKB: number) => void;
  onDeleteRegion: (id: string) => void;
  onFocusRegion: (sw: [number, number], ne: [number, number]) => void;
  addToast: (message: string, type: 'success' | 'warning' | 'error' | 'info') => void;
  activeMapStyle: string;
}

const MAP_TILE_URLS: Record<string, string> = {
  standard: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  topo: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};

export const OfflineMapPanel: React.FC<OfflineMapPanelProps> = ({
  downloadedRegions,
  isSelectionActive,
  onToggleSelection,
  selectedBbox,
  onDownloadRegion,
  onDeleteRegion,
  onFocusRegion,
  addToast,
  activeMapStyle,
}) => {
  const [regionName, setRegionName] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatusText, setDownloadStatusText] = useState('');
  
  // Stats for the active bounding box
  const [areaKm2, setAreaKm2] = useState(0);
  const [estimatedTiles, setEstimatedTiles] = useState(0);
  const [estimatedSizeKB, setEstimatedSizeKB] = useState(0);

  // Set default name based on bounding box
  useEffect(() => {
    if (isSelectionActive && selectedBbox) {
      const latCenter = ((selectedBbox.sw[0] + selectedBbox.ne[0]) / 2).toFixed(3);
      const lngCenter = ((selectedBbox.sw[1] + selectedBbox.ne[1]) / 2).toFixed(3);
      setRegionName(`Map_Offline_Lat${latCenter}_Lng${lngCenter}`);
    } else {
      setRegionName('');
    }
  }, [isSelectionActive, selectedBbox]);

  // Recalculate estimates when bounding box changes
  useEffect(() => {
    if (selectedBbox) {
      const area = getBboxAreaEstimation(selectedBbox.sw, selectedBbox.ne);
      setAreaKm2(area);

      // Simple heuristic for tile count (assuming Zoom levels 12-16)
      // Tile count roughly proportional to bounding box area.
      const tiles = Math.max(12, Math.round(area * 32));
      setEstimatedTiles(tiles);

      // Average raster tile is about 15KB
      const size = Math.round(tiles * 14.5);
      setEstimatedSizeKB(size);
    } else {
      setAreaKm2(0);
      setEstimatedTiles(0);
      setEstimatedSizeKB(0);
    }
  }, [selectedBbox]);

  const handleDownload = async () => {
    if (!regionName.trim()) {
      addToast('Vui lòng đặt tên cho vùng bản đồ offline.', 'warning');
      return;
    }
    if (!selectedBbox) {
      addToast('Không thể xác định khu vực cần tải.', 'error');
      return;
    }

    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStatusText('Đang chuẩn bị danh sách mảnh bản đồ...');

    try {
      const template = MAP_TILE_URLS[activeMapStyle] || MAP_TILE_URLS.standard;
      
      const actualTilesCount = await downloadTiles(
        template,
        selectedBbox.sw,
        selectedBbox.ne,
        12, // minZoom
        16, // maxZoom
        (progress, text) => {
          setDownloadProgress(progress);
          setDownloadStatusText(text);
        }
      );

      // Complete download
      onDownloadRegion(regionName, selectedBbox.sw, selectedBbox.ne, actualTilesCount, actualTilesCount * 14.5);
      addToast(`Đã lưu ngoại tuyến thành công bản đồ "${regionName}"!`, 'success');
    } catch (err) {
      console.error('Download error:', err);
      addToast('Lỗi khi tải bản đồ. Kiểm tra kết nối mạng!', 'error');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadStatusText('');
      onToggleSelection(); // Turn off selector overlay
    }
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* MAP SELECTOR TOGGLER BUTTON */}
      {!isDownloading && (
        <button
          onClick={onToggleSelection}
          className={`w-full h-14 rounded-xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all duration-200 cursor-pointer ${
            isSelectionActive
              ? 'bg-[#FFD700] hover:brightness-110 text-black border-2 border-transparent'
              : 'bg-black hover:bg-black/80 text-white border-2 border-white/10'
          }`}
        >
          {isSelectionActive ? (
            <>
              <X className="w-5 h-5 text-black shrink-0" /> HUỶ CHỌN KHU VỰC
            </>
          ) : (
            <>
              <Download className="w-5 h-5 text-[#FFD700] shrink-0 animate-bounce" /> CHỌN VÙNG TẢI OFFLINE
            </>
          )}
        </button>
      )}

      {/* ACTIVE BBOX SELECTION DETAIL BOX */}
      {isSelectionActive && selectedBbox && (
        <div className="bg-black/90 border-2 border-[#FFD700] rounded-2xl p-5 shadow-[0_0_25px_rgba(255,215,0,0.1)] text-gray-100">
          {isDownloading ? (
            /* DOWNLOAD PROGRESS DISPLAY */
            <div className="flex flex-col gap-4 text-center py-3">
              <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
                <div
                  className="absolute inset-0 border-4 border-[#FFD700] rounded-full border-t-transparent animate-spin"
                  style={{ animationDuration: '1.2s' }}
                ></div>
                <span className="font-mono text-sm font-black text-[#FFD700]">{downloadProgress}%</span>
              </div>
              <div>
                <h4 className="font-black text-[#FFD700] uppercase text-xs tracking-wider mb-1">
                  ĐANG KHỞI TẠO BẢN ĐỒ NGOẠI TUYẾN
                </h4>
                <p className="text-xs font-bold text-gray-200">{downloadStatusText}</p>
              </div>
              <div className="w-full bg-black/60 h-2 rounded-full overflow-hidden border border-white/10">
                <div
                  className="bg-[#FFD700] h-full transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            /* CONFIG & ESTIMATES DISPLAY */
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-[#FFD700]" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Cấu Hinh Vùng Bản Đồ</h3>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-extrabold text-white/40 uppercase tracking-widest">Tên vùng ngoại tuyến</label>
                <input
                  type="text"
                  value={regionName}
                  onChange={(e) => setRegionName(e.target.value)}
                  className="h-10 px-3 bg-black border border-white/10 focus:border-[#FFD700] text-gray-100 font-bold rounded-xl text-xs outline-none"
                  placeholder="Đặt tên vùng ngoại tuyến..."
                />
              </div>

              {/* BOUNDING BOX INFO */}
              <div className="bg-black/60 border border-white/5 p-3 rounded-xl flex flex-col gap-1 font-mono text-[10px] text-white/40">
                <div className="flex justify-between">
                  <span>SW (Tây Nam):</span>
                  <span className="text-gray-200 font-bold">
                    {selectedBbox.sw[0].toFixed(5)}, {selectedBbox.sw[1].toFixed(5)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>NE (Đông Bắc):</span>
                  <span className="text-gray-200 font-bold">
                    {selectedBbox.ne[0].toFixed(5)}, {selectedBbox.ne[1].toFixed(5)}
                  </span>
                </div>
              </div>

              {/* SCIENTIFIC ESTIMATION TABLE */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-black/45 border border-white/5 p-2.5 rounded-xl">
                  <p className="text-[8px] text-white/40 uppercase font-black">Diện tích</p>
                  <p className="font-mono text-sm font-black text-white mt-0.5">{areaKm2.toFixed(1)} km²</p>
                </div>
                <div className="bg-black/45 border border-white/5 p-2.5 rounded-xl">
                  <p className="text-[8px] text-white/40 uppercase font-black">Số mảnh</p>
                  <p className="font-mono text-sm font-black text-white mt-0.5">{estimatedTiles} tiles</p>
                </div>
                <div className="bg-black/45 border border-white/5 p-2.5 rounded-xl">
                  <p className="text-[8px] text-white/40 uppercase font-black">Kích thước</p>
                  <p className="font-mono text-sm font-black text-[#FFD700] mt-0.5">
                    {(estimatedSizeKB / 1024).toFixed(1)} MB
                  </p>
                </div>
              </div>

              {/* LARGE DOWNLOAD ACTION */}
              <button
                onClick={handleDownload}
                className="w-full h-12 bg-[#FFD700] hover:brightness-110 text-black rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <Download className="w-5 h-5 text-black" /> KHỞI CHẠY TẢI VỀ NGOẠI TUYẾN
              </button>
            </div>
          )}
        </div>
      )}

      {/* OFFLINE MAPS GUIDE */}
      {!isSelectionActive && (
        <div className="bg-black/50 border border-white/10 rounded-2xl p-4 text-xs leading-relaxed text-white/50 flex items-start gap-3">
          <Globe className="w-6 h-6 text-sky-400 shrink-0" />
          <div>
            <span className="font-bold text-white block mb-0.5">Cách hoạt động ngoại tuyến:</span>
            Hệ thống sẽ tải toàn bộ vector & raster tiles thuộc khu vực đã khoanh vùng, lưu trực tiếp vào bộ nhớ IndexedDB của trình duyệt. Khi dã ngoại mất sóng điện thoại, bạn vẫn có thể xem bản đồ và tọa độ định vị GPS hiện tại.
          </div>
        </div>
      )}

      {/* SAVED OFFLINE REGIONS LIST */}
      <div className="flex-1 min-h-[220px] flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="text-sm font-black text-[#FFD700] uppercase tracking-widest">Bản Đồ Offline Đã Lưu ({downloadedRegions.length})</h3>
        </div>

        {downloadedRegions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-black/20 rounded-2xl border border-dashed border-white/10">
            <Map className="w-10 h-10 text-white/20 mb-2" />
            <p className="text-xs font-bold text-white/40">Chưa có bản đồ offline nào được lưu.</p>
            <p className="text-[10px] text-white/30 mt-1">Ấn nút "Chọn vùng tải offline" phía trên để đóng gói dữ liệu bản đồ di động.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto max-h-[350px] flex flex-col gap-3 pr-1">
            {downloadedRegions.map((region) => {
              const boundsArea = getBboxAreaEstimation(region.bbox.sw, region.bbox.ne);
              return (
                <div key={region.id} className="bg-black/50 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div>
                      <h4 className="font-bold text-gray-100 text-sm leading-snug break-all">{region.name}</h4>
                      <p className="text-[10px] text-white/40 font-mono mt-0.5">{formatDateTime(region.dateDownloaded)}</p>
                    </div>
                    <button
                      onClick={() => onDeleteRegion(region.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/10 hover:border-[#FF4444]/30 bg-black text-white/40 hover:text-[#FF4444] cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* AREA DETAIL SPECS */}
                  <div className="grid grid-cols-2 gap-2 bg-black/40 border border-white/5 p-2 rounded-lg text-[11px] mb-3">
                    <div className="flex justify-between font-mono px-1">
                      <span className="text-white/40">Kích thước:</span>
                      <span className="text-[#FFD700] font-bold">{(region.sizeKB / 1024).toFixed(2)} MB</span>
                    </div>
                    <div className="flex justify-between font-mono px-1">
                      <span className="text-white/40">Phạm vi:</span>
                      <span className="text-gray-300 font-bold">{boundsArea.toFixed(2)} km²</span>
                    </div>
                    <div className="flex justify-between font-mono px-1">
                      <span className="text-white/40">Mảnh ảnh:</span>
                      <span className="text-gray-300 font-bold">{region.tilesCount} tiles</span>
                    </div>
                    <div className="flex justify-between font-mono px-1">
                      <span className="text-white/40">Mức Zoom:</span>
                      <span className="text-gray-300 font-bold font-sans">z12 - z16</span>
                    </div>
                  </div>

                  {/* QUICK VIEW/ZOOM TO REGION ACTION */}
                  <button
                    onClick={() => onFocusRegion(region.bbox.sw, region.bbox.ne)}
                    className="w-full h-9 bg-black border border-white/10 hover:border-[#FFD700] text-white/70 hover:text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4 text-[#00FF41]" /> ĐỊNH VỊ VÙNG TRÊN MAP
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
