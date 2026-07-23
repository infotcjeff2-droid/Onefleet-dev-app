import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { MapPin, Maximize2 } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { GpsLiveTracker } from './GpsLiveTracker';
import { GpsTrackHistory } from './GpsTrackHistory';
import { FullScreenMonitor } from './FullScreenMonitor';
import type { CameraFeedItem } from './CameraFeed';
import { colors, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { useVehicleStore } from '@/store/vehicleStore';

type TrackingTab = 'live' | 'history';

interface VehicleTrackingSectionProps {
  devIdno: string;
  plateNumber?: string;
  onStatusUpdate?: (status: { isOnline: boolean; hasGps: boolean; speed: number; address?: string }) => void;
  /** 車輛 ID，用於查詢車隊其他車輛的影像串流 */
  vehicleId?: string;
  /** 影像串流列表（最多4台車）；若未提供則從同公司車隊自動帶入 */
  cameraFeeds?: CameraFeedItem[];
}

export function VehicleTrackingSection({
  devIdno,
  plateNumber,
  onStatusUpdate,
  vehicleId,
  cameraFeeds: propCameraFeeds,
}: VehicleTrackingSectionProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TrackingTab>('live');
  const [showFullScreen, setShowFullScreen] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const previousTabRef = useRef<TrackingTab>('live');
  const { vehicles } = useVehicleStore();

  // 相機饋送：優先使用 props，否則自動組成「當前車輛的多通道影像」列表
  // 規則：顯示當前車輛的 6 個 channel（仿官網「實時錄像」六格版：AV 01 / AV 04 / ADAS前視 / ADAS駕駛 / 前視圖 / 後視圖）
  const cameraFeeds: CameraFeedItem[] = propCameraFeeds ?? (() => {
    if (!vehicleId) return [];
    const currentVehicle = vehicles.find(v => v.id === vehicleId);
    if (!currentVehicle) return [];

    const plate = currentVehicle.plateNumber || currentVehicle.id;
    const channels: Array<{ channel: number; label: string }> = [
      { channel: 0, label: 'AV 01' },
      { channel: 3, label: 'AV 04' },
      { channel: 2, label: 'ADAS前視' },
      { channel: 1, label: 'ADAS駕駛' },
      { channel: 5, label: '前視圖' },
      { channel: 4, label: '後視圖' },
    ];

    return channels.map((c, i) => ({
      id: `${currentVehicle.id}-ch${c.channel}`,
      devIdno: currentVehicle.devIdno,
      plateNumber: `${plate}_${c.label}`,
      vehicleName: c.label,
      channel: c.channel,
      isOnline: !!currentVehicle.devIdno,
      order: i,
    }));
  })();

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

  const renderTabButton = (tab: TrackingTab, label: string) => {
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
          <View style={styles.tabBarUnderline} />
        </View>

        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          {activeTab === 'live' ? (
            <GpsLiveTracker
              devIdno={devIdno}
              plateNumber={plateNumber}
              onStatusUpdate={onStatusUpdate}
              bare
            />
          ) : (
            <GpsTrackHistory
              devIdno={devIdno}
              plateNumber={plateNumber}
              bare
            />
          )}
        </Animated.View>
      </Card>

      <FullScreenMonitor
        visible={showFullScreen}
        onClose={() => setShowFullScreen(false)}
        currentDevIdno={devIdno}
        currentPlateNumber={plateNumber}
        cameraFeeds={cameraFeeds}
      />
    </>
  );
}

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
});
