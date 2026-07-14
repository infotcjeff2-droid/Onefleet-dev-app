import { Pressable, Text, View, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { colors, borderRadius, spacing, animation } from '@/constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

const variantStyles = {
  primary: {
    bg: colors.primary,
    bgPressed: colors.primaryDark,
    text: '#FFFFFF',
    border: 'transparent',
  },
  secondary: {
    bg: 'transparent',
    bgPressed: 'rgba(0, 168, 122, 0.1)',
    text: colors.primary,
    border: colors.primary,
  },
  ghost: {
    bg: 'transparent',
    bgPressed: 'rgba(0, 0, 0, 0.05)',
    text: colors.textPrimary,
    border: 'transparent',
  },
  danger: {
    bg: colors.danger,
    bgPressed: '#B83540',
    text: '#FFFFFF',
    border: 'transparent',
  },
};

const sizeStyles = {
  sm: { height: 36, paddingH: spacing.md, fontSize: 13 },
  md: { height: 48, paddingH: spacing.xl, fontSize: 15 },
  lg: { height: 56, paddingH: spacing['2xl'], fontSize: 17 },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  style,
}: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];

  const handlePress = () => {
    if (!disabled && !loading && onPress) {
      onPress();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? v.bgPressed : v.bg,
          borderColor: v.border,
          height: s.height,
          paddingHorizontal: s.paddingH,
          opacity: disabled ? 0.5 : 1,
          width: fullWidth ? '100%' : undefined,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
        style,
      ]}
    >
      <View style={styles.inner}>
        {loading ? (
          <ActivityIndicator size="small" color={v.text} />
        ) : (
          <>
            {icon && <View style={styles.icon}>{icon}</View>}
            <Text style={[styles.text, { color: v.text, fontSize: s.fontSize }]}>
              {title}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: spacing.sm,
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
