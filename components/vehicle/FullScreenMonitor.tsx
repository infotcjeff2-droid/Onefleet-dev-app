import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  Dimensions,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { X, RefreshCw, MapPin, Navigation, Gauge, Clock, AlertCircle, Maximize2 } from 'lucide-react-native';
import { CameraFeed, type CameraFeedItem } from './CameraFeed';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useGps808Store } from '@/store/gps808Store';
import { gps808Api } from '@/utils/gps808Api';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import type { Gps808Vehicle } from '@/utils/gps808Api';
import { defaultColors } from '@/store/themeStore';

type GpsVehicleLike = Partial<Gps808Vehicle> & Record<string, unknown>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_WEB = Platform.OS === 'web';
const REFRESH_INTERVAL = 10_000;
const DEFAULT_MAP_LAT = 22.3193;
const DEFAULT_MAP_LNG = 114.1694;

interface GpsData {
  lat: number;
  lng: number;
  speed: number;
  direction: number;
  gpsTime: number;
  onlineStatus: number;
  address?: string;
}

interface FullScreenMonitorProps {
  visible: boolean;
  onClose: () => void;
  /** 當前車輛的 devIdno（地圖會顯示此車輛位置） */
  currentDevIdno: string;
  /** 當前車輛車牌 */
  currentPlateNumber?: string;
  /** 要顯示影像的四台車輛（最多4台） */
  cameraFeeds: CameraFeedItem[];
}

function parseCoord(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return 0;
    const num = Number(trimmed);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

function formatSpeed(speed: number | undefined): string {
  if (speed === undefined || speed === null) return '--';
  return `${Math.round(speed)} km/h`;
}

function formatDirection(deg: number | undefined): string {
  if (deg === undefined || deg === null) return '--';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(deg / 45) % 8;
  return `${dirs[idx]} (${deg}°)`;
}

function formatGpsTime(ts: number | undefined): string {
  if (!ts) return '--';
  return new Date(ts).toLocaleString();
}

function buildMapHtml(opts: {
  lat: number;
  lng: number;
  label: string;
  zoom: number;
  showMarker: boolean;
  noSignal: boolean;
  noGpsSignalText?: string;
  address?: string;
  currentLang?: string;
}): string {
  const {
    lat,
    lng,
    label,
    zoom,
    showMarker,
    noSignal,
    noGpsSignalText = 'No GPS Signal',
    address,
    currentLang = 'en',
  } = opts;

  const addressText = address || '';
  const formattedAddress = addressText
    ? (() => {
        const chineseChunks = addressText.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffeff]+/g);
        if (chineseChunks && chineseChunks.length > 0) {
          const meaningful = chineseChunks.filter(c => c.length >= 2);
          if (meaningful.length > 0) return meaningful.join('、');
          return chineseChunks.join(' ');
        }
        return addressText;
      })()
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 100vw; height: 100vh; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .car-icon {
      background: #3B82F6;
      border: 3px solid #fff;
      border-radius: 50%;
      width: 32px; height: 32px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
    }
    .car-icon::after {
      content: '';
      width: 0; height: 0;
      border-left: 7px solid transparent;
      border-right: 7px solid transparent;
      border-bottom: 12px solid #fff;
      transform: translateY(-1px);
    }
    .no-signal-badge {
      position: absolute; top: 8px; right: 8px; z-index: 1000;
      background: rgba(239,68,68,0.92);
      color: #fff; padding: 4px 10px; border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex; align-items: center; gap: 4px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .no-signal-badge svg { width: 12px; height: 12px; }
    #marker-label {
      position: absolute; z-index: 999;
      background: #1E293B; color: #fff;
      padding: 5px 12px; border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 15px; font-weight: 700;
      white-space: nowrap;
      transform: translate(-50%, 10px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    .center-btn {
      position: absolute; bottom: 10px; left: 10px; z-index: 1000;
      background: #fff; border: none; border-radius: 8px;
      width: 44px; height: 44px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: transform 0.15s ease;
    }
    .center-btn:active { transform: scale(0.95); }
    .center-btn svg { width: 22px; height: 22px; color: #3B82F6; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="marker-label" style="display:none"></div>
  <button class="center-btn" id="centerBtn" title="Center">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
    </svg>
  </button>
    ${noSignal ? `
  <div class="no-signal-badge">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
      <line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
    ${noGpsSignalText}
  </div>` : ''}
  <script>
    const map = L.map('map', {
      center: [${lat}, ${lng}],
      zoom: ${zoom},
      zoomControl: true,
      attributionControl: true,
      dragging: true,
      scrollWheelZoom: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    ${showMarker ? `
    const carIcon = L.divIcon({
      html: '<div class="car-icon"></div>',
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    const marker = L.marker([${lat}, ${lng}], { icon: carIcon, title: '${label.replace(/'/g, "\\'")}' }).addTo(map);
    marker.bindPopup('<b style="font-size:15px">${label.replace(/'/g, "\\'")}</b><br/><span style="word-break:break-all;font-size:14px">${formattedAddress.replace(/'/g, "\\'")}</span>').openPopup();
    const labelEl = document.getElementById('marker-label');
    if (labelEl) {
      labelEl.textContent = '${label.replace(/'/g, "\\'")}';
      labelEl.style.display = 'block';
      function updateLabelPos() {
        const pt = map.latLngToContainerPoint([${lat}, ${lng}]);
        labelEl.style.left = pt.x + 'px';
        labelEl.style.top = pt.y + 'px';
      }
      map.on('move', updateLabelPos);
      map.on('zoom', updateLabelPos);
      updateLabelPos();
    }
    const centerBtn = document.getElementById('centerBtn');
    if (centerBtn) {
      centerBtn.addEventListener('click', function() {
        map.setView([${lat}, ${lng}], ${zoom});
      });
    }
    ` : ''}
  </script>
</body>
</html>`;
}

export function FullScreenMonitor({
  visible,
  onClose,
  currentDevIdno,
  currentPlateNumber,
  cameraFeeds,
}: FullScreenMonitorProps) {
  const { locale, t } = useTranslation();
  const { isConnected } = useGps808Store();
  const [gpsData, setGpsData] = useState<GpsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedFeedIndex, setSelectedFeedIndex] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const webViewRef = useRef<WebView>(null);

  const hasValidGps = gpsData !== null && gpsData.lat !== 0;
  const displayLat = hasValidGps ? gpsData.lat : DEFAULT_MAP_LAT;
  const displayLng = hasValidGps ? gpsData.lng : DEFAULT_MAP_LNG;
  const mapZoom = hasValidGps ? 18 : 12;

  const mapHtml = buildMapHtml({
    lat: displayLat,
    lng: displayLng,
    label: currentPlateNumber || currentDevIdno,
    zoom: mapZoom,
    showMarker: true,
    noSignal: !hasValidGps,
    noGpsSignalText: t('vehicles.noGpsSignal'),
    address: hasValidGps ? gpsData.address : undefined,
    currentLang: locale,
  });

  const fetchGps = useCallback(async () => {
    if (!currentDevIdno || !isConnected) return;
    setIsLoading(true);
    setError(null);
    try {
      const parseSpeed = (val: unknown): number => {
        return parseCoord(val) / 10;
      };

      const res = await gps808Api.getDeviceStatus(currentDevIdno);

      let lat = 0;
      let lng = 0;
      let speed = 0;
      let direction = 0;
      let gpsTime = Date.now();
      let onlineStatus = 0;
      let gpsDataAddress = '';

      if (res.result === 0 && res.status) {
        const s = res.status as unknown as Record<string, unknown>;

        let rawLat = parseCoord(s.lat);
        let rawLng = parseCoord(s.lng);
        if (rawLat !== 0 && rawLng !== 0) {
          lat = Math.abs(rawLat) > 180 ? rawLat / 1_000_000 : rawLat;
          lng = Math.abs(rawLng) > 180 ? rawLng / 1_000_000 : rawLng;
        }

        if (lat === 0 || lng === 0) {
          const rawMlat = parseCoord(s.mlat);
          const rawMlng = parseCoord(s.mlng);
          const rawLang = parseCoord(s.lang);

          if (rawMlat !== 0 && rawMlng !== 0) {
            lat = Math.abs(rawMlat) > 180 ? rawMlat / 1_000_000 : rawMlat;
            lng = Math.abs(rawMlng) > 180 ? rawMlng / 1_000_000 : rawMlng;
          } else if (rawMlat !== 0 && rawLang !== 0) {
            lat = Math.abs(rawMlat) > 180 ? rawMlat / 1_000_000 : rawMlat;
            lng = Math.abs(rawLang) > 180 ? rawLang / 1_000_000 : rawLang;
          }
        }

        speed = parseSpeed(s.sp);
        direction = parseCoord(s.hx);
        onlineStatus = parseCoord(s.ol);

        const gt = s.gt as number | string | undefined;
        gpsTime = typeof gt === 'number' ? gt : typeof gt === 'string' ? new Date(gt).getTime() : Date.now();

        const address = s.ps as string | undefined;
        if (address && address.trim()) {
          gpsDataAddress = address.trim();
        }
      } else {
        // Fallback: queryVehicleList
        const tried = new Set<string>();
        for (let p = 1; p <= 10; p++) {
          const listRes = await gps808Api.queryVehicleList(p, 200);
          if (listRes.result !== 0 || !listRes.infos || listRes.infos.length === 0) break;
          const device = listRes.infos.find(v =>
            v.devIdno === currentDevIdno ||
            v.devIdno?.toLowerCase() === currentDevIdno.toLowerCase() ||
            (currentPlateNumber && v.vehiIdno?.toLowerCase() === currentPlateNumber.toLowerCase())
          );
          if (device) {
            const rawLat = parseCoord(device.weidu ?? device.lat);
            const rawLng = parseCoord(device.jindu ?? device.lng);
            lat = Math.abs(rawLat) > 180 ? rawLat / 1e6 : rawLat;
            lng = Math.abs(rawLng) > 180 ? rawLng / 1e6 : rawLng;
            speed = parseSpeed(device.speed);
            direction = parseCoord(device.direction);
            onlineStatus = parseCoord(device.onlineStatus);
            const gt = (device as { gpsTime?: number }).gpsTime;
            if (gt) gpsTime = gt;
            break;
          }
          const totalPages = listRes.pagination?.totalPages ?? 0;
          if (totalPages > 0 && p >= totalPages) break;
          if (listRes.infos.length < 200) break;
          const sig = JSON.stringify(listRes.infos.map(v => v.devIdno));
          if (tried.has(sig)) break;
          tried.add(sig);
        }
      }

      setGpsData({ lat, lng, speed, direction, gpsTime, onlineStatus, address: gpsDataAddress });
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [currentDevIdno, currentPlateNumber, isConnected]);

  useEffect(() => {
    if (visible && isConnected) {
      fetchGps();
      intervalRef.current = setInterval(fetchGps, REFRESH_INTERVAL);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [visible, fetchGps, isConnected]);

  // Reset state when modal opens with new devIdno
  useEffect(() => {
    if (visible) {
      setGpsData(null);
      setError(null);
      setSelectedFeedIndex(0);
    }
  }, [visible, currentDevIdno]);

  // Effective camera feeds (pad to 6 slots for current vehicle's multi-channel view)
  const paddedFeeds: CameraFeedItem[] = [...cameraFeeds];
  while (paddedFeeds.length < 6) {
    paddedFeeds.push({
      id: `empty-${paddedFeeds.length}`,
      plateNumber: '',
      isOnline: false,
    });
  }

  const renderCameraCell = (feed: CameraFeedItem, index: number) => {
    if (feed.id.startsWith('empty-')) {
      return (
        <View style={styles.emptyCameraCell}>
          <Text style={styles.emptyCameraText}>無影像</Text>
        </View>
      );
    }
    return (
      <CameraFeed
        item={feed}
        isSelected={selectedFeedIndex === index}
        onPress={() => setSelectedFeedIndex(index)}
      />
    );
  };

  const renderMapArea = () => (
    <View style={styles.mapSection}>
      {/* Map Header */}
      <View style={styles.mapHeader}>
        <View style={styles.mapHeaderLeft}>
          <MapPin size={14} color={defaultColors.primary} />
          <Text style={styles.mapHeaderLabel}>
            {currentPlateNumber || currentDevIdno}
          </Text>
          <View
            style={[
              styles.mapStatusDot,
              { backgroundColor: hasValidGps ? '#22C55E' : '#EF4444' },
            ]}
          />
          <Text style={styles.mapStatusText}>
            {hasValidGps ? t('vehicles.live') : t('vehicles.noSignal')}
          </Text>
        </View>
        <View style={styles.mapHeaderRight}>
          <TouchableOpacity onPress={fetchGps} style={styles.refreshBtn} disabled={isLoading}>
            <RefreshCw
              size={12}
              color={isLoading ? colors.textTertiary : defaultColors.primary}
              style={isLoading ? { transform: [{ rotate: '360deg' }] } : {}}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* GPS Stats Row */}
      {hasValidGps && (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Gauge size={12} color={colors.textSecondary} />
            <Text style={styles.statValue}>{formatSpeed(gpsData.speed)}</Text>
          </View>
          <View style={styles.statItem}>
            <Navigation
              size={12}
              color={colors.textSecondary}
              style={{ transform: [{ rotate: `${gpsData.direction}deg` }] }}
            />
            <Text style={styles.statValue}>{formatDirection(gpsData.direction)}</Text>
          </View>
          <View style={styles.statItem}>
            <Clock size={12} color={colors.textSecondary} />
            <Text style={styles.statValue}>{formatGpsTime(gpsData.gpsTime)}</Text>
          </View>
        </View>
      )}

      {/* Error */}
      {error && !gpsData && (
        <View style={styles.errorBox}>
          <AlertCircle size={14} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Loading */}
      {isLoading && !gpsData && (
        <View style={styles.loadingBox}>
          <LoadingSpinner size={24} />
          <Text style={styles.loadingText}>{t('vehicles.fetchingGps')}</Text>
        </View>
      )}

      {/* Map */}
      <View style={styles.mapContainer}>
        {IS_WEB ? (
          <iframe
            srcDoc={mapHtml}
            style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
            title="Live GPS Map"
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <WebView
            ref={webViewRef}
            source={{ html: mapHtml, baseUrl: 'https://localhost' }}
            style={{ flex: 1, backgroundColor: '#E5E7EB' }}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            mixedContentMode="always"
            allowsFullscreenVideo
            startInLoadingState
            renderLoading={() => (
              <View style={styles.mapLoading}>
                <LoadingSpinner size={24} />
              </View>
            )}
          />
        )}
      </View>

      {/* Last refresh info */}
      {lastRefresh && (
        <View style={styles.refreshInfo}>
          <Text style={styles.refreshInfoText}>
            {t('vehicles.updated')} {lastRefresh.toLocaleTimeString()}
          </Text>
        </View>
      )}
    </View>
  );

  const renderCameraArea = () => (
    <View style={styles.cameraSection}>
      {/* Camera Header */}
      <View style={styles.cameraHeader}>
        <Text style={styles.cameraHeaderTitle}>實時錄像</Text>
        <View style={styles.cameraHeaderRight}>
          {cameraFeeds.length > 0 && (
            <Text style={styles.cameraCountText}>
              {cameraFeeds.length} 路
            </Text>
          )}
        </View>
      </View>

      {/* Camera Grid: 3x2 (6 slots for multi-channel view) */}
      <View style={styles.cameraGrid}>
        <View style={styles.cameraCellRow}>
          <View style={styles.cameraCell}>
            {renderCameraCell(paddedFeeds[0], 0)}
          </View>
          <View style={styles.cameraCell}>
            {renderCameraCell(paddedFeeds[1], 1)}
          </View>
        </View>
        <View style={styles.cameraCellRow}>
          <View style={styles.cameraCell}>
            {renderCameraCell(paddedFeeds[2], 2)}
          </View>
          <View style={styles.cameraCell}>
            {renderCameraCell(paddedFeeds[3], 3)}
          </View>
        </View>
        <View style={styles.cameraCellRow}>
          <View style={styles.cameraCell}>
            {renderCameraCell(paddedFeeds[4], 4)}
          </View>
          <View style={styles.cameraCell}>
            {renderCameraCell(paddedFeeds[5], 5)}
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <MapPin size={16} color={defaultColors.primary} />
            <Text style={styles.topBarTitle}>
              {t('vehicles.trackingSectionTitle')}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Top: Map */}
          {renderMapArea()}

          {/* Bottom: Camera Grid */}
          {renderCameraArea()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#0D0F14',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#161A23',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3040',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  topBarTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },

  // --- Map Section ---
  mapSection: {
    height: '42%',
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 2,
    borderBottomColor: '#2A3040',
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  mapHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  mapHeaderLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  mapStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  mapStatusText: {
    fontSize: typography.fontSize.xs,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
  },
  mapHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  refreshBtn: {
    padding: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    fontSize: typography.fontSize.xs,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  errorText: {
    fontSize: typography.fontSize.xs,
    color: '#EF4444',
    flex: 1,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
  mapLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
  },
  refreshInfo: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  refreshInfoText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
  },

  // --- Camera Section ---
  cameraSection: {
    flex: 1,
    backgroundColor: '#0D0F14',
    padding: spacing.sm,
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  cameraHeaderTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  cameraHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cameraCountText: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  cameraGrid: {
    flex: 1,
    gap: spacing.sm,
  },
  cameraCellRow: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cameraCell: {
    flex: 1,
    minHeight: 80,
  },
  emptyCameraCell: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A3040',
    borderStyle: 'dashed',
  },
  emptyCameraText: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    fontWeight: '600',
  },
});
