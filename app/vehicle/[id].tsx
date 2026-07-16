import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate, Extrapolation } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useVehicleStore } from '@/store/vehicleStore';
import { useDriverStore } from '@/store/driverStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { BentoGrid } from '@/components/vehicle/BentoGrid';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { colors, spacing, typography, borderRadius, layout } from '@/constants/theme';
import { useTranslation } from '@/i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HEADER_MAX_HEIGHT = 280;
const HEADER_MIN_HEIGHT = 80;

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getVehicleById, isLoading } = useVehicleStore();
  const { drivers, loadDrivers } = useDriverStore();
  const { users, loadUsers } = useUserManagementStore();
  const { t } = useTranslation();

  const vehicle = getVehicleById(id ?? '');
  const scrollY = useSharedValue(0);

  useEffect(() => {
    loadDrivers();
    loadUsers();
  }, [loadDrivers, loadUsers]);

  if (isLoading || !vehicle) {
    return (
      <View style={styles.loadingContainer}>
        <SkeletonCard style={{ margin: spacing.lg }} />
      </View>
    );
  }

  if (!vehicle) {
    return (
      <View style={styles.notFoundContainer}>
        <Text style={styles.notFoundText}>{t('vehicles.notFound')}</Text>
      </View>
    );
  }

  const headerAnimatedStyle = useAnimatedStyle(() => {
    const height = interpolate(
      scrollY.value,
      [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
      [HEADER_MAX_HEIGHT, HEADER_MIN_HEIGHT],
      Extrapolation.CLAMP
    );
    return { height };
  });

  const imageOpacityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
      [1, 0.3],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const compactTitleStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT - 20, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      {/* Top Bar (always on top) */}
      <View style={[styles.topBarWrapper, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
            style={styles.backBtn}
          >
            <ChevronLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <Animated.View style={[styles.compactTitle, compactTitleStyle]}>
            <Text style={styles.compactTitleText} numberOfLines={1}>
              {vehicle.make} {vehicle.model}
            </Text>
          </Animated.View>
        </View>
      </View>

      {/* Animated Header Image */}
      <Animated.View style={[styles.header, headerAnimatedStyle]}>
        <Animated.View style={[styles.headerImage, imageOpacityStyle]}>
          <Image
            source={{ uri: vehicle.imageUrl }}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <View style={styles.imageOverlay} />
        </Animated.View>

        {/* Hero content */}
        <Animated.View style={[styles.heroContent, imageOpacityStyle]}>
          <Text style={styles.heroMake}>{vehicle.make}</Text>
          <Text style={styles.heroModel}>{vehicle.model}</Text>
          <Text style={styles.heroPlate}>{vehicle.plateNumber}</Text>
          <View style={styles.heroMeta}>
            <Text style={styles.heroYear}>{vehicle.year}</Text>
            <View style={styles.heroDot} />
            <Text style={styles.heroBodyType}>{t(`vehicles.${vehicle.bodyType}`)}</Text>
            <View style={styles.heroDot} />
            <Text style={styles.heroColor}>{vehicle.color}</Text>
          </View>
        </Animated.View>
      </Animated.View>

      {/* Scrollable Content */}
      <Animated.ScrollView
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_MAX_HEIGHT + insets.top }]}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <BentoGrid vehicle={vehicle} />
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.lg,
  },
  notFoundContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  notFoundText: {
    fontSize: typography.fontSize.xl,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
  },
  headerImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    height: layout.headerHeight,
  },
  topBarWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  compactTitle: {
    flex: 1,
    alignItems: 'center',
  },
  compactTitleText: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  topBarActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  topBarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  heroContent: {
    position: 'absolute',
    bottom: spacing.xl,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
  },
  heroMake: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 36,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroModel: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 28,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroPlate: {
    fontFamily: 'JetBrains Mono',
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 2,
    marginTop: spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  heroYear: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: spacing.sm,
  },
  heroBodyType: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroColor: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  scrollContent: {
    paddingBottom: spacing['3xl'],
  },
  scrollView: {
    zIndex: 1,
  },
});
