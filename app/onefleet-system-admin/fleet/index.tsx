import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useVehicleStore } from '@/store/vehicleStore';
import { useDriverStore } from '@/store/driverStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useThemeStore } from '@/store/themeStore';
import { Vehicle, VehicleStatus } from '@/types';
import {
  Truck as TruckIcon,
  ArrowLeft,
  CheckCircle,
  Wrench,
  Circle as CircleIcon,
  Building2,
} from 'lucide-react-native';

const STATUS_CONFIG: Record<VehicleStatus, { label: string; color: string; icon: React.ReactNode }> = {
  active: {
    label: '使用中',
    color: '#22C55E',
    icon: <CheckCircle size={14} color="#22C55E" />,
  },
  maintenance: {
    label: '保養中',
    color: '#F59E0B',
    icon: <Wrench size={14} color="#F59E0B" />,
  },
  inactive: {
    label: '停用',
    color: '#EF4444',
    icon: <CircleIcon size={14} color="#EF4444" />,
  },
};

export default function FleetManagement() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { vehicles, isLoading, loadVehicles } = useVehicleStore();
  const { getDriverById } = useDriverStore();
  const { getCompanyById } = useUserManagementStore();

  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | 'all'>('all');

  useEffect(() => {
    loadVehicles();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadVehicles();
    setRefreshing(false);
  };

  const filteredVehicles = statusFilter === 'all'
    ? vehicles
    : vehicles.filter((v) => v.status === statusFilter);

  const activeCount = vehicles.filter((v) => v.status === 'active').length;

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>車隊管理</Text>
        <View style={styles.headerRight} />
      </View>

      {/* 提示列 */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerText}>
          車隊資料來自「車輛管理」頁面，請至「車輛管理」新增或編輯車輛
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{activeCount}</Text>
          <Text style={styles.statLabel}>使用中</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{vehicles.length}</Text>
          <Text style={styles.statLabel}>總車輛數</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {(['all', 'active', 'maintenance', 'inactive'] as const).map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterTab,
              statusFilter === status && styles.filterTabActive,
            ]}
            onPress={() => setStatusFilter(status)}
          >
            <Text
              style={[
                styles.filterTabText,
                statusFilter === status && styles.filterTabTextActive,
              ]}
            >
              {status === 'all' ? '全部' : STATUS_CONFIG[status as VehicleStatus].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Vehicle List */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredVehicles.length === 0 ? (
          <View style={styles.emptyState}>
            <TruckIcon size={64} color={colors.textTertiary} />
            <Text style={styles.emptyText}>尚無車輛資料</Text>
            <Text style={styles.emptySubtext}>請至「車輛管理」新增車輛</Text>
          </View>
        ) : (
          filteredVehicles.map((vehicle) => {
            const config = STATUS_CONFIG[vehicle.status];
            const assignedDriver = vehicle.assignedDriverId ? getDriverById(vehicle.assignedDriverId) : null;
            const assignedCompany = assignedDriver?.companyId ? getCompanyById(assignedDriver.companyId) : null;
            return (
              <View key={vehicle.id} style={styles.truckCard}>
                <View style={styles.truckInfo}>
                  <View style={styles.truckHeader}>
                    <TruckIcon size={20} color={colors.primary} />
                    <Text style={styles.plateNumber}>
                      {vehicle.plateNumber || '未填寫車牌'}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: config.color + '20' }]}>
                      {config.icon}
                      <Text style={[styles.statusText, { color: config.color }]}>
                        {config.label}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.truckDetails}>
                    <Text style={styles.detailText}>
                      {vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}
                    </Text>
                    {vehicle.bodyType && (
                      <Text style={styles.detailText}>
                        車型：{getBodyTypeLabel(vehicle.bodyType)}
                      </Text>
                    )}
                    {vehicle.mileage != null && (
                      <Text style={styles.detailText}>
                        里程：{vehicle.mileage.toLocaleString()} km
                      </Text>
                    )}
                    {assignedCompany && (
                      <View style={styles.companyRow}>
                        <Building2 size={14} color={colors.textTertiary} />
                        <Text style={styles.companyText}>
                          {assignedCompany.nameZh || assignedCompany.name}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function getBodyTypeLabel(type: string): string {
  const map: Record<string, string> = {
    sedan: '轎車',
    suv: '休旅車',
    truck: '貨車',
    van: '客貨車',
    motorcycle: '電單車',
    other: '其他',
  };
  return map[type] || type;
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 60,
      paddingBottom: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
    },
    headerRight: {
      width: 40,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    infoBanner: {
      backgroundColor: colors.primary + '15',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    infoBannerText: {
      fontSize: 13,
      color: colors.primary,
      textAlign: 'center',
    },
    statsContainer: {
      flexDirection: 'row',
      padding: 16,
      gap: 12,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    statValue: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.primary,
    },
    statLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    filterContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      gap: 8,
      marginBottom: 8,
    },
    filterTab: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterTabActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterTabText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    filterTabTextActive: {
      color: '#fff',
      fontWeight: '600',
    },
    content: {
      flex: 1,
      padding: 16,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 100,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textSecondary,
      marginTop: 16,
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.textTertiary,
      marginTop: 8,
    },
    truckCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: colors.border,
    },
    truckInfo: {
      flex: 1,
    },
    truckHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    plateNumber: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      flex: 1,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
    },
    truckDetails: {
      marginTop: 8,
      gap: 4,
    },
    detailText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    companyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
    },
    companyText: {
      fontSize: 13,
      color: colors.textTertiary,
    },
  });
