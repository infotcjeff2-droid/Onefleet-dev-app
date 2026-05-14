import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, borderRadius, spacing } from '@/constants/theme';

interface SkeletonCardProps {
  style?: object;
}

export function SkeletonCard({ style }: SkeletonCardProps) {
  const shimmerX = useSharedValue(-200);

  useEffect(() => {
    shimmerX.value = withRepeat(
      withTiming(200, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }, { skewX: '-20deg' }],
  }));

  return (
    <View style={[styles.card, style]}>
      <View style={styles.imagePlaceholder}>
        <Animated.View style={[styles.shimmerOverlay, shimmerStyle]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shimmerGradient}
          />
        </Animated.View>
      </View>
      <View style={styles.content}>
        <View style={[styles.line, styles.titleLine]} />
        <View style={[styles.line, styles.subLine]} />
        <View style={styles.row}>
          <View style={[styles.tag, styles.tag1]} />
          <View style={[styles.tag, styles.tag2]} />
        </View>
      </View>
    </View>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} style={{ marginBottom: spacing.lg }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  imagePlaceholder: {
    height: 160,
    backgroundColor: colors.surface,
    position: 'relative',
    overflow: 'hidden',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  shimmerGradient: {
    width: '50%',
    height: '100%',
  },
  content: {
    padding: spacing.lg,
  },
  line: {
    height: 16,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  titleLine: {
    width: '60%',
  },
  subLine: {
    width: '40%',
    height: 14,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tag: {
    height: 24,
    width: 64,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
  },
  tag1: {
    width: 56,
  },
  tag2: {
    width: 80,
  },
  list: {
    padding: spacing.lg,
  },
});
