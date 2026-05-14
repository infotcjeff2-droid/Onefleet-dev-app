import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Car, Activity, Wrench, AlertTriangle, TrendingUp, Clock } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { useVehicleStore } from '@/store/vehicleStore';
import { colors, spacing, typography } from '@/constants/theme';
import { Header } from '@/components/ui/Header';

function StatCard({ icon, label, value, sub, color, delay = 0 }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
  delay?: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()} style={styles.statCardWrap}>
      <Card style={styles.statCard}>
        <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
          {icon}
        </View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
        {sub && <Text style={styles.statSub}>{sub}</Text>}
      </Card>
    </Animated.View>
  );
}

function FleetOverview() {
  const { vehicles } = useVehicleStore();

  const active = vehicles.filter((v) => v.status === 'active').length;
  const maintenance = vehicles.filter((v) => v.status === 'maintenance').length;
  const inactive = vehicles.filter((v) => v.status === 'inactive').length;
  const totalMileage = vehicles.reduce((sum, v) => sum + v.mileage, 0);
  const avgMileage = vehicles.length > 0 ? Math.round(totalMileage / vehicles.length) : 0;

  const fuelCounts = {
    gasoline: vehicles.filter((v) => v.fuelType === 'gasoline').length,
    diesel: vehicles.filter((v) => v.fuelType === 'diesel').length,
    electric: vehicles.filter((v) => v.fuelType === 'electric').length,
    hybrid: vehicles.filter((v) => v.fuelType === 'hybrid').length,
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Fleet Overview</Text>
      <View style={styles.fleetGrid}>
        <View style={styles.fleetTopRow}>
          <StatCard
            icon={<Car size={24} color={colors.primary} />}
            label="Total Vehicles"
            value={vehicles.length.toString()}
            color={colors.primary}
            delay={0}
          />
        </View>
        <View style={styles.fleetBottomRow}>
          <StatCard
            icon={<Activity size={18} color={colors.success} />}
            label="Active"
            value={active.toString()}
            color={colors.success}
            delay={80}
          />
          <StatCard
            icon={<Wrench size={18} color={colors.warning} />}
            label="Maintenance"
            value={maintenance.toString()}
            color={colors.warning}
            delay={160}
          />
          <StatCard
            icon={<AlertTriangle size={18} color={colors.danger} />}
            label="Inactive"
            value={inactive.toString()}
            color={colors.danger}
            delay={240}
          />
        </View>
      </View>
    </View>
  );
}

function MileageStats() {
  const { vehicles } = useVehicleStore();
  const totalMileage = vehicles.reduce((sum, v) => sum + v.mileage, 0);
  const avgMileage = vehicles.length > 0 ? Math.round(totalMileage / vehicles.length) : 0;
  const maxMileage = vehicles.length > 0 ? Math.max(...vehicles.map((v) => v.mileage)) : 0;
  const minMileage = vehicles.length > 0 ? Math.min(...vehicles.map((v) => v.mileage)) : 0;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Mileage Statistics</Text>
      <Card style={styles.mileageCard}>
        <View style={styles.mileageRow}>
          <View style={styles.mileageStat}>
            <Text style={styles.mileageValue}>{avgMileage.toLocaleString()}</Text>
            <Text style={styles.mileageLabel}>Avg Miles</Text>
          </View>
          <View style={styles.mileageDivider} />
          <View style={styles.mileageStat}>
            <Text style={styles.mileageValue}>{totalMileage.toLocaleString()}</Text>
            <Text style={styles.mileageLabel}>Total Miles</Text>
          </View>
          <View style={styles.mileageDivider} />
          <View style={styles.mileageStat}>
            <Text style={styles.mileageValue}>{maxMileage.toLocaleString()}</Text>
            <Text style={styles.mileageLabel}>Max Miles</Text>
          </View>
        </View>
      </Card>
    </View>
  );
}

function FuelBreakdown() {
  const { vehicles } = useVehicleStore();
  const fuelCounts = {
    gasoline: vehicles.filter((v) => v.fuelType === 'gasoline').length,
    diesel: vehicles.filter((v) => v.fuelType === 'diesel').length,
    electric: vehicles.filter((v) => v.fuelType === 'electric').length,
    hybrid: vehicles.filter((v) => v.fuelType === 'hybrid').length,
  };

  const fuelInfo: { key: string; label: string; count: number; color: string }[] = [
    { key: 'gasoline', label: 'Gasoline', count: fuelCounts.gasoline, color: colors.accent },
    { key: 'diesel', label: 'Diesel', count: fuelCounts.diesel, color: '#7A6040' },
    { key: 'electric', label: 'Electric', count: fuelCounts.electric, color: colors.secondary },
    { key: 'hybrid', label: 'Hybrid', count: fuelCounts.hybrid, color: colors.success },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Fuel Type Breakdown</Text>
      <Card style={styles.fuelCard}>
        {fuelInfo.map((f, i) => (
          <View key={f.key} style={styles.fuelRow}>
            <View style={[styles.fuelDot, { backgroundColor: f.color }]} />
            <Text style={styles.fuelLabel}>{f.label}</Text>
            <Text style={styles.fuelCount}>{f.count}</Text>
            <View style={styles.fuelBar}>
              <View
                style={[
                  styles.fuelBarFill,
                  {
                    width: `${vehicles.length > 0 ? (f.count / vehicles.length) * 100 : 0}%`,
                    backgroundColor: f.color,
                  },
                ]}
              />
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

export default function DashboardScreen() {
  const { vehicles } = useVehicleStore();

  return (
    <View style={styles.container}>
      <Header title="Dashboard" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <FleetOverview />
        <MileageStats />
        <FuelBreakdown />

        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>Quick Stats</Text>
          <View style={styles.quickRow}>
            <Card style={styles.quickCard}>
              <TrendingUp size={20} color={colors.primary} />
              <Text style={styles.quickLabel}>Top Performer</Text>
              <Text style={styles.quickValue}>Camry</Text>
            </Card>
            <Card style={styles.quickCard}>
              <Clock size={20} color={colors.warning} />
              <Text style={styles.quickLabel}>Expiring Soon</Text>
              <Text style={styles.quickValue}>2 Docs</Text>
            </Card>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  fleetGrid: {
    gap: spacing.md,
  },
  fleetTopRow: {
    flex: 1,
  },
  fleetBottomRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    padding: spacing.lg,
    alignItems: 'center',
  },
  statCardWrap: {
    flex: 1,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  statValue: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 36,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  statSub: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  mileageCard: {
    padding: spacing.lg,
  },
  mileageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mileageStat: {
    flex: 1,
    alignItems: 'center',
  },
  mileageValue: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
  },
  mileageLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mileageDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  fuelCard: {
    padding: spacing.lg,
  },
  fuelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  fuelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  fuelLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    width: 80,
  },
  fuelCount: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    width: 24,
  },
  fuelBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fuelBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  quickActions: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickCard: {
    flex: 1,
    padding: spacing.lg,
    alignItems: 'center',
  },
  quickLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
});
