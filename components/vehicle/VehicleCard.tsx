import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { ChevronRight, Gauge, Fuel } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Vehicle } from '@/types';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';

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
          <Image
            source={{ uri: vehicle.imageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
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
  },
  image: {
    width: '100%',
    height: '100%',
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
});
