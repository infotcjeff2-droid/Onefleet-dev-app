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
import { X, RefreshCw, MapPin, Navigation, Gauge, Clock, AlertCircle, Maximize2, ChevronDown, Settings, Square, Play } from 'lucide-react-native';
import { CameraFeed, type CameraFeedItem } from './CameraFeed';
import { VideoControlPanel, type WatchMode, type StreamQuality } from './VideoControlPanel';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useGps808Store } from '@/store/gps808Store';
import { gps808Api } from '@/utils/gps808Api';
import { useVideoStreamStore, formatBytes, formatDuration } from '@/store/videoStreamStore';
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
const MAX_STREAMING_DURATION = 3 * 60; // 3 分鐘（180 秒）

// 808GPS 設備的默認通道標籤配置 - 格式：{設備ID} {鏡頭類型}
const DEFAULT_CHANNEL_LABELS_TEMPLATE = [
  'DSM鏡頭',
  'ADAS鏡頭',
  '前鏡頭',
  '後鏡頭',
  '左鏡頭',
  '右鏡頭',
];

// 根據設備 ID 生成完整通道標籤
function getChannelLabel(devIdno: string, channelIndex: number): string {
  const labelTemplate = DEFAULT_CHANNEL_LABELS_TEMPLATE[channelIndex] || `通道 ${channelIndex + 1}`;
  return `${devIdno} ${labelTemplate}`;
}

interface GpsData {
  lat: number;
  lng: number;
  speed: number;
  direction: number;
  gpsTime: number;
  onlineStatus: number;
  address?: string;
  /** 設備的通道數量（從設備狀態獲取） */
  channelCount?: number;
  /**
   * 是否為「即時」GPS 訊號（lat/lng 都 > 0）。
   * false 表示失去 GPS 定位，僅有「最後已知位置」。
   */
  isRealTime: boolean;
}

interface FullScreenMonitorProps {
  visible: boolean;
  onClose: () => void;
  /** 當前車輛的 devIdno（地圖會顯示此車輛位置） */
  currentDevIdno: string;
  /** 當前車輛車牌 */
  currentPlateNumber?: string;
  /** 要顯示影像的四台車輛（最多4台） */
  cameraFeeds?: CameraFeedItem[];
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

  // 流量限制相關狀態
  const videoStreamStore = useVideoStreamStore();
  const [streamingStartTime, setStreamingStartTime] = useState<Record<string, number>>({});
  const [remainingTimes, setRemainingTimes] = useState<Record<string, number>>({});
  const [slotOverLimits, setSlotOverLimits] = useState<Record<string, { isOver: boolean; reason?: string }>>({});
  const [slotDataUsage, setSlotDataUsage] = useState<Record<string, number>>({});
  const [showControlPanel, setShowControlPanel] = useState(false);
  const [controlPanelKey, setControlPanelKey] = useState(0);
  const [streamQuality, setStreamQuality] = useState<StreamQuality>('sd');
  const [isPlaybackPaused, setIsPlaybackPaused] = useState(false); // 是否已暫停播放
  const [hasSessionExpired, setHasSessionExpired] = useState(false); // 是否已過期
  // 修改為使用 Set 來追蹤選中的通道索引
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set());

  // 全螢幕視頻 Modal 狀態
  const [fullscreenVideoModal, setFullscreenVideoModal] = useState<{
    visible: boolean;
    feed: CameraFeedItem | null;
  }>({ visible: false, feed: null });

  // 全螢幕地圖 Modal 狀態
  const [showFullscreenMap, setShowFullscreenMap] = useState(false);

  // 全螢幕按鈕點擊處理
  const handleFullscreenPress = useCallback((feed: CameraFeedItem) => {
    setFullscreenVideoModal({ visible: true, feed });
  }, []);

  // 使用 ref 保存最新值以避免閉包問題
  const streamingStartTimeRef = useRef(streamingStartTime);
  streamingStartTimeRef.current = streamingStartTime;

  // 使用 ref 保存 slotDataUsage 以避免閉包問題
  const slotDataUsageRef = useRef(slotDataUsage);
  slotDataUsageRef.current = slotDataUsage;

  // 設備的總通道數（從設備狀態獲取，默認為 4）
  const deviceChannelCount = gpsData?.channelCount || 4;

  // 根據設備通道數生成默認的 cameraFeeds
  const defaultCameraFeeds: CameraFeedItem[] = Array.from({ length: deviceChannelCount }, (_, index) => ({
    id: `${currentDevIdno}-ch${index}`,
    devIdno: currentDevIdno,
    channel: index,
    plateNumber: currentPlateNumber || currentDevIdno,
    vehicleName: getChannelLabel(currentDevIdno, index),
  }));

  // 使用傳入的 cameraFeeds 或默認配置
  const allFeeds = cameraFeeds && cameraFeeds.length > 0 ? cameraFeeds : defaultCameraFeeds;

  // 當 Modal 打開時，重置 session 使用量
  useEffect(() => {
    if (!visible) return;

    // 重置所有設備的 sessionBytes
    allFeeds.forEach((feed) => {
      if (feed.devIdno) {
        videoStreamStore.resetSessionUsage(feed.devIdno);
      }
    });
  }, [visible]);

  // 當 Modal 關閉時，做最終結算
  useEffect(() => {
    if (visible) return;

    // 計算每個通道的最終使用時長並結算
    Object.entries(streamingStartTimeRef.current).forEach(([feedId, startTime]) => {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      if (duration > 0) {
        // 找到對應的 feed 以獲取 devIdno
        const feed = allFeeds.find(f => f.id === feedId);
        if (feed?.devIdno) {
          videoStreamStore.addDuration(feed.devIdno, duration);
          videoStreamStore.stopStreaming();
          console.log(`[FullScreenMonitor] 結算頻道 ${feedId}: 使用時長 ${duration} 秒`);
        }
      }
    });

    // 重置所有播放狀態
    setIsPlaybackPaused(false);
    setHasSessionExpired(false);
    setSelectedChannels(new Set()); // 重置通道選擇
    setStreamingStartTime({});
    setRemainingTimes({});
    setSlotOverLimits({});
    setSlotDataUsage({});
  }, [visible]);

  // 計時器：每秒檢查一次超限
  useEffect(() => {
    if (!visible) return;

    const timer = setInterval(() => {
      const currentStartTimes = streamingStartTimeRef.current;
      const now = Date.now();
      const newRemaining: Record<string, number> = {};
      const newOverLimits: Record<string, { isOver: boolean; reason?: string }> = {};
      let anyExpired = false;

      Object.entries(currentStartTimes).forEach(([feedId, startTime]) => {
        const elapsedSeconds = Math.floor((now - startTime) / 1000);
        const remaining = MAX_STREAMING_DURATION - elapsedSeconds;

        if (remaining <= 0) {
          // 只有計時器倒數到 0 才標記為過期
          newRemaining[feedId] = 0;
          newOverLimits[feedId] = { isOver: true, reason: '播放時間已達上限' };
          anyExpired = true;
        } else {
          newRemaining[feedId] = remaining;
          newOverLimits[feedId] = { isOver: false };
        }
      });

      if (Object.keys(newRemaining).length > 0) {
        setRemainingTimes(newRemaining);
        setSlotOverLimits(newOverLimits);
      }

      // 如果有任何計時器過期，設置 hasSessionExpired 並停止播放
      if (anyExpired && !hasSessionExpired) {
        setHasSessionExpired(true);
        setIsPlaybackPaused(true);
        
        // 清空計時器狀態（停止倒數）
        setStreamingStartTime({});
        setRemainingTimes({});
        
        // 停止所有播放並做最終結算
        Object.entries(currentStartTimes).forEach(([feedId, startTime]) => {
          const duration = Math.floor((now - startTime) / 1000);
          if (duration > 0) {
            const feed = allFeeds.find(f => f.id === feedId);
            if (feed?.devIdno) {
              videoStreamStore.addDuration(feed.devIdno, duration);
              videoStreamStore.stopStreaming();
              console.log(`[FullScreenMonitor] 計時器到期，結算頻道 ${feedId}: ${duration} 秒`);
            }
          }
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, currentDevIdno, videoStreamStore, hasSessionExpired, allFeeds]);

  // 根據 selectedChannels 過濾要顯示的頻道
  const displayFeeds = allFeeds.filter((_, index) => selectedChannels.has(index));

  // 處理通道選擇
  const handleChannelToggle = (channelIndex: number) => {
    setSelectedChannels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(channelIndex)) {
        newSet.delete(channelIndex);
      } else {
        newSet.add(channelIndex);
      }
      return newSet;
    });
    // 重置播放狀態
    setIsPlaybackPaused(false);
    setHasSessionExpired(false);
    setStreamingStartTime({});
    setRemainingTimes({});
    setSlotOverLimits({});
    setSlotDataUsage({});
  };

  // 清除所有通道選擇
  const handleClearChannels = () => {
    setSelectedChannels(new Set());
    setIsPlaybackPaused(false);
    setHasSessionExpired(false);
    setStreamingStartTime({});
    setRemainingTimes({});
    setSlotOverLimits({});
    setSlotDataUsage({});
  };

  // 追蹤流量使用（放在 displayFeeds 定義之後以避免 TDZ 問題）
  useEffect(() => {
    if (!visible || displayFeeds.length === 0) return;

    const dataTimer = setInterval(() => {
      let hasUpdate = false;

      displayFeeds.forEach((feed) => {
        if (feed.devIdno && !feed.id.startsWith('empty-')) {
          const bytesPerSecond = streamQuality === 'hd' ? 1.5 * 1024 * 1024 : 500 * 1024;
          const key = `${feed.id}-${feed.devIdno}`;
          const currentUsage = slotDataUsageRef.current[key] ?? 0;
          setSlotDataUsage(prev => ({ ...prev, [key]: currentUsage + bytesPerSecond }));
          videoStreamStore.addDataUsage(feed.devIdno, bytesPerSecond);
          hasUpdate = true;
        }
      });
    }, 1000);

    return () => clearInterval(dataTimer);
  }, [visible, displayFeeds, streamQuality, videoStreamStore]);

  // 追蹤播放開始時間（放在 displayFeeds 定義之後以避免 TDZ 問題）
  useEffect(() => {
    if (!visible) return;

    displayFeeds.forEach((feed) => {
      if (feed.devIdno && !feed.id.startsWith('empty-')) {
        if (!streamingStartTime[feed.id]) {
          setStreamingStartTime(prev => ({ ...prev, [feed.id]: Date.now() }));
          videoStreamStore.startStreaming(feed.devIdno);
        }
      }
    });
  }, [visible, displayFeeds, videoStreamStore]);

  const hasValidGps = gpsData !== null && (gpsData.lat !== 0 || gpsData.lng !== 0);
  const isRealTimeGps = gpsData?.isRealTime ?? false;
  const displayLat = hasValidGps ? gpsData.lat : DEFAULT_MAP_LAT;
  const displayLng = hasValidGps ? gpsData.lng : DEFAULT_MAP_LNG;
  const mapZoom = hasValidGps ? 18 : 12;

  const mapHtml = buildMapHtml({
    lat: displayLat,
    lng: displayLng,
    label: currentPlateNumber || currentDevIdno,
    zoom: mapZoom,
    showMarker: true,
    noSignal: !isRealTimeGps,
    noGpsSignalText: hasValidGps
      ? t('vehicles.noGpsSignalLastKnown')
      : t('vehicles.noGpsSignal'),
    address: hasValidGps ? gpsData.address : undefined,
    currentLang: locale,
  });

  // 根據顯示的通道數計算網格佈局
  const getGridLayout = (count: number): { rows: number; cols: number } => {
    if (count <= 1) return { rows: 1, cols: 1 };
    if (count <= 2) return { rows: 1, cols: 2 };
    if (count <= 4) return { rows: 2, cols: 2 };
    if (count <= 6) return { rows: 2, cols: 3 };
    return { rows: Math.ceil(count / 3), cols: 3 };
  };

  const gridLayout = getGridLayout(displayFeeds.length);

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
      let lastKnownLat = 0;
      let lastKnownLng = 0;
      let hasRealTimeFix = false;
      let speed = 0;
      let direction = 0;
      let gpsTime = Date.now();
      let onlineStatus = 0;
      let gpsDataAddress = '';
      let channelCount = 4; // 默認 4 通道

      if (res.result === 0 && res.status) {
        const s = res.status as unknown as Record<string, unknown>;

        // 解析通道數量
        const pt = parseCoord(s.pt);
        if (pt > 0 && pt <= 16) {
          channelCount = pt;
        }

        // 解析即時 GPS 座標（status.lng / status.lat）
        // 格式：1e6 整數（例如 114157293 = 114.157293）
        let rawLat = parseCoord(s.lat);
        let rawLng = parseCoord(s.lng);
        if (rawLat !== 0 && rawLng !== 0) {
          lat = Math.abs(rawLat) > 180 ? rawLat / 1_000_000 : rawLat;
          lng = Math.abs(rawLng) > 180 ? rawLng / 1_000_000 : rawLng;
          hasRealTimeFix = true;
        }

        // 解析「最後已知位置」（status.mlat / status.mlng / status.lang）
        // 格式：通常為 decimal 字串（例如 "22.342830" / "114.157293"）
        // 808GPS API 在車輛失去 GPS 定位時仍會保留此值，應作為「最後位置」顯示
        const rawMlat = parseCoord(s.mlat);
        const rawMlng = parseCoord(s.mlng);
        const rawLang = parseCoord(s.lang);

        if (rawMlat !== 0 && rawMlng !== 0) {
          lastKnownLat = Math.abs(rawMlat) > 180 ? rawMlat / 1_000_000 : rawMlat;
          lastKnownLng = Math.abs(rawMlng) > 180 ? rawMlng / 1_000_000 : rawMlng;
        } else if (rawMlat !== 0 && rawLang !== 0) {
          lastKnownLat = Math.abs(rawMlat) > 180 ? rawMlat / 1_000_000 : rawMlat;
          lastKnownLng = Math.abs(rawLang) > 180 ? rawLang / 1_000_000 : rawLang;
        }

        // 若無即時定位但有最後已知位置，採用最後已知位置作為顯示座標
        if (!hasRealTimeFix && (lastKnownLat !== 0 || lastKnownLng !== 0)) {
          lat = lastKnownLat;
          lng = lastKnownLng;
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
            hasRealTimeFix = true;
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

      setGpsData({ lat, lng, speed, direction, gpsTime, onlineStatus, address: gpsDataAddress, isRealTime: hasRealTimeFix, channelCount });
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
      // 重置所有狀態
      setGpsData(null);
      setError(null);
      setSelectedFeedIndex(0);
      setStreamingStartTime({});
      setRemainingTimes({});
      setSlotOverLimits({});
      setSlotDataUsage({});
      // 重新獲取 GPS 數據
      if (isConnected) {
        fetchGps();
      }
    }
  }, [visible, currentDevIdno, isConnected]);

  // 超限重置函數
  const handleOverLimitReset = (feed: CameraFeedItem) => {
    if (!feed.devIdno) return;
    
    // 重置該通道的超限狀態
    setSlotOverLimits(prev => {
      const updated = { ...prev };
      delete updated[feed.id];
      return updated;
    });
    setRemainingTimes(prev => {
      const updated = { ...prev };
      delete updated[feed.id];
      return updated;
    });
    // 重置該設備的流量統計
    videoStreamStore.resetUsage(feed.devIdno);
    setSlotDataUsage(prev => {
      const updated = { ...prev };
      const key = `${feed.id}-${feed.devIdno}`;
      delete updated[key];
      return updated;
    });
  };

  const renderCameraCell = (feed: CameraFeedItem, index: number) => {
    if (!feed.devIdno || feed.id.startsWith('empty-')) {
      return (
        <View style={styles.emptyCameraCell}>
          <Text style={styles.emptyCameraText}>無影像</Text>
        </View>
      );
    }
    
    // 渲染恢復播放按鈕
    const renderResumeButton = () => (
      <View style={styles.pauseOverlay}>
        <View style={styles.pauseOverlayContent}>
          <Text style={styles.pauseOverlayText}>
            {hasSessionExpired ? '播放時間已結束' : '實時監控已暫停'}
          </Text>
          <Text style={styles.pauseOverlaySubText}>
            {hasSessionExpired ? '請按「恢復實時監控」繼續觀看' : '請按「恢復實時監控」繼續觀看'}
          </Text>
          <TouchableOpacity
            style={styles.resumeBtn}
            onPress={() => {
              // 重置所有播放狀態並重新開始
              setIsPlaybackPaused(false);
              setHasSessionExpired(false);
              setStreamingStartTime({});
              setRemainingTimes({});
              setSlotOverLimits({});
              setSlotDataUsage({});
              // 重新開始播放
              setTimeout(() => {
                const selectedFeeds = allFeeds.filter((_, idx) => selectedChannels.has(idx));
                selectedFeeds.forEach((f) => {
                  if (f.devIdno && !f.id.startsWith('empty-')) {
                    setStreamingStartTime(prev => ({ ...prev, [f.id]: Date.now() }));
                    videoStreamStore.startStreaming(f.devIdno);
                  }
                });
              }, 100);
            }}
          >
            <Text style={styles.resumeBtnText}>恢復實時監控</Text>
          </TouchableOpacity>
        </View>
      </View>
    );

    return (
      <View style={styles.cameraCellContent}>
        <CameraFeed
          item={feed}
          isSelected={selectedFeedIndex === index}
          onPress={() => setSelectedFeedIndex(index)}
          quality={streamQuality}
          remainingTime={remainingTimes[feed.id] ?? 0}
          dataUsed={slotDataUsage[`${feed.id}-${feed.devIdno}`] || videoStreamStore.getVehicleUsage(feed.devIdno).monthlyBytes}
          dataLimit={videoStreamStore.settings.maxDataLimit}
          isOverLimit={slotOverLimits[feed.id]?.isOver ?? false}
          limitWarning={slotOverLimits[feed.id]?.reason}
          onOverLimitReset={() => handleOverLimitReset(feed)}
          isPaused={isPlaybackPaused || hasSessionExpired}
          onFullscreen={handleFullscreenPress}
        />
        {(isPlaybackPaused || hasSessionExpired) && renderResumeButton()}
      </View>
    );
  };

  const renderMapArea = () => (
    <View style={styles.mapSection}>
      {/* Map Header */}
      <View style={styles.mapHeader}>
        <View style={styles.mapHeaderLeft}>
          <Text style={styles.mapHeaderLabel}>GPS 位置</Text>
        </View>
        <View style={styles.mapHeaderRight}>
          <TouchableOpacity
            onPress={() => setShowFullscreenMap(true)}
            style={styles.mapFullscreenBtn}
            hitSlop={8}
          >
            <Maximize2 size={14} color="#FFFFFF" />
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

  const renderCameraArea = () => {
    // 渲染停止/恢復播放按鈕（開關模式）
    const renderStopResumeButton = () => {
      // 只有在有計時器運行或已過期時才顯示
      const hasTimerRunning = Object.values(remainingTimes).some(t => t > 0);
      if (!hasTimerRunning && !isPlaybackPaused && !hasSessionExpired) {
        return null;
      }

      return (
        <TouchableOpacity
          style={styles.stopResumeBtn}
          onPress={() => {
            if (isPlaybackPaused || hasSessionExpired) {
              // 恢復播放：重新載入並開始播放
              setIsPlaybackPaused(false);
              setHasSessionExpired(false);
              setStreamingStartTime({});
              setRemainingTimes({});
              setSlotOverLimits({});
              setSlotDataUsage({});
              // 重新開始播放
              setTimeout(() => {
                const selectedFeeds = allFeeds.filter((_, idx) => selectedChannels.has(idx));
                selectedFeeds.forEach((feed) => {
                  if (feed.devIdno && !feed.id.startsWith('empty-')) {
                    setStreamingStartTime(prev => ({ ...prev, [feed.id]: Date.now() }));
                    videoStreamStore.startStreaming(feed.devIdno);
                  }
                });
              }, 100);
            } else {
              // 停止播放（顯示 overlay，不停止視頻）
              setIsPlaybackPaused(true);
            }
          }}
        >
          {isPlaybackPaused || hasSessionExpired ? (
            <Play size={14} color="#FFFFFF" />
          ) : (
            <Square size={14} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      );
    };

    // 渲染自動停止計時器（可點擊切換）
    const renderAutoStopTimer = () => {
      const hasTimerRunning = Object.values(remainingTimes).some(t => t > 0);
      
      // 渲染計時器內容（可點擊切換開關）
      const renderTimerContent = () => {
        if (hasSessionExpired) {
          return (
            <TouchableOpacity 
              style={styles.autoStopTimerTouchable}
              onPress={() => {
                // 切換：恢復播放
                setIsPlaybackPaused(false);
                setHasSessionExpired(false);
                setStreamingStartTime({});
                setRemainingTimes({});
                setSlotOverLimits({});
                setSlotDataUsage({});
                setTimeout(() => {
                  const selectedFeeds = allFeeds.filter((_, idx) => selectedChannels.has(idx));
                  selectedFeeds.forEach((feed) => {
                    if (feed.devIdno && !feed.id.startsWith('empty-')) {
                      setStreamingStartTime(prev => ({ ...prev, [feed.id]: Date.now() }));
                      videoStreamStore.startStreaming(feed.devIdno);
                    }
                  });
                }, 100);
              }}
            >
              <Text style={styles.autoStopTimerLabel}>自動停止計時器</Text>
              <Text style={styles.sessionExpiredText}>已過期</Text>
            </TouchableOpacity>
          );
        }

        if (hasTimerRunning) {
          const minRemaining = Math.min(...Object.values(remainingTimes).filter(t => t > 0));
          const minutes = Math.floor(minRemaining / 60);
          const seconds = minRemaining % 60;

          return (
            <TouchableOpacity 
              style={styles.autoStopTimerTouchable}
              onPress={() => {
                // 切換：停止播放
                setIsPlaybackPaused(true);
              }}
            >
              <Text style={styles.autoStopTimerLabel}>自動停止計時器</Text>
              <Text style={styles.autoStopTimerValue}>
                {minutes}:{String(seconds).padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          );
        }

        // 無計時器運行
        return (
          <View style={styles.autoStopTimerTouchable}>
            <Text style={styles.autoStopTimerLabel}>自動停止計時器</Text>
            <Text style={styles.autoStopTimerInactive}>--:--</Text>
          </View>
        );
      };

      return (
        <View style={styles.autoStopTimerContainer}>
          {renderTimerContent()}
          {renderStopResumeButton()}
        </View>
      );
    };

    // 渲染頻道選擇器 - 直接顯示數字按鈕 (1 2 3 4)，支援多選
    // 定義在前面以避免 TDZ 問題
    const renderChannelSelector = () => {
      if (allFeeds.length <= 1) return null;

      return (
        <View style={styles.channelSelectorContainer}>
          {allFeeds.slice(0, Math.min(allFeeds.length, 8)).map((_, index) => {
            const count = index + 1;
            const isActive = selectedChannels.has(index);
            return (
              <TouchableOpacity
                key={`ch-${count}`}
                style={[
                  styles.channelNumBtn,
                  isActive && styles.channelNumBtnActive,
                ]}
                onPress={() => handleChannelToggle(index)}
              >
                <Text style={[
                  styles.channelNumText,
                  isActive && styles.channelNumTextActive,
                ]}>
                  {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    };

    // 如果沒有影像饋送，顯示提示
    if (allFeeds.length === 0) {
      return (
        <View style={styles.cameraSection}>
          <View style={styles.cameraHeader}>
            <Text style={styles.cameraHeaderTitle}>實時錄像</Text>
          </View>
          <View style={styles.noCameraContainer}>
            <Text style={styles.noCameraText}>此車輛無影像設備</Text>
          </View>
        </View>
      );
    }

    // 當未選擇任何通道時，顯示提示
    if (selectedChannels.size === 0) {
      return (
        <View style={styles.cameraSection}>
          {/* Camera Header */}
          <View style={styles.cameraHeader}>
            <Text style={styles.cameraHeaderTitle}>實時錄像</Text>
            <View style={styles.cameraHeaderRight}>
              <Text style={styles.cameraCountText}>
                {allFeeds.length} 通道
              </Text>
              {renderChannelSelector()}
              {renderAutoStopTimer()}
            </View>
          </View>

          {/* Empty State - No channel selected */}
          <View style={styles.noChannelContainer}>
            <Text style={styles.noChannelText}>請選擇要觀看的通道</Text>
            <Text style={styles.noChannelHint}>點擊上方數字選擇 1-{Math.min(allFeeds.length, 8)} 通道</Text>
          </View>
        </View>
      );
    }

    // 根據網格佈局動態生成行
    const renderGrid = () => {
      const rows: React.ReactNode[] = [];
      const selectedFeeds = allFeeds.filter((_, index) => selectedChannels.has(index));
      const layout = getGridLayout(selectedFeeds.length);

      for (let row = 0; row < layout.rows; row++) {
        const cells: React.ReactNode[] = [];

        for (let col = 0; col < layout.cols; col++) {
          const feedIndex = row * layout.cols + col;
          const feed = selectedFeeds[feedIndex];

          if (!feed) {
            // 超出實際通道數的格子顯示為空
            cells.push(
              <View key={`empty-${row}-${col}`} style={styles.cameraCell}>
                <View style={styles.emptyCameraCell}>
                  <Text style={styles.emptyCameraText}>-</Text>
                </View>
              </View>
            );
          } else {
            cells.push(
              <View key={feed.id || feedIndex} style={styles.cameraCell}>
                {renderCameraCell(feed, feedIndex)}
              </View>
            );
          }
        }

        rows.push(
          <View key={`row-${row}`} style={styles.cameraCellRow}>
            {cells}
          </View>
        );
      }

      return rows;
    };

    return (
      <View style={styles.cameraSection}>
        {/* Camera Header */}
        <View style={styles.cameraHeader}>
          <Text style={styles.cameraHeaderTitle}>實時錄像</Text>
          <View style={styles.cameraHeaderRight}>
            <Text style={styles.cameraCountText}>
              {allFeeds.length} 通道
            </Text>
            {renderChannelSelector()}
            {renderAutoStopTimer()}
          </View>
        </View>

        {/* Dynamic Camera Grid based on channel count */}
        <View style={styles.cameraGrid}>
          {renderGrid()}
        </View>
      </View>
    );
  };

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
            <Text style={styles.topBarTitle} numberOfLines={1}>
              {currentPlateNumber || currentDevIdno}
            </Text>
            <Text style={styles.topBarDivider}>|</Text>
            <Text style={styles.topBarSubtitle}>實時監控</Text>
            <View style={styles.streamingBadge}>
              <View style={styles.streamingDot} />
              <Text style={styles.streamingBadgeText}>即時</Text>
            </View>
          </View>
          <View style={styles.topBarRight}>
            <TouchableOpacity
              onPress={() => {
                setControlPanelKey(prev => prev + 1);
                setShowControlPanel(true);
              }}
              style={styles.settingsBtn}
            >
              <Settings size={16} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Top: Map */}
          {renderMapArea()}

          {/* Bottom: Camera Grid */}
          {renderCameraArea()}
        </View>
      </View>

      {/* Video Control Panel Modal */}
      <VideoControlPanel
        key={controlPanelKey}
        visible={showControlPanel}
        onClose={() => setShowControlPanel(false)}
        devIdno={currentDevIdno}
        plateNumber={currentPlateNumber}
      />

      {/* 全螢幕視頻 Modal */}
      <Modal
        visible={fullscreenVideoModal.visible}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setFullscreenVideoModal({ visible: false, feed: null })}
      >
        <View style={fullscreenVideoStyles.modalContainer}>
          {/* Header */}
          <View style={fullscreenVideoStyles.topBar}>
            <TouchableOpacity
              style={fullscreenVideoStyles.backBtn}
              onPress={() => setFullscreenVideoModal({ visible: false, feed: null })}
            >
              <ChevronDown size={20} color="#FFFFFF" />
              <Text style={fullscreenVideoStyles.backText}>關閉</Text>
            </TouchableOpacity>
            <View style={fullscreenVideoStyles.topBarCenter}>
              {fullscreenVideoModal.feed && (
                <>
                  <View style={fullscreenVideoStyles.liveBadge}>
                    <View style={fullscreenVideoStyles.liveDot} />
                    <Text style={fullscreenVideoStyles.liveBadgeText}>LIVE</Text>
                  </View>
                  <Text style={fullscreenVideoStyles.topBarTitle}>
                    {fullscreenVideoModal.feed.vehicleName || fullscreenVideoModal.feed.devIdno}
                  </Text>
                </>
              )}
            </View>
            <View style={{ width: 80 }} />
          </View>

          {/* Fullscreen Video */}
          <View style={fullscreenVideoStyles.videoContainer}>
            {fullscreenVideoModal.feed && (
              <CameraFeed
                item={fullscreenVideoModal.feed}
                quality={streamQuality}
                showQualityControl
                onQualityChange={setStreamQuality}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* 全螢幕地圖 Modal */}
      <Modal
        visible={showFullscreenMap}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowFullscreenMap(false)}
      >
        <View style={fullscreenMapStyles.modalContainer}>
          {/* Header */}
          <View style={fullscreenMapStyles.topBar}>
            <TouchableOpacity
              style={fullscreenMapStyles.backBtn}
              onPress={() => setShowFullscreenMap(false)}
            >
              <ChevronDown size={20} color="#FFFFFF" />
              <Text style={fullscreenMapStyles.backText}>返回</Text>
            </TouchableOpacity>
            <View style={fullscreenMapStyles.topBarCenter}>
              <MapPin size={16} color={defaultColors.primary} />
              <Text style={fullscreenMapStyles.topBarTitle}>
                {currentPlateNumber || currentDevIdno}
              </Text>
              <View style={fullscreenMapStyles.statusBadge}>
                <View style={[fullscreenMapStyles.statusDot, { backgroundColor: isRealTimeGps ? '#22C55E' : (hasValidGps ? '#F59E0B' : '#EF4444') }]} />
                <Text style={fullscreenMapStyles.statusText}>
                  {isRealTimeGps ? '即時' : (hasValidGps ? '最後位置' : '無GPS')}
                </Text>
              </View>
            </View>
            <View style={{ width: 80 }} />
          </View>

          {/* GPS Stats Row */}
          {hasValidGps && (
            <View style={fullscreenMapStyles.statsRow}>
              <View style={fullscreenMapStyles.statItem}>
                <Gauge size={14} color="#FFFFFF" />
                <Text style={fullscreenMapStyles.statValue}>{formatSpeed(gpsData.speed)}</Text>
              </View>
              <View style={fullscreenMapStyles.statItem}>
                <Navigation
                  size={14}
                  color="#FFFFFF"
                  style={{ transform: [{ rotate: `${gpsData.direction}deg` }] }}
                />
                <Text style={fullscreenMapStyles.statValue}>{formatDirection(gpsData.direction)}</Text>
              </View>
              <View style={fullscreenMapStyles.statItem}>
                <Clock size={14} color="#FFFFFF" />
                <Text style={fullscreenMapStyles.statValue}>{formatGpsTime(gpsData.gpsTime)}</Text>
              </View>
            </View>
          )}

          {/* Address Row */}
          {hasValidGps && gpsData.address && (
            <View style={fullscreenMapStyles.addressRow}>
              <MapPin size={12} color="rgba(255,255,255,0.7)" />
              <Text style={fullscreenMapStyles.addressText} numberOfLines={2}>
                {gpsData.address}
              </Text>
            </View>
          )}

          {/* Fullscreen Map */}
          <View style={fullscreenMapStyles.mapContainer}>
            {IS_WEB ? (
              <iframe
                srcDoc={mapHtml}
                style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
                title="Live GPS Map Fullscreen"
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
                  <View style={fullscreenMapStyles.mapLoading}>
                    <LoadingSpinner size={32} />
                    <Text style={{ marginTop: 12, fontSize: 14, color: '#6B7280' }}>載入地圖中...</Text>
                  </View>
                )}
              />
            )}
          </View>

          {/* Last refresh info */}
          {lastRefresh && (
            <View style={fullscreenMapStyles.refreshInfo}>
              <Text style={fullscreenMapStyles.refreshInfoText}>
                更新時間 {lastRefresh.toLocaleTimeString()} · 每 10 秒自動刷新
              </Text>
            </View>
          )}
        </View>
      </Modal>
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
    gap: spacing.xs,
    flex: 1,
  },
  topBarTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  topBarDivider: {
    fontSize: typography.fontSize.base,
    color: '#4A5568',
    marginHorizontal: spacing.xs,
  },
  topBarSubtitle: {
    fontSize: typography.fontSize.sm,
    color: '#8B92A8',
    fontWeight: '500',
  },
  streamingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  streamingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  streamingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#22C55E',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
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
  mapFullscreenBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
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
  autoStopTimerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  autoStopTimerLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#F59E0B',
  },
  autoStopTimerValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: '#EF4444',
  },
  sessionExpiredText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: '#EF4444',
  },
  stopResumeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
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
  cameraCellContent: {
    flex: 1,
    position: 'relative',
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
  noCameraContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  noCameraText: {
    fontSize: typography.fontSize.md,
    color: colors.textTertiary,
    fontWeight: '600',
    textAlign: 'center',
  },
  // No channel selected state
  noChannelContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  noChannelText: {
    fontSize: typography.fontSize.lg,
    color: '#8B92A8',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  noChannelHint: {
    fontSize: typography.fontSize.sm,
    color: '#4A5568',
    textAlign: 'center',
  },
  // Pause overlay
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  pauseOverlayContent: {
    alignItems: 'center',
    gap: spacing.md,
  },
  pauseOverlayText: {
    fontSize: typography.fontSize.md,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  pauseOverlaySubText: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  resumeBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  resumeBtnText: {
    fontSize: typography.fontSize.sm,
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // --- Channel Selector (数字按钮) ---
  channelSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  channelNumBtn: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A3040',
  },
  channelNumBtnActive: {
    backgroundColor: defaultColors.primary,
    borderColor: defaultColors.primary,
  },
  channelNumText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  channelNumTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // 可點擊的計時器內容
  autoStopTimerTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  autoStopTimerInactive: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: '#6B7280',
  },

  // --- 旧的 dropdown 样式保留备用 ---
  channelSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: defaultColors.primary,
  },
  channelSelectorText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  channelDropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: spacing.xs,
    backgroundColor: '#1a1a2e',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: '#2A3040',
    overflow: 'hidden',
    minWidth: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  channelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3040',
  },
  channelOptionActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  channelOptionText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  channelOptionTextActive: {
    color: defaultColors.primary,
    fontWeight: '600',
  },
  channelOptionCheck: {
    fontSize: typography.fontSize.sm,
    color: defaultColors.primary,
    fontWeight: '700',
  },
});

// 全螢幕視頻 Modal 樣式
const fullscreenVideoStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#0D0F14',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: '#161A23',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
    width: 80,
  },
  backText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  topBarCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    justifyContent: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#22C55E',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  topBarTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
});

// Fullscreen Map Modal Styles
const fullscreenMapStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#0D0F14',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: '#161A23',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3040',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
    width: 80,
  },
  backText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  topBarCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    fontSize: typography.fontSize.sm,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  addressText: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.8)',
    flex: 1,
    lineHeight: 20,
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
    paddingVertical: spacing.sm,
    backgroundColor: '#161A23',
  },
  refreshInfoText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
  },
});
