import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Modal, TouchableOpacity, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { MapPin, Maximize2, ChevronDown, Gauge, Navigation, Clock } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { GpsLiveTracker, buildMapHtml } from './GpsLiveTracker';
import { GpsTrackHistory } from './GpsTrackHistory';
import { FullScreenMonitor } from './FullScreenMonitor';
import { VideoRecordingCard } from './VideoRecordingCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { CameraFeedItem } from './CameraFeed';
import { colors, spacing, typography } from '@/constants/theme';
import { defaultColors } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { useGps808Store } from '@/store/gps808Store';
import { gps808Api } from '@/utils/gps808Api';

const IS_WEB = Platform.OS === 'web';

// 808GPS 設備的默認 4 通道配置（根據截圖：DSM, ADAS, 前鏡, 後鏡）
const DEFAULT_CAMERA_LABELS = ['DSM鏡頭', 'ADAS鏡頭', '前鏡頭', '後鏡頭'];

function getCameraLabel(devIdno: string, label: string): string {
  return `${devIdno} ${label}`;
}

interface VehicleTrackingSectionProps {
  devIdno: string;
  plateNumber?: string;
  onStatusUpdate?: (status: { isOnline: boolean; hasGps: boolean; isRealTime: boolean; speed: number; address?: string }) => void;
  /** 自定義攝影機配置，若不提供則使用默認的 4 通道 */
  cameraFeeds?: CameraFeedItem[];
}

type TabType = 'live' | 'history' | 'recording';

export function VehicleTrackingSection({
  devIdno,
  plateNumber,
  onStatusUpdate,
  cameraFeeds: propCameraFeeds,
}: VehicleTrackingSectionProps) {
  const { t } = useTranslation();
  const { isConnected } = useGps808Store();
  const [activeTab, setActiveTab] = useState<TabType>('live');
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [showFullscreenMap, setShowFullscreenMap] = useState(false);
  const [gpsData, setGpsData] = useState<{
    lat: number;
    lng: number;
    speed: number;
    direction: number;
    gpsTime: number;
    address?: string;
    isRealTime: boolean;
  } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const previousTabRef = useRef<TabType>('live');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 根據設備 ID 自動生成 4 通道的攝影機配置
  const defaultCameraFeeds: CameraFeedItem[] = DEFAULT_CAMERA_LABELS.map((label, index) => ({
    id: `${devIdno}-ch${index}`,
    devIdno,
    channel: index,
    plateNumber: plateNumber || devIdno,
    vehicleName: getCameraLabel(devIdno, label),
  }));

  // 使用傳入的自定義配置，否則使用默認配置
  const cameraFeeds = propCameraFeeds && propCameraFeeds.length > 0 ? propCameraFeeds : defaultCameraFeeds;

  useEffect(() => {
    if (previousTabRef.current === activeTab) return;
    previousTabRef.current = activeTab;

    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [activeTab, fadeAnim]);

  // Fetch GPS data for fullscreen map
  useEffect(() => {
    if (!devIdno || !isConnected) return;

    const fetchGps = async () => {
      try {
        const res = await gps808Api.getDeviceStatus(devIdno);
        if (res.result === 0 && res.status) {
          const s = res.status as unknown as Record<string, unknown>;

          const parseCoord = (val: unknown): number => {
            if (val === null || val === undefined) return 0;
            if (typeof val === 'number') return val;
            if (typeof val === 'string') {
              const trimmed = val.trim();
              if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return 0;
              const num = Number(trimmed);
              return isNaN(num) ? 0 : num;
            }
            return 0;
          };

          let lat = 0;
          let lng = 0;
          let lastKnownLat = 0;
          let lastKnownLng = 0;
          let hasRealTimeFix = false;

          let rawLat = parseCoord(s.lat);
          let rawLng = parseCoord(s.lng);
          if (rawLat !== 0 && rawLng !== 0) {
            lat = Math.abs(rawLat) > 180 ? rawLat / 1_000_000 : rawLat;
            lng = Math.abs(rawLng) > 180 ? rawLng / 1_000_000 : rawLng;
            hasRealTimeFix = true;
          }

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

          if (!hasRealTimeFix && (lastKnownLat !== 0 || lastKnownLng !== 0)) {
            lat = lastKnownLat;
            lng = lastKnownLng;
          }

          const speed = parseCoord(s.sp) / 10;
          const direction = parseCoord(s.hx);
          const gpsTime = typeof s.gt === 'number' ? s.gt : Date.now();
          const address = (s.ps as string | undefined)?.trim();

          setGpsData({
            lat,
            lng,
            speed,
            direction,
            gpsTime,
            address,
            isRealTime: hasRealTimeFix,
          });
          setLastRefresh(new Date());
        }
      } catch (err) {
        console.log('[VehicleTrackingSection] GPS fetch error:', err);
      }
    };

    fetchGps();
    intervalRef.current = setInterval(fetchGps, 10_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [devIdno, isConnected]);

  const renderTabButton = (tab: TabType, label: string) => {
    const isActive = activeTab === tab;
    return (
      <Pressable
        key={tab}
        onPress={() => setActiveTab(tab)}
        style={[styles.tab, isActive && styles.tabActive]}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
      >
        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MapPin size={22} color={colors.primary} />
            <Text style={styles.title}>{t('vehicles.trackingSectionTitle')}</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              onPress={() => setShowFullScreen(true)}
              style={styles.fullscreenBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('vehicles.openFullScreenMonitor')}
            >
              <Maximize2 size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.tabBar}>
          {renderTabButton('live', t('vehicles.liveTab'))}
          {renderTabButton('history', t('vehicles.historyTab'))}
          {renderTabButton('recording', t('vehicles.recordingTab'))}
          <View style={styles.tabBarUnderline} />
        </View>

        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          {activeTab === 'live' ? (
            <View style={styles.liveTabContainer}>
              <GpsLiveTracker
                devIdno={devIdno}
                plateNumber={plateNumber}
                onStatusUpdate={onStatusUpdate}
                onFullscreenMapPress={() => setShowFullscreenMap(true)}
                bare
              />
            </View>
          ) : activeTab === 'history' ? (
            <GpsTrackHistory
              devIdno={devIdno}
              plateNumber={plateNumber}
              bare
            />
          ) : (
            <VideoRecordingCard
              devIdno={devIdno}
              plateNumber={plateNumber}
              height={280}
            />
          )}
        </Animated.View>
      </Card>

      {/* Full Screen Monitor (map + 4 camera channels) */}
      <FullScreenMonitor
        visible={showFullScreen}
        onClose={() => setShowFullScreen(false)}
        currentDevIdno={devIdno}
        currentPlateNumber={plateNumber}
        cameraFeeds={cameraFeeds}
      />

      {/* Fullscreen Map Modal */}
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
                {plateNumber || devIdno}
              </Text>
              <View style={fullscreenMapStyles.statusBadge}>
                <View style={[fullscreenMapStyles.statusDot, {
                  backgroundColor: gpsData?.isRealTime ? '#22C55E' : (gpsData ? '#F59E0B' : '#EF4444')
                }]} />
                <Text style={fullscreenMapStyles.statusText}>
                  {gpsData?.isRealTime ? '即時' : (gpsData ? '最後位置' : '無GPS')}
                </Text>
              </View>
            </View>
            <View style={{ width: 80 }} />
          </View>

          {/* GPS Stats Row */}
          {gpsData && (
            <View style={fullscreenMapStyles.statsRow}>
              <View style={fullscreenMapStyles.statItem}>
                <Gauge size={14} color="#FFFFFF" />
                <Text style={fullscreenMapStyles.statValue}>{Math.round(gpsData.speed)} km/h</Text>
              </View>
              <View style={fullscreenMapStyles.statItem}>
                <Navigation
                  size={14}
                  color="#FFFFFF"
                  style={{ transform: [{ rotate: `${gpsData.direction}deg` }] }}
                />
                <Text style={fullscreenMapStyles.statValue}>{gpsData.direction}°</Text>
              </View>
              <View style={fullscreenMapStyles.statItem}>
                <Clock size={14} color="#FFFFFF" />
                <Text style={fullscreenMapStyles.statValue}>
                  {gpsData.gpsTime ? new Date(gpsData.gpsTime).toLocaleTimeString() : '--'}
                </Text>
              </View>
              <View style={fullscreenMapStyles.statItem}>
                <MapPin size={14} color="#FFFFFF" />
                <Text style={fullscreenMapStyles.statValue}>{gpsData.lat.toFixed(6)}, {gpsData.lng.toFixed(6)}</Text>
              </View>
            </View>
          )}

          {/* Address Row */}
          {gpsData && gpsData.address && (
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
                srcDoc={buildMapHtml({
                  lat: gpsData?.lat ?? 22.3193,
                  lng: gpsData?.lng ?? 114.1694,
                  label: plateNumber || devIdno,
                  zoom: gpsData ? 18 : 12,
                  showMarker: true,
                  noSignal: !gpsData?.isRealTime,
                  noGpsSignalText: gpsData ? '最後已知位置' : '無GPS訊號',
                  address: gpsData?.address,
                  currentLang: 'zh-TW',
                })}
                style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
                title="Live GPS Map Fullscreen"
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <WebView
                source={{
                  html: buildMapHtml({
                    lat: gpsData?.lat ?? 22.3193,
                    lng: gpsData?.lng ?? 114.1694,
                    label: plateNumber || devIdno,
                    zoom: gpsData ? 18 : 12,
                    showMarker: true,
                    noSignal: !gpsData?.isRealTime,
                    noGpsSignalText: gpsData ? '最後已知位置' : '無GPS訊號',
                    address: gpsData?.address,
                    currentLang: 'zh-TW',
                  }),
                  baseUrl: 'https://localhost',
                }}
                style={{ flex: 1, backgroundColor: '#E5E7EB' }}
                javaScriptEnabled
                domStorageEnabled
                originWhitelist={['*']}
                mixedContentMode="always"
                allowsFullscreenVideo
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
    </>
  );
}

// Fullscreen Map Modal Styles (must be before component render)
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

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  fullscreenBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    position: 'relative',
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  tabBarUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.border,
  },
  content: {
    padding: spacing.lg,
  },
  liveTabContainer: {
    marginHorizontal: -spacing.lg,
  },
});
