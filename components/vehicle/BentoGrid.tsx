import { View, Text, StyleSheet } from 'react-native';
import { Shield, FileText, Wrench, MapPin, Fuel, Settings2, Gauge } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Vehicle } from '@/types';
import { useThemeStore } from '@/store/themeStore';
import { defaultColors } from '@/store/themeStore';
import { borderRadius, spacing, typography, statusColors } from '@/constants/theme';
import { statusLabels, fuelTypeLabels, transmissionLabels } from '@/constants/mockData';

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

export function BentoGrid({ vehicle }: BentoGridProps) {
  const { colors } = useThemeStore();
  const statusColor = statusColors[vehicle.status];
  const insuranceInfo = daysUntil(vehicle.insuranceExpiry);
  const regInfo = daysUntil(vehicle.registrationExpiry);

  return (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Card style={{ flex: 1, padding: spacing.lg, minHeight: 160 }}>
          <View style={{ marginBottom: spacing.md }}>
            <Gauge size={20} color={defaultColors.primary} />
          </View>
          <Text style={{ fontSize: typography.fontSize['4xl'], fontWeight: '700', color: colors.textPrimary, lineHeight: 44 }}>{vehicle.mileage.toLocaleString()}</Text>
          <Text style={{ fontSize: typography.fontSize.sm, color: colors.textTertiary, fontWeight: '500', marginTop: -spacing.xs, marginBottom: spacing.sm }}>miles</Text>
          <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mileage</Text>
        </Card>
        <View style={{ flex: 1, gap: spacing.md }}>
          <Card style={{ flex: 1, padding: spacing.md }}>
            <View style={{ marginBottom: spacing.md }}>
              <Fuel size={18} color={defaultColors.secondary} />
            </View>
            <Text style={{ fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary }}>{fuelTypeLabels[vehicle.fuelType]}</Text>
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Fuel</Text>
          </Card>
          <Card style={{ flex: 1, padding: spacing.md }}>
            <View style={{ marginBottom: spacing.md }}>
              <Settings2 size={18} color={defaultColors.secondary} />
            </View>
            <Text style={{ fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary }}>{transmissionLabels[vehicle.transmission]}</Text>
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Transmission</Text>
          </Card>
        </View>
      </View>

      <Card style={{ padding: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Current Status</Text>
            <Badge label={statusLabels[vehicle.status]} variant={vehicle.status} size="md" dot style={{ marginTop: spacing.sm }} />
          </View>
          <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: statusColor.bg }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: statusColor.dot }} />
          </View>
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Card style={{ flex: 1, padding: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
            <Shield size={16} color={insuranceInfo.urgent || insuranceInfo.expired ? defaultColors.danger : defaultColors.success} />
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: spacing.xs }}>Insurance</Text>
          </View>
          <Text style={{ fontSize: typography.fontSize.xl, fontWeight: '700', color: insuranceInfo.urgent || insuranceInfo.expired ? defaultColors.danger : colors.textPrimary }}>{insuranceInfo.text}</Text>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textTertiary, marginTop: spacing.xs }}>{vehicle.insuranceExpiry || 'N/A'}</Text>
        </Card>
        <Card style={{ flex: 1, padding: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
            <FileText size={16} color={regInfo.urgent || regInfo.expired ? defaultColors.danger : defaultColors.secondary} />
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: spacing.xs }}>Registration</Text>
          </View>
          <Text style={{ fontSize: typography.fontSize.xl, fontWeight: '700', color: regInfo.urgent || regInfo.expired ? defaultColors.danger : colors.textPrimary }}>{regInfo.text}</Text>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textTertiary, marginTop: spacing.xs }}>{vehicle.registrationExpiry || 'N/A'}</Text>
        </Card>
      </View>

      <Card style={{ padding: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
          <Wrench size={16} color={defaultColors.accentSecondary} />
          <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: spacing.xs }}>Maintenance</Text>
          <View style={{ marginLeft: 'auto', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.sm, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textTertiary }}>Coming Soon</Text>
          </View>
        </View>
        <Text style={{ fontSize: typography.fontSize.xs, color: colors.textTertiary, lineHeight: 16 }}>Maintenance records and scheduling</Text>
      </Card>

      <Card style={{ padding: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
          <MapPin size={16} color={defaultColors.secondary} />
          <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: spacing.xs }}>Live Tracking</Text>
          <View style={{ marginLeft: 'auto', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.sm, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textTertiary }}>Coming Soon</Text>
          </View>
        </View>
        <Text style={{ fontSize: typography.fontSize.xs, color: colors.textTertiary, lineHeight: 16 }}>GPS tracking and route history</Text>
      </Card>

      {vehicle.notes && (
        <Card style={{ padding: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
            <FileText size={16} color={colors.textSecondary} />
            <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: spacing.xs }}>Notes</Text>
          </View>
          <Text style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 22 }}>{vehicle.notes}</Text>
        </Card>
      )}

      <Card style={{ padding: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
          <Gauge size={16} color={colors.textTertiary} />
          <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: spacing.xs }}>Purchase Date</Text>
        </View>
        <Text style={{ fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary }}>{vehicle.purchaseDate || 'N/A'}</Text>
        <Text style={{ fontSize: typography.fontSize.xs, color: colors.textTertiary, marginTop: spacing.xs }}>
          {vehicle.purchaseDate ? `${Math.floor((Date.now() - new Date(vehicle.purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 365))} years owned` : ''}
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({});
