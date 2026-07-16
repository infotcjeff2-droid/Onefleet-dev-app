import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Image, Linking, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { ChevronRight, Globe, Check, Database, Type, Truck, Link2, Cpu, Warehouse, Package, Zap, RefreshCw, Settings, Shield, LayoutDashboard } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { spacing, typography, colors } from '@/constants/theme';
import { useVehicleStore } from '@/store/vehicleStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import { hasSupabaseEnv, supabaseSetupSql } from '@/utils/fleetSync';
import { useFontScale, FontScale } from '@/contexts/FontScaleContext';

const { themeColors } = require('@/constants/theme');

type Locale = 'zh-TW' | 'en';

const LANGUAGES: { locale: Locale; label: string; native: string }[] = [
  { locale: 'zh-TW', label: '繁體中文', native: 'Chinese (Traditional)' },
  { locale: 'en', label: 'English', native: 'English' },
];

const FONT_SCALES: { scale: FontScale; label: string; labelEn: string }[] = [
  { scale: 'normal', label: '標準', labelEn: 'Normal' },
  { scale: 'large', label: '放大', labelEn: 'Large' },
  { scale: 'larger', label: '更大', labelEn: 'Larger' },
];

export default function OneFleetSystemAdminScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { locale, setLocale, t } = useTranslation();
  const { fontScale, setFontScale } = useFontScale();
  const vehicleCount = useVehicleStore((s) => s.vehicles.length);
  const deliveryCount = useDeliveryStore((s) => s.deliveries.length);
  const vehicleSyncError = useVehicleStore((s) => s.syncError);
  const deliverySyncError = useDeliveryStore((s) => s.syncError);
  const vehicleSyncing = useVehicleStore((s) => s.isSyncing);
  const deliverySyncing = useDeliveryStore((s) => s.isSyncing);

  const [activeTab, setActiveTab] = useState<'preferences' | 'inventory'>('preferences');

  const syncStatus = vehicleSyncError || deliverySyncError
    ? 'error'
    : vehicleSyncing || deliverySyncing
      ? 'syncing'
      : 'idle';

  const handleCopySql = async () => {
    await Clipboard.setStringAsync(supabaseSetupSql);
    Alert.alert(
      locale === 'zh-TW' ? '已複製 SQL' : 'SQL copied',
      locale === 'zh-TW'
        ? '請到 Supabase SQL Editor 貼上執行，建立或更新同步資料表。'
        : 'Paste it into the Supabase SQL Editor to create or update the sync table.'
    );
  };

  const handleOpenSupabase = () => {
    Linking.openURL('https://supabase.com/dashboard');
  };

  const handleOpenFleetSync = () => {
    Linking.openURL('https://fleet-sync.example.com');
  };

  const SyncStatusBadge = () => {
    if (syncStatus === 'syncing') {
      return <Text style={[styles.syncBadge, { color: colors.accentSecondary }]}>⟳ 同步中</Text>;
    }
    if (syncStatus === 'error') {
      return <Text style={[styles.syncBadge, { color: colors.danger }]}>⚠ 錯誤</Text>;
    }
    return <Text style={[styles.syncBadge, { color: colors.accentSecondary }]}>✓ 已連接</Text>;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="OneFleet 系統管理"
        leftElement={
          <Pressable onPress={() => router.push('/')} hitSlop={8}>
            <Image
              source={require('@/assets/onefleet_2560.png')}
              style={{ width: 90, height: 30 }}
              resizeMode="contain"
            />
          </Pressable>
        }
      />

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable
          style={[styles.tab, activeTab === 'preferences' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('preferences')}
        >
          <Settings size={18} color={activeTab === 'preferences' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'preferences' ? colors.primary : colors.textSecondary }]}>
            偏好設定
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'inventory' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('inventory')}
        >
          <LayoutDashboard size={18} color={activeTab === 'inventory' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'inventory' ? colors.primary : colors.textSecondary }]}>
            系統 & 庫存與配送
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'preferences' ? (
          <>
            <Card style={styles.card}>
              <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>🌐 語言</Text>
              {LANGUAGES.map((lang, i) => (
                <View key={lang.locale}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  <Pressable style={styles.settingRow} onPress={() => setLocale(lang.locale)}>
                    <View style={styles.settingLeft}>
                      <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>{lang.label}</Text>
                      <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>{lang.native}</Text>
                    </View>
                    {locale === lang.locale && <Check size={18} color={colors.primary} />}
                  </Pressable>
                </View>
              ))}
            </Card>

            <Card style={styles.card}>
              <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>🔤 字體大小</Text>
              {FONT_SCALES.map((item, i) => (
                <View key={item.scale}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  <Pressable style={styles.settingRow} onPress={() => setFontScale(item.scale)}>
                    <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                      {locale === 'zh-TW' ? item.label : item.labelEn}
                    </Text>
                    {fontScale === item.scale && <Check size={18} color={colors.primary} />}
                  </Pressable>
                </View>
              ))}
            </Card>

            <Card style={styles.card}>
              <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>🖥️ 應用設定</Text>
              <Pressable style={styles.settingRow} onPress={() => router.push('/onefleet-system-admin/settings')}>
                <View style={styles.settingLeft}>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>{t('profile.appSettings')}</Text>
                  <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>Supabase、API、地圖整合</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </Pressable>
            </Card>
          </>
        ) : (
          <>
            <Card style={styles.card}>
              <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>🛠️ 系統管理</Text>
              <Pressable style={styles.settingRow} onPress={() => router.push('/onefleet-system-admin/vehicle-management')}>
                <View style={styles.settingLeft}>
                  <Truck size={18} color={colors.textSecondary} />
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>{t('nav.vehicleManagement')}</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Pressable style={styles.settingRow} onPress={() => router.push('/onefleet-system-admin/pair-device')}>
                <View style={styles.settingLeft}>
                  <Link2 size={18} color={colors.textSecondary} />
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>{t('nav.pairDevice')}</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Pressable style={styles.settingRow} onPress={() => router.push('/onefleet-system-admin/config')}>
                <View style={styles.settingLeft}>
                  <Cpu size={18} color={colors.textSecondary} />
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>{t('nav.config')}</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Pressable style={styles.settingRow} onPress={() => router.push('/onefleet-system-admin/trash')}>
                <View style={styles.settingLeft}>
                  <Text style={{ fontSize: 16 }}>🗑️</Text>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>垃圾桶</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </Pressable>
            </Card>

            <Card style={styles.card}>
              <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>📦 庫存與配送</Text>
              <Pressable style={styles.settingRow} onPress={() => router.push('/onefleet-system-admin/warehouse')}>
                <View style={styles.settingLeft}>
                  <Warehouse size={18} color="#F59E0B" />
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>倉庫管理</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Pressable style={styles.settingRow} onPress={() => router.push('/onefleet-system-admin/inventory')}>
                <View style={styles.settingLeft}>
                  <Package size={18} color="#8B5CF6" />
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>庫存物品管理</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Pressable style={styles.settingRow} onPress={() => router.push('/onefleet-system-admin/fleet')}>
                <View style={styles.settingLeft}>
                  <Truck size={18} color="#3B82F6" />
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>車隊管理</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Pressable style={styles.settingRow} onPress={() => router.push('/onefleet-system-admin/dispatch')}>
                <View style={styles.settingLeft}>
                  <Zap size={18} color="#22C55E" />
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>智能配送調度</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Pressable style={styles.settingRow} onPress={() => router.push('/onefleet-system-admin/replenishment')}>
                <View style={styles.settingLeft}>
                  <RefreshCw size={18} color="#EF4444" />
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>補貨訂單管理</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} />
              </Pressable>
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: 100 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  tabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  card: { marginBottom: spacing.lg, padding: spacing.lg },
  sectionHeader: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  settingLabel: {
    fontSize: typography.fontSize.base,
  },
  settingDesc: {
    fontSize: typography.fontSize.sm,
  },
  divider: { height: 1, marginVertical: spacing.xs },
  syncBadge: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
});
