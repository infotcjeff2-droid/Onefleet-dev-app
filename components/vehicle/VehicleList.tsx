import { useEffect, useRef } from 'react';
import { View, StyleSheet, Text, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Plus, Car } from 'lucide-react-native';
import { useVehicleStore } from '@/store/vehicleStore';
import { VehicleCard } from './VehicleCard';
import { SkeletonList } from '@/components/ui/SkeletonCard';
import { Button } from '@/components/ui/Button';
import { SearchBar } from './SearchBar';
import { FilterChips } from './FilterChips';
import { colors, spacing, typography } from '@/constants/theme';
import { Vehicle } from '@/types';

export function VehicleList() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const {
    isLoading,
    searchQuery,
    statusFilter,
    setSearchQuery,
    setStatusFilter,
    loadVehicles,
    getFilteredVehicles,
  } = useVehicleStore();

  const vehicles = getFilteredVehicles();

  useEffect(() => {
    loadVehicles();
  }, []);

  useEffect(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, [statusFilter, searchQuery]);

  const handleVehiclePress = (vehicle: Vehicle) => {
    router.push(`/vehicle/${vehicle.id}`);
  };

  const handleAddPress = () => {
    router.push('/vehicle/add');
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
            onRefresh={loadVehicles}
            tintColor={colors.primary}
          />
        }
      >
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <FilterChips
          selected={statusFilter}
          onSelect={setStatusFilter}
        />

        {vehicles.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Car size={48} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>No vehicles found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? `No results for "${searchQuery}"`
                : 'Add your first vehicle to get started'}
            </Text>
            {!searchQuery && (
              <Button
                title="Add Vehicle"
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
            title="Add Vehicle"
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
