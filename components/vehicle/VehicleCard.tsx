import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { ChevronRight, Gauge, Fuel, Truck, Building2 } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Vehicle } from '@/types';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { useDriverStore } from '@/store/driverStore';
import { useUserManagementStore } from '@/store/userManagementStore';

interface VehicleCardProps {
  vehicle: Vehicle;
  onPress: () => void;
  index?: number;
}

function formatMileage(miles: number, t: (key: string) => string): string {
  if (miles >= 1000) {
    return `${(miles / 1000).toFixed(1)}k ${t('vehicles.mileageUnit')}`;
  }
  return `${miles} ${t('vehicles.mileageUnit')}`;
}

function getFuelTypeTranslation(fuelType: string, t: (key: string) => string): string {
  const fuelKey = `vehicles.fuel${fuelType.charAt(0).toUpperCase() + fuelType.slice(1)}`;
  return t(fuelKey);
}

export function VehicleCard({ vehicle, onPress, index = 0 }: VehicleCardProps) {
  const { t } = useTranslation();
  const hasImage = vehicle.imageUrl && vehicle.imageUrl.trim() !== '';
  const { getDriverById } = useDriverStore();
  const { getCompanyById } = useUserManagementStore();

  // Get driver and company info
  const driver = vehicle.assignedDriverId ? getDriverById(vehicle.assignedDriverId) : null;
  const company = driver?.companyId ? getCompanyById(driver.companyId) : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.cardWrapper,
        { transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.imageContainer}>
          {hasImage ? (
            <Image
              source={{ uri: vehicle.imageUrl }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholderImage}>
              <Truck size={48} color={colors.textTertiary} />
            </View>
          )}
          <View style={styles.imageOverlay} />
          <View style={styles.statusBadge}>
            <Badge
              label={t('vehicles.' + vehicle.status)}
              variant={vehicle.status}
              dot
              solid
              delay={index * 50}
            />
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.titleGroup}>
              <Text style={styles.make}>{vehicle.make}</Text>
              <Text style={styles.model}>{vehicle.model}</Text>
            </View>
            <ChevronRight size={20} color={colors.textTertiary} />
          </View>

          <Text style={styles.plate}>{vehicle.plateNumber}</Text>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Gauge size={14} color={colors.textSecondary} />
              <Text style={styles.statText}>{formatMileage(vehicle.mileage, t)}</Text>
            </View>
            <View style={styles.statDot} />
            <View style={styles.stat}>
              <Fuel size={14} color={colors.textSecondary} />
              <Text style={styles.statText}>
                {getFuelTypeTranslation(vehicle.fuelType, t)}
              </Text>
            </View>
            <View style={styles.statDot} />
            <Text style={styles.yearText}>{vehicle.year}</Text>
          </View>

          {company && (
            <View style={[styles.companyInfo, { borderTopColor: colors.border }]}>
              <View style={styles.companyInfoIcon}>
                <Building2 size={14} color={colors.secondary} />
              </View>
              <View style={styles.companyInfoContent}>
                <Text style={styles.companyInfoLabel}>{t('vehicles.companyInfo')}</Text>
                <Text style={styles.companyNameZh}>{company.nameZh || company.name}</Text>
                {company.nameEn && (
                  <Text style={styles.companyNameEn}>{company.nameEn}</Text>
                )}
              </View>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  imageContainer: {
    height: 160,
    position: 'relative',
    backgroundColor: colors.surface,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: 'transparent',
  },
  statusBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
  content: {
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    flex: 1,
    gap: spacing.sm,
  },
  make: {
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  model: {
    fontSize: typography.fontSize.xl,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  plate: {
    fontFamily: 'JetBrains Mono',
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  fuelText: {
    textTransform: 'capitalize',
  },
  statDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textTertiary,
    marginHorizontal: spacing.sm,
  },
  yearText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  companyInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  companyInfoIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.secondaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyInfoContent: {
    flex: 1,
  },
  companyInfoLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  companyNameZh: {
    fontSize: typography.fontSize.sm,
    color: colors.secondary,
    fontWeight: '600',
  },
  companyNameEn: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
