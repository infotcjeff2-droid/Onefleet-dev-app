import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Image, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { ChevronRight, Globe, Check, Database, Type, Users, RefreshCw, Video, Gauge, Trash2 } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { useThemeStore, defaultColors } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { spacing, typography, borderRadius } from '@/constants/theme';
import { useVehicleStore } from '@/store/vehicleStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { hasSupabaseEnv, supabaseSetupSql } from '@/utils/fleetSync';
import { useFontScale, FontScale } from '@/contexts/FontScaleContext';
import { useVideoStreamStore, formatBytes, formatDuration, DEFAULT_STREAM_SETTINGS } from '@/store/videoStreamStore';

type Locale = 'zh-TW' | 'en';

const LANGUAGES: { locale: Locale; label: string; native: string }[] = [
  { locale: 'zh-TW', label: '繁體中文', native: 'Chinese (Traditional)' },
  { locale: 'en', label: 'English', native: 'English' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const { locale, setLocale } = useTranslation();
  const { fontScale, setFontScale } = useFontScale();
  const vehicleCount = useVehicleStore((s) => s.vehicles.length);
  const deliveryCount = useDeliveryStore((s) => s.deliveries.length);
  const vehicleSyncError = useVehicleStore((s) => s.syncError);
  const deliverySyncError = useDeliveryStore((s) => s.syncError);
  const vehicleSyncing = useVehicleStore((s) => s.isSyncing);
  const deliverySyncing = useDeliveryStore((s) => s.isSyncing);
  const users = useUserManagementStore((s) => s.users);
  const userSyncError = useUserManagementStore((s) => s.syncError);
  const userSyncing = useUserManagementStore((s) => s.isSyncing);
  const syncUsers = useUserManagementStore((s) => s.syncUsers);

  const [syncingUsers, setSyncingUsers] = useState(false);

  // 視頻流量設定
  const videoStreamStore = useVideoStreamStore();
  const { settings, vehicleUsage, updateSettings, resetAllUsage } = videoStreamStore;

  const FONT_SCALES: { scale: FontScale; label: string; labelEn: string }[] = [
    { scale: 'normal', label: '標準', labelEn: 'Normal' },
    { scale: 'large', label: '放大', labelEn: 'Large' },
    { scale: 'larger', label: '更大', labelEn: 'Larger' },
  ];

  // 流量限制選項（GB）
  const DATA_LIMIT_OPTIONS = [
    { value: 1 * 1024 * 1024 * 1024, label: '1 GB' },
    { value: 2 * 1024 * 1024 * 1024, label: '2 GB' },
    { value: 3 * 1024 * 1024 * 1024, label: '3 GB' },
    { value: 5 * 1024 * 1024 * 1024, label: '5 GB' },
    { value: 10 * 1024 * 1024 * 1024, label: '10 GB' },
  ];

  // 時長限制選項（分鐘）
  const DURATION_OPTIONS = [
    { value: 60, label: '1 分鐘' },
    { value: 2 * 60, label: '2 分鐘' },
    { value: 3 * 60, label: '3 分鐘' },
    { value: 5 * 60, label: '5 分鐘' },
    { value: 10 * 60, label: '10 分鐘' },
  ];

  const handleCopySql = async () => {
    await Clipboard.setStringAsync(supabaseSetupSql);
    Alert.alert(
      locale === 'zh-TW' ? '已複製 SQL' : 'SQL copied',
      locale === 'zh-TW'
        ? '請到 Supabase SQL Editor 貼上執行，建立或更新同步資料表。'
        : 'Paste it into the Supabase SQL Editor to create or update the sync table.'
    );
  };

  const handleSyncUsers = async () => {
    if (!hasSupabaseEnv) {
      Alert.alert(
        locale === 'zh-TW' ? '無法同步' : 'Cannot sync',
        locale === 'zh-TW' ? '請先設定 Supabase 環境變數' : 'Please configure Supabase environment variables first'
      );
      return;
    }

    setSyncingUsers(true);
    try {
      await syncUsers();
      Alert.alert(
        locale === 'zh-TW' ? '同步完成' : 'Sync completed',
        locale === 'zh-TW'
          ? `已同步 ${users.length} 個使用者到 user_profile 表`
          : `Synced ${users.length} users to user_profile table`
      );
    } catch (err) {
      Alert.alert(
        locale === 'zh-TW' ? '同步失敗' : 'Sync failed',
        err instanceof Error ? err.message : (locale === 'zh-TW' ? '未知錯誤' : 'Unknown error')
      );
    } finally {
      setSyncingUsers(false);
    }
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
      <Header
        title={locale === 'zh-TW' ? '設定' : 'Settings'}
        showBack
        leftElement={
          <Pressable onPress={() => router.push('/(tabs)')} hitSlop={8}>
            <Image
              source={require('@/assets/onefleet_2560.png')}
              style={{ width: 90, height: 30 }}
              resizeMode="contain"
            />
          </Pressable>
        }
      />

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
            {locale === 'zh-TW' ? '顯示' : 'Display'}
          </Text>
          <Card style={styles.settingsCard}>
            {FONT_SCALES.map((item, i) => (
              <View key={item.scale}>
                <Pressable
                  onPress={() => setFontScale(item.scale)}
                  style={({ pressed }) => [
                    styles.settingItem,
                    { backgroundColor: pressed ? colors.cardHover : 'transparent' },
                  ]}
                >
                  <View style={styles.settingLeft}>
                    <View style={[styles.settingIconWrap, { backgroundColor: `${colors.primary}15` }]}>
                      <Type size={18} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                        {locale === 'zh-TW' ? item.label : item.labelEn}
                      </Text>
                      <Text style={[styles.settingSub, { color: colors.textTertiary }]}>
                        {locale === 'zh-TW' ? '變更介面文字大小' : 'Change interface text size'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.settingRight}>
                    {fontScale === item.scale && <Check size={18} color={colors.primary} />}
                    <ChevronRight size={16} color={colors.textTertiary} />
                  </View>
                </Pressable>
                {i < FONT_SCALES.length - 1 && (
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

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <Pressable
              onPress={handleSyncUsers}
              disabled={syncingUsers || !hasSupabaseEnv}
              style={({ pressed }) => [
                styles.settingItem,
                { backgroundColor: pressed ? colors.cardHover : 'transparent', opacity: (!hasSupabaseEnv ? 0.5 : 1) }
              ]}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIconWrap, { backgroundColor: `${colors.success}15` }]}>
                  <Users size={18} color={colors.success} />
                </View>
                <View>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                    {locale === 'zh-TW' ? '同步使用者到 user_profile' : 'Sync users to user_profile'}
                  </Text>
                  <Text style={[styles.settingSub, { color: colors.textTertiary }]}>
                    {userSyncError
                      ? userSyncError
                      : locale === 'zh-TW'
                        ? `目前有 ${users.length} 個使用者等待同步`
                        : `${users.length} users ready to sync`}
                  </Text>
                </View>
              </View>
              <View style={styles.settingRight}>
                {syncingUsers ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <RefreshCw size={16} color={colors.textTertiary} />
                )}
              </View>
            </Pressable>
          </Card>
        </View>

        {/* 視頻流量限制設定 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {locale === 'zh-TW' ? '視頻流量限制' : 'Video Data Limit'}
          </Text>
          <Card style={styles.settingsCard}>
            {/* 流量上限設定 */}
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIconWrap, { backgroundColor: `${colors.primary}15` }]}>
                  <Database size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                    {locale === 'zh-TW' ? '最大流量限制（每車）' : 'Max Data Limit (per vehicle)'}
                  </Text>
                  <Text style={[styles.settingSub, { color: colors.textTertiary }]}>
                    {formatBytes(settings.maxDataLimit)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.optionGrid}>
              {DATA_LIMIT_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.optionBtn,
                    settings.maxDataLimit === option.value && styles.optionBtnActive,
                  ]}
                  onPress={() => updateSettings({ maxDataLimit: option.value })}
                >
                  <Text
                    style={[
                      styles.optionBtnText,
                      settings.maxDataLimit === option.value && styles.optionBtnTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* 時長上限設定 */}
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIconWrap, { backgroundColor: `${colors.primary}15` }]}>
                  <Gauge size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                    {locale === 'zh-TW' ? '最大播放時長' : 'Max Streaming Duration'}
                  </Text>
                  <Text style={[styles.settingSub, { color: colors.textTertiary }]}>
                    {formatDuration(settings.maxStreamingDuration)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.optionGrid}>
              {DURATION_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.optionBtn,
                    settings.maxStreamingDuration === option.value && styles.optionBtnActive,
                  ]}
                  onPress={() => updateSettings({ maxStreamingDuration: option.value })}
                >
                  <Text
                    style={[
                      styles.optionBtnText,
                      settings.maxStreamingDuration === option.value && styles.optionBtnTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* 流量限制開關 */}
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIconWrap, { backgroundColor: `${colors.warning}15` }]}>
                  <Video size={18} color={colors.warning} />
                </View>
                <View>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                    {locale === 'zh-TW' ? '啟用流量限制' : 'Enable Data Limit'}
                  </Text>
                  <Text style={[styles.settingSub, { color: colors.textTertiary }]}>
                    {locale === 'zh-TW'
                      ? '達到限制後自動斷開播放'
                      : 'Auto disconnect when limit reached'}
                  </Text>
                </View>
              </View>
              <Pressable
                style={[
                  styles.toggle,
                  settings.enableDataLimit && styles.toggleActive,
                ]}
                onPress={() => updateSettings({ enableDataLimit: !settings.enableDataLimit })}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    settings.enableDataLimit && styles.toggleThumbActive,
                  ]}
                />
              </Pressable>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* 重置所有流量統計 */}
            <Pressable
              style={({ pressed }) => [
                styles.settingItem,
                { backgroundColor: pressed ? colors.cardHover : 'transparent' },
              ]}
              onPress={() => {
                Alert.alert(
                  locale === 'zh-TW' ? '確認重置' : 'Confirm Reset',
                  locale === 'zh-TW'
                    ? '確定要重置所有車輛的流量統計嗎？'
                    : 'Are you sure you want to reset all vehicle data usage?',
                  [
                    { text: locale === 'zh-TW' ? '取消' : 'Cancel', style: 'cancel' },
                    {
                      text: locale === 'zh-TW' ? '確認重置' : 'Reset',
                      style: 'destructive',
                      onPress: () => resetAllUsage(),
                    },
                  ]
                );
              }}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIconWrap, { backgroundColor: `${colors.danger}15` }]}>
                  <Trash2 size={18} color={colors.danger} />
                </View>
                <View>
                  <Text style={[styles.settingLabel, { color: colors.danger }]}>
                    {locale === 'zh-TW' ? '重置流量統計' : 'Reset All Data Usage'}
                  </Text>
                  <Text style={[styles.settingSub, { color: colors.textTertiary }]}>
                    {locale === 'zh-TW'
                      ? `已記錄 ${Object.keys(vehicleUsage).length} 輛車的流量`
                      : `${Object.keys(vehicleUsage).length} vehicles tracked`}
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
  // Video stream settings styles
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  optionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: defaultColors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: defaultColors.border,
  },
  optionBtnActive: {
    backgroundColor: defaultColors.primary,
    borderColor: defaultColors.primary,
  },
  optionBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: defaultColors.textSecondary,
  },
  optionBtnTextActive: {
    color: '#FFFFFF',
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: defaultColors.surface,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: defaultColors.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
});
