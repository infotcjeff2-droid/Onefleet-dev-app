import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Platform, ScrollView, Modal, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { Calendar, Clock, MapPin, Navigation, X, RotateCcw } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { useGps808Store } from '@/store/gps808Store';
import { gps808Api, type Gps808TrackPoint } from '@/utils/gps808Api';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';

type QuickRange = '24h' | '7d' | 'custom';

const IS_WEB = Platform.OS === 'web';

interface GpsTrackHistoryProps {
  devIdno: string;
  plateNumber?: string;
}

interface TrackPoint {
  lat: number;
  lng: number;
  speed: number;
  direction: number;
  gpsTime: number;
  address?: string;
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
    gpsTime = gt > 1e12 ? gt : gt * 1000;
  } else if (typeof gt === 'string') {
    gpsTime = new Date(gt).getTime();
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

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
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

function getQuickRangeDates(range: QuickRange, customDate?: Date): { begintime: string; endtime: string } {
  const now = new Date();
  const end = new Date(now);
  end.setSeconds(59, 999);

  let start = new Date(now);

  if (range === '24h') {
    start.setHours(start.getHours() - 24);
  } else if (range === '7d') {
    start.setDate(start.getDate() - 7);
  } else if (range === 'custom' && customDate) {
    start = new Date(customDate);
    start.setHours(0, 0, 0, 0);
    const endCustom = new Date(customDate);
    endCustom.setHours(23, 59, 59, 999);
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
  currentLabel: string;
}): string {
  const { points, label, locale: currentLang, startLabel, endLabel, currentLabel } = opts;

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

  const carIcon = `
    L.divIcon({
      html: '<div class="car-icon"><div class="car-icon-inner"></div></div>',
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
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
  const safeCurrentLabel = currentLabel.replace(/'/g, "\\'");
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
      position: absolute; top: 8px; left: 8px; z-index: 1000;
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
  <div class="info-badge">${safeLabel} - ${points.length} points</div>
  <div class="legend">
    <div class="legend-item"><div class="legend-dot" style="background:#22C55E"></div> ${safeStartLabel}</div>
    <div class="legend-item"><div class="legend-dot" style="background:#3B82F6"></div> ${safeCurrentLabel}</div>
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

    const carMarker = L.marker([${endPoint.lat}, ${endPoint.lng}], { icon: ${carIcon}, title: '${safeLabel}' }).addTo(map);
    carMarker.bindPopup('<b>${safeCurrentLabel} - ${safeLabel}</b><br/><span style="word-break:break-all;font-size:12px">${safeEndAddr}</span>').openPopup();

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
  if (!chineseChunks || chineseChunks.length === 0) return '';
  const meaningful = chineseChunks.filter((chunk) => chunk.length >= 2);
  if (meaningful.length === 0) return chineseChunks.join(' ');
  return meaningful.join('、');
}

function formatSpeed(speed: number): string {
  return `${Math.round(speed)} km/h`;
}

export function GpsTrackHistory({ devIdno, plateNumber }: GpsTrackHistoryProps) {
  const { t, locale } = useTranslation();
  const { isConnected } = useGps808Store();
  const [selectedRange, setSelectedRange] = useState<QuickRange>('24h');
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalDistance, setTotalDistance] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<string>('');
  const webViewRef = useRef<WebView>(null);

  const fetchTrackHistory = useCallback(async () => {
    if (!devIdno) return;
    if (!isConnected) return;

    setIsLoading(true);
    setError(null);

    try {
      const { begintime, endtime } = getQuickRangeDates(selectedRange, customDate);

      const response = await gps808Api.getTrackHistory(devIdno, begintime, endtime, {
        distance: 0,
        parkTime: 0,
        currentPage: 1,
        pageRecords: 500,
        toMap: 1,
      });

      if (response.result === 0 && response.tracks) {
        const parsedPoints: TrackPoint[] = [];
        for (const raw of response.tracks) {
          const point = parseTrackPoint(raw);
          if (point) {
            point.address = raw.address;
            parsedPoints.push(point);
          }
        }

        setTrackPoints(parsedPoints);

        if (response.distance) {
          setTotalDistance(parseFloat(String(response.distance)));
        }

        if (parsedPoints.length >= 2) {
          const first = parsedPoints[0].gpsTime;
          const last = parsedPoints[parsedPoints.length - 1].gpsTime;
          const durationMs = last - first;
          const hours = Math.floor(durationMs / (1000 * 60 * 60));
          const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
          setTotalDuration(`${hours}h ${minutes}m`);
        }
      } else {
        setTrackPoints([]);
        setError(response.error || t('vehicles.noTrackData'));
      }
    } catch (err) {
      setError(String(err));
      setTrackPoints([]);
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
    currentLabel: t('vehicles.currentPosition'),
  });

  const handleQuickRange = (range: QuickRange) => {
    setSelectedRange(range);
    if (range !== 'custom') {
      setShowDatePicker(false);
    }
  };

  const handleDateSelect = (date: Date) => {
    setCustomDate(date);
    setSelectedRange('custom');
    setShowDatePicker(false);
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
    return (
      <Card style={{ padding: spacing.lg }}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MapPin size={16} color={colors.textSecondary} />
            <Text style={styles.label}>{t('vehicles.trackHistory')}</Text>
          </View>
        </View>
        <Text style={styles.unavailableText}>
          {t('vehicles.connectToEnableTracking')}
        </Text>
      </Card>
    );
  }

  if (!devIdno) {
    return (
      <Card style={{ padding: spacing.lg }}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MapPin size={16} color={colors.textSecondary} />
            <Text style={styles.label}>{t('vehicles.trackHistory')}</Text>
          </View>
        </View>
        <Text style={styles.unavailableText}>
          {t('vehicles.noGpsDeviceConfigured')}
        </Text>
      </Card>
    );
  }

  return (
    <Card style={{ padding: spacing.lg }}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MapPin size={16} color={colors.textSecondary} />
          <Text style={styles.label}>{t('vehicles.trackHistory')}</Text>
        </View>
        <Pressable onPress={fetchTrackHistory} style={styles.refreshBtn} disabled={isLoading}>
          <RotateCcw size={14} color={isLoading ? colors.textTertiary : colors.primary} />
        </Pressable>
      </View>

      {/* Quick Range Selector */}
      <View style={styles.quickRangeContainer}>
        <Pressable
          style={[styles.quickRangeBtn, selectedRange === '24h' && styles.quickRangeBtnActive]}
          onPress={() => handleQuickRange('24h')}
        >
          <Text style={[styles.quickRangeText, selectedRange === '24h' && styles.quickRangeTextActive]}>
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
          <ActivityIndicator size="small" color={colors.primary} />
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
                    <ActivityIndicator size="small" color="#3B82F6" />
                    <Text style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>{t('vehicles.loadingMap')}</Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      )}

      {/* Recent Points List */}
      {!isLoading && trackPoints.length > 0 && (
        <View style={styles.recentPointsContainer}>
          <Text style={styles.recentPointsTitle}>{t('vehicles.recentLocations')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {trackPoints.slice(-10).reverse().map((point, index) => (
              <View key={index} style={styles.recentPointItem}>
                <Text style={styles.recentPointTime}>
                  {new Date(point.gpsTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={styles.recentPointAddress} numberOfLines={2}>
                  {extractChineseAddress(point.address || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`)}
                </Text>
                <Text style={styles.recentPointSpeed}>{formatSpeed(point.speed)}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* View on Maps Button */}
      {trackPoints.length > 0 && (
        <Pressable style={styles.viewOnMapsBtn} onPress={handleViewInMaps}>
          <MapPin size={14} color={colors.primary} />
          <Text style={styles.viewOnMapsText}>{t('vehicles.viewOnGoogleMaps')}</Text>
        </Pressable>
      )}
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
});
