import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, Modal, TouchableOpacity, TextInput } from 'react-native';
import { WebView } from 'react-native-webview';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Calendar, Clock, MapPin, Navigation, X, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useGps808Store } from '@/store/gps808Store';
import { gps808Api, type Gps808TrackPoint } from '@/utils/gps808Api';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';

type QuickRange = '1d' | '7d' | 'custom';

interface DailyRoute {
  date: string;
  points: TrackPoint[];
  distance: number;
  duration: string;
}

const IS_WEB = Platform.OS === 'web';

interface GpsTrackHistoryProps {
  devIdno: string;
  plateNumber?: string;
  bare?: boolean;
}

interface TrackPoint {
  lat: number;
  lng: number;
  speed: number;
  direction: number;
  gpsTime: number;
  address?: string;
  /** Park time in seconds (from API pt field) */
  parkTime?: number;
}

/** Calculate distance between two points in km using Haversine formula */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Calculate total distance from an array of track points */
function calculateTotalDistance(points: TrackPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += calculateDistance(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng
    );
  }
  return total;
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

/**
 * Fetch all pages of track history for a given time range.
 * Handles GPS devices that may have multiple on/off cycles per day.
 * 
 * OPTIMIZATION: Uses larger page size and parallel fetching for speed.
 */
async function fetchAllTrackPages(
  devIdno: string,
  begintime: string,
  endtime: string,
  maxPages: number = 20, // Reduced from 100 - most use cases need <10k points
  pageSize: number = 1000, // Increased from 500 for fewer round trips
): Promise<TrackPoint[]> {
  const allPoints: TrackPoint[] = [];
  let currentPage = 1;
  let totalPages = 1;

  // Fetch pages in parallel batches for speed
  const BATCH_SIZE = 3; // Parallel requests per batch

  while (currentPage <= totalPages && currentPage <= maxPages) {
    // Create batch of requests
    const batchPromises: Promise<{ points: TrackPoint[]; totalPages: number }>[] = [];
    
    for (let i = 0; i < BATCH_SIZE && currentPage + i <= totalPages && currentPage + i <= maxPages; i++) {
      const pageNum = currentPage + i;
      batchPromises.push(
        gps808Api.getTrackHistory(devIdno, begintime, endtime, {
          distance: 0,
          parkTime: 0,
          currentPage: pageNum,
          pageRecords: pageSize,
          toMap: 1,
        }).then(response => {
          const points: TrackPoint[] = [];
          
          // Handle tracks array
          if (response.result === 0 && response.tracks) {
            for (const raw of response.tracks) {
              const point = parseGpsInfoItem(raw as unknown as Gps808InfoItem);
              if (point) points.push(point);
            }
          }
          
          // Handle infos array (alternative response format)
          const infos = (response as unknown as { infos?: Gps808InfoItem[] }).infos;
          if (response.result === 0 && infos) {
            for (const raw of infos) {
              const point = parseGpsInfoItem(raw);
              if (point) points.push(point);
            }
          }
          
          // Check pagination
          let respTotalPages = 1;
          if (response.pagination) {
            respTotalPages = response.pagination.totalPages;
          }
          
          return { points, totalPages: respTotalPages };
        })
      );
    }
    
    // Wait for batch to complete
    const results = await Promise.all(batchPromises);
    
    // Update totalPages from first result (they should all be the same)
    if (results.length > 0) {
      totalPages = results[0].totalPages;
    }
    
    // Collect points from batch
    for (const result of results) {
      allPoints.push(...result.points);
    }
    
    currentPage += BATCH_SIZE;
  }

  return allPoints;
}

/** GPS API response info item */
interface Gps808InfoItem {
  id?: string;
  devIdno?: string;
  gt?: string;
  lat?: number | string;
  lng?: number | string;
  sp?: number | string;
  hx?: number | string;
  lc?: number | string;
  mlng?: string;
  mlat?: string;
  address?: string;
  vid?: string;
  /** Park time in seconds */
  pt?: number | string;
  [key: string]: unknown;
}

function parseTrackPoint(raw: Gps808TrackPoint): TrackPoint | null {
  const rawLat = parseCoord(raw.lat);
  const rawLng = parseCoord(raw.lng);

  if (rawLat === 0 || rawLng === 0) return null;

  const lat = Math.abs(rawLat) > 180 ? rawLat / 1_000_000 : rawLat;
  const lng = Math.abs(rawLng) > 180 ? rawLng / 1_000_000 : rawLng;

  if (lat === 0 || lng === 0) return null;

  const speed = parseCoord(raw.speed) / 10;
  const direction = parseCoord(raw.direction);

  let gpsTime = Date.now();
  const gt = raw.gpsTime;
  if (typeof gt === 'number') {
    // 808 GPS API 返回毫秒或秒，根據數值大小判斷
    if (gt > 1e12) {
      // 毫秒級時間戳
      gpsTime = gt;
    } else if (gt > 1e9) {
      // 秒級時間戳，轉為毫秒
      gpsTime = gt * 1000;
    } else {
      // 其他數值，預設為當前時間
      gpsTime = Date.now();
    }
  } else if (typeof gt === 'string') {
    const parsed = new Date(gt).getTime();
    gpsTime = isNaN(parsed) ? Date.now() : parsed;
  }

  return {
    lat,
    lng,
    speed,
    direction,
    gpsTime,
    address: raw.address,
  };
}

/** Parse GPS info item from API response (uses 'infos' array) */
function parseGpsInfoItem(raw: Gps808InfoItem): TrackPoint | null {
  // 優先使用字串格式的座標 (mlat, mlng)
  let lat = 0;
  let lng = 0;
  
  if (raw.mlat && raw.mlng) {
    lat = parseCoord(raw.mlat);
    lng = parseCoord(raw.mlng);
  }
  
  // 如果字串格式無效，嘗試使用整數格式並除以 1,000,000
  if (lat === 0 || lng === 0) {
    lat = parseCoord(raw.lat) / 1_000_000;
    lng = parseCoord(raw.lng) / 1_000_000;
  }

  if (lat === 0 || lng === 0 || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const speed = parseCoord(raw.sp) / 10;
  const direction = parseCoord(raw.hx);

  // gt 格式: "2026-07-15 00:00:04"
  let gpsTime = Date.now();
  const gtStr = raw.gt;
  if (typeof gtStr === 'string' && gtStr) {
    // 替換空格為 T 來符合 ISO 格式
    const isoStr = gtStr.replace(' ', 'T');
    const parsed = new Date(isoStr).getTime();
    gpsTime = isNaN(parsed) ? Date.now() : parsed;
  }

  // pt 是停泊時間（秒）
  const parkTime = parseCoord(raw.pt);

  return {
    lat,
    lng,
    speed,
    direction,
    gpsTime,
    address: typeof raw.address === 'string' ? raw.address : undefined,
    parkTime: parkTime > 0 ? parkTime : undefined,
  };
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 8);
}

function formatChineseAddress(str: string): string {
  if (!str) return '';
  const cleaned = str.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').replace(/\s*-\s*/g, '-');
  const chineseChunks = cleaned.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g);
  if (!chineseChunks || chineseChunks.length === 0) return '';
  const meaningful = chineseChunks.filter((chunk) => chunk.length >= 2);
  if (meaningful.length === 0) return chineseChunks.join(' ');
  return meaningful.join('、');
}

function getQuickRangeDates(range: QuickRange, customDate?: Date, customStartTime?: { hour: number; minute: number }, customEndTime?: { hour: number; minute: number }): { begintime: string; endtime: string } {
  const now = new Date();
  const end = new Date(now);
  end.setSeconds(59, 999);

  let start = new Date(now);

  if (range === '1d') {
    // 1日 = 昨天整天 (例如: 今天是16號, 則顯示15號的資料)
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const endYesterday = new Date(start);
    endYesterday.setHours(23, 59, 59, 999);
    return {
      begintime: `${formatDate(start)} ${formatTime(start)}`,
      endtime: `${formatDate(endYesterday)} ${formatTime(endYesterday)}`,
    };
  } else if (range === '7d') {
    start.setDate(start.getDate() - 7);
  } else if (range === 'custom' && customDate) {
    start = new Date(customDate);
    if (customStartTime) {
      start.setHours(customStartTime.hour, customStartTime.minute, 0, 0);
    } else {
      start.setHours(0, 0, 0, 0);
    }
    const endCustom = new Date(customDate);
    if (customEndTime) {
      endCustom.setHours(customEndTime.hour, customEndTime.minute, 59, 999);
    } else {
      endCustom.setHours(23, 59, 59, 999);
    }
    return {
      begintime: `${formatDate(start)} ${formatTime(start)}`,
      endtime: `${formatDate(endCustom)} ${formatTime(endCustom)}`,
    };
  }

  return {
    begintime: `${formatDate(start)} ${formatTime(start)}`,
    endtime: `${formatDate(end)} ${formatTime(end)}`,
  };
}

function buildTrackMapHtml(opts: {
  points: TrackPoint[];
  label: string;
  locale: string;
  startLabel: string;
  endLabel: string;
}): string {
  const { points, label, locale: currentLang, startLabel, endLabel } = opts;

  if (points.length === 0) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 100vw; height: 100vh; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    #map { width: 100%; height: 100%; }
    .no-data { text-align: center; color: #666; font-family: -apple-system, sans-serif; }
    .center-btn {
      position: absolute; bottom: 60px; right: 10px; z-index: 1000;
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
  <button class="center-btn" id="centerBtn" title="Center">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
    </svg>
  </button>
  <script>
    const map = L.map('map').setView([22.3193, 114.1694], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    const centerBtn = document.getElementById('centerBtn');
    if (centerBtn) {
      centerBtn.addEventListener('click', function() {
        map.setView([22.3193, 114.1694], 12);
      });
    }
  </script>
</body>
</html>`;
  }

  const latLngs = points.map(p => `[${p.lat}, ${p.lng}]`).join(',');
  const startPoint = points[0];
  const endPoint = points[points.length - 1];

  const formatAddress = (addr: string | undefined): string => {
    if (!addr) return '';
    if (currentLang === 'zh-TW' || currentLang === 'zh-HK') {
      return formatChineseAddress(addr);
    }
    return addr;
  };

  const startAddr = formatAddress(startPoint.address);
  const endAddr = formatAddress(endPoint.address);

  const startIcon = `
    L.divIcon({
      html: '<div style="background:#22C55E;border:2px solid #fff;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700;box-shadow:0 2px 4px rgba(0,0,0,0.3)">S</div>',
      className: '',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })
  `;

  const endIcon = `
    L.divIcon({
      html: '<div style="background:#EF4444;border:2px solid #fff;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700;box-shadow:0 2px 4px rgba(0,0,0,0.3)">E</div>',
      className: '',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })
  `;

  const polylineOptions = `
    color: '#3B82F6',
    weight: 4,
    opacity: 0.8,
  `;

  const safeLabel = label.replace(/'/g, "\\'");
  const safeStartLabel = startLabel.replace(/'/g, "\\'");
  const safeEndLabel = endLabel.replace(/'/g, "\\'");
  const safeStartAddr = startAddr.replace(/'/g, "\\'");
  const safeEndAddr = endAddr.replace(/'/g, "\\'");

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
    .car-icon-inner {
      width: 0; height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-bottom: 10px solid #fff;
      transform: translateY(-2px);
    }
    .info-badge {
      position: absolute; top: 8px; right: 8px; z-index: 1000;
      background: rgba(30, 41, 59, 0.95);
      color: #fff; padding: 8px 12px; border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px; font-weight: 600;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .legend {
      position: absolute; bottom: 8px; right: 8px; z-index: 1000;
      background: rgba(255,255,255,0.95);
      padding: 8px 12px; border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 11px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    }
    .legend-item { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
    .center-btn {
      position: absolute; bottom: 10px; left: 8px; z-index: 1000;
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
  <div class="info-badge">${safeLabel}</div>
  <div class="legend">
    <div class="legend-item"><div class="legend-dot" style="background:#22C55E"></div> ${safeStartLabel}</div>
    <div class="legend-item"><div class="legend-dot" style="background:#EF4444"></div> ${safeEndLabel}</div>
  </div>
  <button class="center-btn" id="centerBtn" title="Center">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
    </svg>
  </button>
  <script>
    const points = [${latLngs}];
    const center = points[Math.floor(points.length / 2)] || [22.3193, 114.1694];

    const map = L.map('map', {
      center: [center[0], center[1]],
      zoom: 14,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    const latLngPoints = points.map(p => [p[0], p[1]]);

    L.polyline(latLngPoints, { ${polylineOptions} }).addTo(map);

    const startMarker = L.marker([${startPoint.lat}, ${startPoint.lng}], { icon: ${startIcon} }).addTo(map);
    startMarker.bindPopup('<b>${safeStartLabel}</b><br/><span style="word-break:break-all;font-size:12px">${safeStartAddr}</span>');

    const endMarker = L.marker([${endPoint.lat}, ${endPoint.lng}], { icon: ${endIcon} }).addTo(map);
    endMarker.bindPopup('<b>${safeEndLabel}</b><br/><span style="word-break:break-all;font-size:12px">${safeEndAddr}</span>');

    map.fitBounds(latLngPoints, { padding: [50, 50] });

    const centerBtn = document.getElementById('centerBtn');
    if (centerBtn) {
      centerBtn.addEventListener('click', function() {
        map.fitBounds(latLngPoints, { padding: [50, 50] });
      });
    }
  </script>
</body>
</html>`;
}

function extractChineseAddress(str: string): string {
  if (!str) return '';
  const cleaned = str.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').replace(/\s*-\s*/g, '-');
  const chineseChunks = cleaned.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g);
  if (!chineseChunks || chineseChunks.length === 0) {
    // 沒有中文，返回原始地址
    return cleaned;
  }
  const meaningful = chineseChunks.filter((chunk) => chunk.length >= 2);
  if (meaningful.length === 0) return cleaned;
  return meaningful.join('、');
}

function formatSpeed(speed: number): string {
  return `${Math.round(speed)} km/h`;
}

export function GpsTrackHistory({ devIdno, plateNumber, bare = false }: GpsTrackHistoryProps) {
  const { t, locale } = useTranslation();
  const { isConnected } = useGps808Store();
  const [selectedRange, setSelectedRange] = useState<QuickRange>('1d');
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalDistance, setTotalDistance] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<string>('');
  const webViewRef = useRef<WebView>(null);

  // Time range state for custom date selection
  const [startHour, setStartHour] = useState(0);
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState(23);
  const [endMinute, setEndMinute] = useState(59);

  // 7-day route data
  const [dailyRoutes, setDailyRoutes] = useState<DailyRoute[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [isLoading7Days, setIsLoading7Days] = useState(false);
  const [is7DaysDataReady, setIs7DaysDataReady] = useState(false);

  // Full day start/end points (for showing actual device on/off times)
  const [dayStartPoint, setDayStartPoint] = useState<TrackPoint | null>(null);
  const [dayEndPoint, setDayEndPoint] = useState<TrackPoint | null>(null);

  // Filtered time range points (for map display in custom/24h modes)
  const [filteredStartPoint, setFilteredStartPoint] = useState<TrackPoint | null>(null);
  const [filteredEndPoint, setFilteredEndPoint] = useState<TrackPoint | null>(null);

  // For 24h/custom: show time range picker after selecting date/day
  const [showTimeRangePicker, setShowTimeRangePicker] = useState(false);
  // For 7d: selected day for time range
  const [selectedDayTimeRange, setSelectedDayTimeRange] = useState<{ start: number; end: number }>({ start: 0, end: 23 });
  // Expanded parking location index
  const [expandedParkIndex, setExpandedParkIndex] = useState<number | null>(null);
  
  // Time input mode: true = use hour range slider, false = use direct time input
  const [useTimeSlider, setUseTimeSlider] = useState(true);

  const fetchTrackHistory = useCallback(async (forceRange?: QuickRange, forceDate?: Date, forceStartTime?: { hour: number; minute: number }, forceEndTime?: { hour: number; minute: number }) => {
    if (!devIdno) return;
    if (!isConnected) return;

    const range = forceRange ?? selectedRange;
    const date = forceDate ?? customDate;

    // If 7-day mode, fetch all 7 days data in parallel (simplified - just show routes)
    if (range === '7d') {
      setIsLoading7Days(true);
      try {
        // Create promises for all 7 days
        const dayPromises: Promise<DailyRoute>[] = [];
        for (let i = 6; i >= 0; i--) {
          const dayDate = new Date();
          dayDate.setDate(dayDate.getDate() - i);
          const { begintime, endtime } = getQuickRangeDates('custom', dayDate);
          const dateStr = formatDate(dayDate);

          dayPromises.push(
            fetchAllTrackPages(devIdno, begintime, endtime).then((parsedPoints) => {
              // Calculate distance from parsed points
              const dayDistance = calculateTotalDistance(parsedPoints);
              
              let dayDuration = '';
              if (parsedPoints.length >= 2) {
                const first = parsedPoints[0].gpsTime;
                const last = parsedPoints[parsedPoints.length - 1].gpsTime;
                const durationMs = last - first;
                const hours = Math.floor(durationMs / (1000 * 60 * 60));
                const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                dayDuration = `${hours}h ${minutes}m`;
              }

              return {
                date: dateStr,
                points: parsedPoints,
                distance: dayDistance,
                duration: dayDuration,
              };
            }).catch(() => ({
              date: dateStr,
              points: [] as TrackPoint[],
              distance: 0,
              duration: '',
            }))
          );
        }

        // Wait for all requests to complete
        const routes = await Promise.all(dayPromises);
        setDailyRoutes(routes);
        setSelectedDayIndex(0);
        setIs7DaysDataReady(true);
        
        // Only set first day's points if available (simplified - don't process all days)
        const firstDay = routes[0];
        if (firstDay.points.length > 0) {
          setDayStartPoint(firstDay.points[0]);
          setDayEndPoint(firstDay.points[firstDay.points.length - 1]);
          setTrackPoints(firstDay.points);
          setTotalDistance(firstDay.distance);
          setTotalDuration(firstDay.duration);
          setFilteredStartPoint(firstDay.points[0]);
          setFilteredEndPoint(firstDay.points[firstDay.points.length - 1]);
          // Auto show time range picker for first day
          setSelectedDayTimeRange({ start: 0, end: 23 });
          setShowTimeRangePicker(true);
        } else {
          setDayStartPoint(null);
          setDayEndPoint(null);
          setTrackPoints([]);
          setTotalDistance(0);
          setTotalDuration('');
          setFilteredStartPoint(null);
          setFilteredEndPoint(null);
        }
      } finally {
        setIsLoading7Days(false);
      }
      return;
    }

    // Reset 7d ready flag when not in 7d mode
    setIs7DaysDataReady(false);

    setIsLoading(true);
    setError(null);

    try {
      // Fetch full day data to get device on/off times (S/E) - with pagination support
      // For '1d' mode, use yesterday's date for full day data
      // For 'custom' mode, use the selected date
      const is1dMode = range === '1d';
      const fullDayDate = is1dMode ? new Date(Date.now() - 24 * 60 * 60 * 1000) : new Date(date);
      const fullDayStart = new Date(fullDayDate);
      fullDayStart.setHours(0, 0, 0, 0);
      const fullDayEnd = new Date(fullDayDate);
      fullDayEnd.setHours(23, 59, 59, 999);
      const fullDayStartStr = `${formatDate(fullDayStart)} ${formatTime(fullDayStart)}`;
      const fullDayEndStr = `${formatDate(fullDayEnd)} ${formatTime(fullDayEnd)}`;

      // OPTIMIZATION: For '1d' mode, getQuickRangeDates already returns yesterday's full day
      // So we only need ONE API call instead of two
      const { begintime, endtime } = getQuickRangeDates(range, date, forceStartTime, forceEndTime);
      
      // Check if the time ranges are identical (1d mode) to avoid duplicate API call
      const isSameTimeRange = begintime === fullDayStartStr && endtime === fullDayEndStr;
      
      // Fetch data once - reuse for both S/E points and map display
      const allPoints = await fetchAllTrackPages(devIdno, 
        isSameTimeRange ? fullDayStartStr : begintime, 
        isSameTimeRange ? fullDayEndStr : endtime
      );

      let fullDayStartPoint: TrackPoint | null = null;
      let fullDayEndPoint: TrackPoint | null = null;
      let parsedPoints: TrackPoint[] = allPoints;

      if (allPoints.length > 0) {
        console.log('[GPS] Full day infos count:', allPoints.length);
        
        // 第一筆是最早的，最後一筆是最晚的
        const firstPoint = allPoints[0];
        const lastPoint = allPoints[allPoints.length - 1];
        console.log('[GPS] First info parsed:', JSON.stringify(firstPoint));
        console.log('[GPS] Last info parsed:', JSON.stringify(lastPoint));
        
        fullDayStartPoint = firstPoint;
        fullDayEndPoint = lastPoint;
        
        // For 1d mode, S/E are the same as first/last points
        // For custom mode, S/E are from full day, but we filter for display
        if (!isSameTimeRange && range === 'custom') {
          // Custom mode: full day for S/E, but filter by selected time range
          // Note: we already fetched the custom range, so filter in-memory
          const filterStartHour = forceStartTime?.hour ?? startHour;
          const filterEndHour = forceEndTime?.hour ?? endHour;
          
          parsedPoints = allPoints.filter((p) => {
            const hour = new Date(p.gpsTime).getHours();
            return hour >= filterStartHour && hour <= filterEndHour;
          });
        }
      }
      setDayStartPoint(fullDayStartPoint);
      setDayEndPoint(fullDayEndPoint);

      if (parsedPoints.length > 0) {
        // Calculate distance from parsed points using Haversine formula
        const dayDistance = calculateTotalDistance(parsedPoints);
        setTrackPoints(parsedPoints);
        setDailyRoutes([]);

        // Set filtered start/end points (for recent locations list)
        if (parsedPoints.length > 0) {
          setFilteredStartPoint(parsedPoints[0]);
          setFilteredEndPoint(parsedPoints[parsedPoints.length - 1]);
        } else {
          setFilteredStartPoint(null);
          setFilteredEndPoint(null);
        }

        setTotalDistance(dayDistance);

        if (parsedPoints.length >= 2) {
          const first = parsedPoints[0].gpsTime;
          const last = parsedPoints[parsedPoints.length - 1].gpsTime;
          const durationMs = last - first;
          const hours = Math.floor(durationMs / (1000 * 60 * 60));
          const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
          setTotalDuration(`${hours}h ${minutes}m`);
        } else {
          setTotalDuration('');
        }
      } else {
        // No data found for the selected time range
        setTrackPoints([]);
        setDailyRoutes([]);
        setFilteredStartPoint(null);
        setFilteredEndPoint(null);
        setError(t('vehicles.noTrackData'));
      }
    } catch (err) {
      setError(String(err));
      setTrackPoints([]);
      setDailyRoutes([]);
      setFilteredStartPoint(null);
      setFilteredEndPoint(null);
    } finally {
      setIsLoading(false);
    }
  }, [devIdno, isConnected, selectedRange, customDate, t]);

  useEffect(() => {
    fetchTrackHistory();
  }, [fetchTrackHistory]);

  const mapHtml = buildTrackMapHtml({
    points: trackPoints,
    label: plateNumber || devIdno,
    locale,
    startLabel: t('vehicles.trackStart'),
    endLabel: t('vehicles.trackEnd'),
  });

  const handleQuickRange = (range: QuickRange) => {
    setSelectedRange(range);
    if (range !== 'custom') {
      setShowDatePicker(false);
    }
    if (range !== '7d') {
      setShowTimeRangePicker(false);
    }
  };

  const handleDateSelect = (date: Date) => {
    setCustomDate(date);
    setSelectedRange('custom');
    setShowDatePicker(false);
    setShowTimeRangePicker(true);
  };

  const handleTimeRangeApply = () => {
    setShowTimeRangePicker(false);
    fetchTrackHistory('custom', customDate, { hour: startHour, minute: startMinute }, { hour: endHour, minute: endMinute });
  };

  const handleDaySelect = (index: number) => {
    setSelectedDayIndex(index);
    const route = dailyRoutes[index];
    if (route) {
      // Set all points for this day to display on map
      setTrackPoints(route.points);
      // Set S/E from full day data (for display in S/E section)
      setDayStartPoint(route.points[0] || null);
      setDayEndPoint(route.points[route.points.length - 1] || null);
      // Set filtered points (same as full day initially)
      setFilteredStartPoint(route.points[0] || null);
      setFilteredEndPoint(route.points[route.points.length - 1] || null);
      setTotalDistance(route.distance);
      setTotalDuration(route.duration);
      // Show time range picker for this day
      setSelectedDayTimeRange({ start: 0, end: 23 });
      setShowTimeRangePicker(true);
    }
  };

  // When 7-day mode is active, ensure time picker shows
  useEffect(() => {
    if (selectedRange === '7d' && is7DaysDataReady && !showTimeRangePicker) {
      setSelectedDayTimeRange({ start: 0, end: 23 });
      setShowTimeRangePicker(true);
    }
  }, [selectedRange, is7DaysDataReady]);

  const handle7DayTimeRangeApply = (closePicker = false) => {
    if (closePicker) {
      setShowTimeRangePicker(false);
    }
    const route = dailyRoutes[selectedDayIndex];
    if (route && route.points.length > 0) {
      // Filter points by selected time range
      const startHour = selectedDayTimeRange.start;
      const endHour = selectedDayTimeRange.end;
      const filtered = route.points.filter((p) => {
        const hour = new Date(p.gpsTime).getHours();
        return hour >= startHour && hour <= endHour;
      });
      setTrackPoints(filtered);
      setFilteredStartPoint(filtered[0] || null);
      setFilteredEndPoint(filtered[filtered.length - 1] || null);
      // Recalculate distance and duration for filtered range
      if (filtered.length >= 2) {
        const first = filtered[0].gpsTime;
        const last = filtered[filtered.length - 1].gpsTime;
        const durationMs = last - first;
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        setTotalDuration(`${hours}h ${minutes}m`);
        setTotalDistance(route.distance);
      } else {
        setTotalDuration('');
        setTotalDistance(0);
      }
    }
  };

  const handleViewInMaps = () => {
    if (trackPoints.length > 0) {
      const lastPoint = trackPoints[trackPoints.length - 1];
      const url = `https://www.google.com/maps?q=${lastPoint.lat},${lastPoint.lng}`;
      if (IS_WEB) {
        window.open(url, '_blank');
      }
    }
  };

  if (!isConnected) {
    const unavailableBody = (
      <>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MapPin size={20} color={colors.textSecondary} />
            <Text style={styles.label}>{t('vehicles.trackHistory')}</Text>
          </View>
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
            <Text style={styles.label}>{t('vehicles.trackHistory')}</Text>
          </View>
        </View>
        <Text style={styles.unavailableText}>
          {t('vehicles.noGpsDeviceConfigured')}
        </Text>
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
          <Text style={styles.label}>{t('vehicles.trackHistory')}</Text>
        </View>
        <Pressable onPress={fetchTrackHistory} style={styles.refreshBtn} disabled={isLoading}>
          <RotateCcw size={14} color={isLoading ? colors.textTertiary : colors.primary} />
        </Pressable>
      </View>

      {/* Quick Range Selector */}
      <View style={styles.quickRangeContainer}>
        <Pressable
          style={[styles.quickRangeBtn, selectedRange === '1d' && styles.quickRangeBtnActive]}
          onPress={() => handleQuickRange('1d')}
        >
          <Text style={[styles.quickRangeText, selectedRange === '1d' && styles.quickRangeTextActive]}>
            {t('vehicles.last24h')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.quickRangeBtn, selectedRange === '7d' && styles.quickRangeBtnActive]}
          onPress={() => handleQuickRange('7d')}
        >
          <Text style={[styles.quickRangeText, selectedRange === '7d' && styles.quickRangeTextActive]}>
            {t('vehicles.last7d')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.quickRangeBtn, selectedRange === 'custom' && styles.quickRangeBtnActive]}
          onPress={() => {
            setShowDatePicker(!showDatePicker);
          }}
        >
          <Calendar size={12} color={selectedRange === 'custom' ? colors.primary : colors.textTertiary} />
          <Text style={[styles.quickRangeText, selectedRange === 'custom' && styles.quickRangeTextActive]}>
            {selectedRange === 'custom' ? formatDate(customDate) : t('vehicles.customDate')}
          </Text>
        </Pressable>
      </View>

      {/* Custom Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowDatePicker(false)}>
          <View style={styles.datePickerContainer}>
            <View style={styles.datePickerHeader}>
              <Text style={styles.datePickerTitle}>{t('vehicles.selectDate')}</Text>
              <Pressable onPress={() => setShowDatePicker(false)}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={styles.datePickerScroll}>
              {Array.from({ length: 30 }, (_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const isSelected = formatDate(date) === formatDate(customDate);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.dateOption, isSelected && styles.dateOptionSelected]}
                    onPress={() => handleDateSelect(date)}
                  >
                    <Text style={[styles.dateOptionText, isSelected && styles.dateOptionTextSelected]}>
                      {formatDate(date)} ({date.toLocaleDateString(locale, { weekday: 'short' })})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* 7-Day Route Selector */}
      {selectedRange === '7d' && (
        <>
          {isLoading7Days ? (
            <View style={styles.dailyRouteLoading}>
              <LoadingSpinner size={32} />
              <Text style={styles.dailyRouteLoadingText}>{t('common.loading')}...</Text>
            </View>
          ) : is7DaysDataReady && dailyRoutes.length > 0 ? (
            <View style={styles.dailyRouteContainer}>
              <Text style={styles.dailyRouteTitle}>{t('vehicles.dailyRoute')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {dailyRoutes.map((route, index) => (
                  <Pressable
                    key={route.date}
                    style={[styles.dailyRouteItem, selectedDayIndex === index && styles.dailyRouteItemActive]}
                    onPress={() => handleDaySelect(index)}
                  >
                    <Text style={[styles.dailyRouteDate, selectedDayIndex === index && styles.dailyRouteDateActive]}>
                      {route.date.slice(5)}
                    </Text>
                    <Text style={[styles.dailyRouteDistance, selectedDayIndex === index && styles.dailyRouteDistanceActive]}>
                      {route.distance > 0 ? `${route.distance.toFixed(1)}km` : ''}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </>
      )}

      {/* Stats Row */}
      {trackPoints.length > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Navigation size={14} color={colors.primary} />
            <Text style={styles.statValue}>{totalDistance.toFixed(1)} km</Text>
            <Text style={styles.statLabel}>{t('vehicles.distance')}</Text>
          </View>
          <View style={styles.statItem}>
            <Clock size={14} color={colors.primary} />
            <Text style={styles.statValue}>{totalDuration}</Text>
            <Text style={styles.statLabel}>{t('vehicles.duration')}</Text>
          </View>
          <View style={styles.statItem}>
            <MapPin size={14} color={colors.primary} />
            <Text style={styles.statValue}>{trackPoints.length}</Text>
            <Text style={styles.statLabel}>{t('vehicles.trackPoints')}</Text>
          </View>
        </View>
      )}

      {/* Loading State */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <LoadingSpinner size={24} />
          <Text style={styles.loadingText}>{t('vehicles.loadingTrackHistory')}</Text>
        </View>
      )}

      {/* Error State */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Empty State */}
      {!isLoading && !error && trackPoints.length === 0 && (
        <View style={styles.emptyContainer}>
          <MapPin size={32} color={colors.textTertiary} />
          <Text style={styles.emptyText}>{t('vehicles.noTrackData')}</Text>
          <Text style={styles.emptySubtext}>{t('vehicles.tryDifferentDate')}</Text>
        </View>
      )}

      {/* Track Map */}
      {!isLoading && trackPoints.length > 0 && (
        <View style={styles.mapWrapper}>
          <View style={styles.mapContainer}>
            {IS_WEB ? (
              <iframe
                srcDoc={mapHtml}
                style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
                title="Track History Map"
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
                startInLoadingState
                renderLoading={() => (
                  <View style={styles.mapLoading}>
                    <LoadingSpinner size={24} />
                    <Text style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>{t('vehicles.loadingMap')}</Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      )}

      {/* Start and End Location Display - Full Day Device On/Off Times (always show when available) */}
      {(dayStartPoint || dayEndPoint) && (
        <View style={styles.locationSummaryContainer}>
          <View style={styles.locationItem}>
            <View style={[styles.locationIcon, styles.locationIconStart]}>
              <Text style={styles.locationIconText}>S</Text>
            </View>
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>{t('vehicles.deviceOnTime')}</Text>
              <Text style={styles.locationTime}>
                {dayStartPoint
                  ? new Date(dayStartPoint.gpsTime).toLocaleString(locale, { month: 'short', day: 'numeric', hour12: false, hour: '2-digit', minute: '2-digit' })
                  : '-'}
              </Text>
            </View>
          </View>
          <View style={styles.locationDivider} />
          <View style={styles.locationItem}>
            <View style={[styles.locationIcon, styles.locationIconEnd]}>
              <Text style={styles.locationIconText}>E</Text>
            </View>
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>{t('vehicles.deviceOffTime')}</Text>
              <Text style={styles.locationTime}>
                {dayEndPoint
                  ? new Date(dayEndPoint.gpsTime).toLocaleString(locale, { month: 'short', day: 'numeric', hour12: false, hour: '2-digit', minute: '2-digit' })
                  : '-'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Inline Time Range Filter - Shows below On/Off section */}
      {(showTimeRangePicker && (selectedRange === 'custom' || selectedRange === '7d')) && (
        <View style={styles.timeRangePickerInline}>
          <View style={styles.timeRangePickerHeader}>
            <Text style={styles.timeRangePickerTitle}>
              {selectedRange === '7d' 
                ? `${dailyRoutes[selectedDayIndex]?.date || ''} - ${t('vehicles.selectTime')}`
                : t('vehicles.selectTime')}
            </Text>
            <View style={styles.timeModeToggle}>
              <Pressable
                style={[styles.timeModeBtn, useTimeSlider && styles.timeModeBtnActive]}
                onPress={() => setUseTimeSlider(true)}
              >
                <Text style={[styles.timeModeBtnText, useTimeSlider && styles.timeModeBtnTextActive]}>時段</Text>
              </Pressable>
              <Pressable
                style={[styles.timeModeBtn, !useTimeSlider && styles.timeModeBtnActive]}
                onPress={() => setUseTimeSlider(false)}
              >
                <Text style={[styles.timeModeBtnText, !useTimeSlider && styles.timeModeBtnTextActive]}>時間</Text>
              </Pressable>
            </View>
          </View>
          
          {useTimeSlider ? (
          /* Simple Range Bar - 24 hour slider with drag */
          <View style={styles.rangeBarContainer}>
            <View style={styles.rangeBarLabels}>
              <Text style={styles.rangeBarTime}>
                {String(selectedRange === '7d' ? selectedDayTimeRange.start : startHour).padStart(2, '0')}:00
              </Text>
              <Text style={styles.rangeBarTime}>
                {String(selectedRange === '7d' ? selectedDayTimeRange.end : endHour).padStart(2, '0')}:59
              </Text>
            </View>
            <View style={styles.rangeBarTrack}>
              <View 
                style={[
                  styles.rangeBarSelected,
                  {
                    left: `${((selectedRange === '7d' ? selectedDayTimeRange.start : startHour) / 24) * 100}%`,
                    width: `${((selectedRange === '7d' ? selectedDayTimeRange.end : endHour) - (selectedRange === '7d' ? selectedDayTimeRange.start : startHour) + 1) / 24 * 100}%`,
                  }
                ]}
              />
              <GestureDetector gesture={Gesture.Pan().onUpdate((e) => {
                const newHour = Math.round(Math.max(0, Math.min(23, (e.absoluteX - 40) / 280 * 24)));
                if (selectedRange === '7d') {
                  if (Math.abs(newHour - selectedDayTimeRange.start) < Math.abs(newHour - selectedDayTimeRange.end)) {
                    setSelectedDayTimeRange(prev => ({ ...prev, start: newHour }));
                  }
                } else {
                  if (Math.abs(newHour - startHour) < Math.abs(newHour - endHour)) {
                    setStartHour(newHour);
                  }
                }
              }).onEnd(() => {
                if (selectedRange === '7d') {
                  handle7DayTimeRangeApply(false);
                } else {
                  handleTimeRangeApply();
                }
              })}>
                <View 
                  style={[
                    styles.rangeBarThumb,
                    { left: `${((selectedRange === '7d' ? selectedDayTimeRange.start : startHour) / 24) * 100}%` }
                  ]}
                />
              </GestureDetector>
              <GestureDetector gesture={Gesture.Pan().onUpdate((e) => {
                const newHour = Math.round(Math.max(0, Math.min(23, (e.absoluteX - 40) / 280 * 24)));
                if (selectedRange === '7d') {
                  if (Math.abs(newHour - selectedDayTimeRange.end) <= Math.abs(newHour - selectedDayTimeRange.start)) {
                    setSelectedDayTimeRange(prev => ({ ...prev, end: newHour }));
                  }
                } else {
                  if (Math.abs(newHour - endHour) >= Math.abs(newHour - startHour)) {
                    setEndHour(newHour);
                  }
                }
              }).onEnd(() => {
                if (selectedRange === '7d') {
                  handle7DayTimeRangeApply(false);
                } else {
                  handleTimeRangeApply();
                }
              })}>
                <View 
                  style={[
                    styles.rangeBarThumb,
                    { left: `${((selectedRange === '7d' ? selectedDayTimeRange.end : endHour) / 24) * 100}%` }
                  ]}
                />
              </GestureDetector>
            </View>
            <View style={styles.rangeBarTicks}>
              {[0, 6, 12, 18, 24].map(hour => (
                <Text key={hour} style={styles.rangeBarTick}>
                  {String(hour).padStart(2, '0')}
                </Text>
              ))}
            </View>
          </View>
          ) : (
          /* Direct Time Input Mode */
          <View style={styles.timeInputContainer}>
            <View style={styles.timeInputRow}>
              <Text style={styles.timeInputLabel}>開始時間</Text>
              <TextInput
                style={styles.timeInputField}
                value={String(selectedRange === '7d' ? selectedDayTimeRange.start : startHour).padStart(2, '0')}
                onChangeText={(text) => {
                  const hour = parseInt(text, 10);
                  if (!isNaN(hour) && hour >= 0 && hour <= 23) {
                    if (selectedRange === '7d') {
                      setSelectedDayTimeRange(prev => ({ ...prev, start: hour }));
                    } else {
                      setStartHour(hour);
                    }
                  }
                }}
                keyboardType="numeric"
                maxLength={2}
                selectTextOnFocus
              />
              <Text style={styles.timeInputColon}>:</Text>
              <TextInput
                style={styles.timeInputField}
                value={String(selectedRange === '7d' ? 0 : startMinute).padStart(2, '0')}
                onChangeText={(text) => {
                  const minute = parseInt(text, 10);
                  if (!isNaN(minute) && minute >= 0 && minute <= 59) {
                    setStartMinute(minute);
                  }
                }}
                keyboardType="numeric"
                maxLength={2}
                selectTextOnFocus
              />
            </View>
            <View style={styles.timeInputRow}>
              <Text style={styles.timeInputLabel}>結束時間</Text>
              <TextInput
                style={styles.timeInputField}
                value={String(selectedRange === '7d' ? selectedDayTimeRange.end : endHour).padStart(2, '0')}
                onChangeText={(text) => {
                  const hour = parseInt(text, 10);
                  if (!isNaN(hour) && hour >= 0 && hour <= 23) {
                    if (selectedRange === '7d') {
                      setSelectedDayTimeRange(prev => ({ ...prev, end: hour }));
                    } else {
                      setEndHour(hour);
                    }
                  }
                }}
                keyboardType="numeric"
                maxLength={2}
                selectTextOnFocus
              />
              <Text style={styles.timeInputColon}>:</Text>
              <TextInput
                style={styles.timeInputField}
                value={String(selectedRange === '7d' ? 59 : endMinute).padStart(2, '0')}
                onChangeText={(text) => {
                  const minute = parseInt(text, 10);
                  if (!isNaN(minute) && minute >= 0 && minute <= 59) {
                    setEndMinute(minute);
                  }
                }}
                keyboardType="numeric"
                maxLength={2}
                selectTextOnFocus
              />
            </View>
            <Pressable 
              style={styles.timeInputApplyBtn}
              onPress={() => {
                if (selectedRange === '7d') {
                  handle7DayTimeRangeApply(false);
                } else {
                  handleTimeRangeApply();
                }
              }}
            >
              <Text style={styles.timeInputApplyText}>套用</Text>
            </Pressable>
          </View>
          )}
        </View>
      )}

      {/* Parked Locations List - Shows locations from selected time range */}
      {trackPoints.length > 0 && (
        <View style={styles.recentPointsContainer}>
          <Text style={styles.recentPointsTitle}>{t('vehicles.parkedLocations')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {/* Start of range */}
            {filteredStartPoint && (
              <View style={styles.recentPointItem}>
                <View style={[styles.recentPointBadge, styles.recentPointBadgeStart]}>
                  <Text style={styles.recentPointBadgeText}>S</Text>
                </View>
                <Text style={styles.recentPointSpeed}>
                  {new Date(filteredStartPoint.gpsTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            )}
            {/* Parked/stopped points (every ~30min, expandable) */}
            {(() => {
              const parkPoints = trackPoints.slice(1, -1).filter((point, i, arr) => {
                const prevPoint = arr[i - 1];
                if (prevPoint) {
                  const timeDiff = point.gpsTime - prevPoint.gpsTime;
                  return timeDiff >= 30 * 60 * 1000; // 30 minutes
                }
                return false;
              });
              return parkPoints.map((point, index) => {
                const isExpanded = expandedParkIndex === index;
                return (
                  <Pressable 
                    key={`park-${index}`} 
                    style={styles.recentPointItem}
                    onPress={() => setExpandedParkIndex(isExpanded ? null : index)}
                  >
                    <View style={styles.recentPointHeader}>
                      <View style={[styles.recentPointBadge, styles.recentPointBadgePark]}>
                        <Text style={styles.recentPointBadgeText}>P</Text>
                      </View>
                      {isExpanded ? (
                        <ChevronDown size={14} color={colors.textSecondary} />
                      ) : (
                        <ChevronRight size={14} color={colors.textSecondary} />
                      )}
                    </View>
                    <Text style={styles.recentPointSpeed}>
                      {new Date(point.gpsTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {point.parkTime ? ` (${Math.round(point.parkTime / 60)}min)` : ''}
                    </Text>
                    {isExpanded && (
                      <View style={styles.recentPointExpanded}>
                        <Text style={styles.recentPointExpandedText}>
                          速度: {point.speed.toFixed(1)} km/h
                        </Text>
                        <Text style={styles.recentPointExpandedText}>
                          方向: {point.direction.toFixed(0)}°
                        </Text>
                        <Text style={styles.recentPointExpandedText}>
                          時間: {new Date(point.gpsTime).toLocaleString()}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              });
            })()}
            {/* End of range */}
            {filteredEndPoint && filteredEndPoint !== filteredStartPoint && (
              <View style={styles.recentPointItem}>
                <View style={[styles.recentPointBadge, styles.recentPointBadgeEnd]}>
                  <Text style={styles.recentPointBadgeText}>E</Text>
                </View>
                <Text style={styles.recentPointSpeed}>
                  {new Date(filteredEndPoint.gpsTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}

    </>
  );

  if (bare) return <View>{mainBody}</View>;
  return <Card style={{ padding: spacing.lg }}>{mainBody}</Card>;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  refreshBtn: {
    padding: spacing.xs,
  },
  quickRangeContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  quickRangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickRangeBtnActive: {
    backgroundColor: `${colors.primary}15`,
    borderColor: colors.primary,
  },
  quickRangeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  quickRangeTextActive: {
    color: colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    width: '80%',
    maxHeight: '60%',
    overflow: 'hidden',
  },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  datePickerTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  datePickerScroll: {
    maxHeight: 300,
  },
  dateOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateOptionSelected: {
    backgroundColor: `${colors.primary}15`,
  },
  dateOptionText: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
  },
  dateOptionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statItem: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  loadingText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  errorContainer: {
    padding: spacing.md,
    backgroundColor: `${colors.danger}15`,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.danger,
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptySubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  mapWrapper: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  mapContainer: {
    height: 300,
    backgroundColor: '#E5E7EB',
  },
  mapLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
  },
  recentPointsContainer: {
    marginBottom: spacing.md,
  },
  recentPointsTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  recentPointItem: {
    width: 120,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
  },
  recentPointTime: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 2,
  },
  recentPointAddress: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 14,
    marginBottom: 2,
  },
  recentPointSpeed: {
    fontSize: 10,
    color: colors.textTertiary,
  },
  recentPointBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  recentPointBadgeStart: {
    backgroundColor: '#22C55E',
  },
  recentPointBadgeEnd: {
    backgroundColor: '#EF4444',
  },
  recentPointBadgePark: {
    backgroundColor: '#F59E0B',
  },
  recentPointBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  recentPointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentPointExpanded: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  recentPointExpandedText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  viewOnMapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  viewOnMapsText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  unavailableText: {
    fontSize: typography.fontSize.sm,
    color: colors.textTertiary,
    lineHeight: 20,
  },
  // Inline time range picker styles (replaces modal)
  timeRangePickerInline: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeRangePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  timeRangePickerTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  timeModeToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  timeModeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeModeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timeModeBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  timeModeBtnTextActive: {
    color: '#fff',
  },
  timeInputContainer: {
    marginVertical: spacing.sm,
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: spacing.sm,
  },
  timeInputLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  timeInputField: {
    width: 40,
    height: 36,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  timeInputColon: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginHorizontal: spacing.xs,
  },
  timeInputApplyBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  timeInputApplyText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: '#fff',
  },
  rangeBarContainer: {
    marginVertical: spacing.sm,
  },
  rangeBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  rangeBarTime: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  rangeBarTrack: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    position: 'relative',
    marginVertical: spacing.sm,
  },
  rangeBarSelected: {
    position: 'absolute',
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  rangeBarThumb: {
    position: 'absolute',
    top: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    marginLeft: -10,
    borderWidth: 2,
    borderColor: '#fff',
  },
  rangeBarTicks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  rangeBarTick: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
  timeRangeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  timeCancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  timeCancelText: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  // Time range picker styles
  timeRangeContainer: {
    padding: spacing.md,
  },
  timeRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  timeRangeLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timePickerGroup: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.xs,
  },
  timeAdjustBtn: {
    padding: spacing.xs,
    width: 36,
    alignItems: 'center',
  },
  timeAdjustText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  timeValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: spacing.xs,
    minWidth: 36,
    textAlign: 'center',
  },
  timeSeparator: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  timeApplyBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeApplyText: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: '#fff',
  },
  // 7-day route selector styles
  dailyRouteLoading: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dailyRouteLoadingText: {
    marginTop: spacing.sm,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  dailyRouteContainer: {
    marginBottom: spacing.md,
  },
  dailyRouteTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  dailyRouteItem: {
    width: 80,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dailyRouteItemActive: {
    backgroundColor: `${colors.primary}15`,
    borderColor: colors.primary,
  },
  dailyRouteDate: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dailyRouteDateActive: {
    color: colors.primary,
  },
  dailyRoutePoints: {
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 2,
  },
  dailyRoutePointsActive: {
    color: colors.primary,
  },
  dailyRouteDistance: {
    fontSize: 10,
    color: colors.textTertiary,
  },
  dailyRouteDistanceActive: {
    color: colors.primary,
  },
  // Start/End location styles
  locationSummaryContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  locationItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  locationIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationIconStart: {
    backgroundColor: '#22C55E',
  },
  locationIconEnd: {
    backgroundColor: '#EF4444',
  },
  locationIconText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  locationAddress: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 2,
  },
  locationTime: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 2,
  },
  locationDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
});
