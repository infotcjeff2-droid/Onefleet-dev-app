import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Platform, Modal, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { MapPin, Navigation, Gauge, Clock, RefreshCw, WifiOff, ExternalLink, AlertCircle, Maximize2 } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useGps808Store } from '@/store/gps808Store';
import { gps808Api } from '@/utils/gps808Api';
import { storage } from '@/utils/storage';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import type { Gps808Vehicle } from '@/utils/gps808Api';

type GpsVehicleLike = Partial<Gps808Vehicle> & Record<string, unknown>;

const IS_WEB = Platform.OS === 'web';

const REFRESH_INTERVAL = 10_000;
const DEFAULT_MAP_LAT = 22.3193;
const DEFAULT_MAP_LNG = 114.1694;

interface GpsLiveTrackerProps {
  devIdno: string;
  plateNumber?: string;
  onStatusUpdate?: (status: { isOnline: boolean; hasGps: boolean; isRealTime: boolean; speed: number; address?: string }) => void;
  bare?: boolean;
  /** 當按下地圖全螢幕按鈕時的回調 */
  onFullscreenMapPress?: () => void;
}

interface GpsData {
  lat: number;
  lng: number;
  speed: number;
  direction: number;
  gpsTime: number;
  onlineStatus: number;
  address?: string;
  /**
   * 是否為「即時」GPS 訊號（lat/lng 都 > 0）。
   * false 表示失去 GPS 定位，僅有「最後已知位置」。
   */
  isRealTime: boolean;
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

function parseDeviceStatus(raw: Record<string, unknown>): { lat: number; lng: number } {
  const lat = parseCoord(raw.lat);
  const lng = parseCoord(raw.lng);
  return { lat, lng };
}

/**
 * Extract Chinese characters from a mixed-language address string.
 * Keeps CJK Unified Ideographs (U+4E00–U+9FFF), CJK punctuation (U+3000–U+303F),
 * full-width ASCII (U+FF00–U+FFEF), and the special separators 「,」「、」「。」
 */
function extractChineseAddress(str: string): string {
  if (!str) return '';
  const cleaned = str
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*-\s*/g, '-');

  const chineseChunks = cleaned.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g);
  if (!chineseChunks || chineseChunks.length === 0) return '';

  const meaningful = chineseChunks.filter((chunk) => chunk.length >= 2);
  if (meaningful.length === 0) return chineseChunks.join(' ');

  return meaningful.join('、');
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

function directionLabel(deg: number | undefined): string {
  if (deg === undefined || deg === null) return 'Unknown';
  if (deg >= 337.5 || deg < 22.5) return 'Northbound';
  if (deg >= 22.5 && deg < 67.5) return 'NE';
  if (deg >= 67.5 && deg < 112.5) return 'Eastbound';
  if (deg >= 112.5 && deg < 157.5) return 'SE';
  if (deg >= 157.5 && deg < 202.5) return 'Southbound';
  if (deg >= 202.5 && deg < 247.5) return 'SW';
  if (deg >= 247.5 && deg < 292.5) return 'Westbound';
  return 'NW';
}

function formatAddressForPopup(address: string, lang: string): string {
  if (!address) return '';
  if (lang === 'zh-TW' || lang === 'zh-HK') {
    const chineseChunks = address.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffeff]+/g);
    if (chineseChunks && chineseChunks.length > 0) {
      const meaningful = chineseChunks.filter(chunk => chunk.length >= 2);
      if (meaningful.length > 0) {
        return meaningful.join('、');
      }
      return chineseChunks.join(' ');
    }
    return address;
  }
  const englishChunks = address.match(/[a-zA-Z0-9\s,.-]+/g);
  if (englishChunks && englishChunks.length > 0) {
    const cleaned = englishChunks.map(s => s.trim()).filter(s => s.length > 0);
    if (cleaned.length > 0) {
      return cleaned.join(', ');
    }
  }
  return address;
}

export function buildMapHtml(opts: {
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
  const formattedAddress = formatAddressForPopup(addressText, currentLang);

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
      html: '<div class="car-icon" style="transform: rotate(' + ${0} + 'deg)"></div>',
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

export function GpsLiveTracker({ devIdno, plateNumber, onStatusUpdate, bare = false, onFullscreenMapPress }: GpsLiveTrackerProps) {
  const { locale, t } = useTranslation();
  const { isConnected } = useGps808Store();
  const [gpsData, setGpsData] = useState<GpsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [mapExpanded, setMapExpanded] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const webViewRef = useRef<WebView>(null);
  const onStatusUpdateRef = useRef(onStatusUpdate);
  onStatusUpdateRef.current = onStatusUpdate;

  const hasValidGps = gpsData !== null && (gpsData.lat !== 0 || gpsData.lng !== 0);
  const isRealTimeGps = gpsData?.isRealTime ?? false;

  const displayLat = hasValidGps ? gpsData.lat : DEFAULT_MAP_LAT;
  const displayLng = hasValidGps ? gpsData.lng : DEFAULT_MAP_LNG;

  const mapHtml = buildMapHtml({
    lat: displayLat,
    lng: displayLng,
    label: plateNumber || devIdno,
    zoom: hasValidGps ? 18 : 12,
    showMarker: true,
    noSignal: !isRealTimeGps,
    noGpsSignalText: hasValidGps
      ? t('vehicles.noGpsSignalLastKnown')
      : t('vehicles.noGpsSignal'),
    address: hasValidGps ? gpsData.address : undefined,
    currentLang: locale,
  });

  const fetchGps = useCallback(async () => {
    if (!devIdno) return;
    setIsLoading(true);
    setError(null);
    try {
      // Helper to parse speed (808GPS returns sp in tenths)
      const parseSpeed = (val: unknown): number => {
        const n = parseCoord(val);
        return n / 10;
      };

      // Try getDeviceStatus first
      const res = await gps808Api.getDeviceStatus(devIdno);

      let lat = 0;
      let lng = 0;
      let lastKnownLat = 0;
      let lastKnownLng = 0;
      let hasRealTimeFix = false;
      let speed = 0;
      let direction = 0;
      let gpsTime = Date.now();
      let onlineStatus = 0;
      let gpsDataAddress = '';

      // Try to parse from getDeviceStatus response
      // NOTE: gps808Api.getDeviceStatus() already extracts status[0] and returns it as a single object
      if (res.result === 0 && res.status) {
        const s = res.status as unknown as Record<string, unknown>;
        // Log all available fields for debugging
        console.log('[GpsLiveTracker] Full status keys:', Object.keys(s));
        console.log('[GpsLiveTracker] status.ps (address):', s.ps);
        console.log('[GpsLiveTracker] Full status:', JSON.stringify(s));

        // Debug: log all coordinate-related fields
        console.log('[GpsLiveTracker] lat raw:', s.lat, 'type:', typeof s.lat);
        console.log('[GpsLiveTracker] lng raw:', s.lng, 'type:', typeof s.lng);
        console.log('[GpsLiveTracker] mlat raw:', s.mlat, 'type:', typeof s.mlat);
        console.log('[GpsLiveTracker] mlng raw:', s.mlng, 'type:', typeof s.mlng);
        console.log('[GpsLiveTracker] lang raw:', s.lang, 'type:', typeof s.lang);

        // 解析即時 GPS 座標（status.lng / status.lat）
        // 格式：1e6 整數（例如 114157293 = 114.157293）
        let rawLat = parseCoord(s.lat);
        let rawLng = parseCoord(s.lng);
        console.log('[GpsLiveTracker] After parseCoord - rawLat:', rawLat, 'rawLng:', rawLng);
        if (rawLat !== 0 && rawLng !== 0) {
          // 數值 > 180 視為 1e6 格式，需除以 1e6
          lat = Math.abs(rawLat) > 180 ? rawLat / 1_000_000 : rawLat;
          lng = Math.abs(rawLng) > 180 ? rawLng / 1_000_000 : rawLng;
          hasRealTimeFix = true;
          console.log('[GpsLiveTracker] Using real-time lat/lng - lat:', lat, 'lng:', lng);
        }

        // 解析「最後已知位置」（status.mlat / status.mlng / status.lang）
        // 格式：通常為 decimal 字串（例如 "22.342830" / "114.157293"）
        // 808GPS API 在車輛失去 GPS 定位時仍會保留此值，應作為「最後位置」顯示
        const rawMlat = parseCoord(s.mlat);
        const rawMlng = parseCoord(s.mlng);
        const rawLang = parseCoord(s.lang);
        console.log('[GpsLiveTracker] mlat/mlng fallback - rawMlat:', rawMlat, 'rawMlng:', rawMlng, 'rawLang:', rawLang);

        if (rawMlat !== 0 && rawMlng !== 0) {
          lastKnownLat = Math.abs(rawMlat) > 180 ? rawMlat / 1_000_000 : rawMlat;
          lastKnownLng = Math.abs(rawMlng) > 180 ? rawMlng / 1_000_000 : rawMlng;
          console.log('[GpsLiveTracker] Using mlat/mlng (last known) - lat:', lastKnownLat, 'lng:', lastKnownLng);
        } else if (rawMlat !== 0 && rawLang !== 0) {
          lastKnownLat = Math.abs(rawMlat) > 180 ? rawMlat / 1_000_000 : rawMlat;
          lastKnownLng = Math.abs(rawLang) > 180 ? rawLang / 1_000_000 : rawLang;
          console.log('[GpsLiveTracker] Using mlat/lang (last known) - lat:', lastKnownLat, 'lng:', lastKnownLng);
        }

        // 若無即時定位但有最後已知位置，採用最後已知位置作為顯示座標
        if (!hasRealTimeFix && (lastKnownLat !== 0 || lastKnownLng !== 0)) {
          lat = lastKnownLat;
          lng = lastKnownLng;
          console.log('[GpsLiveTracker] No real-time GPS, falling back to last known position');
        }

        speed = parseSpeed(s.sp);
        direction = parseCoord(s.hx);
        onlineStatus = parseCoord(s.ol);

        const gt = s.gt as number | string | undefined;
        gpsTime = typeof gt === 'number' ? gt : typeof gt === 'string' ? new Date(gt).getTime() : Date.now();

        // 判斷 GPS 訊號是否「即時」（gt 時間必須在合理範圍內）
        // 808GPS 平台: 若車輛失去 GPS 定位，gt 仍可能保留「最後已知定位時間」
        // 若 gt 與當前時間相差 > 5 分鐘，視為「無即時 GPS 訊號」
        const GPS_FRESHNESS_MS = 5 * 60 * 1000; // 5 分鐘
        if (hasRealTimeFix && gpsTime > 0) {
          const now = Date.now();
          const age = now - gpsTime;
          if (age > GPS_FRESHNESS_MS) {
            console.log('[GpsLiveTracker] GPS 訊號過期 (', Math.round(age / 1000), 's), 視為失去即時定位');
            hasRealTimeFix = false;
          }
        }

        // Parse address from ps field (geocoded location string)
        const address = s.ps as string | undefined;
        console.log('[GpsLiveTracker] Address from ps:', JSON.stringify(address));
        if (address && address.trim()) {
          gpsDataAddress = address.trim();
          console.log('[GpsLiveTracker] gpsDataAddress set to:', gpsDataAddress);
        }
      } else {
        console.log('[GpsLiveTracker] getDeviceStatus result:', res.result, 'status:', JSON.stringify(res.status));
      }

      // If getDeviceStatus didn't return GPS, try queryVehicleList
      // The list API may paginate - try filtering by devIdno/vehiIdno first, then by paginating
      let listRawResponse = '';
      let allVehicles: GpsVehicleLike[] = [];

      // Attempt 1: Paginate through the full vehicle list to find our device
      // (filter parameters may not be supported by this API version)
      if (lat === 0 || lng === 0) {
        const tried = new Set<string>();
        for (let p = 1; p <= 10; p++) {
          // Try unfiltered list
          const listRes = await gps808Api.queryVehicleList(p, 200);
          if (listRes.result !== 0 || !listRes.infos || listRes.infos.length === 0) break;
          allVehicles.push(...listRes.infos);
          
          // Try matching against all collected vehicles so far
          const device = allVehicles.find((v) =>
            v.devIdno === devIdno ||
            v.devIdno?.toLowerCase() === devIdno.toLowerCase() ||
            (plateNumber && v.vehiIdno?.toLowerCase() === plateNumber.toLowerCase()) ||
            (plateNumber && v.vehiIdno?.toLowerCase().replace(/\s+/g, '') === plateNumber.toLowerCase().replace(/\s+/g, '')) ||
            v.vehiIdno === devIdno
          );
          if (device) {
            listRawResponse = JSON.stringify(device, null, 2);
            // queryVehicleList returns weidu/jindu in 1e6 format or as numeric strings
            const rawLat = parseCoord(device.weidu ?? device.lat);
            const rawLng = parseCoord(device.jindu ?? device.lng);

            // Convert from 1e6 format to decimal (if value is too large)
            lat = Math.abs(rawLat) > 180 ? rawLat / 1e6 : rawLat;
            lng = Math.abs(rawLng) > 180 ? rawLng / 1e6 : rawLng;
            // queryVehicleList 回傳的是「列表快照」，並非即時 GPS 定位
            hasRealTimeFix = false;

            speed = parseSpeed(device.speed);
            direction = parseCoord(device.direction);
            onlineStatus = parseCoord(device.onlineStatus);

            const gt = (device as { gpsTime?: number }).gpsTime;
            if (gt) gpsTime = gt;
            break;
          }
          
          // Stop pagination if no more pages
          const totalPages = listRes.pagination?.totalPages ?? 0;
          if (totalPages > 0 && p >= totalPages) break;
          // Also break if we got fewer items than the page size
          if (listRes.infos.length < 200) break;
          // Avoid infinite loop on the same page signature
          const sig = JSON.stringify(listRes.infos.map(v => v.devIdno));
          if (tried.has(sig)) break;
          tried.add(sig);
        }
        
        // If still not found, also try findVehicleInfoByDeviceId
        if (lat === 0 || lng === 0) {
          const infoRes = await gps808Api.findVehicleInfoByDeviceId(devIdno);
          if (infoRes.result === 0 && infoRes.infos && infoRes.infos.length > 0) {
            const device = infoRes.infos[0];
            listRawResponse = JSON.stringify({ ...device, _source: 'findVehicleInfoByDeviceId', _allVehiclesCount: allVehicles.length }, null, 2);
            const rawLat = parseCoord(device.weidu ?? device.lat);
            const rawLng = parseCoord(device.jindu ?? device.lng);

            lat = Math.abs(rawLat) > 180 ? rawLat / 1e6 : rawLat;
            lng = Math.abs(rawLng) > 180 ? rawLng / 1e6 : rawLng;
            hasRealTimeFix = false;

            speed = parseSpeed(device.speed);
            direction = parseCoord(device.direction);
            onlineStatus = parseCoord(device.onlineStatus);
          } else {
            listRawResponse = JSON.stringify({ _totalFound: allVehicles.length, _searched: devIdno, _plateSearched: plateNumber, _firstSamples: allVehicles.slice(0, 3).map(v => ({ vehiIdno: v.vehiIdno, devIdno: v.devIdno, weidu: v.weidu, jindu: v.jindu })) }, null, 2);
          }
        } else if (!listRawResponse) {
          // We've found the device but listRawResponse wasn't set (shouldn't happen)
          const device = allVehicles.find((v) =>
            v.devIdno === devIdno ||
            v.devIdno?.toLowerCase() === devIdno.toLowerCase() ||
            (plateNumber && v.vehiIdno?.toLowerCase() === plateNumber.toLowerCase()) ||
            v.vehiIdno === devIdno
          );
          listRawResponse = JSON.stringify(device ?? { _totalFound: allVehicles.length, _searched: devIdno }, null, 2);
        }
      }

      console.log('[GpsLiveTracker] Final coords after fallback:', lat, lng);

      setGpsData({
        lat,
        lng,
        speed,
        direction,
        gpsTime,
        onlineStatus,
        address: gpsDataAddress,
        isRealTime: hasRealTimeFix,
      });
      console.log('[GpsLiveTracker] setGpsData called with:', { lat, lng, address: gpsDataAddress, isRealTime: hasRealTimeFix });
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [devIdno]);

  useEffect(() => {
    fetchGps();
    intervalRef.current = setInterval(fetchGps, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchGps]);

  useEffect(() => {
    if (onStatusUpdateRef.current) {
      onStatusUpdateRef.current({
        isOnline: isConnected,
        hasGps: hasValidGps,
        isRealTime: isRealTimeGps,
        speed: gpsData?.speed ?? 0,
        address: gpsData?.address,
      });
    }
  }, [isConnected, hasValidGps, isRealTimeGps, gpsData]);

  if (!isConnected) {
    const unavailableBody = (
      <>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MapPin size={20} color={colors.textSecondary} />
            <Text style={styles.label}>{t('vehicles.liveTracking')}</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: '#F59E0B' }]} />
        </View>
        <Text style={styles.unavailableText}>
          {t('vehicles.connectToEnableTracking')}
        </Text>
      </>
    );
    if (bare) return <View>{unavailableBody}</View>;
    return <Card style={{ padding: spacing.lg }}>{unavailableBody}</Card>;
  }

  if (!devIdno) {
    const noDeviceBody = (
      <>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MapPin size={20} color={colors.textSecondary} />
            <Text style={styles.label}>{t('vehicles.liveTracking')}</Text>
          </View>
        </View>
        <Text style={styles.unavailableText}>
          {t('vehicles.noGpsDeviceConfigured')}
        </Text>
        <Pressable
          style={styles.setupLink}
          onPress={() => Alert.alert('GPS Setup', t('vehicles.setupGpsToEnableTracking'))}
        >
          <ExternalLink size={12} color={colors.primary} />
          <Text style={styles.setupLinkText}>{t('vehicles.setupGpsDevice')}</Text>
        </Pressable>
      </>
    );
    if (bare) return <View>{noDeviceBody}</View>;
    return <Card style={{ padding: spacing.lg }}>{noDeviceBody}</Card>;
  }

  const mainBody = (
    <>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MapPin size={20} color={colors.textSecondary} />
          <Text style={styles.label}>{t('vehicles.liveTracking')}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.statusDot, { backgroundColor: isRealTimeGps ? '#22C55E' : (hasValidGps ? '#F59E0B' : '#EF4444') }]} />
          <Text style={styles.statusText}>
            {isRealTimeGps
              ? t('vehicles.live')
              : hasValidGps
                ? t('vehicles.noGpsSignalLastKnown')
                : t('vehicles.noSignal')}
          </Text>
          <Pressable onPress={fetchGps} style={styles.refreshBtn} disabled={isLoading}>
            <RefreshCw size={12} color={isLoading ? colors.textTertiary : colors.primary} />
          </Pressable>
        </View>
      </View>

      {isLoading && !gpsData && (
        <View style={styles.loadingRow}>
          <LoadingSpinner size={24} />
          <Text style={styles.loadingText}>{t('vehicles.fetchingGps')}</Text>
        </View>
      )}

      {error && !gpsData && (
        <View style={styles.errorBox}>
          <AlertCircle size={14} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={{ gap: spacing.md }}>
        <View style={styles.coordRow}>
          <Navigation size={14} color={colors.primary} />
          <Text style={styles.coordText}>
            {hasValidGps
              ? `${gpsData.lat.toFixed(6)}, ${gpsData.lng.toFixed(6)}`
              : t('vehicles.locationUnavailable')}
          </Text>
        </View>

        {/* Address row */}
        {hasValidGps && gpsData.address && (
          <View style={styles.addressRow}>
            <MapPin size={12} color={colors.textTertiary} />
            <Text style={styles.addressText} numberOfLines={2}>
              {extractChineseAddress(gpsData.address)}
            </Text>
          </View>
        )}

        {hasValidGps && (
          <>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Gauge size={14} color={colors.textTertiary} />
                <Text style={styles.statValue}>{formatSpeed(gpsData.speed)}</Text>
                <Text style={styles.statLabel}>{t('vehicles.speed')}</Text>
              </View>
              <View style={styles.statItem}>
                <Navigation
                  size={14}
                  color={colors.textTertiary}
                  style={{ transform: [{ rotate: `${gpsData.direction}deg` }] }}
                />
                <Text style={styles.statValue}>{formatDirection(gpsData.direction)}</Text>
                <Text style={styles.statLabel}>{directionLabel(gpsData.direction)}</Text>
              </View>
              <View style={styles.statItem}>
                <Clock size={14} color={colors.textTertiary} />
                <Text style={styles.statValue}>{formatGpsTime(gpsData.gpsTime)}</Text>
                <Text style={styles.statLabel}>{t('vehicles.gpsTime')}</Text>
              </View>
            </View>

            {lastRefresh && (
              <Text style={styles.refreshInfo}>
                {t('vehicles.updated')} {lastRefresh.toLocaleTimeString()} · {t('vehicles.autoRefresh')}
              </Text>
            )}
          </>
        )}

        <View style={styles.mapWrapper}>
          <View style={styles.mapHeader}>
            <View style={styles.mapHeaderLeft}>
              <MapPin size={12} color={colors.primary} />
              <Text style={styles.mapHeaderText}>
                {plateNumber || devIdno}
              </Text>
            </View>
            <Pressable
              onPress={onFullscreenMapPress}
              style={styles.mapToggleBtn}
              hitSlop={8}
            >
              <Maximize2 size={12} color={colors.textTertiary} />
            </Pressable>
          </View>
          <View style={[styles.mapContainer, { height: mapExpanded ? 320 : 120 }]}>
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
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5E7EB' }}>
                    <LoadingSpinner size={24} />
                    <Text style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>Loading map…</Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </View>

    </>
  );

  if (bare) return <View>{mainBody}</View>;
  return (
    <Card style={{ padding: spacing.lg }}>
      {mainBody}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: typography.fontSize.xs, color: colors.textTertiary, fontWeight: '600' },
  refreshBtn: { marginLeft: spacing.xs, padding: 4 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  loadingText: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  errorText: { fontSize: typography.fontSize.sm, color: '#EF4444', flex: 1 },
  coordRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.surface, borderRadius: borderRadius.sm, padding: spacing.sm,
  },
  coordText: {
    fontFamily: 'JetBrains Mono', fontSize: typography.fontSize.xs,
    color: colors.textPrimary, fontWeight: '500', flex: 1,
  },
  addressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs,
    backgroundColor: colors.surface, borderRadius: borderRadius.sm, padding: spacing.sm,
    paddingTop: spacing.xs,
  },
  addressText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary, flex: 1, lineHeight: 18,
  },
  statsGrid: { flexDirection: 'row', gap: spacing.sm },
  statItem: {
    flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.sm,
    padding: spacing.sm, alignItems: 'center', gap: 2,
  },
  statValue: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  statLabel: { fontSize: typography.fontSize.xs, color: colors.textTertiary, textAlign: 'center' },
  refreshInfo: { fontSize: typography.fontSize.xs, color: colors.textTertiary, textAlign: 'center' },
  unavailableText: { fontSize: typography.fontSize.sm, color: colors.textTertiary, lineHeight: 20 },
  mapLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, marginTop: spacing.md, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  mapLinkText: { fontSize: typography.fontSize.sm, color: colors.primary, fontWeight: '600' },
  setupLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  setupLinkText: { fontSize: typography.fontSize.sm, color: colors.primary, fontWeight: '600' },
  mapWrapper: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#E5E7EB',
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mapHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  mapHeaderText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mapToggleBtn: { padding: 4 },
  mapContainer: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
});

