import { useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, ScrollView, RefreshControl, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Plus, Car } from 'lucide-react-native';
import { useVehicleStore } from '@/store/vehicleStore';
import { useGps808Store, GpsDeviceStatusCache } from '@/store/gps808Store';
import { VehicleCard } from './VehicleCard';
import { SkeletonList } from '@/components/ui/SkeletonCard';
import { Button } from '@/components/ui/Button';
import { SearchBar } from './SearchBar';
import { FilterChips } from './FilterChips';
import { colors, spacing, typography } from '@/constants/theme';
import { Vehicle } from '@/types';
import { useTranslation } from '@/i18n';
import { gps808Api } from '@/utils/gps808Api';

const IS_WEB = Platform.OS === 'web';

/**
 * 根據速度判斷 GPS 設備狀態
 * 速度 > 5 km/h 為行駛中，速度 = 0 為停泊
 */
function determineGpsStatus(speed: number, onlineStatus: number): 'moving' | 'parked' | 'offline' | 'unknown' {
  if (onlineStatus !== 1) {
    return 'offline';
  }
  if (speed > 5) {
    return 'moving';
  }
  return 'parked';
}

/**
 * 刷新所有 GPS 設備的狀態
 */
async function refreshGpsDeviceStatus(devIdnos: string[]): Promise<GpsDeviceStatusCache[]> {
  const results: GpsDeviceStatusCache[] = [];
  const now = Date.now();

  for (const devIdno of devIdnos) {
    try {
      const response = await gps808Api.getDeviceStatus(devIdno, false);
      if (response.result === 0 && response.status) {
        const status = response.status;
        // speed 是 0.1 km/h 格式
        const speedValue = status.sp !== undefined && status.sp !== null && status.sp !== ''
          ? (typeof status.sp === 'number' ? status.sp / 10 : parseFloat(String(status.sp)) / 10)
          : 0;
        const onlineStatus = status.ol !== undefined && status.ol !== null && status.ol !== ''
          ? (typeof status.ol === 'number' ? status.ol : parseInt(String(status.ol), 10))
          : 0;

        const gpsStatus = determineGpsStatus(speedValue, onlineStatus);

        results.push({
          devIdno,
          status: gpsStatus,
          speed: speedValue,
          onlineStatus,
          lastUpdate: now,
        });
      } else {
        // 設備狀態查詢失敗
        results.push({
          devIdno,
          status: 'offline',
          speed: 0,
          onlineStatus: 0,
          lastUpdate: now,
        });
      }
    } catch (err) {
      console.error(`[VehicleList] 刷新 GPS 設備狀態失敗: ${devIdno}`, err);
      results.push({
        devIdno,
        status: 'offline',
        speed: 0,
        onlineStatus: 0,
        lastUpdate: now,
      });
    }
  }

  return results;
}

export function VehicleList() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const { t } = useTranslation();
  const {
    isLoading,
    searchQuery,
    statusFilter,
    setSearchQuery,
    setStatusFilter,
    loadVehicles,
    getFilteredVehicles,
  } = useVehicleStore();
  const { isConnected, batchUpdateDeviceStatus, loadConfig } = useGps808Store();

  const vehicles = getFilteredVehicles();

  // 刷新 GPS 設備狀態
  const refreshGpsStatuses = useCallback(async () => {
    if (!isConnected) return;

    // 取得所有有 GPS 設備 ID 的車輛
    const devIdnos = vehicles
      .map((v) => v.devIdno || v.gpsDeviceId)
      .filter((id): id is string => !!id);

    if (devIdnos.length === 0) return;

    const statuses = await refreshGpsDeviceStatus(devIdnos);
    batchUpdateDeviceStatus(statuses);
  }, [vehicles, isConnected, batchUpdateDeviceStatus]);

  // 進入車輛頁時同時載入車輛並重新驗證/重連 GPS proxy，
  // 避免 localStorage 內的 stale SERVER_URL_KEY 或 jsession 導致連線狀態誤判。
  useEffect(() => {
    loadVehicles();
    if (IS_WEB) {
      loadConfig();
    }
  }, []);

  // 當車輛載入完成且 GPS 已連線時，刷新 GPS 狀態
  useEffect(() => {
    if (!isLoading && vehicles.length > 0 && isConnected) {
      refreshGpsStatuses();
    }
  }, [isLoading, vehicles.length, isConnected]);

  useEffect(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, [statusFilter, searchQuery]);

  const handleVehiclePress = (vehicle: Vehicle) => {
    router.push(`/vehicle/${vehicle.id}`);
  };

  const handleAddPress = () => {
    router.push('/vehicle/add');
  };

  const handleRefresh = async () => {
    await loadVehicles();
    if (isConnected) {
      await refreshGpsStatuses();
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <SearchBar value="" onChangeText={() => {}} />
        <FilterChips selected="all" onSelect={() => {}} />
        <SkeletonList count={4} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          t={t}
        />
        <FilterChips
          selected={statusFilter}
          onSelect={setStatusFilter}
          t={t}
        />

        {vehicles.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Car size={48} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>{t('vehicles.noVehicles')}</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? `No results for "${searchQuery}"`
                : t('vehicles.addFirst')}
            </Text>
            {!searchQuery && (
              <Button
                title={t('vehicles.addTitle')}
                onPress={handleAddPress}
                icon={<Plus size={18} color="#FFF" />}
                style={{ marginTop: spacing.lg }}
              />
            )}
          </View>
        ) : (
          <View style={styles.listContainer}>
            {vehicles.map((vehicle, index) => (
              <Animated.View
                key={vehicle.id}
                entering={FadeInDown.delay(Math.min(index * 80, 400)).springify()}
              >
                <VehicleCard
                  vehicle={vehicle}
                  onPress={() => handleVehiclePress(vehicle)}
                  index={index}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>

      {vehicles.length > 0 && (
        <View style={styles.fabContainer}>
          <Button
            title={t('vehicles.addTitle')}
            onPress={handleAddPress}
            icon={<Plus size={18} color="#FFF" />}
            fullWidth
          />
        </View>
      )}
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
    paddingTop: spacing.md,
    paddingBottom: 160,
  },
  listContainer: {
    paddingTop: spacing.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: spacing['2xl'],
    minHeight: 300,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 20,
    left: spacing.lg,
    right: spacing.lg,
  },
});
