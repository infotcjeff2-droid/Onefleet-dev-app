import { View, Text, StyleSheet } from 'react-native';
import { useState } from 'react';
import { Shield, FileText, Wrench, MapPin, Fuel, Settings2, Gauge, User, Wifi, WifiOff, Navigation } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Vehicle } from '@/types';
import { GpsLiveTracker } from './GpsLiveTracker';
import { GpsTrackHistory } from './GpsTrackHistory';
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
      {/* Real-time Tracking Section - Moved to top */}
      <GpsLiveTracker
        devIdno={vehicle.devIdno}
        plateNumber={vehicle.plateNumber}
        onStatusUpdate={handleGpsStatusUpdate}
      />

      {/* Track History */}
      <GpsTrackHistory devIdno={vehicle.devIdno} plateNumber={vehicle.plateNumber} />

      {/* Dynamic Status Card based on GPS */}
      <Card style={{ padding: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('vehicles.currentStatus')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm }}>
              <Badge
                label={getGpsStatusLabel()}
                variant={getGpsStatusVariant()}
                size="md"
                dot
              />
              {gpsStatus.address && (
                <View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: 180 }}>
                  <MapPin size={10} color={colors.textTertiary} />
                  <Text style={{ fontSize: 10, color: colors.textTertiary, marginLeft: 2 }} numberOfLines={1}>
                    {extractChineseAddress(gpsStatus.address)}
                  </Text>
                </View>
              )}
            </View>
            {assignedDriver && (
              <View style={{ marginTop: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.sm, alignSelf: 'flex-start' }}>
                  <User size={14} color={defaultColors.primary} />
                  <Text style={{ fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary, marginLeft: spacing.xs }}>{t('vehicles.driver')}: {assignedDriver.name}</Text>
                </View>
              </View>
            )}
            {gpsStatus.hasGps && (
              <View style={{ marginTop: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <Gauge size={12} color={colors.primary} />
                    <Text style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary }}>
                      {Math.round(gpsStatus.speed)} km/h
                    </Text>
                  </View>
                  {gpsStatus.speed > 5 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <Navigation size={12} color={colors.primary} style={{ transform: [{ rotate: '45deg' }] }} />
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
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Card style={{ flex: 1, padding: spacing.lg, minHeight: 160 }}>
          <View style={{ marginBottom: spacing.md }}>
            <Gauge size={20} color={defaultColors.primary} />
          </View>
          <Text style={{ fontSize: typography.fontSize['4xl'], fontWeight: '700', color: colors.textPrimary, lineHeight: 44 }}>{vehicle.mileage.toLocaleString()}</Text>
          <Text style={{ fontSize: typography.fontSize.sm, color: colors.textTertiary, fontWeight: '500', marginTop: -spacing.xs, marginBottom: spacing.sm }}>{t('vehicles.miles')}</Text>
          <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('vehicles.mileage')}</Text>
        </Card>
        <View style={{ flex: 1, gap: spacing.md }}>
          <Card style={{ flex: 1, padding: spacing.md }}>
            <View style={{ marginBottom: spacing.md }}>
              <Fuel size={18} color={defaultColors.secondary} />
            </View>
            <Text style={{ fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary }}>{fuelTypeLabels[vehicle.fuelType]}</Text>
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('vehicles.fuel')}</Text>
          </Card>
          <Card style={{ flex: 1, padding: spacing.md }}>
            <View style={{ marginBottom: spacing.md }}>
              <Settings2 size={18} color={defaultColors.secondary} />
            </View>
            <Text style={{ fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary }}>{transmissionLabels[vehicle.transmission]}</Text>
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('vehicles.transmission')}</Text>
          </Card>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Card style={{ flex: 1, padding: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
            <Shield size={16} color={insuranceInfo.urgent || insuranceInfo.expired ? defaultColors.danger : defaultColors.success} />
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: spacing.xs }}>{t('vehicles.insurance')}</Text>
          </View>
          <Text style={{ fontSize: typography.fontSize.xl, fontWeight: '700', color: insuranceInfo.urgent || insuranceInfo.expired ? defaultColors.danger : colors.textPrimary }}>{insuranceInfo.text}</Text>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textTertiary, marginTop: spacing.xs }}>{vehicle.insuranceExpiry || t('vehicles.notAvailable')}</Text>
        </Card>
        <Card style={{ flex: 1, padding: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
            <FileText size={16} color={regInfo.urgent || regInfo.expired ? defaultColors.danger : defaultColors.secondary} />
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: spacing.xs }}>{t('vehicles.registration')}</Text>
          </View>
          <Text style={{ fontSize: typography.fontSize.xl, fontWeight: '700', color: regInfo.urgent || regInfo.expired ? defaultColors.danger : colors.textPrimary }}>{regInfo.text}</Text>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textTertiary, marginTop: spacing.xs }}>{vehicle.registrationExpiry || t('vehicles.notAvailable')}</Text>
        </Card>
      </View>

      <Card style={{ padding: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
          <Wrench size={16} color={defaultColors.accentSecondary} />
          <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: spacing.xs }}>{t('vehicles.maintenance')}</Text>
          <View style={{ marginLeft: 'auto', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.sm, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textTertiary }}>{t('vehicles.comingSoon')}</Text>
          </View>
        </View>
        <Text style={{ fontSize: typography.fontSize.xs, color: colors.textTertiary, lineHeight: 16 }}>{t('vehicles.maintenanceRecords')}</Text>
      </Card>

      {vehicle.notes && (
        <Card style={{ padding: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
            <FileText size={16} color={colors.textSecondary} />
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: spacing.xs }}>{t('vehicles.notes')}</Text>
          </View>
          <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 22 }}>{decodeHtmlEntities(vehicle.notes)}</Text>
        </Card>
      )}

      <Card style={{ padding: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
          <Gauge size={16} color={colors.textTertiary} />
          <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: spacing.xs }}>{t('vehicles.purchaseDate')}</Text>
        </View>
        <Text style={{ fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary }}>{vehicle.purchaseDate || t('vehicles.notAvailable')}</Text>
        <Text style={{ fontSize: typography.fontSize.xs, color: colors.textTertiary, marginTop: spacing.xs }}>
          {vehicle.purchaseDate ? `${Math.floor((Date.now() - new Date(vehicle.purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 365))} ${t('vehicles.yearsOwned')}` : ''}
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({});
