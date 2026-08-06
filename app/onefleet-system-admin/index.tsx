import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Image, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { ChevronRight, Truck, Link2, Cpu, Warehouse, Package, Zap, RefreshCw, Settings, Shield, LayoutDashboard } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { spacing, typography } from '@/constants/theme';
import { useVehicleStore } from '@/store/vehicleStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import { supabaseSetupSql } from '@/utils/fleetSync';

export default function OneFleetSystemAdminScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { locale, t } = useTranslation();
  const vehicleSyncError = useVehicleStore((s) => s.syncError);
  const deliverySyncError = useDeliveryStore((s) => s.syncError);
  const vehicleSyncing = useVehicleStore((s) => s.isSyncing);
  const deliverySyncing = useDeliveryStore((s) => s.isSyncing);

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

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 應用設定 - 連結到偏好設定頁面 */}
        <Card style={styles.card}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>⚙️ 應用設定</Text>
          <Pressable style={styles.settingRow} onPress={() => router.push('/profile/preferences')}>
            <View style={styles.settingLeft}>
              <Settings size={18} color={colors.primary} />
              <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>偏好設定</Text>
              <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>語言、字體大小</Text>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} />
          </Pressable>
        </Card>

        {/* 系統管理 */}
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
          <Pressable style={styles.settingRow} onPress={() => router.push('/onefleet-system-admin/user-management')}>
            <View style={styles.settingLeft}>
              <Text style={{ fontSize: 16 }}>👤</Text>
              <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>使用者管理</Text>
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

        {/* 庫存與配送 */}
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

        {/* 客戶資訊 */}
        <Card style={styles.card}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>👥 客戶資訊</Text>
          <Pressable style={styles.settingRow} onPress={() => router.push('/onefleet-system-admin/customer-management')}>
            <View style={styles.settingLeft}>
              <Text style={{ fontSize: 18 }}>👥</Text>
              <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>客戶管理</Text>
              <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>新增、編輯、刪除客戶資料</Text>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} />
          </Pressable>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: 100 },
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
    marginLeft: spacing.xs,
  },
  divider: { height: 1, marginVertical: spacing.xs },
  syncBadge: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
});
