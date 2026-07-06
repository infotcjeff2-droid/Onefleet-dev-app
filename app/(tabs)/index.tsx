import { View, Text, StyleSheet, ScrollView, Image, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import {
  Car,
  Activity,
  Wrench,
  AlertTriangle,
  Fuel,
  TrendingUp,
  Clock,
  Zap,
  Droplets,
  Leaf,
  Gauge,
  MapPin,
  Package,
  Truck,
  CircleCheckBig,
  Route,
  ChevronRight,
  Building2,
  Shield,
  ArrowUpRight,
  Users,
  FileClock,
  CalendarRange,
} from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useVehicleStore } from '@/store/vehicleStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import { useAuthStore } from '@/store/authStore';
import { colors, spacing, typography, borderRadius } from '@/constants/theme';
import { Header } from '@/components/ui/Header';
import { useTranslation } from '@/i18n';
import { UserRole, Vehicle } from '@/types';

function HeroBanner({ t, total, active, maintenance, inactive }: {
  t: (key: string) => string; total: number; active: number; maintenance: number; inactive: number;
}) {
  const pct = (n: number) => total > 0 ? n / total : 0;

  return (
    <Animated.View entering={FadeInDown.duration(500)}>
      <LinearGradient
        colors={[colors.primary, `${colors.primary}CC`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroGradient}
      >
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.heroGreeting}>{t('dashboard.heroTitle')}</Text>
            <Text style={styles.heroSubGreeting}>{t('dashboard.title')}</Text>
          </View>
          <View style={styles.heroBadge}>
            <Badge label="Live" variant="active" dot size="sm" />
          </View>
        </View>

        <View style={styles.heroStats}>
          <View style={styles.heroMainStat}>
            <Text style={styles.heroMainNumber}>{total}</Text>
            <Text style={styles.heroMainLabel}>{t('dashboard.title')}</Text>
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.heroMiniStats}>
            <View style={styles.heroMiniRow}>
              <View style={[styles.heroMiniDot, { backgroundColor: '#00A87A' }]} />
              <Text style={styles.heroMiniLabel}>{t('dashboard.active')}</Text>
              <Text style={styles.heroMiniValue}>{active}</Text>
              <View style={styles.heroMiniBarWrap}>
                <View style={[styles.heroMiniBar, { width: `${pct(active) * 100}%`, backgroundColor: '#00A87A' }]} />
              </View>
            </View>
            <View style={styles.heroMiniRow}>
              <View style={[styles.heroMiniDot, { backgroundColor: '#E69500' }]} />
              <Text style={styles.heroMiniLabel}>{t('dashboard.maintenance').substring(0, 5)}</Text>
              <Text style={styles.heroMiniValue}>{maintenance}</Text>
              <View style={styles.heroMiniBarWrap}>
                <View style={[styles.heroMiniBar, { width: `${pct(maintenance) * 100}%`, backgroundColor: '#E69500' }]} />
              </View>
            </View>
            <View style={styles.heroMiniRow}>
              <View style={[styles.heroMiniDot, { backgroundColor: '#5A6178' }]} />
              <Text style={styles.heroMiniLabel}>{t('dashboard.inactive')}</Text>
              <Text style={styles.heroMiniValue}>{inactive}</Text>
              <View style={styles.heroMiniBarWrap}>
                <View style={[styles.heroMiniBar, { width: `${pct(inactive) * 100}%`, backgroundColor: '#5A6178' }]} />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.heroOrbContainer}>
          <View style={[styles.heroOrb, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
          <View style={[styles.heroOrb2, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

type StatusItem = { key: string; label: string; icon: React.ReactNode; bg: string; color: string };

function StatusCard({ status }: { status: StatusItem }) {
  return (
    <Animated.View entering={FadeInUp.delay(100).springify()}>
      <Card style={[styles.statusCard, { borderTopColor: status.color, borderTopWidth: 3 }]}> 
        <View style={[styles.statusIconWrap, { backgroundColor: status.bg }]}>
          {status.icon}
        </View>
        <Text style={styles.statusLabel}>{status.label}</Text>
      </Card>
    </Animated.View>
  );
}

type FuelItem = { key: string; label: string; icon: React.ReactNode; bg: string; color: string };

function FuelCard({ fuel, count, total }: { fuel: FuelItem; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;

  return (
    <View style={styles.fuelRow}>
      <View style={[styles.fuelIconWrap, { backgroundColor: fuel.bg }]}> 
        {fuel.icon}
      </View>
      <View style={styles.fuelInfo}>
        <View style={styles.fuelLabelRow}>
          <Text style={styles.fuelLabel}>{fuel.label}</Text>
          <Text style={[styles.fuelPct, { color: fuel.color }]}>{count}</Text>
        </View>
        <View style={styles.fuelBarWrap}>
          <View style={[styles.fuelBarFill, { width: `${pct}%`, backgroundColor: fuel.color }]} />
        </View>
      </View>
    </View>
  );
}

function MileageCard({ t, avg, total, max }: { t: (key: string) => string; avg: number; total: number; max: number }) {
  return (
    <Animated.View entering={FadeInUp.delay(200).springify()}>
      <Card style={styles.mileageCard}>
        <View style={styles.mileageHeader}>
          <View style={[styles.mileageIconWrap, { backgroundColor: `${colors.primary}15` }]}> 
            <Gauge size={18} color={colors.primary} />
          </View>
          <Text style={styles.mileageTitle}>{t('dashboard.mileage')}</Text>
        </View>
        <View style={styles.mileageStatsRow}>
          <View style={styles.mileageStat}>
            <Text style={[styles.mileageStatValue, { color: colors.textPrimary }]}>{avg.toLocaleString()}</Text>
            <Text style={styles.mileageStatLabel}>{t('dashboard.avgMi')}</Text>
          </View>
          <View style={[styles.mileageSep, { backgroundColor: colors.border }]} />
          <View style={styles.mileageStat}>
            <Text style={[styles.mileageStatValue, { color: colors.primary }]}>{total.toLocaleString()}</Text>
            <Text style={styles.mileageStatLabel}>{t('dashboard.totalMi')}</Text>
          </View>
          <View style={[styles.mileageSep, { backgroundColor: colors.border }]} />
          <View style={styles.mileageStat}>
            <Text style={[styles.mileageStatValue, { color: colors.textPrimary }]}>{max.toLocaleString()}</Text>
            <Text style={styles.mileageStatLabel}>{t('dashboard.maxMi')}</Text>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

function DriverHero({
  t,
  name,
  activeCount,
  completedCount,
}: {
  t: (key: string) => string;
  name: string;
  activeCount: number;
  completedCount: number;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.driverHeroWrap}>
      <LinearGradient
        colors={[ '#FF9F62', '#FF7A45' ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.driverHeroGradient}
      >
        <View style={styles.driverHeroTopRow}>
          <View>
            <Text style={styles.driverHeroEyebrow}>{t('dashboard.driverHeroEyebrow')}</Text>
            <Text style={styles.driverHeroName}>{name}</Text>
            <Text style={styles.driverHeroSub}>{t('dashboard.driverHeroReady')}</Text>
          </View>
          <View style={styles.driverHeroAvatar}>
            <Truck size={20} color="#FF7A45" />
          </View>
        </View>

        <View style={styles.driverHeroStatsRow}>
          <View style={styles.driverHeroStatCard}>
            <Text style={styles.driverHeroStatValue}>{activeCount}</Text>
            <Text style={styles.driverHeroStatLabel}>{t('dashboard.driverActiveJobs')}</Text>
          </View>
          <View style={styles.driverHeroStatCard}>
            <Text style={styles.driverHeroStatValue}>{completedCount}</Text>
            <Text style={styles.driverHeroStatLabel}>{t('dashboard.driverCompleted')}</Text>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function DriverStatCard({
  icon,
  label,
  value,
  accentColor,
  accentBg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accentColor: string;
  accentBg: string;
}) {
  return (
    <Card style={styles.driverStatCard}>
      <View style={[styles.driverStatIconWrap, { backgroundColor: accentBg }]}>{icon}</View>
      <Text style={styles.driverStatValue}>{value}</Text>
      <Text style={[styles.driverStatLabel, { color: accentColor }]}>{label}</Text>
    </Card>
  );
}

function DriverDeliveryCard({
  t,
  order,
  statusLabel,
}: {
  t: (key: string) => string;
  order: DeliveryOrder;
  statusLabel: string;
}) {
  return (
    <Card style={styles.driverDeliveryCard}>
      <View style={styles.driverDeliveryHeader}>
        <View style={styles.driverDeliveryTitleWrap}>
          <Text style={styles.driverDeliveryOrderNo}>{order.orderNo}</Text>
          <Text style={styles.driverDeliveryCustomer}>{order.customerName}</Text>
        </View>
        <Badge
          label={statusLabel}
          variant={order.status === 'signed' ? 'active' : order.status === 'in_transit' ? 'warning' : 'info'}
          size="sm"
        />
      </View>

      <View style={styles.driverRouteWrap}>
        <View style={styles.driverRouteMarkerColumn}>
          <View style={[styles.driverRouteIconWrap, { backgroundColor: '#E8FFF6' }]}> 
            <MapPin size={14} color={colors.primary} />
          </View>
          <View style={styles.driverRouteLine} />
          <View style={[styles.driverRouteIconWrap, { backgroundColor: '#FFF1EA' }]}> 
            <Route size={14} color="#FF7A45" />
          </View>
        </View>
        <View style={styles.driverRouteTextColumn}>
          <View style={styles.driverRouteBlock}>
            <Text style={styles.driverRouteLabel}>{t('dashboard.driverPickup')}</Text>
            <Text style={styles.driverRouteAddress}>{order.pickupAddress}</Text>
            <Text style={styles.driverRouteMeta}>{order.pickupTime}</Text>
          </View>
          <View style={styles.driverRouteBlock}>
            <Text style={styles.driverRouteLabel}>{t('dashboard.driverDropoff')}</Text>
            <Text style={styles.driverRouteAddress}>{order.dropoffAddress}</Text>
            {order.dropoffTime ? <Text style={styles.driverRouteMeta}>{order.dropoffTime}</Text> : null}
          </View>
        </View>
      </View>

      <View style={styles.driverDeliveryFooter}>
        <View style={styles.driverDeliveryChip}>
          <Package size={14} color={colors.textSecondary} />
          <Text style={styles.driverDeliveryChipText}>{order.cargoWeight} kg</Text>
        </View>
        <View style={styles.driverDeliveryChip}>
          <Truck size={14} color={colors.textSecondary} />
          <Text style={styles.driverDeliveryChipText}>{order.cargoDescription}</Text>
        </View>
        <ChevronRight size={18} color={colors.textTertiary} />
      </View>
    </Card>
  );
}

function DriverDashboard({
  t,
  deliveries,
  userName,
}: {
  t: (key: string) => string;
  deliveries: DeliveryOrder[];
  userName: string;
}) {
  const activeDeliveries = deliveries.filter((order) => order.status === 'assigned' || order.status === 'in_transit' || order.status === 'delivered');
  const completedDeliveries = deliveries.filter((order) => order.status === 'signed');
  const nextStop = activeDeliveries[0] ?? deliveries[0] ?? null;

  const totalWeight = deliveries.reduce((sum, order) => sum + order.cargoWeight, 0);
  const statusLabelMap: Record<DeliveryOrder['status'], string> = {
    pending: t('delivery.pending'),
    assigned: t('delivery.assigned'),
    in_transit: t('delivery.inTransit'),
    delivered: t('delivery.delivered'),
    signed: t('delivery.signed'),
  };

  return (
    <View style={[styles.container, { backgroundColor: '#FFF8F3' }]}> 
      <Header
        title={t('dashboard.title')}
        leftElement={
          <Pressable onPress={() => router.push('/(tabs)')} hitSlop={8}>
            <Image
              source={require('@/assets/onefleet_2560.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </Pressable>
        }
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.driverScrollContent}
        showsVerticalScrollIndicator={false}
      >

        <DriverHero
          t={t}
          name={userName}
          activeCount={activeDeliveries.length}
          completedCount={completedDeliveries.length}
        />

        <Animated.View entering={FadeInUp.delay(120).springify()} style={styles.driverStatsGrid}>
          <DriverStatCard
            icon={<Activity size={18} color={colors.primary} />}
            label={t('dashboard.driverAssigned')}
            value={String(deliveries.filter((order) => order.status === 'assigned').length)}
            accentColor={colors.primary}
            accentBg="#E8FFF6"
          />
          <DriverStatCard
            icon={<Route size={18} color="#FF7A45" />}
            label={t('dashboard.driverInTransit')}
            value={String(deliveries.filter((order) => order.status === 'in_transit').length)}
            accentColor="#FF7A45"
            accentBg="#FFF1EA"
          />
          <DriverStatCard
            icon={<CircleCheckBig size={18} color={colors.secondary} />}
            label={t('dashboard.driverSigned')}
            value={String(completedDeliveries.length)}
            accentColor={colors.secondary}
            accentBg="#EEF5FF"
          />
          <DriverStatCard
            icon={<Package size={18} color={colors.accentSecondary} />}
            label={t('dashboard.driverCargo')}
            value={`${totalWeight} kg`}
            accentColor={colors.accentSecondary}
            accentBg="#FFF8E8"
          />
        </Animated.View>

        {nextStop ? (
          <Animated.View entering={FadeInUp.delay(180).springify()} style={styles.driverSection}>
            <View style={styles.driverSectionHeader}>
              <Text style={styles.driverSectionTitle}>{t('dashboard.driverNextStop')}</Text>
              <Text style={styles.driverSectionAction}>{t('dashboard.driverToday')}</Text>
            </View>
            <Card style={styles.driverHighlightCard}>
              <View style={styles.driverHighlightTop}>
                <View>
                  <Text style={styles.driverHighlightOrder}>{nextStop.orderNo}</Text>
                  <Text style={styles.driverHighlightCustomer}>{nextStop.customerName}</Text>
                </View>
                <View style={styles.driverHighlightBadge}>
                  <Clock size={14} color="#FF7A45" />
                  <Text style={styles.driverHighlightBadgeText}>{nextStop.pickupTime}</Text>
                </View>
              </View>
              <Text style={styles.driverHighlightAddress}>{nextStop.pickupAddress}</Text>
              <View style={styles.driverHighlightDivider} />
              <Text style={styles.driverHighlightRouteLabel}>{t('dashboard.driverDestination')}</Text>
              <Text style={styles.driverHighlightAddress}>{nextStop.dropoffAddress}</Text>
            </Card>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInUp.delay(260).springify()} style={[styles.driverSection, { paddingBottom: 100 }]}>
          <View style={styles.driverSectionHeader}>
            <Text style={styles.driverSectionTitle}>{t('dashboard.driverMyDeliveries')}</Text>
            <Text style={styles.driverSectionAction}>{deliveries.length} {t('dashboard.driverTotal')}</Text>
          </View>
          {deliveries.length === 0 ? (
            <Card style={styles.driverEmptyCard}>
              <View style={styles.driverEmptyIconWrap}>
                <Truck size={20} color="#FF7A45" />
              </View>
              <Text style={styles.driverEmptyTitle}>{t('dashboard.driverNoDeliveries')}</Text>
              <Text style={styles.driverEmptyText}>{t('dashboard.driverNoDeliveriesHint')}</Text>
            </Card>
          ) : (
            deliveries.map((order) => (
              <DriverDeliveryCard key={order.id} t={t} order={order} statusLabel={statusLabelMap[order.status]} />
            ))
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

type OverviewMetric = {
  key: string;
  label: string;
  value: string;
  caption: string;
  icon: React.ReactNode;
  accent: string;
  bg: string;
};

type FleetHealthMetric = {
  key: string;
  label: string;
  value: number;
  color: string;
  bg: string;
  icon: React.ReactNode;
};

function OverviewMetricCard({ item }: { item: OverviewMetric }) {
  return (
    <Animated.View entering={FadeInUp.delay(90).springify()} style={styles.adminMetricCardWrap}>
      <Card style={styles.adminMetricCard}>
        <View style={[styles.adminMetricIconWrap, { backgroundColor: item.bg }]}>{item.icon}</View>
        <Text style={styles.adminMetricValue}>{item.value}</Text>
        <Text style={styles.adminMetricLabel}>{item.label}</Text>
        <Text style={[styles.adminMetricCaption, { color: item.accent }]}>{item.caption}</Text>
      </Card>
    </Animated.View>
  );
}

function FleetHealthCard({ item, total }: { item: FleetHealthMetric; total: number }) {
  const percent = total > 0 ? (item.value / total) * 100 : 0;

  return (
    <View style={styles.adminHealthRow}>
      <View style={[styles.adminHealthIconWrap, { backgroundColor: item.bg }]}>{item.icon}</View>
      <View style={styles.adminHealthInfo}>
        <View style={styles.adminHealthTopRow}>
          <Text style={styles.adminHealthLabel}>{item.label}</Text>
          <Text style={[styles.adminHealthValue, { color: item.color }]}>{item.value}</Text>
        </View>
        <View style={styles.adminHealthBarTrack}>
          <View style={[styles.adminHealthBarFill, { width: `${percent}%`, backgroundColor: item.color }]} />
        </View>
      </View>
    </View>
  );
}

function CompanyAdminDashboard({
  t,
  role,
  userName,
  vehicles,
  deliveries,
}: {
  t: (key: string) => string;
  role: UserRole;
  userName: string;
  vehicles: Vehicle[];
  deliveries: DeliveryOrder[];
}) {
  const activeVehicles = vehicles.filter((vehicle) => vehicle.status === 'active');
  const maintenanceVehicles = vehicles.filter((vehicle) => vehicle.status === 'maintenance');
  const inactiveVehicles = vehicles.filter((vehicle) => vehicle.status === 'inactive');
  const pendingOrders = deliveries.filter((delivery) => delivery.status === 'pending');
  const activeOrders = deliveries.filter((delivery) => delivery.status === 'assigned' || delivery.status === 'in_transit' || delivery.status === 'delivered');
  const signedOrders = deliveries.filter((delivery) => delivery.status === 'signed');
  const urgentVehicles = vehicles
    .map((vehicle) => ({
      vehicle,
      daysLeft: vehicle.insuranceExpiry
        ? Math.ceil((new Date(vehicle.insuranceExpiry).getTime() - Date.now()) / 86400000)
        : 999,
    }))
    .filter((item) => item.daysLeft <= 45)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 3);

  const topMileageVehicles = [...vehicles]
    .sort((a, b) => b.mileage - a.mileage)
    .slice(0, 3);

  const totalMileage = vehicles.reduce((sum, vehicle) => sum + vehicle.mileage, 0);
  const averageMileage = vehicles.length ? Math.round(totalMileage / vehicles.length) : 0;
  const roleLabel = role === 'admin' ? 'Admin Control Center' : 'Company Operations';

  const overviewMetrics: OverviewMetric[] = [
    {
      key: 'fleet',
      label: 'Fleet Assets',
      value: String(vehicles.length),
      caption: `${activeVehicles.length} active vehicles`,
      icon: <Car size={18} color={colors.primary} />,
      accent: colors.primary,
      bg: '#E8FFF6',
    },
    {
      key: 'jobs',
      label: 'Active Orders',
      value: String(activeOrders.length),
      caption: `${pendingOrders.length} waiting dispatch`,
      icon: <Route size={18} color={colors.secondary} />,
      accent: colors.secondary,
      bg: '#EEF5FF',
    },
    {
      key: 'team',
      label: 'Drivers Online',
      value: String(new Set(deliveries.filter((delivery) => delivery.assignedDriverId).map((delivery) => delivery.assignedDriverId)).size),
      caption: `${signedOrders.length} orders completed`,
      icon: <Users size={18} color={colors.accentSecondary} />,
      accent: colors.accentSecondary,
      bg: '#FFF8E8',
    },
    {
      key: 'mileage',
      label: 'Avg. Mileage',
      value: averageMileage.toLocaleString(),
      caption: `${totalMileage.toLocaleString()} km total`,
      icon: <Gauge size={18} color={colors.accent} />,
      accent: colors.accent,
      bg: '#FFF1EA',
    },
  ];

  const healthMetrics: FleetHealthMetric[] = [
    {
      key: 'active',
      label: 'Active',
      value: activeVehicles.length,
      color: colors.primary,
      bg: '#E8FFF6',
      icon: <Activity size={16} color={colors.primary} />,
    },
    {
      key: 'maintenance',
      label: 'Maintenance',
      value: maintenanceVehicles.length,
      color: colors.warning,
      bg: '#FFF8E8',
      icon: <Wrench size={16} color={colors.warning} />,
    },
    {
      key: 'inactive',
      label: 'Inactive',
      value: inactiveVehicles.length,
      color: colors.textSecondary,
      bg: '#F2F4F8',
      icon: <AlertTriangle size={16} color={colors.textSecondary} />,
    },
  ];

  return (
    <View style={[styles.container, styles.adminScreenBg]}>
      <Header
        title={t('dashboard.title')}
        leftElement={
          <Pressable onPress={() => router.push('/(tabs)')} hitSlop={8}>
            <Image
              source={require('@/assets/onefleet_2560.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </Pressable>
        }
      />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.adminScrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(500)} style={styles.adminHeroWrap}>
          <LinearGradient
            colors={['#0D1325', '#17203A', '#1E2B4D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.adminHeroGradient}
          >
            <View style={styles.adminHeroTopRow}>
              <View style={styles.adminHeroTitleBlock}>
                <Text style={styles.adminHeroEyebrow}>{roleLabel}</Text>
                <Text style={styles.adminHeroTitle}>Welcome back, {userName}</Text>
                <Text style={styles.adminHeroSubtitle}>Monitor fleet health, dispatch flow, and expiring documents in one place.</Text>
              </View>
              <View style={styles.adminHeroBadgeWrap}>
                <View style={styles.adminHeroBadge}>
                  {role === 'admin' ? <Shield size={15} color="#0D1325" /> : <Building2 size={15} color="#0D1325" />}
                  <Text style={styles.adminHeroBadgeText}>{role === 'admin' ? 'Administrator' : 'Company'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.adminHeroOverviewRow}>
              <View style={styles.adminHeroKpiCard}>
                <Text style={styles.adminHeroKpiValue}>{vehicles.length}</Text>
                <Text style={styles.adminHeroKpiLabel}>Fleet Units</Text>
              </View>
              <View style={styles.adminHeroKpiCard}>
                <Text style={styles.adminHeroKpiValue}>{activeOrders.length}</Text>
                <Text style={styles.adminHeroKpiLabel}>Orders In Motion</Text>
              </View>
              <View style={styles.adminHeroKpiCard}>
                <Text style={styles.adminHeroKpiValue}>{urgentVehicles.length}</Text>
                <Text style={styles.adminHeroKpiLabel}>Needs Attention</Text>
              </View>
            </View>

            <View style={styles.adminHeroFloatingCard}>
              <View style={styles.adminHeroFloatingHeader}>
                <Text style={styles.adminHeroFloatingTitle}>Dispatch Snapshot</Text>
                <ArrowUpRight size={16} color="#7EE6B8" />
              </View>
              <View style={styles.adminHeroFloatingStats}>
                <View>
                  <Text style={styles.adminHeroFloatingValue}>{pendingOrders.length}</Text>
                  <Text style={styles.adminHeroFloatingLabel}>Pending</Text>
                </View>
                <View style={styles.adminHeroFloatingDivider} />
                <View>
                  <Text style={styles.adminHeroFloatingValue}>{signedOrders.length}</Text>
                  <Text style={styles.adminHeroFloatingLabel}>Delivered</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(120).springify()} style={styles.adminMetricsGrid}>
          {overviewMetrics.map((item) => (
            <OverviewMetricCard key={item.key} item={item} />
          ))}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(180).springify()} style={styles.adminSection}>
          <View style={styles.adminSectionHeader}>
            <Text style={styles.adminSectionTitle}>Fleet Health</Text>
            <Text style={styles.adminSectionHint}>Live operational split</Text>
          </View>
          <Card style={styles.adminHealthCard}>
            {healthMetrics.map((item) => (
              <FleetHealthCard key={item.key} item={item} total={vehicles.length} />
            ))}
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(240).springify()} style={styles.adminTwoColumnRow}>
          <Card style={[styles.adminPanelCard, styles.adminPanelSpacing]}>
            <View style={styles.adminPanelHeader}>
              <Text style={styles.adminPanelTitle}>Document Alerts</Text>
              <View style={styles.adminPanelTag}>
                <FileClock size={14} color={colors.warning} />
                <Text style={styles.adminPanelTagText}>45 days</Text>
              </View>
            </View>
            {urgentVehicles.length === 0 ? (
              <View style={styles.adminEmptyState}>
                <Text style={styles.adminEmptyTitle}>All documents are healthy</Text>
                <Text style={styles.adminEmptyText}>No insurance expiry requiring action right now.</Text>
              </View>
            ) : (
              urgentVehicles.map(({ vehicle, daysLeft }) => (
                <View key={vehicle.id} style={styles.adminListRow}>
                  <View style={styles.adminListLead}>
                    <View style={[styles.adminMiniBadge, { backgroundColor: daysLeft < 0 ? '#FFE8EA' : '#FFF8E8' }]}>
                      <CalendarRange size={14} color={daysLeft < 0 ? colors.danger : colors.warning} />
                    </View>
                    <View>
                      <Text style={styles.adminListTitle}>{vehicle.make} {vehicle.model}</Text>
                      <Text style={styles.adminListSubtitle}>{vehicle.plateNumber}</Text>
                    </View>
                  </View>
                  <Badge
                    label={daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days left`}
                    variant={daysLeft < 0 ? 'danger' : 'warning'}
                    size="sm"
                  />
                </View>
              ))
            )}
          </Card>

          <Card style={[styles.adminPanelCard, styles.adminPanelSpacing]}>
            <View style={styles.adminPanelHeader}>
              <Text style={styles.adminPanelTitle}>Top Mileage Vehicles</Text>
              <Text style={styles.adminPanelMuted}>Highest utilization</Text>
            </View>
            {topMileageVehicles.map((vehicle, index) => (
              <View key={vehicle.id} style={styles.adminListRow}>
                <View style={styles.adminListLead}>
                  <View style={styles.adminRankCircle}>
                    <Text style={styles.adminRankText}>{index + 1}</Text>
                  </View>
                  <View>
                    <Text style={styles.adminListTitle}>{vehicle.make} {vehicle.model}</Text>
                    <Text style={styles.adminListSubtitle}>{vehicle.plateNumber}</Text>
                  </View>
                </View>
                <Text style={styles.adminMileageText}>{vehicle.mileage.toLocaleString()} km</Text>
              </View>
            ))}
          </Card>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

export default function DashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { vehicles } = useVehicleStore();
  const { deliveries } = useDeliveryStore();
  const { role, user } = useAuthStore();

  const active = vehicles.filter((v) => v.status === 'active').length;
  const maintenance = vehicles.filter((v) => v.status === 'maintenance').length;
  const inactive = vehicles.filter((v) => v.status === 'inactive').length;
  const totalMileage = vehicles.reduce((s, v) => s + v.mileage, 0);
  const avgMileage = vehicles.length > 0 ? Math.round(totalMileage / vehicles.length) : 0;
  const maxMileage = vehicles.length > 0 ? Math.max(...vehicles.map((v) => v.mileage)) : 0;

  const total = vehicles.length;
  const fuelCounts: Record<string, number> = {
    gasoline: vehicles.filter((v) => v.fuelType === 'gasoline').length,
    diesel: vehicles.filter((v) => v.fuelType === 'diesel').length,
    electric: vehicles.filter((v) => v.fuelType === 'electric').length,
    hybrid: vehicles.filter((v) => v.fuelType === 'hybrid').length,
  };

  const topVehicle = vehicles.length > 0
    ? [...vehicles].sort((a, b) => b.mileage - a.mileage)[0]
    : null;

  const statusConfig: StatusItem[] = [
    { key: 'active', label: t('dashboard.active'), icon: <Activity size={18} color="#00A87A" />, bg: 'rgba(0,168,122,0.12)', color: '#00A87A' },
    { key: 'maintenance', label: t('dashboard.maintenance'), icon: <Wrench size={18} color="#E69500" />, bg: 'rgba(230,149,0,0.12)', color: '#E69500' },
    { key: 'inactive', label: t('dashboard.inactive'), icon: <AlertTriangle size={18} color="#5A6178" />, bg: 'rgba(90,97,120,0.12)', color: '#5A6178' },
  ];

  const fuelConfig: FuelItem[] = [
    { key: 'gasoline', label: t('dashboard.gasoline'), icon: <Droplets size={16} color="#C47B3A" />, bg: 'rgba(196,123,58,0.1)', color: '#C47B3A' },
    { key: 'diesel', label: t('dashboard.diesel'), icon: <Droplets size={16} color="#7A6040" />, bg: 'rgba(122,96,64,0.1)', color: '#7A6040' },
    { key: 'electric', label: t('dashboard.electric'), icon: <Zap size={16} color="#2B7FD4" />, bg: 'rgba(43,127,212,0.1)', color: '#2B7FD4' },
    { key: 'hybrid', label: t('dashboard.hybrid'), icon: <Leaf size={16} color="#00A87A" />, bg: 'rgba(0,168,122,0.1)', color: '#00A87A' },
  ];

  if (role === 'driver') {
    const driverDeliveries = user ? deliveries.filter((delivery) => delivery.assignedDriverId === user.id) : [];
    return <DriverDashboard t={t} deliveries={driverDeliveries} userName={user?.name || 'Driver'} />;
  }

  if (role === 'admin' || role === 'company') {
    return (
      <CompanyAdminDashboard
        t={t}
        role={role}
        userName={user?.name || (role === 'admin' ? 'Administrator' : 'Company')}
        vehicles={vehicles}
        deliveries={deliveries}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <Header
        title={t('dashboard.title')}
        leftElement={
          <Pressable onPress={() => router.push('/(tabs)')} hitSlop={8}>
            <Image
              source={require('@/assets/onefleet_2560.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </Pressable>
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        <View style={styles.heroWrap}>
          <HeroBanner
            t={t}
            total={vehicles.length}
            active={active}
            maintenance={maintenance}
            inactive={inactive}
          />
        </View>

        <Animated.View entering={FadeInUp.delay(150).springify()} style={styles.statusPills}>
          {statusConfig.map((s) => (
            <StatusCard key={s.key} status={s} />
          ))}
        </Animated.View>

        <View style={styles.section}>
          <MileageCard t={t} avg={avgMileage} total={totalMileage} max={maxMileage} />
        </View>

        <Animated.View entering={FadeInUp.delay(250).springify()} style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, { backgroundColor: `${colors.secondary}15` }]}>
              <Fuel size={16} color={colors.secondary} />
            </View>
            <Text style={styles.sectionTitle}>{t('dashboard.fuelBreakdown')}</Text>
          </View>
          <Card style={styles.fuelCard}>
            {fuelConfig.map((f) => (
              <FuelCard
                key={f.key}
                fuel={f}
                count={fuelCounts[f.key] ?? 0}
                total={total}
              />
            ))}
          </Card>
        </Animated.View>

        {topVehicle && (
          <Animated.View entering={FadeInUp.delay(350).springify()} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: `${colors.accentSecondary}15` }]}>
                <TrendingUp size={16} color={colors.accentSecondary} />
              </View>
              <Text style={styles.sectionTitle}>{t('dashboard.topPerformer')}</Text>
            </View>
            <Card style={styles.topCard}>
              <View style={styles.topCardLeft}>
                <View style={[styles.topAvatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.topAvatarText}>{topVehicle.make.charAt(0).toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.topName}>{topVehicle.make} {topVehicle.model}</Text>
                  <Text style={styles.topPlate}>{topVehicle.plateNumber}</Text>
                </View>
              </View>
              <View style={styles.topCardRight}>
                <Text style={styles.topMileage}>{topVehicle.mileage.toLocaleString()}</Text>
                <Text style={styles.topMileageLabel}>{t('dashboard.mileage')}</Text>
              </View>
            </Card>
          </Animated.View>
        )}

        <Animated.View entering={FadeInUp.delay(450).springify()} style={[styles.section, { paddingBottom: 100 }]}> 
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, { backgroundColor: `${colors.warning}15` }]}>
              <Clock size={16} color={colors.warning} />
            </View>
            <Text style={styles.sectionTitle}>{t('dashboard.attention')}</Text>
          </View>
          <Card style={styles.attentionCard}>
            {vehicles.filter((v) => {
              const days = v.insuranceExpiry
                ? Math.ceil((new Date(v.insuranceExpiry).getTime() - Date.now()) / 86400000)
                : 999;
              return days <= 30;
            }).length === 0 ? (
              <View style={styles.attentionEmpty}>
                <View style={[styles.attentionIconWrap, { backgroundColor: `${colors.success}15` }]}>
                  <Activity size={20} color={colors.success} />
                </View>
                <Text style={styles.attentionEmptyText}>{t('dashboard.allDocsOk')}</Text>
              </View>
            ) : (
              vehicles
                .filter((v) => {
                  const days = v.insuranceExpiry
                    ? Math.ceil((new Date(v.insuranceExpiry).getTime() - Date.now()) / 86400000)
                    : 999;
                  return days <= 30;
                })
                .map((v) => {
                  const days = Math.ceil((new Date(v.insuranceExpiry).getTime() - Date.now()) / 86400000);
                  return (
                    <View key={v.id} style={styles.attentionRow}>
                      <View style={[styles.attentionDot, { backgroundColor: days < 0 ? colors.danger : colors.warning }]} />
                      <Text style={styles.attentionName}>{`${v.make} ${v.model}`}</Text>
                      <Badge
                        label={days < 0 ? t('dashboard.daysOverdue') : `${days} ${t('dashboard.daysLeft')}`}
                        variant={days < 0 ? 'danger' : 'warning'}
                        size="sm"
                      />
                    </View>
                  );
                })
            )}
          </Card>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 100, paddingTop: 0 },
  driverScrollContent: { paddingBottom: 120, paddingTop: 0 },
  adminScreenBg: { backgroundColor: '#F3F6FB' },
  adminScrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 120 },
  headerLogo: {
    width: 90,
    height: 30,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  logoImage: {
    width: 180,
    height: 60,
  },
  logoImageSmall: {
    width: 90,
    height: 30,
  },
  adminHeroWrap: { marginBottom: spacing.lg },
  adminHeroGradient: {
    borderRadius: 30,
    padding: spacing.xl,
    overflow: 'hidden',
  },
  adminHeroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  adminHeroTitleBlock: { flex: 1 },
  adminHeroEyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  adminHeroTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
  },
  adminHeroSubtitle: {
    marginTop: spacing.sm,
    color: 'rgba(255,255,255,0.76)',
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
    maxWidth: 280,
  },
  adminHeroBadgeWrap: { paddingTop: 4 },
  adminHeroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  adminHeroBadgeText: {
    color: '#0D1325',
    fontSize: 12,
    fontWeight: '700',
  },
  adminHeroOverviewRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  adminHeroKpiCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 22,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  adminHeroKpiValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  adminHeroKpiLabel: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  adminHeroFloatingCard: {
    marginTop: spacing.xl,
    alignSelf: 'flex-start',
    backgroundColor: '#111A31',
    borderRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minWidth: 190,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  adminHeroFloatingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  adminHeroFloatingTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  adminHeroFloatingStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  adminHeroFloatingValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  adminHeroFloatingLabel: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
  },
  adminHeroFloatingDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  adminMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  adminMetricCardWrap: { width: '47.7%' },
  adminMetricCard: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderRadius: 24,
  },
  adminMetricIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  adminMetricValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize['2xl'],
    fontWeight: '800',
  },
  adminMetricLabel: {
    marginTop: 4,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
  },
  adminMetricCaption: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  adminSection: { marginBottom: spacing.xl },
  adminSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  adminSectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '800',
  },
  adminSectionHint: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  adminHealthCard: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: 24,
    gap: spacing.md,
  },
  adminHealthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  adminHealthIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminHealthInfo: { flex: 1 },
  adminHealthTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  adminHealthLabel: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
  },
  adminHealthValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: '800',
  },
  adminHealthBarTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: '#EEF2F7',
    overflow: 'hidden',
  },
  adminHealthBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  adminTwoColumnRow: {
    gap: spacing.md,
    paddingBottom: 20,
  },
  adminPanelCard: {
    borderRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  adminPanelSpacing: { marginBottom: spacing.md },
  adminPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  adminPanelTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    fontWeight: '800',
  },
  adminPanelMuted: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  adminPanelTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF8E8',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  adminPanelTagText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '700',
  },
  adminEmptyState: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  adminEmptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
  },
  adminEmptyText: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  adminListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  adminListLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  adminMiniBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminListTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
  },
  adminListSubtitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 12,
  },
  adminRankCircle: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.full,
    backgroundColor: '#EEF5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminRankText: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: '800',
  },
  adminMileageText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },

  heroWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  heroGradient: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    overflow: 'hidden',
    minHeight: 180,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  heroGreeting: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 28,
  },
  heroSubGreeting: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  heroBadge: { marginTop: 4 },
  heroStats: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  heroMainStat: { width: 96 },
  heroMainNumber: {
    fontSize: 44,
    lineHeight: 46,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroMainLabel: {
    marginTop: 4,
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.82)',
  },
  heroDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginHorizontal: spacing.lg,
  },
  heroMiniStats: { flex: 1, gap: spacing.sm },
  heroMiniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroMiniDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  heroMiniLabel: {
    width: 78,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  heroMiniValue: {
    width: 18,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  heroMiniBarWrap: {
    flex: 1,
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  heroMiniBar: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  heroOrbContainer: {
    position: 'absolute',
    right: -8,
    bottom: -16,
  },
  heroOrb: {
    width: 120,
    height: 120,
    borderRadius: 999,
  },
  heroOrb2: {
    width: 64,
    height: 64,
    borderRadius: 999,
    position: 'absolute',
    top: 20,
    left: -12,
  },

  statusPills: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  statusCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  statusIconWrap: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statusLabel: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },

  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    fontWeight: '800',
  },
  mileageCard: { padding: spacing.lg },
  mileageHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  mileageIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mileageTitle: { fontSize: typography.fontSize.base, fontWeight: '800', color: colors.textPrimary },
  mileageStatsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch' },
  mileageStat: { flex: 1, alignItems: 'center' },
  mileageStatValue: { fontSize: typography.fontSize.xl, fontWeight: '800' },
  mileageStatLabel: { marginTop: 4, fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  mileageSep: { width: 1, marginHorizontal: spacing.sm },

  fuelCard: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  fuelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fuelIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fuelInfo: { flex: 1 },
  fuelLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  fuelLabel: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  fuelPct: { fontSize: 12, fontWeight: '800' },
  fuelBarWrap: {
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  fuelBarFill: { height: '100%', borderRadius: borderRadius.full },

  topCard: {
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topCardLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  topAvatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topAvatarText: { color: '#fff', fontSize: typography.fontSize.lg, fontWeight: '800' },
  topName: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.textPrimary },
  topPlate: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  topCardRight: { alignItems: 'flex-end' },
  topMileage: { fontSize: typography.fontSize.xl, fontWeight: '800', color: colors.primary },
  topMileageLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  attentionCard: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  attentionEmpty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  attentionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attentionEmptyText: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  attentionDot: { width: 10, height: 10, borderRadius: borderRadius.full },
  attentionName: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textPrimary, fontWeight: '600' },

  driverHeroWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  driverHeroGradient: {
    borderRadius: 28,
    padding: spacing.xl,
    minHeight: 210,
    overflow: 'hidden',
  },
  driverHeroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  driverHeroEyebrow: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    marginBottom: 8,
  },
  driverHeroName: {
    fontSize: 30,
    lineHeight: 36,
    color: '#fff',
    fontWeight: '800',
  },
  driverHeroSub: {
    marginTop: 6,
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.88)',
  },
  driverHeroAvatar: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.full,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverHeroStatsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  driverHeroStatCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  driverHeroStatValue: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    color: '#fff',
  },
  driverHeroStatLabel: {
    marginTop: 4,
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
  },
  driverStatsGrid: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  driverStatCard: {
    width: '47.8%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
  },
  driverStatIconWrap: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  driverStatValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  driverStatLabel: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
  },
  driverSection: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  driverSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  driverSectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  driverSectionAction: {
    fontSize: typography.fontSize.sm,
    color: '#FF7A45',
    fontWeight: '700',
  },
  driverHighlightCard: {
    padding: spacing.lg,
    borderRadius: 24,
  },
  driverHighlightTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  driverHighlightOrder: {
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '700',
  },
  driverHighlightCustomer: {
    marginTop: 4,
    fontSize: typography.fontSize.lg,
    color: colors.textPrimary,
    fontWeight: '800',
  },
  driverHighlightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF1EA',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  driverHighlightBadgeText: {
    fontSize: 12,
    color: '#FF7A45',
    fontWeight: '700',
  },
  driverHighlightAddress: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.base,
    lineHeight: 22,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  driverHighlightDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  driverHighlightRouteLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  driverEmptyCard: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing['2xl'],
    borderRadius: 24,
  },
  driverEmptyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: '#FFF1EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  driverEmptyTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  driverEmptyText: {
    marginTop: 6,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  driverDeliveryCard: {
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: 24,
  },
  driverDeliveryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  driverDeliveryTitleWrap: { flex: 1 },
  driverDeliveryOrderNo: {
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '700',
  },
  driverDeliveryCustomer: {
    marginTop: 4,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    fontWeight: '800',
  },
  driverRouteWrap: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  driverRouteMarkerColumn: { alignItems: 'center' },
  driverRouteIconWrap: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverRouteLine: {
    width: 2,
    flex: 1,
    minHeight: 18,
    backgroundColor: colors.border,
    marginVertical: 6,
  },
  driverRouteTextColumn: { flex: 1, gap: spacing.lg },
  driverRouteBlock: { gap: 4 },
  driverRouteLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  driverRouteAddress: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    lineHeight: 20,
    fontWeight: '600',
  },
  driverRouteMeta: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  driverDeliveryFooter: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  driverDeliveryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    flex: 1,
  },
  driverDeliveryChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
});
