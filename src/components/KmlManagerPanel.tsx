import React, { useRef, useState, useMemo } from 'react';
import { Upload, FileUp, Layers, Eye, EyeOff, Trash2, HelpCircle, Check, MapPin, Milestone, Box } from 'lucide-react';
import JSZip from 'jszip';
import { KmlLayer } from '../types';
import { parseKml } from '../utils/kmlParser';

interface KmlManagerPanelProps {
  kmlLayers: KmlLayer[];
  onImportLayer: (layer: KmlLayer) => void;
  onToggleLayerVisibility: (id: string) => void;
  onDeleteLayer: (id: string) => void;
  onLoadSampleLayers: () => void;
  onFocusCoordinates: (coords: [number, number]) => void;
  addToast: (message: string, type: 'success' | 'warning' | 'error' | 'info') => void;
  selectedLabelAttribute: string;
  onLabelAttributeChange: (attr: string) => void;
}

export const KmlManagerPanel: React.FC<KmlManagerPanelProps> = ({
  kmlLayers,
  onImportLayer,
  onToggleLayerVisibility,
  onDeleteLayer,
  onLoadSampleLayers,
  onFocusCoordinates,
  addToast,
  selectedLabelAttribute,
  onLabelAttributeChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedFeatureId, setExpandedFeatureId] = useState<string | null>(null);

  const availableAttributes = useMemo(() => {
    const keysSet = new Set<string>();
    kmlLayers.forEach((layer) => {
      if (!layer.visible) return;
      layer.features.forEach((feat) => {
        if (feat.properties.attributes) {
          Object.keys(feat.properties.attributes).forEach((key) => {
            keysSet.add(key);
          });
        }
      });
    });
    return Array.from(keysSet);
  }, [kmlLayers]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
  };

  const processFiles = async (files: FileList) => {
    setLoading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isKml = file.name.toLowerCase().endsWith('.kml');
      const isKmz = file.name.toLowerCase().endsWith('.kmz');

      if (!isKml && !isKmz) {
        addToast(`Chỉ chấp nhận tệp định dạng .kml hoặc .kmz. Tệp "${file.name}" không hợp lệ.`, 'error');
        continue;
      }

      try {
        let kmlText = '';
        let displayFileName = file.name;

        if (isKmz) {
          const zip = await JSZip.loadAsync(file);
          // Look for any file ending in .kml in the zip
          const kmlFileInZip = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.kml'));
          if (!kmlFileInZip) {
            addToast(`Tệp KMZ "${file.name}" không chứa tệp KML hợp lệ bên trong.`, 'error');
            continue;
          }
          kmlText = await kmlFileInZip.async('text');
          displayFileName = kmlFileInZip.name;
        } else {
          kmlText = await file.text();
        }

        const layer = parseKml(kmlText, file.name);
        
        if (layer.features.length === 0) {
          addToast(`Không tìm thấy đa giác, tuyến đường hay điểm đánh dấu hợp lệ nào trong tệp "${file.name}".`, 'warning');
          continue;
        }

        onImportLayer(layer);
        
        // Count features by type
        const polys = layer.features.filter(f => f.type === 'polygon').length;
        const lines = layer.features.filter(f => f.type === 'linestring').length;
        const points = layer.features.filter(f => f.type === 'point').length;
        
        addToast(`Đã tải thành công ${isKmz ? 'KMZ (đã giải nén KML)' : 'KML'}: ${polys} vùng, ${lines} đường, ${points} điểm POI!`, 'success');
      } catch (err: any) {
        addToast(`Lỗi phân tích tệp "${file.name}": ${err.message || err}`, 'error');
      }
    }
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processFiles(files);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* DRAG AND DROP KML UPLOADER */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFileSelect}
        className={`border-3 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] ${
          isDragging
            ? 'border-[#FFD700] bg-[#FFD700]/10'
            : 'border-white/10 bg-black/50 hover:border-white/25 hover:bg-black/80'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".kml,.kmz"
          className="hidden"
          multiple
        />
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 border-4 border-[#FFD700] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-bold text-gray-300">Đang giải mã tệp bản đồ...</p>
          </div>
        ) : (
          <>
            <FileUp className="w-10 h-10 text-[#FFD700] mb-2.5" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider mb-1">
              {isDragging ? 'Thả tệp vào đây!' : 'Nhập Tệp KML/KMZ Ngoài Trời'}
            </h3>
            <p className="text-[11px] text-white/50 max-w-[240px] leading-relaxed">
              Nhấp để chọn hoặc kéo thả tệp ranh giới lâm nghiệp, trạm gác, hay tuyến đường dã ngoại dạng <span className="text-[#FFD700] font-mono font-bold">.kml</span> hoặc <span className="text-[#FFD700] font-mono font-bold">.kmz</span>.
            </p>
          </>
        )}
      </div>

      {/* DETAILED SAMPLE DATA INJECTOR */}
      {kmlLayers.length === 0 && (
        <div className="bg-[#FFD700]/5 border border-[#FFD700]/30 rounded-2xl p-4 text-center">
          <p className="text-xs font-bold text-white/70 leading-relaxed mb-3">
            Bạn chưa có sẵn dữ liệu KML? Trải nghiệm ngay bộ ranh giới Vườn quốc gia Cát Tiên và tuyến leo núi Fansipan bằng một nút bấm!
          </p>
          <button
            onClick={onLoadSampleLayers}
            className="h-11 px-5 bg-[#FFD700] hover:brightness-110 text-black rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 mx-auto shadow-lg transition-all cursor-pointer"
          >
            <Layers className="w-4 h-4 fill-current" /> TẢI DỮ LIỆU MẪU LÊN MAP
          </button>
        </div>
      )}

      {/* MAP LABEL LAYOUT OPTION CONTROLLER */}
      {kmlLayers.length > 0 && (
        <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#FFD700]" />
            <span className="text-xs font-black text-white uppercase tracking-wider">Hiển thị nhãn trên bản đồ</span>
          </div>
          <p className="text-[10px] text-white/50 leading-relaxed -mt-1">
            Chọn thuộc tính từ file KML (như <span className="text-[#FFD700] font-bold">NGUOINK</span>, <span className="text-[#FFD700] font-bold">LO</span>,...) để làm nhãn hiển thị trực tiếp lên từng lô rừng.
          </p>
          <div className="flex flex-col gap-1.5">
            <select
              value={selectedLabelAttribute}
              onChange={(e) => {
                onLabelAttributeChange(e.target.value);
                addToast(`Đã chọn hiển thị nhãn bằng thuộc tính: ${e.target.value === 'none' ? 'Không hiển thị' : e.target.value === 'name' ? 'Tên lô/hộ' : e.target.value}`, 'success');
              }}
              className="bg-black hover:bg-black/80 border border-white/10 focus:border-[#FFD700] text-white rounded-xl h-10 px-3 text-xs font-bold transition-all cursor-pointer outline-none w-full"
            >
              <option value="none">❌ Không hiển thị nhãn</option>
              <option value="name">🏷️ Tên đối tượng (Lô/Hộ)</option>
              {availableAttributes.map((attr) => (
                <option key={attr} value={attr}>
                  🌳 Thuộc tính: {attr}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* KML LAYERS LIST */}
      <div className="flex-1 min-h-[220px] flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="text-sm font-black text-[#FFD700] uppercase tracking-widest">Các Lớp Bản Đồ Đang Hoạt Động ({kmlLayers.length})</h3>
        </div>

        {kmlLayers.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-black/20 rounded-2xl border border-dashed border-white/10">
            <Layers className="w-10 h-10 text-white/20 mb-2" />
            <p className="text-xs font-bold text-white/40">Chưa có lớp phủ KML nào được nhập.</p>
            <p className="text-[10px] text-white/30 mt-1">Sử dụng uploader ở trên hoặc bấm nút tải dữ liệu mẫu để vẽ ranh giới lên bản đồ.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto max-h-[350px] flex flex-col gap-3 pr-1">
            {kmlLayers.map((layer) => {
              const polyCount = layer.features.filter(f => f.type === 'polygon').length;
              const lineCount = layer.features.filter(f => f.type === 'linestring').length;
              const pointCount = layer.features.filter(f => f.type === 'point').length;

              return (
                <div key={layer.id} className={`bg-black/50 border rounded-xl p-4 transition-all ${layer.visible ? 'border-white/10' : 'border-white/5 opacity-40'}`}>
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div>
                      <h4 className="font-bold text-gray-100 text-sm leading-snug truncate max-w-[200px]">{layer.name}</h4>
                      <p className="text-[10px] text-white/40 font-mono mt-0.5">{layer.fileName}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => onToggleLayerVisibility(layer.id)}
                        title={layer.visible ? "Ẩn lớp này" : "Hiện lớp này"}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/10 hover:border-white/20 bg-black cursor-pointer"
                      >
                        {layer.visible ? <Eye className="w-4 h-4 text-[#FFD700]" /> : <EyeOff className="w-4 h-4 text-white/40" />}
                      </button>
                      <button
                        onClick={() => onDeleteLayer(layer.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/10 hover:border-[#FF4444]/30 bg-black text-white/40 hover:text-[#FF4444] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* LAYER CONTENT SUMMARY */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {polyCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-[#00FF41]/10 border border-[#00FF41]/30 text-[#00FF41] px-2 py-0.5 rounded-full font-bold">
                        <Box className="w-3 h-3 shrink-0" /> {polyCount} Vùng Bảo Tồn
                      </span>
                    )}
                    {lineCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-[#FF4444]/10 border border-[#FF4444]/30 text-[#FF4444] px-2 py-0.5 rounded-full font-bold">
                        <Milestone className="w-3 h-3 shrink-0" /> {lineCount} Tuyến Leo Núi
                      </span>
                    )}
                    {pointCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-sky-500/10 border border-sky-500/30 text-sky-400 px-2 py-0.5 rounded-full font-bold">
                        <MapPin className="w-3 h-3 shrink-0" /> {pointCount} Điểm Trạm Gác
                      </span>
                    )}
                  </div>

                  {/* FEATURE LIST WITH METADATA SUPPORT */}
                  <div className="border-t border-white/5 pt-3 flex flex-col gap-2">
                    <p className="text-[10px] text-[#FFD700] uppercase tracking-widest font-black flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#FFD700]" /> Danh sách đối tượng & thông tin hộ:
                    </p>
                    <div className="flex flex-col gap-1.5 max-h-[250px] overflow-y-auto pr-1">
                      {layer.features.map((feat) => {
                        let firstCoord: [number, number] | null = null;
                        if (feat.type === 'point') {
                          firstCoord = feat.coordinates[0] as [number, number];
                        } else if (feat.type === 'linestring' || feat.type === 'polygon') {
                          firstCoord = (feat.coordinates as [number, number][])[0];
                        }

                        if (!firstCoord) return null;
                        const coords = firstCoord;
                        const hasAttributes = feat.properties.attributes && Object.keys(feat.properties.attributes).length > 0;
                        const isExpanded = expandedFeatureId === feat.id;

                        return (
                          <div key={feat.id} className="bg-black/40 border border-white/5 rounded-xl p-2.5 hover:border-white/10 transition-colors flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                              <button
                                onClick={() => onFocusCoordinates(coords)}
                                className="flex-1 text-[11px] font-bold text-left text-white hover:text-[#FFD700] transition-colors flex items-center gap-1.5 truncate cursor-pointer"
                                title="Nhấp để chuyển bản đồ tới đây"
                              >
                                <span className="text-xs shrink-0">
                                  {feat.type === 'polygon' ? '🟩' : feat.type === 'linestring' ? '📈' : '📍'}
                                </span>
                                <span className="truncate">{feat.name}</span>
                              </button>
                              
                              {hasAttributes && (
                                <button
                                  onClick={() => setExpandedFeatureId(isExpanded ? null : feat.id)}
                                  className={`text-[9px] font-black px-2 py-1 rounded transition-colors cursor-pointer shrink-0 uppercase tracking-wider ${
                                    isExpanded 
                                      ? 'bg-[#FFD700] text-black font-extrabold shadow-[0_0_8px_rgba(255,215,0,0.2)]'
                                      : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white'
                                  }`}
                                >
                                  {isExpanded ? 'Ẩn hồ sơ' : 'Xem hồ sơ'}
                                </button>
                              )}
                            </div>

                            {/* Collapsible Info Table for Contracted Households */}
                            {hasAttributes && isExpanded && (
                              <div className="mt-1 bg-black/80 border border-white/5 rounded-lg p-2 flex flex-col gap-1.5 animate-fade-in">
                                <p className="text-[9px] text-[#00FF41] uppercase tracking-wider font-extrabold border-b border-white/5 pb-1">
                                  HỒ SƠ HỘ NHẬN KHOÁN
                                </p>
                                <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto pr-1">
                                  {Object.entries(feat.properties.attributes).map(([key, val]) => (
                                    <div key={key} className="flex justify-between items-start gap-3 text-[10px] py-1 border-b border-white/5 last:border-0 hover:bg-white/5 px-1 rounded">
                                      <span className="text-white/40 font-medium break-words max-w-[100px]">{key}:</span>
                                      <span className="text-[#00FF41] font-bold text-right break-words max-w-[160px]">{String(val)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
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
