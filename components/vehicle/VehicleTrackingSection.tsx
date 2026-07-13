import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { GpsLiveTracker } from './GpsLiveTracker';
import { GpsTrackHistory } from './GpsTrackHistory';
import { colors, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';

type TrackingTab = 'live' | 'history';

interface VehicleTrackingSectionProps {
  devIdno: string;
  plateNumber?: string;
  onStatusUpdate?: (status: { isOnline: boolean; hasGps: boolean; speed: number; address?: string }) => void;
}

export function VehicleTrackingSection({ devIdno, plateNumber, onStatusUpdate }: VehicleTrackingSectionProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TrackingTab>('live');
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const previousTabRef = useRef<TrackingTab>('live');

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
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MapPin size={22} color={colors.primary} />
          <Text style={styles.title}>{t('vehicles.trackingSectionTitle')}</Text>
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
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
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
