import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, borderRadius, spacing } from '@/constants/theme';
import { Pressable } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  hoverable?: boolean;
}

export function Card({ children, style, onPress, hoverable = false }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          style,
          pressed && hoverable && styles.cardPressed,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardPressed: {
    backgroundColor: colors.cardHover,
    transform: [{ scale: 0.98 }],
  },
});
