import { View, Text, Pressable, Image, StyleSheet, Platform, ScrollView } from 'react-native';
import { LayoutDashboard, Car, ClipboardList, User, LogOut, Settings as SettingsIcon, Activity } from 'lucide-react-native';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { colors, spacing, borderRadius, typography } from '@/constants/theme';

type SidebarItem = {
  key: string;
  labelKey: string;
  icon: React.ReactNode;
  href: string;
};

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { user, role, logout } = useAuthStore();

  const items: SidebarItem[] = [
    { key: 'index', labelKey: 'nav.dashboard', icon: <LayoutDashboard size={20} color={colors.textSecondary} />, href: '/(tabs)' },
    { key: 'vehicle', labelKey: 'nav.vehicles', icon: <Car size={20} color={colors.textSecondary} />, href: '/(tabs)/vehicle' },
    { key: 'delivery', labelKey: 'nav.delivery', icon: <ClipboardList size={20} color={colors.textSecondary} />, href: '/(tabs)/delivery' },
    { key: 'profile', labelKey: 'nav.profile', icon: <User size={20} color={colors.textSecondary} />, href: '/(tabs)/onefleet-system-admin' },
  ];

  const isActive = (href: string) => {
    const norm = (s: string) => s.replace(/\/\(\w+\)\//g, '/').replace(/\/+/g, '/');
    return norm(pathname).startsWith(norm(href));
  };

  const roleLabel: Record<string, string> = {
    admin: 'Administrator',
    company: 'Company',
    driver: 'Driver',
    user: 'Demo',
  };

  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <Image source={require('@/assets/images/onefleet_logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brandText}>FleetPro</Text>
      </View>

      <View style={styles.userCard}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>{(user?.name || '?').slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.userName} numberOfLines={1}>{user?.name || 'Guest'}</Text>
          <Text style={styles.userRole} numberOfLines={1}>{roleLabel[role || 'user'] || 'User'}</Text>
        </View>
      </View>

      <ScrollView style={styles.navList} contentContainerStyle={styles.navListContent} showsVerticalScrollIndicator={false}>
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.href as never)}
              style={[styles.navItem, active && styles.navItemActive]}
            >
              <View style={[styles.navIconWrap, active && styles.navIconWrapActive]}>
                {item.icon}
              </View>
              <Text style={[styles.navLabel, active && styles.navLabelActive]} numberOfLines={1}>
                {t(item.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={() => router.push('/settings' as never)} style={styles.footerItem}>
          <SettingsIcon size={18} color={colors.textSecondary} />
          <Text style={styles.footerLabel}>{t('nav.settings')}</Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await logout();
            router.replace('/(auth)/login' as never);
          }}
          style={styles.footerItem}
        >
          <LogOut size={18} color={colors.textSecondary} />
          <Text style={styles.footerLabel}>{t('nav.logout')}</Text>
        </Pressable>
        <View style={styles.platformBadge}>
          <Activity size={12} color={colors.textTertiary} />
          <Text style={styles.platformBadgeText}>{Platform.OS === 'web' ? 'Web' : Platform.OS}</Text>
        </View>
      </View>
    </View>
  );
}

const SIDEBAR_WIDTH = 240;

const styles = StyleSheet.create({
  container: {
    width: SIDEBAR_WIDTH,
    flex: 1,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    // @ts-ignore — web-only CSS variable for height
    height: '100vh' as unknown as number,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  logo: { width: 36, height: 36 },
  brandText: { fontSize: typography.fontSize.lg, fontWeight: '800', color: colors.textPrimary },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { color: '#fff', fontSize: typography.fontSize.base, fontWeight: '800' },
  userName: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary },
  userRole: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  navList: { flex: 1 },
  navListContent: { paddingHorizontal: spacing.md, gap: 4 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  navItemActive: { backgroundColor: colors.primaryGlow },
  navIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconWrapActive: { backgroundColor: colors.card },
  navLabel: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  navLabelActive: { color: colors.textPrimary, fontWeight: '700' },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 4,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  footerLabel: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  platformBadgeText: { fontSize: 11, color: colors.textTertiary, fontWeight: '600' },
});

export const SIDEBAR_WIDTH_PX = SIDEBAR_WIDTH;