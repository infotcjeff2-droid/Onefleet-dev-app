import { View, Text, StyleSheet, Pressable, SafeAreaView, StatusBar } from 'react-native';
import { colors, borderRadius, spacing, typography, layout } from '@/constants/theme';
import { useRouter } from 'expo-router';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  leftElement?: React.ReactNode;
  rightAction?: React.ReactNode;
  transparent?: boolean;
}

export function Header({ title, showBack = false, leftElement, rightAction, transparent = false }: HeaderProps) {
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.safeArea, transparent && styles.safeAreaTransparent]}>
      <StatusBar barStyle="dark-content" backgroundColor={transparent ? 'transparent' : colors.background} />
      <View style={[styles.headerBorder, transparent && styles.headerBorderTransparent]}>
        <View style={styles.header}>
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

          {leftElement ? (
            <>
              <View style={styles.logoTitleContainer}>
                <View style={styles.logoWrap}>{leftElement}</View>
                <View style={styles.titleSpacer} />
              </View>
              <View style={styles.titleOverlay} pointerEvents="none">
                <Text style={[styles.title, transparent && styles.titleTransparent]} numberOfLines={1}>
                  {title}
                </Text>
              </View>
            </>
          ) : (
            <Text style={[styles.title, transparent && styles.titleTransparent]} numberOfLines={1}>
              {title}
            </Text>
          )}

          <View style={styles.rightSection}>{rightAction}</View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
  },
  safeAreaTransparent: {
    backgroundColor: 'transparent',
  },
  headerBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  headerBorderTransparent: {
    borderBottomWidth: 0,
    backgroundColor: 'transparent',
  },
  header: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  leftSection: {
    alignItems: 'flex-start',
    justifyContent: 'center',
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
  logoTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoWrap: {
    marginRight: spacing.sm,
  },
  titleSpacer: {
    width: 0,
    flex: 1,
  },
  titleOverlay: {
    position: 'absolute',
    top: 0,
    left: spacing.lg,
    right: spacing.lg,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
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
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
