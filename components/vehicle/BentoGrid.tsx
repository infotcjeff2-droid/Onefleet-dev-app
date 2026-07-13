import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { useState } from 'react';
import { Shield, FileText, Wrench, MapPin, Fuel, Settings2, Gauge, User, Wifi, WifiOff, Navigation, Activity } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Vehicle } from '@/types';
import { VehicleTrackingSection } from './VehicleTrackingSection';
import { useThemeStore } from '@/store/themeStore';
import { useDriverStore } from '@/store/driverStore';
import { useGps808Store } from '@/store/gps808Store';
import { defaultColors } from '@/store/themeStore';
import { borderRadius, spacing, typography, statusColors, fuelTypeLabels, transmissionLabels } from '@/constants/theme';
import { useTranslation } from '@/i18n';

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
  };
  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.split(entity).join(char);
  }
  // Strip HTML tags
  decoded = decoded.replace(/<[^>]*>/g, '');
  // Normalize whitespace
  decoded = decoded.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return decoded;
}

interface BentoGridProps {
  vehicle: Vehicle;
}

function daysUntil(dateStr: string): { text: string; urgent: boolean; expired: boolean } {
  if (!dateStr) return { text: 'N/A', urgent: false, expired: false };
  const target = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { text: 'Expired', urgent: true, expired: true };
  if (diff <= 30) return { text: `${diff}d left`, urgent: true, expired: false };
  return { text: `${diff}d`, urgent: false, expired: false };
}

function daysUntilLocalized(dateStr: string, t: (key: string) => string): { text: string; urgent: boolean; expired: boolean } {
  if (!dateStr) return { text: t('vehicles.notAvailable'), urgent: false, expired: false };
  const target = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { text: t('vehicles.expired'), urgent: true, expired: true };
  if (diff <= 30) return { text: `${diff}${t('vehicles.daysLeft')}`, urgent: true, expired: false };
  return { text: `${diff}${t('vehicles.daysLeft')}`, urgent: false, expired: false };
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

interface GpsStatusState {
  isOnline: boolean;
  hasGps: boolean;
  speed: number;
  address?: string;
}

export function BentoGrid({ vehicle }: BentoGridProps) {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const { getDriverById } = useDriverStore();
  const { isConnected } = useGps808Store();
  const [gpsStatus, setGpsStatus] = useState<GpsStatusState>({
    isOnline: false,
    hasGps: false,
    speed: 0,
    address: undefined,
  });
  const [activeInfoTab, setActiveInfoTab] = useState<'basic' | 'compliance'>('basic');
  const statusColor = statusColors[vehicle.status];
  const insuranceInfo = daysUntilLocalized(vehicle.insuranceExpiry, t);
  const regInfo = daysUntilLocalized(vehicle.registrationExpiry, t);
  const assignedDriver = vehicle.assignedDriverId ? getDriverById(vehicle.assignedDriverId) : undefined;

  const getGpsStatusLabel = () => {
    if (!isConnected) return t('vehicles.gpsNotConnected');
    if (!gpsStatus.hasGps) return t('vehicles.noSignal');
    if (gpsStatus.speed > 5) return t('vehicles.moving');
    return t('vehicles.parked');
  };

  const getGpsStatusVariant = (): 'active' | 'warning' | 'danger' | 'inactive' => {
    if (!isConnected) return 'danger';
    if (!gpsStatus.hasGps) return 'warning';
    if (gpsStatus.speed > 5) return 'active';
    return 'inactive';
  };

  const getGpsStatusColor = () => {
    if (!isConnected) return { dot: '#EF4444', bg: 'rgba(239, 68, 68, 0.1)' };
    if (!gpsStatus.hasGps) return { dot: '#F59E0B', bg: 'rgba(245, 158, 11, 0.1)' };
    if (gpsStatus.speed > 5) return { dot: '#22C55E', bg: 'rgba(34, 197, 94, 0.1)' };
    return { dot: '#3B82F6', bg: 'rgba(59, 130, 246, 0.1)' };
  };

  const gpsStatusColors = getGpsStatusColor();

  const handleGpsStatusUpdate = (status: GpsStatusState) => {
    setGpsStatus(status);
  };

  return (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      {/* Dynamic Status Card based on GPS */}
      <Card style={{ padding: spacing.lg }}>
        <View style={styles.sectionTitle}>
          <Activity size={22} color={defaultColors.primary} />
          <Text style={styles.sectionTitleText}>{t('vehicles.currentStatus')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Badge
              label={getGpsStatusLabel()}
              variant={getGpsStatusVariant()}
              size="md"
              dot
            />
            {gpsStatus.hasGps && (
              <View style={{ marginTop: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <Gauge size={14} color={colors.primary} />
                    <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                      {Math.round(gpsStatus.speed)} km/h
                    </Text>
                  </View>
                  {gpsStatus.speed > 5 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <Navigation size={14} color={colors.primary} style={{ transform: [{ rotate: '45deg' }] }} />
                      <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                        {t('vehicles.inMotion')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
          <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: gpsStatusColors.bg }}>
            {isConnected && gpsStatus.hasGps ? (
              gpsStatus.speed > 5 ? (
                <Navigation size={24} color={gpsStatusColors.dot} />
              ) : (
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: gpsStatusColors.dot }} />
              )
            ) : (
              isConnected ? (
                <WifiOff size={24} color={gpsStatusColors.dot} />
              ) : (
                <Wifi size={24} color={gpsStatusColors.dot} />
              )
            )}
          </View>
        </View>

        {/* Driver Section */}
        {assignedDriver && (
          <View style={[styles.driverSection, { marginTop: spacing.lg }]}>
            <Text style={styles.driverLabel}>{t('vehicles.driver')}</Text>
            <View style={styles.driverInfo}>
              <View style={[styles.driverAvatar, { backgroundColor: defaultColors.primary, zIndex: 0 }]}>
                {assignedDriver.avatar ? (
                  <Image source={{ uri: assignedDriver.avatar }} style={{ width: '100%', height: '100%', borderRadius: 30, zIndex: 0 }} />
                ) : (
                  <Text style={styles.driverAvatarText}>{assignedDriver.name.charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{assignedDriver.name}</Text>
                <Text style={styles.driverPhone}>{assignedDriver.phone}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Notes - at the bottom of Current Status card */}
        {vehicle.notes && (
          <View style={[styles.notesSection, { marginTop: spacing.lg }]}>
            <Text style={styles.notesLabel}>{t('vehicles.notes')}</Text>
            <Text style={styles.notesContent}>{decodeHtmlEntities(vehicle.notes)}</Text>
          </View>
        )}
      </Card>

      {/* Real-time Tracking Section with tabs (Live / History) */}
      <VehicleTrackingSection
        devIdno={vehicle.devIdno ?? ''}
        plateNumber={vehicle.plateNumber}
        onStatusUpdate={handleGpsStatusUpdate}
      />

      {/* Unified Vehicle Info Section */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <View style={styles.infoSectionHeader}>
          <View style={styles.infoSectionHeaderLeft}>
            <Gauge size={22} color={defaultColors.primary} />
            <Text style={styles.infoSectionTitle}>{t('vehicles.vehicleInfo')}</Text>
          </View>
        </View>

        {/* Tab Bar */}
        <View style={styles.infoTabBar}>
          <Pressable
            style={[styles.infoTab, activeInfoTab === 'basic' && styles.infoTabActive]}
            onPress={() => setActiveInfoTab('basic')}
          >
            <Text style={[styles.infoTabText, activeInfoTab === 'basic' && styles.infoTabTextActive]}>
              {t('vehicles.basicInfo')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.infoTab, activeInfoTab === 'compliance' && styles.infoTabActive]}
            onPress={() => setActiveInfoTab('compliance')}
          >
            <Text style={[styles.infoTabText, activeInfoTab === 'compliance' && styles.infoTabTextActive]}>
              {t('vehicles.compliance')}
            </Text>
          </Pressable>
          <View style={styles.infoTabBarUnderline} />
        </View>

        {/* Tab Content */}
        <View style={styles.infoTabContent}>
          {activeInfoTab === 'basic' ? (
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.infoItemLabel}>{t('vehicles.mileage')}</Text>
                <Text style={styles.infoItemValue}>{vehicle.mileage.toLocaleString()} {t('vehicles.miles')}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoItemLabel}>{t('vehicles.fuel')}</Text>
                <Text style={styles.infoItemValue}>{fuelTypeLabels[vehicle.fuelType]}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoItemLabel}>{t('vehicles.transmission')}</Text>
                <Text style={styles.infoItemValue}>{transmissionLabels[vehicle.transmission]}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoItemLabel}>{t('vehicles.maintenance')}</Text>
                <View style={styles.infoItemBadge}>
                  <Text style={styles.infoItemBadgeText}>{t('vehicles.comingSoon')}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.infoItemLabel}>{t('vehicles.insurance')}</Text>
                <Text style={[styles.infoItemValue, insuranceInfo.urgent || insuranceInfo.expired ? { color: defaultColors.danger } : {}]}>
                  {insuranceInfo.text}
                </Text>
                <Text style={styles.infoItemSub}>{vehicle.insuranceExpiry || t('vehicles.notAvailable')}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoItemLabel}>{t('vehicles.registration')}</Text>
                <Text style={[styles.infoItemValue, regInfo.urgent || regInfo.expired ? { color: defaultColors.danger } : {}]}>
                  {regInfo.text}
                </Text>
                <Text style={styles.infoItemSub}>{vehicle.registrationExpiry || t('vehicles.notAvailable')}</Text>
              </View>
            </View>
          )}
        </View>
      </Card>

    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitleText: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: defaultColors.textPrimary,
    letterSpacing: 0.3,
  },
  sectionValue: {
    fontSize: 12,
    color: defaultColors.textTertiary,
    marginTop: spacing.xs,
  },
  driverSection: {
    borderTopWidth: 1,
    borderTopColor: defaultColors.border,
    paddingTop: spacing.md,
  },
  driverLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: defaultColors.textTertiary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  driverAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  driverName: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: defaultColors.textPrimary,
    marginBottom: 2,
  },
  driverPhone: {
    fontSize: typography.fontSize.xs,
    color: defaultColors.textTertiary,
  },
  notesSection: {
    borderTopWidth: 1,
    borderTopColor: defaultColors.border,
    paddingTop: spacing.md,
  },
  notesLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: defaultColors.textTertiary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesContent: {
    fontSize: typography.fontSize.sm,
    color: defaultColors.textSecondary,
    lineHeight: 20,
    backgroundColor: defaultColors.surface,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  infoSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  infoSectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  infoSectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: defaultColors.textPrimary,
    letterSpacing: 0.3,
  },
  infoTabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: defaultColors.border,
    position: 'relative',
  },
  infoTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  infoTabActive: {
    borderBottomColor: defaultColors.primary,
  },
  infoTabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: defaultColors.textTertiary,
  },
  infoTabTextActive: {
    color: defaultColors.primary,
    fontWeight: '700',
  },
  infoTabBarUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: defaultColors.border,
  },
  infoTabContent: {
    padding: spacing.lg,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoItem: {
    width: '50%',
    marginBottom: spacing.lg,
  },
  infoItemLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: defaultColors.textPrimary,
    marginBottom: spacing.xs,
    letterSpacing: 0,
  },
  infoItemValue: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: defaultColors.textTertiary,
  },
  infoItemSub: {
    fontSize: 11,
    color: defaultColors.textTertiary,
    marginTop: 4,
    opacity: 0.75,
  },
  infoItemBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: defaultColors.surface,
  },
  infoItemBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: defaultColors.textTertiary,
  },
});
