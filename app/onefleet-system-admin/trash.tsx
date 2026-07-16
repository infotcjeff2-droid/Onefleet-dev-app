import { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
  Platform,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  X,
  User,
  Truck,
  Users,
  Package,
  ChevronRight,
} from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/i18n';
import {
  useTrashStore,
  TrashItem,
  TrashEntityKind,
  formatTimeLeft,
  TRASH_RETENTION_DAYS,
} from '@/store/trashStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useDriverStore } from '@/store/driverStore';
import { spacing, typography, borderRadius } from '@/constants/theme';

const isWeb = Platform.OS === 'web';

const KIND_META: Record<
  TrashEntityKind,
  { label: string; icon: (color: string) => React.ReactNode; accent: string }
> = {
  user: { label: '使用者', icon: (c) => <User size={16} color={c} />, accent: '#3B82F6' },
  driver: { label: '司機', icon: (c) => <Truck size={16} color={c} />, accent: '#22C55E' },
  vehicle: { label: '車輛', icon: (c) => <Truck size={16} color={c} />, accent: '#F59E0B' },
  delivery: { label: '派送單', icon: (c) => <Package size={16} color={c} />, accent: '#8B5CF6' },
};

export default function TrashScreen() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const role = useAuthStore((s) => s.role);
  const currentUser = useAuthStore((s) => s.user);
  const { t } = useTranslation();

  const items = useTrashStore((s) => s.items);
  const loadTrash = useTrashStore((s) => s.loadTrash);
  const cleanupExpired = useTrashStore((s) => s.cleanupExpired);
  const removeFromTrash = useTrashStore((s) => s.removeFromTrash);
  const clearAll = useTrashStore((s) => s.clearAll);

  const restoreUser = useUserManagementStore((s) => s.addUser);
  const addDriver = useDriverStore((s) => s.addDriver);

  const [filter, setFilter] = useState<TrashEntityKind | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTrash().then(() => cleanupExpired());
  }, [loadTrash, cleanupExpired]);

  // 權限保護：只有 admin 可進入
  if (role !== 'admin') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="垃圾桶" showBack />
        <View style={styles.noAccessWrap}>
          <AlertTriangle size={48} color={colors.warning} />
          <Text style={[styles.noAccessTitle, { color: colors.textPrimary }]}>
            權限不足
          </Text>
          <Text style={[styles.noAccessSub, { color: colors.textTertiary }]}>
            此頁面僅限管理員（admin）查看。
          </Text>
          <Button title="返回" onPress={() => router.back()} variant="ghost" />
        </View>
      </View>
    );
  }

  const activeItems = useMemo(() => {
    const now = Date.now();
    return items
      .filter((it) => it.expiresAt > now)
      .filter((it) => filter === 'all' || it.kind === filter)
      .sort((a, b) => b.deletedAt - a.deletedAt);
  }, [items, filter]);

  const counts = useMemo(() => {
    const now = Date.now();
    const active = items.filter((it) => it.expiresAt > now);
    return {
      all: active.length,
      user: active.filter((it) => it.kind === 'user').length,
      driver: active.filter((it) => it.kind === 'driver').length,
      vehicle: active.filter((it) => it.kind === 'vehicle').length,
      delivery: active.filter((it) => it.kind === 'delivery').length,
    };
  }, [items]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadTrash();
      await cleanupExpired();
    } finally {
      setRefreshing(false);
    }
  };

  const confirmAndRun = (title: string, message: string, action: () => Promise<void> | void) => {
    if (isWeb) {
      if (window.confirm(`${title}\n\n${message}`)) {
        void action();
      }
      return;
    }
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      { text: '確定', style: 'destructive', onPress: () => void action() },
    ]);
  };

  const handleRestore = async (item: TrashItem) => {
    confirmAndRun(
      '還原資料',
      `確定要還原「${String(item.payload.name ?? item.payload.email ?? item.originalId)}」嗎？`,
      async () => {
        try {
          if (item.kind === 'user') {
            const u = item.payload as Record<string, unknown>;
            await restoreUser(
              String(u.name ?? ''),
              String(u.email ?? ''),
              String(u.password ?? '1234'),
              (u.role as 'driver' | 'company') ?? 'driver',
              u.phone as string | undefined,
              u.avatar as string | undefined
            );
          } else if (item.kind === 'driver') {
            const d = item.payload as Record<string, unknown>;
            await addDriver(
              String(d.name ?? ''),
              String(d.phone ?? ''),
              String(d.email ?? ''),
              d.vehiclePlate as string | undefined,
              d.avatar as string | undefined
            );
          }
          await removeFromTrash(item.trashId);
          Alert.alert('✅ 已還原', '資料已成功還原');
        } catch (e) {
          Alert.alert('❌ 還原失敗', e instanceof Error ? e.message : '未知錯誤');
        }
      }
    );
  };

  const handlePermanentDelete = async (item: TrashItem) => {
    confirmAndRun(
      '永久刪除',
      `⚠️ 此操作無法復原！\n\n確定要永久刪除「${String(item.payload.name ?? item.payload.email ?? item.originalId)}」嗎？`,
      async () => {
        await removeFromTrash(item.trashId);
        Alert.alert('✅ 已永久刪除', '該項目已從垃圾桶永久移除');
      }
    );
  };

  const handleClearAll = () => {
    if (items.length === 0) {
      Alert.alert('垃圾桶是空的', '目前沒有任何項目可清除');
      return;
    }
    confirmAndRun(
      '清空垃圾桶',
      `⚠️ 警告：這會永久刪除垃圾桶內全部 ${items.length} 項資料，且無法復原！`,
      async () => {
        await clearAll();
        Alert.alert('✅ 已清空', '垃圾桶已全部清除');
      }
    );
  };

  const formatDeletedAt = (ts: number) => {
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="🗑️ 垃圾桶" showBack />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 說明卡片 */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: `${colors.warning}20` }]}>
                <AlertTriangle size={18} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>
                  軟刪除機制
                </Text>
                <Text style={[styles.infoSub, { color: colors.textTertiary }]}>
                  任何資料刪除後會先移到這裡，{TRASH_RETENTION_DAYS} 天後自動永久清除。在這之前您可以隨時還原。
                </Text>
              </View>
            </View>
          </Card>
        </Animated.View>

        {/* 篩選器 */}
        <View style={styles.filterRow}>
          {(
            [
              { key: 'all', label: '全部', count: counts.all },
              { key: 'user', label: '使用者', count: counts.user },
              { key: 'driver', label: '司機', count: counts.driver },
              { key: 'vehicle', label: '車輛', count: counts.vehicle },
              { key: 'delivery', label: '派送單', count: counts.delivery },
            ] as { key: TrashEntityKind | 'all'; label: string; count: number }[]
          ).map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={({ pressed }) => [
                  styles.filterChip,
                  {
                    backgroundColor: active
                      ? colors.primary
                      : pressed
                        ? colors.cardHover
                        : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: active ? '#FFFFFF' : colors.textPrimary },
                  ]}
                >
                  {f.label}
                </Text>
                <View
                  style={[
                    styles.filterCount,
                    { backgroundColor: active ? 'rgba(255,255,255,0.25)' : `${colors.primary}20` },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterCountText,
                      { color: active ? '#FFFFFF' : colors.primary },
                    ]}
                  >
                    {f.count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* 列表 */}
        {activeItems.length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={[styles.emptyIcon, { backgroundColor: `${colors.success}20` }]}>
              <Trash2 size={32} color={colors.success} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              垃圾桶是空的
            </Text>
            <Text style={[styles.emptySub, { color: colors.textTertiary }]}>
              {items.length === 0
                ? '目前沒有任何被刪除的資料'
                : '目前篩選條件下沒有資料，試著切換其他類型'}
            </Text>
          </Card>
        ) : (
          <Animated.View entering={FadeInDown.delay(100).duration(300)}>
            <Card style={styles.listCard}>
              {activeItems.map((item, idx) => {
                const meta = KIND_META[item.kind];
                const displayName =
                  String(item.payload.name ?? '') ||
                  String(item.payload.email ?? '') ||
                  String(item.payload.id ?? item.originalId);
                return (
                  <View key={item.trashId}>
                    <View style={styles.trashItem}>
                      <View
                        style={[
                          styles.trashKindIcon,
                          { backgroundColor: `${meta.accent}20` },
                        ]}
                      >
                        {meta.icon(meta.accent)}
                      </View>
                      <View style={styles.trashInfo}>
                        <View style={styles.trashNameRow}>
                          <Text style={[styles.trashName, { color: colors.textPrimary }]} numberOfLines={1}>
                            {displayName}
                          </Text>
                          <View style={[styles.kindTag, { backgroundColor: `${meta.accent}20`, borderColor: `${meta.accent}40` }]}>
                            <Text style={[styles.kindTagText, { color: meta.accent }]}>
                              {meta.label}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.trashMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                          {item.payload.email ? `${String(item.payload.email)} · ` : ''}
                          刪除於 {formatDeletedAt(item.deletedAt)}
                        </Text>
                        <Text style={[styles.trashExpiry, { color: colors.warning }]}>
                          ⏰ {formatTimeLeft(item.expiresAt)}
                        </Text>
                      </View>
                      <View style={styles.trashActions}>
                        <Pressable
                          onPress={() => handleRestore(item)}
                          style={({ pressed }) => [
                            styles.actionBtn,
                            {
                              backgroundColor: pressed ? `${colors.success}30` : `${colors.success}15`,
                              borderColor: `${colors.success}40`,
                            },
                          ]}
                          hitSlop={8}
                        >
                          <RotateCcw size={14} color={colors.success} />
                          <Text style={[styles.actionBtnText, { color: colors.success }]}>
                            還原
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handlePermanentDelete(item)}
                          style={({ pressed }) => [
                            styles.actionBtn,
                            {
                              backgroundColor: pressed ? `${colors.danger}30` : `${colors.danger}15`,
                              borderColor: `${colors.danger}40`,
                            },
                          ]}
                          hitSlop={8}
                        >
                          <X size={14} color={colors.danger} />
                          <Text style={[styles.actionBtnText, { color: colors.danger }]}>
                            永久刪除
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                    {idx < activeItems.length - 1 && (
                      <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    )}
                  </View>
                );
              })}
            </Card>
          </Animated.View>
        )}

        {/* 底部操作區 */}
        <View style={styles.bottomActions}>
          <Button
            title="🔄 重新整理"
            variant="ghost"
            onPress={handleRefresh}
            loading={refreshing}
            style={{ flex: 1 }}
          />
          <Button
            title="🗑️ 清空垃圾桶"
            variant="ghost"
            onPress={handleClearAll}
            disabled={items.length === 0}
            style={{ flex: 1 }}
          />
        </View>

        <View style={styles.spacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 80 },
  noAccessWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  noAccessTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
  },
  noAccessSub: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
  },
  infoCard: {
    margin: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    marginBottom: 4,
  },
  infoSub: {
    fontSize: typography.fontSize.xs,
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
  },
  filterCount: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
    minWidth: 20,
    alignItems: 'center',
  },
  filterCountText: {
    fontSize: 10,
    fontWeight: '700',
  },
  emptyCard: {
    marginHorizontal: spacing.lg,
    padding: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
  },
  listCard: {
    marginHorizontal: spacing.lg,
    padding: 0,
    overflow: 'hidden',
  },
  trashItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  trashKindIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashInfo: {
    flex: 1,
    gap: 4,
  },
  trashNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  trashName: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    flexShrink: 1,
  },
  kindTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  kindTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  trashMeta: {
    fontSize: typography.fontSize.xs,
  },
  trashExpiry: {
    fontSize: 11,
    fontWeight: '600',
  },
  trashActions: {
    flexDirection: 'column',
    gap: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginLeft: spacing.lg + 36 + spacing.md,
  },
  bottomActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  spacer: { height: 40 },
});