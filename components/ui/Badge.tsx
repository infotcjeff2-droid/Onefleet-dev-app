import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { colors, borderRadius, spacing, typography, statusColors } from '@/constants/theme';

type BadgeVariant = 'active' | 'maintenance' | 'inactive' | 'info' | 'warning' | 'danger';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
  style?: ViewStyle;
  delay?: number;
}

const variantMap: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  active: { bg: 'rgba(0, 200, 150, 0.28)', text: '#00F0BC', dot: '#00F0BC' },
  maintenance: { bg: 'rgba(255, 181, 71, 0.32)', text: '#FFCC77', dot: '#FFCC77' },
  inactive: { bg: 'rgba(90, 97, 120, 0.32)', text: '#B0B7CC', dot: '#B0B7CC' },
  info: { bg: 'rgba(59, 158, 255, 0.28)', text: '#70BAFF', dot: '#70BAFF' },
  warning: { bg: 'rgba(255, 181, 71, 0.32)', text: '#FFCC77', dot: '#FFCC77' },
  danger: { bg: 'rgba(255, 71, 87, 0.32)', text: '#FF7A8A', dot: '#FF7A8A' },
};

export function Badge({ label, variant = 'active', size = 'sm', dot = false, style, delay = 0 }: BadgeProps) {
  const v = variantMap[variant];
  const isSmall = size === 'sm';

  const scale = useSharedValue(0.7);
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    const targetScale = 1;
    const targetOpacity = 1;
    scale.value = withDelay(delay, withSpring(targetScale, { damping: 12, stiffness: 180 }));
    opacity.value = withDelay(delay, withSpring(targetOpacity, { damping: 14, stiffness: 160 }));
  }, [delay]);

  return (
    <Animated.View
      style={[
        styles.badge,
        { backgroundColor: v.bg },
        isSmall ? styles.badgeSmall : styles.badgeMd,
        animatedStyle,
        style,
      ]}
    >
      {dot && (
        <View
          style={[
            styles.dot,
            { backgroundColor: v.dot },
          ]}
        />
      )}
      <Text
        style={[
          styles.text,
          { color: v.text },
          isSmall ? styles.textSmall : styles.textMd,
        ]}
      >
        {label}
      </Text>
      </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  badgeSmall: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  badgeMd: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs + 2,
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  textSmall: {
    fontSize: typography.fontSize.xs,
  },
  textMd: {
    fontSize: typography.fontSize.sm,
  },
});
