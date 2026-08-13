import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { MapPin, Maximize2 } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { GpsLiveTracker } from './GpsLiveTracker';
import { GpsTrackHistory } from './GpsTrackHistory';
import { FullScreenMonitor } from './FullScreenMonitor';
import { VideoRecordingCard } from './VideoRecordingCard';
import type { CameraFeedItem } from './CameraFeed';
import { colors, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';

// 808GPS 設備的默認 4 通道配置（根據截圖：DSM, ADAS, 前鏡, 後鏡）
const DEFAULT_CAMERA_LABELS = ['DSM 司機', 'ADAS 輔助', '前鏡頭', '後鏡頭'];

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
  const [activeTab, setActiveTab] = useState<TabType>('live');
  const [showFullScreen, setShowFullScreen] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const previousTabRef = useRef<TabType>('live');

  // 根據設備 ID 自動生成 4 通道的攝影機配置
  const defaultCameraFeeds: CameraFeedItem[] = DEFAULT_CAMERA_LABELS.map((label, index) => ({
    id: `${devIdno}-ch${index}`,
    devIdno,
    channel: index,
    plateNumber: plateNumber || devIdno,
    vehicleName: label,
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
            <GpsLiveTracker
              devIdno={devIdno}
              plateNumber={plateNumber}
              onStatusUpdate={onStatusUpdate}
              bare
            />
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
