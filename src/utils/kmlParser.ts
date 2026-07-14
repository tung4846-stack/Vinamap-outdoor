import { KmlFeature, KmlLayer } from '../types';

/**
 * Parses a KML string into structured KmlFeatures.
 */
export function parseKml(kmlString: string, fileName: string): KmlLayer {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlString, 'text/xml');
  const features: KmlFeature[] = [];

  // Check for parse errors
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Định dạng XML của file KML không hợp lệ: ' + parserError.textContent);
  }

  const placemarks = xmlDoc.querySelectorAll('Placemark');
  let featureCounter = 0;

  placemarks.forEach((placemark) => {
    const nameNode = placemark.querySelector('name');
    const descNode = placemark.querySelector('description');
    const name = nameNode ? nameNode.textContent?.trim() || 'Thành phần không tên' : 'Thành phần không tên';
    const description = descNode ? descNode.textContent?.trim() || '' : '';

    // EXTRACT EXTENDED DATA / METADATA
    const extendedProperties: Record<string, string> = {};
    
    // 1. Try ExtendedData
    const extendedDataNode = placemark.querySelector('ExtendedData');
    if (extendedDataNode) {
      // Parse SimpleData elements
      const simpleDataNodes = extendedDataNode.querySelectorAll('SimpleData');
      simpleDataNodes.forEach((node) => {
        const nameAttr = node.getAttribute('name');
        if (nameAttr) {
          extendedProperties[nameAttr] = node.textContent?.trim() || '';
        }
      });

      // Parse Data elements
      const dataNodes = extendedDataNode.querySelectorAll('Data');
      dataNodes.forEach((node) => {
        const nameAttr = node.getAttribute('name');
        const valNode = node.querySelector('value');
        if (nameAttr) {
          extendedProperties[nameAttr] = valNode ? valNode.textContent?.trim() || '' : '';
        }
      });
    }

    // 2. Try parsing metadata tables inside description HTML
    if (description && (description.includes('</') || description.includes('<table') || description.includes('<tr'))) {
      try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = description;
        const rows = tempDiv.querySelectorAll('tr');
        rows.forEach((row) => {
          const cells = row.querySelectorAll('td');
          if (cells.length === 2) {
            let key = cells[0].textContent?.trim() || '';
            let val = cells[1].textContent?.trim() || '';
            // Strip trailing colons or bold markdown artifacts
            key = key.replace(/:$/, '').trim();
            if (key && val) {
              extendedProperties[key] = val;
            }
          } else if (cells.length === 1 && cells[0].textContent?.includes(':')) {
            // Support single cell with "Key: Value"
            const text = cells[0].textContent || '';
            const colonIdx = text.indexOf(':');
            if (colonIdx > 0) {
              const key = text.substring(0, colonIdx).trim();
              const val = text.substring(colonIdx + 1).trim();
              if (key && val) {
                extendedProperties[key] = val;
              }
            }
          }
        });
      } catch (e) {
        // Safe ignore on parsing HTML description
      }
    }

    // Extract style information if available (e.g., color)
    let color = '#EAB308'; // Default yellow accent
    let fillColor = '#EAB30833'; // Default transparent yellow

    const styleNode = placemark.querySelector('Style');
    if (styleNode) {
      const lineStyle = styleNode.querySelector('LineStyle');
      const polyStyle = styleNode.querySelector('PolyStyle');
      
      if (lineStyle) {
        const colorNode = lineStyle.querySelector('color');
        if (colorNode && colorNode.textContent) {
          color = kmlColorToHex(colorNode.textContent);
        }
      }
      if (polyStyle) {
        const colorNode = polyStyle.querySelector('color');
        if (colorNode && colorNode.textContent) {
          fillColor = kmlColorToHex(colorNode.textContent);
        }
      }
    }

    // Check Geometry types
    const polygonNode = placemark.querySelector('Polygon');
    const lineStringNode = placemark.querySelector('LineString');
    const pointNode = placemark.querySelector('Point');

    if (polygonNode) {
      const coordNodes = polygonNode.querySelectorAll('coordinates');
      coordNodes.forEach((coordNode) => {
        const coords = parseCoordinatesString(coordNode.textContent || '');
        if (coords.length > 0) {
          featureCounter++;
          features.push({
            id: `kml-feature-${Date.now()}-${featureCounter}`,
            name,
            type: 'polygon',
            coordinates: coords,
            properties: {
              name,
              description,
              color,
              fillColor,
              attributes: extendedProperties,
            },
          });
        }
      });
    } else if (lineStringNode) {
      const coordNode = lineStringNode.querySelector('coordinates');
      if (coordNode) {
        const coords = parseCoordinatesString(coordNode.textContent || '');
        if (coords.length > 0) {
          featureCounter++;
          features.push({
            id: `kml-feature-${Date.now()}-${featureCounter}`,
            name,
            type: 'linestring',
            coordinates: coords,
            properties: {
              name,
              description,
              color,
              attributes: extendedProperties,
            },
          });
        }
      }
    } else if (pointNode) {
      const coordNode = pointNode.querySelector('coordinates');
      if (coordNode) {
        const coords = parseCoordinatesString(coordNode.textContent || '');
        if (coords.length > 0) {
          featureCounter++;
          features.push({
            id: `kml-feature-${Date.now()}-${featureCounter}`,
            name,
            type: 'point',
            coordinates: coords, // Single point [lat, lng] in wrapper array for uniformity
            properties: {
              name,
              description,
              color,
              attributes: extendedProperties,
            },
          });
        }
      }
    }
  });

  return {
    id: `kml-layer-${Date.now()}`,
    name: fileName.replace(/\.[^/.]+$/, ""), // strip extension
    fileName,
    features,
    visible: true,
    importedAt: Date.now(),
  };
}

/**
 * Parses coordinates string like: "107.42,11.42,0 107.43,11.43,0"
 * Returns list of [lat, lng] coordinates.
 */
function parseCoordinatesString(coordinatesText: string): [number, number][] {
  const result: [number, number][] = [];
  const rawPoints = coordinatesText.trim().split(/\s+/);

  for (const rawPoint of rawPoints) {
    if (!rawPoint) continue;
    const parts = rawPoint.split(',');
    if (parts.length >= 2) {
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng)) {
        result.push([lat, lng]);
      }
    }
  }
  return result;
}

/**
 * Converts KML color format (AABBGGRR in hex) to standard Hex color (#RRGGBBAA).
 */
function kmlColorToHex(kmlColor: string): string {
  const clean = kmlColor.trim();
  if (clean.length === 8) {
    // KML format: aabbggrr -> CSS format: #rrggbbaa
    const a = clean.substring(0, 2);
    const b = clean.substring(2, 4);
    const g = clean.substring(4, 6);
    const r = clean.substring(6, 8);
    return `#${r}${g}${b}${a}`;
  }
  if (clean.length === 6) {
    // KML format: bbggrr -> CSS format: #rrggbb
    const b = clean.substring(0, 2);
    const g = clean.substring(2, 4);
    const r = clean.substring(4, 6);
    return `#${r}${g}${b}`;
  }
  return clean.startsWith('#') ? clean : `#${clean}`;
}

/**
 * Generates sample KML layers for Cat Tien National Park boundary and Fansipan Trekking
 */
export function getSampleKmlLayers(): KmlLayer[] {
  return [
    {
      id: 'sample-layer-honhankhoan',
      name: 'Bản Đồ Hộ Nhận Khoán Lâm Nghiệp',
      fileName: 'ho_nhan_khoan_lam_nghiep.kml',
      importedAt: Date.now(),
      visible: true,
      features: [
        {
          id: 'hnk-poly-1',
          name: 'Hộ ông Nguyễn Văn Hải (Lô 12a)',
          type: 'polygon',
          coordinates: [
            [11.4350, 107.4100],
            [11.4450, 107.4150],
            [11.4400, 107.4250],
            [11.4300, 107.4200],
            [11.4350, 107.4100]
          ],
          properties: {
            name: 'Hộ ông Nguyễn Văn Hải (Lô 12a)',
            description: 'Vùng đất rừng sản xuất nhận giao khoán bảo vệ rừng tự nhiên và phát triển lâm nghiệp.',
            color: '#FFD700',
            fillColor: 'rgba(255, 215, 0, 0.25)',
            attributes: {
              'NGUOINK': 'Nguyễn Văn Hải',
              'LO': '12a',
              'KHOANH': '3',
              'TIEUKHU': '120',
              'DTICH': '12.45 ha',
              'Họ và tên chủ hộ': 'Nguyễn Văn Hải',
              'Mã hộ nhận khoán': 'HNK-CATTIEN-1029',
              'Số CCCD': '038092001234',
              'Số điện thoại': '0912.345.678',
              'Địa chỉ thường trú': 'Thôn 3, Xã Nam Cát Tiên, Huyện Tân Phú, Tỉnh Đồng Nai',
              'Diện tích nhận khoán': '12.45 Hécta',
              'Vị trí lâm nghiệp': 'Tiểu khu 120, Khoảnh 3, Lô 12a',
              'Loại rừng': 'Rừng sản xuất (Trồng Keo lai)',
              'Trạng thái rừng': 'Rừng trồng 3 năm tuổi, sinh trưởng tốt',
              'Thời hạn giao khoán': '20 năm (2022 - 2042)',
              'Mức phí khoán bảo vệ': '600,000 VND / ha / năm',
              'Ngày ký hợp đồng': '15/08/2022',
              'Hiện trạng ranh giới': 'Đã cắm mốc ranh giới đầy đủ'
            }
          }
        },
        {
          id: 'hnk-poly-2',
          name: 'Hộ bà Lâm Thị Mai (Lô 14b)',
          type: 'polygon',
          coordinates: [
            [11.4280, 107.4300],
            [11.4380, 107.4350],
            [11.4340, 107.4450],
            [11.4240, 107.4400],
            [11.4280, 107.4300]
          ],
          properties: {
            name: 'Hộ bà Lâm Thị Mai (Lô 14b)',
            description: 'Vùng đất rừng phòng hộ nhận khoán khoanh nuôi bảo vệ rừng tự nhiên.',
            color: '#00FF41',
            fillColor: 'rgba(0, 255, 65, 0.2)',
            attributes: {
              'NGUOINK': 'Lâm Thị Mai',
              'LO': '14b',
              'KHOANH': '3',
              'TIEUKHU': '120',
              'DTICH': '15.80 ha',
              'Họ và tên chủ hộ': 'Lâm Thị Mai',
              'Mã hộ nhận khoán': 'HNK-CATTIEN-1030',
              'Số CCCD': '035084005678',
              'Số điện thoại': '0983.888.999',
              'Địa chỉ thường trú': 'Thôn 2, Xã Nam Cát Tiên, Huyện Tân Phú, Tỉnh Đồng Nai',
              'Diện tích nhận khoán': '15.80 Hécta',
              'Vị trí lâm nghiệp': 'Tiểu khu 120, Khoảnh 3, Lô 14b',
              'Loại rừng': 'Rừng phòng hộ tự nhiên',
              'Trạng thái rừng': 'Rừng hỗn giao gỗ tự nhiên và tre nứa',
              'Thời hạn giao khoán': '30 năm (2020 - 2050)',
              'Mức phí khoán bảo vệ': '800,000 VND / ha / năm',
              'Ngày ký hợp đồng': '02/01/2020',
              'Hiện trạng ranh giới': 'Ranh giới tự nhiên (theo dòng suối Đạ Huoai)'
            }
          }
        }
      ]
    },
    {
      id: 'sample-layer-cattien',
      name: 'Vườn Quốc Gia Cát Tiên - Ranh Giới',
      fileName: 'cattien_boundary_sample.kml',
      importedAt: Date.now() - 120000,
      visible: false,
      features: [
        {
          id: 'cattien-poly-1',
          name: 'Phân khu Bảo vệ nghiêm ngặt Cát Lộc',
          type: 'polygon',
          coordinates: [
            [11.4553, 107.3989],
            [11.4753, 107.4189],
            [11.4653, 107.4589],
            [11.4253, 107.4689],
            [11.4053, 107.4289],
            [11.4153, 107.3889],
            [11.4553, 107.3989] // Closed loop
          ],
          properties: {
            name: 'Phân khu Bảo vệ nghiêm ngặt Cát Lộc',
            description: 'Vùng bảo tồn đa dạng sinh học cốt lõi, nơi sinh sống của nhiều loài chim quý hiếm và thực vật đặc hữu vùng Đông Nam Bộ.',
            color: '#22C55E', // Green
            fillColor: 'rgba(34, 197, 94, 0.2)'
          }
        },
        {
          id: 'cattien-point-hq',
          name: 'Trụ sở Vườn Quốc Gia Cát Tiên',
          type: 'point',
          coordinates: [[11.4253, 107.4289]],
          properties: {
            name: 'Trụ sở Vườn Quốc Gia Cát Tiên',
            description: 'Điểm xuất phát cho mọi tuyến khám phá xuyên rừng, trung tâm tiếp đón du khách và nghiên cứu khoa học.',
            color: '#EAB308' // Yellow
          }
        },
        {
          id: 'cattien-point-campsite',
          name: 'Bãi Cắm Trại Bàu Sấu',
          type: 'point',
          coordinates: [[11.4512, 107.4356]],
          properties: {
            name: 'Bãi Cắm Trại Bàu Sấu',
            description: 'Khu vực đất ngập nước Ramsar nổi tiếng với quần thể cá sấu xiêm hoang dã phục hồi thành công.',
            color: '#EF4444' // Red
          }
        }
      ]
    },
    {
      id: 'sample-layer-fansipan',
      name: 'Cung Trekking Đỉnh Fansipan',
      fileName: 'fansipan_trek_sample.kml',
      importedAt: Date.now() - 3600000,
      visible: false,
      features: [
        {
          id: 'fansi-line-1',
          name: 'Tuyến Trạm Tôn - Đỉnh Fansipan',
          type: 'linestring',
          coordinates: [
            [22.3486, 103.7762], // Trạm Tôn (1900m)
            [22.3392, 103.7689], // Trạm 2200m
            [22.3256, 103.7721], // Trạm 2800m
            [22.3123, 103.7785], // Chùa Đồng / Trạm cáp treo
            [22.3033, 103.7750]  // Đỉnh Fansipan (3143m)
          ],
          properties: {
            name: 'Tuyến Trạm Tôn - Đỉnh Fansipan (Khám phá)',
            description: 'Cung đường leo núi Fansipan phổ biến nhất, cảnh quan hùng vĩ của dãy Hoàng Liên Sơn hùng vĩ.',
            color: '#EF4444' // Red line
          }
        },
        {
          id: 'fansi-point-start',
          name: 'Điểm Xuất Phát Trạm Tôn (1900m)',
          type: 'point',
          coordinates: [[22.3486, 103.7762]],
          properties: {
            name: 'Điểm Xuất Phát Trạm Tôn (1900m)',
            description: 'Trạm kiểm lâm và đăng ký leo núi thuộc Vườn Quốc Gia Hoàng Liên.',
            color: '#3B82F6' // Blue
          }
        },
        {
          id: 'fansi-point-summit',
          name: 'Đỉnh Fansipan (3143m)',
          type: 'point',
          coordinates: [[22.3033, 103.7750]],
          properties: {
            name: 'Đỉnh Fansipan - Nóc Nhà Đông Dương',
            description: 'Cột mốc 3143m linh thiêng, điểm cao nhất Việt Nam và toàn bán đảo Đông Dương.',
            color: '#EAB308' // Yellow
          }
        }
      ]
    }
  ];
}
