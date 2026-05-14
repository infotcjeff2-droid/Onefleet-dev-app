import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { LogOut, Shield, Settings, Bell, Moon, ChevronRight, User, Mail, Award, Truck } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { spacing, typography, borderRadius } from '@/constants/theme';
import { Header } from '@/components/ui/Header';

function SettingItem({
  icon,
  label,
  value,
  danger = false,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  const colors = useThemeStore((s) => s.colors);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingItem,
        { backgroundColor: pressed ? colors.cardHover : 'transparent' },
      ]}
    >
      <View style={styles.settingLeft}>
        <View style={styles.settingIcon}>{icon}</View>
        <Text style={[styles.settingLabel, { color: danger ? colors.danger : colors.textPrimary }]}>
          {label}
        </Text>
      </View>
      <View style={styles.settingRight}>
        {value && (
          <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{value}</Text>
        )}
        <ChevronRight size={16} color={colors.textTertiary} />
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const role = useAuthStore((state) => state.role);
  const { colors, isDark } = useThemeStore();

  const roleConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    admin: { label: 'Administrator', color: colors.primary, icon: <Shield size={12} color={colors.primary} /> },
    company: { label: 'Company', color: colors.secondary, icon: <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 10, fontWeight: '700', color: colors.secondary }}>C</Text></View> },
    driver: { label: 'Driver', color: colors.accentSecondary, icon: <Truck size={12} color={colors.accentSecondary} /> },
    user: { label: 'User', color: colors.textSecondary, icon: <User size={12} color={colors.textSecondary} /> },
  };
  const currentRole = role ? roleConfig[role] : roleConfig.user;

  const handleLogout = async () => {
    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Sign Out',
        'Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Sign Out', style: 'destructive', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
    });

    if (confirmed) {
      await logout();
      router.replace('/(auth)/login');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Profile" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <Animated.View entering={FadeInDown.springify()}>
          <Card style={styles.profileCard}>
            <View style={styles.avatarContainer}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarText}>
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </Text>
              </View>
              {currentRole && (
                <View
                  style={[
                    styles.adminBadge,
                    { backgroundColor: colors.card, borderColor: colors.background },
                  ]}
                >
                  {currentRole.icon}
                </View>
              )}
            </View>
            <Text style={[styles.userName, { color: colors.textPrimary }]}>
              {user?.name || 'Guest'}
            </Text>
            <Text style={[styles.userEmail, { color: colors.textSecondary }]}>
              {user?.email || 'No email'}
            </Text>
            {currentRole && (
              <View
                style={[
                  styles.adminTag,
                  { backgroundColor: `${currentRole.color}20`, borderColor: currentRole.color },
                ]}
              >
                <Text style={[styles.adminTagText, { color: currentRole.color }]}>
                  {currentRole.label}
                </Text>
              </View>
            )}
          </Card>
        </Animated.View>

        {/* Account Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Account</Text>
          <Card style={styles.settingsCard}>
            <SettingItem
              icon={<User size={18} color={colors.textSecondary} />}
              label="Display Name"
              value={user?.name || 'N/A'}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingItem
              icon={<Mail size={18} color={colors.textSecondary} />}
              label="Email"
              value={user?.email || 'N/A'}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingItem
              icon={<Award size={18} color={colors.textSecondary} />}
              label="Role"
              value={currentRole.label}
            />
          </Card>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Preferences</Text>
          <Card style={styles.settingsCard}>
            <SettingItem
              icon={<Bell size={18} color={colors.textSecondary} />}
              label="Notifications"
              value="On"
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingItem
              icon={<Moon size={18} color={colors.textSecondary} />}
              label="Dark Mode"
              value={isDark ? 'On' : 'Off'}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingItem
              icon={<Settings size={18} color={colors.textSecondary} />}
              label="App Settings"
            />
          </Card>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Account</Text>
          <Card style={styles.settingsCard}>
            <SettingItem
              icon={<LogOut size={18} color={colors.danger} />}
              label="Sign Out"
              danger
              onPress={handleLogout}
            />
          </Card>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={[styles.appVersion, { color: colors.textTertiary }]}>
            FleetPro v1.0.0
          </Text>
          <Text style={[styles.appCopyright, { color: colors.textTertiary }]}>
            Vehicle Fleet Management
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  profileCard: {
    margin: spacing.lg,
    padding: spacing['2xl'],
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: '700',
    color: '#FFFFFF',
  },
  adminBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  userEmail: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.md,
  },
  adminTag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  adminTagText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  settingsCard: {
    padding: 0,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    marginRight: spacing.md,
  },
  settingLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: '500',
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingValue: {
    fontSize: typography.fontSize.sm,
  },
  divider: {
    height: 1,
    marginLeft: spacing.lg + 18 + spacing.md,
  },
  appInfo: {
    alignItems: 'center',
    marginTop: spacing['3xl'],
    paddingHorizontal: spacing.lg,
  },
  appVersion: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  appCopyright: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
});
