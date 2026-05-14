import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Alert, Dimensions, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate, Extrapolation } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Edit, Trash2, Share2, ChevronLeft, MapPin } from 'lucide-react-native';
import { useVehicleStore } from '@/store/vehicleStore';
import { BentoGrid } from '@/components/vehicle/BentoGrid';
import { Button } from '@/components/ui/Button';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { colors, spacing, typography, borderRadius, layout } from '@/constants/theme';
import { bodyTypeLabels } from '@/constants/mockData';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HEADER_MAX_HEIGHT = 280;
const HEADER_MIN_HEIGHT = 80;

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getVehicleById, deleteVehicle, isLoading } = useVehicleStore();

  const [vehicle, setVehicle] = useState(getVehicleById(id));
  const scrollY = useSharedValue(0);

  useEffect(() => {
    setVehicle(getVehicleById(id));
  }, [id]);

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
        <Text style={styles.notFoundText}>Vehicle not found</Text>
        <Button title="Go Back" onPress={() => router.back()} />
      </View>
    );
  }

  const handleDelete = () => {
    Alert.alert(
      'Delete Vehicle',
      `Are you sure you want to delete the ${vehicle.make} ${vehicle.model}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteVehicle(id);
            router.back();
          },
        },
      ]
    );
  };

  const handleShare = () => {
    Alert.alert(
      'Share Vehicle',
      `Sharing ${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})`
    );
  };

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

      {/* Animated Header */}
      <Animated.View style={[styles.header, { paddingTop: insets.top }, headerAnimatedStyle]}>
        <Animated.View style={[styles.headerImage, imageOpacityStyle]}>
          <Image
            source={{ uri: vehicle.imageUrl }}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <View style={styles.imageOverlay} />
        </Animated.View>

        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <ChevronLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <Animated.View style={[styles.compactTitle, compactTitleStyle]}>
            <Text style={styles.compactTitleText} numberOfLines={1}>
              {vehicle.make} {vehicle.model}
            </Text>
          </Animated.View>
          <View style={styles.topBarActions}>
            <Pressable onPress={handleShare} style={styles.topBarBtn}>
              <Share2 size={20} color={colors.textPrimary} />
            </Pressable>
            <Pressable
              onPress={() => router.push(`/vehicle/add?edit=${vehicle.id}`)}
              style={styles.topBarBtn}
            >
              <Edit size={20} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>

        {/* Hero content */}
        <Animated.View style={[styles.heroContent, imageOpacityStyle]}>
          <Text style={styles.heroMake}>{vehicle.make}</Text>
          <Text style={styles.heroModel}>{vehicle.model}</Text>
          <Text style={styles.heroPlate}>{vehicle.plateNumber}</Text>
          <View style={styles.heroMeta}>
            <Text style={styles.heroYear}>{vehicle.year}</Text>
            <View style={styles.heroDot} />
            <Text style={styles.heroBodyType}>{bodyTypeLabels[vehicle.bodyType]}</Text>
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
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: HEADER_MAX_HEIGHT }} />
        <BentoGrid vehicle={vehicle} />

        {/* Action Bar */}
        <View style={styles.actionBar}>
          <Button
            title="Edit"
            onPress={() => router.push(`/vehicle/add?edit=${vehicle.id}`)}
            variant="secondary"
            size="lg"
            icon={<Edit size={16} color={colors.primary} />}
            style={{ flex: 1, marginRight: spacing.md }}
          />
          <Button
            title="Delete"
            onPress={handleDelete}
            variant="danger"
            size="lg"
            icon={<Trash2 size={16} color="#FFF" />}
            style={{ flex: 1 }}
          />
        </View>
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
    backgroundColor: 'rgba(13, 15, 20, 0.4)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    height: layout.headerHeight,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(13, 15, 20, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  compactTitle: {
    flex: 1,
    alignItems: 'center',
  },
  compactTitleText: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  topBarActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  topBarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(13, 15, 20, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
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
  },
  heroModel: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 28,
  },
  heroPlate: {
    fontFamily: 'JetBrains Mono',
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 2,
    marginTop: spacing.xs,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  heroYear: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  heroDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: spacing.sm,
  },
  heroBodyType: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  heroColor: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  scrollContent: {
    paddingBottom: spacing['3xl'],
  },
  actionBar: {
    flexDirection: 'row',
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
});
