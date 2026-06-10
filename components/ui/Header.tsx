import { View, Text, StyleSheet, Pressable } from 'react-native';
import { X } from 'lucide-react-native';
import { colors, borderRadius, spacing, typography, layout } from '@/constants/theme';
import { useRouter } from 'expo-router';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
  transparent?: boolean;
}

export function Header({ title, showBack = false, rightAction, transparent = false }: HeaderProps) {
  const router = useRouter();

  return (
    <View
      style={[
        styles.header,
        transparent && styles.headerTransparent,
      ]}
    >
      <View style={styles.leftSection}>
        {showBack && (
          <Pressable
            onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
            style={styles.backButton}
            hitSlop={12}
          >
            <View style={styles.backArrow}>
              <Text style={styles.backArrowText}>{'<'}</Text>
            </View>
          </Pressable>
        )}
      </View>

      <Text style={[styles.title, transparent && styles.titleTransparent]} numberOfLines={1}>
        {title}
      </Text>

      <View style={styles.rightSection}>{rightAction}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTransparent: {
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  leftSection: {
    width: 48,
    alignItems: 'flex-start',
  },
  backButton: {
    padding: spacing.sm,
    marginLeft: -spacing.sm,
  },
  backArrow: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  backArrowText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  titleTransparent: {
    color: colors.textPrimary,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  rightSection: {
    width: 48,
    alignItems: 'flex-end',
  },
});
