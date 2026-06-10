import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ChevronRight, Globe, Check, Database } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { spacing, typography } from '@/constants/theme';
import { useVehicleStore } from '@/store/vehicleStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import { hasSupabaseEnv, supabaseSetupSql } from '@/utils/fleetSync';

type Locale = 'zh-TW' | 'en';

const LANGUAGES: { locale: Locale; label: string; native: string }[] = [
  { locale: 'zh-TW', label: '繁體中文', native: 'Chinese (Traditional)' },
  { locale: 'en', label: 'English', native: 'English' },
];

export default function SettingsScreen() {
  const colors = useThemeStore((s) => s.colors);
  const { locale, setLocale } = useTranslation();
  const vehicleCount = useVehicleStore((s) => s.vehicles.length);
  const deliveryCount = useDeliveryStore((s) => s.deliveries.length);
  const vehicleSyncError = useVehicleStore((s) => s.syncError);
  const deliverySyncError = useDeliveryStore((s) => s.syncError);
  const vehicleSyncing = useVehicleStore((s) => s.isSyncing);
  const deliverySyncing = useDeliveryStore((s) => s.isSyncing);

  const handleCopySql = async () => {
    await Clipboard.setStringAsync(supabaseSetupSql);
    Alert.alert(
      locale === 'zh-TW' ? '已複製 SQL' : 'SQL copied',
      locale === 'zh-TW'
        ? '請到 Supabase SQL Editor 貼上執行，建立或更新同步資料表。'
        : 'Paste it into the Supabase SQL Editor to create or update the sync table.'
    );
  };

  const syncStatus = vehicleSyncError || deliverySyncError
    ? locale === 'zh-TW' ? '同步異常' : 'Sync issue'
    : vehicleSyncing || deliverySyncing
      ? locale === 'zh-TW' ? '同步中' : 'Syncing'
      : locale === 'zh-TW' ? '自動同步中' : 'Auto sync enabled';

  const syncDescription = vehicleSyncError || deliverySyncError
    ? (vehicleSyncError ?? deliverySyncError ?? '')
    : locale === 'zh-TW'
      ? `車輛 ${vehicleCount} 筆，派送 ${deliveryCount} 筆，開啟 App 時會自動同步`
      : `${vehicleCount} vehicles and ${deliveryCount} deliveries sync automatically on app start`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <Header title={locale === 'zh-TW' ? '設定' : 'Settings'} showBack />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {locale === 'zh-TW' ? '語言' : 'Language'}
          </Text>
          <Card style={styles.settingsCard}>
            {LANGUAGES.map((lang, i) => (
              <View key={lang.locale}>
                <Pressable
                  onPress={() => setLocale(lang.locale)}
                  style={({ pressed }) => [
                    styles.settingItem,
                    { backgroundColor: pressed ? colors.cardHover : 'transparent' },
                  ]}
                >
                  <View style={styles.settingLeft}>
                    <View style={[styles.settingIconWrap, { backgroundColor: `${colors.primary}15` }]}>
                      <Globe size={18} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                        {lang.label}
                      </Text>
                      <Text style={[styles.settingSub, { color: colors.textTertiary }]}>
                        {lang.native}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.settingRight}>
                    {locale === lang.locale && <Check size={18} color={colors.primary} />}
                    <ChevronRight size={16} color={colors.textTertiary} />
                  </View>
                </Pressable>
                {i < LANGUAGES.length - 1 && (
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                )}
              </View>
            ))}
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {locale === 'zh-TW' ? '雲端同步' : 'Cloud Sync'}
          </Text>
          <Card style={styles.settingsCard}>
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIconWrap, { backgroundColor: `${colors.primary}15` }]}>
                  <Database size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                    {locale === 'zh-TW' ? 'Supabase 狀態' : 'Supabase status'}
                  </Text>
                  <Text style={[styles.settingSub, { color: colors.textTertiary }]}> 
                    {hasSupabaseEnv
                      ? locale === 'zh-TW'
                        ? '已設定 URL 與 Publishable Key'
                        : 'URL and publishable key are configured'
                      : locale === 'zh-TW'
                        ? '尚未完成環境設定'
                        : 'Environment variables are missing'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.settingValue, { color: hasSupabaseEnv ? colors.success : colors.warning }]}>
                {hasSupabaseEnv ? 'Ready' : 'Pending'}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIconWrap, { backgroundColor: `${colors.primary}15` }]}>
                  <Database size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                    {locale === 'zh-TW' ? '同步模式' : 'Sync mode'}
                  </Text>
                  <Text style={[styles.settingSub, { color: colors.textTertiary }]}>
                    {syncDescription}
                  </Text>
                </View>
              </View>
              <Text style={[styles.settingValue, { color: vehicleSyncError || deliverySyncError ? colors.warning : colors.success }]}>
                {syncStatus}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <Pressable
              onPress={handleCopySql}
              style={({ pressed }) => [styles.settingItem, { backgroundColor: pressed ? colors.cardHover : 'transparent' }]}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIconWrap, { backgroundColor: `${colors.primary}15` }]}>
                  <Database size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                    {locale === 'zh-TW' ? '複製建表 SQL' : 'Copy setup SQL'}
                  </Text>
                  <Text style={[styles.settingSub, { color: colors.textTertiary }]}>
                    {locale === 'zh-TW' ? '如欄位結構未建立，請先到 Supabase 執行 SQL' : 'Run the SQL in Supabase if the table schema is not ready'}
                  </Text>
                </View>
              </View>
              <ChevronRight size={16} color={colors.textTertiary} />
            </Pressable>
          </Card>
        </View>

        <View style={styles.spacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  settingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: '500',
  },
  settingSub: {
    fontSize: typography.fontSize.xs,
    marginTop: 1,
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
    marginLeft: spacing.lg + 36 + spacing.md,
  },
  spacer: { height: 80 },
});
