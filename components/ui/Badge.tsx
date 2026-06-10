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
  active: { bg: 'rgba(0, 168, 122, 0.12)', text: '#00A87A', dot: '#00A87A' },
  maintenance: { bg: 'rgba(230, 149, 0, 0.12)', text: '#E69500', dot: '#E69500' },
  inactive: { bg: 'rgba(90, 97, 120, 0.12)', text: '#5A6178', dot: '#5A6178' },
  info: { bg: 'rgba(43, 127, 212, 0.12)', text: '#2B7FD4', dot: '#2B7FD4' },
  warning: { bg: 'rgba(230, 149, 0, 0.12)', text: '#E69500', dot: '#E69500' },
  danger: { bg: 'rgba(217, 63, 74, 0.12)', text: '#D93F4A', dot: '#D93F4A' },
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
