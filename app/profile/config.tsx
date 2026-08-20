import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { useThemeStore } from '@/store/themeStore';
import { useGps808Store } from '@/store/gps808Store';
import { useGoogleMapsStore } from '@/store/googleMapsStore';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/i18n';
import { spacing, typography } from '@/constants/theme';
import { Link2, Map, CheckCircle, XCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function ProfileConfigScreen() {
  const colors = useThemeStore((s) => s.colors);
  const { t } = useTranslation();
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.id === 'u-admin';

  const { isConnected: gpsConnected, isLoading: gpsLoading } = useGps808Store();
  const { isConfigured: mapsConfigured, isLoading: mapsLoading } = useGoogleMapsStore();

  // Admin 已被導向到系統管理的 config 頁，這裡只服務非管理員
  useEffect(() => {
    if (isAdmin) {
      router.replace('/onefleet-system-admin/config');
    }
  }, [isAdmin, router]);

  const renderBadge = (loading: boolean, ok: boolean, okText: string, failText: string) => {
    if (loading) {
      return (
        <View style={[styles.statusBadge, { backgroundColor: `${colors.textTertiary}20` }]}>
          <Text style={[styles.statusBadgeText, { color: colors.textTertiary }]}>...</Text>
        </View>
      );
    }
    return (
      <View style={[styles.statusBadge, { backgroundColor: ok ? `${colors.success}20` : `${colors.textTertiary}20` }]}>
        {ok ? <CheckCircle size={12} color={colors.success} /> : <XCircle size={12} color={colors.textTertiary} />}
        <Text style={[styles.statusBadgeText, { color: ok ? colors.success : colors.textTertiary }]}>
          {ok ? okText : failText}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={t('nav.config')}
        showBack
        leftElement={
          <Image
            source={require('@/assets/onefleet_2560.png')}
            style={{ width: 90, height: 30 }}
            resizeMode="contain"
          />
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* API 整合 - 唯讀狀態卡片 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('config.apiIntegrations')}
          </Text>
          <Card style={styles.card}>
            {/* 808GPS Provider */}
            <View style={[styles.configItem, { borderBottomColor: colors.border }]}>
              <View style={[styles.configIcon, { backgroundColor: `${colors.primary}15` }]}>
                <Link2 size={18} color={colors.primary} />
              </View>
              <View style={styles.configContent}>
                <Text style={[styles.configLabel, { color: colors.textPrimary }]}>808GPS Provider</Text>
                <Text style={[styles.configDesc, { color: colors.textTertiary }]}>console.onefleet.hk</Text>
              </View>
              {renderBadge(gpsLoading, gpsConnected, 'Connected', 'Disconnected')}
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Google Maps API */}
            <View style={styles.configItem}>
              <View style={[styles.configIcon, { backgroundColor: `${colors.secondary}15` }]}>
                <Map size={18} color={colors.secondary} />
              </View>
              <View style={styles.configContent}>
                <Text style={[styles.configLabel, { color: colors.textPrimary }]}>Google Maps API</Text>
                <Text style={[styles.configDesc, { color: colors.textTertiary }]}>maps.googleapis.com</Text>
              </View>
              {renderBadge(mapsLoading, mapsConfigured, 'Configured', 'Not Set')}
            </View>
          </Card>
          <Text style={[styles.readonlyHint, { color: colors.textTertiary }]}>
            {t('config.sharedByAdminHint')}
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
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    marginHorizontal: spacing.lg,
  },
  configItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  configIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  configContent: {
    flex: 1,
  },
  configLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: '500',
  },
  configDesc: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 4,
    marginLeft: spacing.sm,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  readonlyHint: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
    lineHeight: 16,
  },
});
