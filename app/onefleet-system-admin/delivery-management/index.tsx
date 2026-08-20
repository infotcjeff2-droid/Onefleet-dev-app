import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useDeliveryStore } from '@/store/deliveryStore';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useTranslation } from '@/i18n';
import { DeliveryOrder, DeliveryStatus } from '@/types';
import {
  FileText,
  X,
  ArrowLeft,
  Search,
  Truck,
  Clock,
  MapPin,
  User,
  ChevronRight,
} from 'lucide-react-native';

const STATUS_COLORS: Record<DeliveryStatus, { bg: string; text: string }> = {
  pending: { bg: '#FEF3C7', text: '#D97706' },
  assigned: { bg: '#DBEAFE', text: '#2563EB' },
  in_transit: { bg: '#E0E7FF', text: '#6366F1' },
  delivered: { bg: '#D1FAE5', text: '#059669' },
  signed: { bg: '#F3E8FF', text: '#9333EA' },
  expired: { bg: '#FEE2E2', text: '#DC2626' },
};

function getEffectiveStatus(delivery: DeliveryOrder): DeliveryStatus {
  if (delivery.status === 'signed' || delivery.signatureData || delivery.signedAt) {
    return 'signed';
  }
  const pickupDate = new Date(delivery.pickupTime);
  const now = new Date();
  if (pickupDate < now && delivery.status === 'pending' && !delivery.assignedDriverId) {
    return 'expired';
  }
  return delivery.status as DeliveryStatus;
}

export default function DeliveryManagement() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { colors } = useThemeStore();
  const { user, role } = useAuthStore();
  const { deliveries, isLoading, isSyncing, loadDeliveries, syncDeliveries } = useDeliveryStore();
  const { loadUsers, getUsersByCompanyId } = useUserManagementStore();
  const managedUsers = useUserManagementStore((state) => state.users);

  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterStatus, setFilterStatus] = useState<DeliveryStatus | 'all'>('all');
  const searchInputRef = useRef<TextInput>(null);

  const isZh = locale === 'zh-TW';
  const isAdmin = role === 'admin';

  // 根據 userId 查詢使用者名稱
  const getCreatorName = (userId: string | undefined) => {
    if (!userId) return null;
    const found = managedUsers.find((u) => u.id === userId);
    return found?.name ?? found?.nameZh ?? found?.email ?? userId;
  };

  // 狀態標籤（使用翻譯）
  const statusLabels: Record<DeliveryStatus, string> = useMemo(() => ({
    pending: t('delivery.pending'),
    assigned: t('delivery.assigned'),
    in_transit: t('delivery.inTransit'),
    delivered: t('delivery.delivered'),
    signed: t('delivery.signed'),
    expired: t('delivery.expired'),
  }), [t]);

  // 計算 company 角色的可見池：本人 + 旗下所有相關 driver 的 userId
  const companyPoolUserIds = useMemo(() => {
    if (!user || user.role !== 'company') return null;
    const pool = new Set<string>([user.id]);
    for (const u of getUsersByCompanyId(user.id)) {
      if (u.id) pool.add(u.id);
    }
    return pool;
  }, [user, managedUsers]);

  // 根據角色過濾可見的配送單
  const visibleDeliveries = useMemo(() => {
    if (role === 'driver' && user) {
      return deliveries.filter((d) =>
        d.assignedDriverId === user.id ||
        (!!user.name && d.assignedDriverName === user.name)
      );
    }
    if (role === 'company' && companyPoolUserIds) {
      return deliveries.filter((d) =>
        !!d.userId && companyPoolUserIds.has(d.userId)
      );
    }
    return deliveries; // admin 看全部
  }, [deliveries, role, user, companyPoolUserIds]);

  // 搜尋過濾
  const filteredDeliveries = useMemo(() => {
    let result = visibleDeliveries;
    const q = searchText.trim().toLowerCase();

    if (q) {
      result = result.filter((d) =>
        d.orderNo?.toLowerCase().includes(q) ||
        d.customerName?.toLowerCase().includes(q) ||
        d.pickupAddress?.toLowerCase().includes(q) ||
        d.dropoffAddress?.toLowerCase().includes(q) ||
        d.assignedDriverName?.toLowerCase().includes(q)
      );
    }

    if (filterStatus !== 'all') {
      result = result.filter((d) => getEffectiveStatus(d) === filterStatus);
    }

    return result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [visibleDeliveries, searchText, filterStatus]);

  useEffect(() => {
    loadUsers();
    loadDeliveries();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncDeliveries();
    setRefreshing(false);
  }, []);

  const handlePressOrder = (order: DeliveryOrder) => {
    router.push(`/delivery/${order.id}`);
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/onefleet-system-admin');
          }}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('delivery.deliveryManagement')}</Text>
        <TouchableOpacity
          onPress={() => setShowFilter(true)}
          style={styles.filterButton}
        >
          <Text style={styles.filterButtonText}>
            {filterStatus === 'all' ? t('delivery.filterAll') : statusLabels[filterStatus]}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBarWrap}>
        <View style={styles.searchBar}>
          <Search size={18} color={colors.textTertiary} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder={t('delivery.searchPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')} hitSlop={8}>
              <X size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {isZh ? '共' : 'Total '}
          <Text style={styles.statsCount}>{filteredDeliveries.length}</Text>
          {isZh ? ' 筆' : ' orders'}
        </Text>
        {isSyncing && (
          <View style={styles.syncingBadge}>
            <Clock size={12} color={colors.primary} />
            <Text style={styles.syncingText}>{isZh ? '同步中' : 'Syncing'}</Text>
          </View>
        )}
      </View>

      {/* Order List */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredDeliveries.length === 0 ? (
          <View style={styles.emptyState}>
            <FileText size={64} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              {isLoading
                ? t('common.loading')
                : searchText.length > 0 || filterStatus !== 'all'
                  ? t('delivery.noResults')
                  : t('delivery.noOrders')}
            </Text>
          </View>
        ) : (
          filteredDeliveries.map((order) => {
            const status = getEffectiveStatus(order);
            const statusStyle = STATUS_COLORS[status];
            return (
              <TouchableOpacity
                key={order.id}
                style={styles.orderCard}
                onPress={() => handlePressOrder(order)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.orderNoWrap}>
                    <FileText size={14} color={colors.primary} />
                    <Text style={styles.orderNo}>{order.orderNo}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusText, { color: statusStyle.text }]}>
                      {statusLabels[status]}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardRow}>
                  <User size={13} color={colors.textSecondary} />
                  <Text style={styles.cardRowText} numberOfLines={1}>
                    {order.customerName}
                  </Text>
                </View>

                <View style={styles.cardRow}>
                  <MapPin size={13} color={colors.textSecondary} />
                  <Text style={styles.cardRowText} numberOfLines={1}>
                    {order.pickupAddress}
                  </Text>
                </View>

                <View style={styles.cardRow}>
                  <MapPin size={13} color={colors.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />
                  <Text style={styles.cardRowText} numberOfLines={1}>
                    {order.dropoffAddress}
                  </Text>
                </View>

                <View style={styles.cardFooter}>
                  <View style={styles.cardFooterLeft}>
                    {order.assignedDriverName && (
                      <View style={styles.driverChip}>
                        <Truck size={11} color={colors.primary} />
                        <Text style={styles.driverChipText}>{order.assignedDriverName}</Text>
                      </View>
                    )}
                    <View style={styles.timeChip}>
                      <Clock size={11} color={colors.textTertiary} />
                      <Text style={styles.timeChipText}>
                        {order.pickupTime
                          ? new Date(order.pickupTime).toLocaleDateString(locale === 'zh-TW' ? 'zh-TW' : 'en-US', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color={colors.textTertiary} />
                </View>

                {isAdmin && order.userId && (
                  <View style={styles.creatorBadge}>
                    <Text style={styles.creatorText}>
                      {isZh ? '建立者: ' : 'By: '}{getCreatorName(order.userId)}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Filter Modal */}
      <Modal visible={showFilter} animationType="fade" transparent onRequestClose={() => setShowFilter(false)}>
        <Pressable style={styles.filterOverlay} onPress={() => setShowFilter(false)}>
          <Pressable style={styles.filterSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.filterSheetHeader}>
              <Text style={styles.filterSheetTitle}>{t('delivery.filterStatus')}</Text>
              <TouchableOpacity onPress={() => setShowFilter(false)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.filterList} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.filterOption, filterStatus === 'all' && styles.filterOptionSelected]}
                onPress={() => { setFilterStatus('all'); setShowFilter(false); }}
              >
                <Text style={[styles.filterOptionText, filterStatus === 'all' && styles.filterOptionTextSelected]}>
                  {t('delivery.filterAll')}
                </Text>
                {filterStatus === 'all' && <Text style={styles.filterCheckmark}>✓</Text>}
              </TouchableOpacity>
              {(Object.keys(statusLabels) as DeliveryStatus[]).map((s) => {
                const sc = STATUS_COLORS[s];
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.filterOption, filterStatus === s && styles.filterOptionSelected]}
                    onPress={() => { setFilterStatus(s); setShowFilter(false); }}
                  >
                    <View style={[styles.filterDot, { backgroundColor: sc.text }]} />
                    <Text style={[styles.filterOptionText, filterStatus === s && styles.filterOptionTextSelected]}>
                      {statusLabels[s]}
                    </Text>
                    {filterStatus === s && <Text style={styles.filterCheckmark}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 60,
      paddingBottom: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: { padding: 8 },
    title: { fontSize: 18, fontWeight: '700', color: colors.text, flex: 1, textAlign: 'center' },
    filterButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterButtonText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
    searchBarWrap: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
      backgroundColor: colors.surface,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.background,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      padding: 0,
    },
    statsBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    statsText: { fontSize: 13, color: colors.textSecondary },
    statsCount: { fontWeight: '700', color: colors.text },
    searchHint: { color: colors.primary },
    syncingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    syncingText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
    content: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 100 },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 100,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textSecondary,
      marginTop: 16,
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.textTertiary,
      marginTop: 8,
      textAlign: 'center',
    },
    orderCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    orderNoWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    orderNo: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '700',
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 6,
    },
    cardRowText: {
      flex: 1,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    cardFooterLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    driverChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: colors.primaryGlow,
    },
    driverChipText: {
      fontSize: 11,
      color: colors.primary,
      fontWeight: '600',
    },
    timeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    timeChipText: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    creatorBadge: {
      marginTop: 6,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    creatorText: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    filterOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    filterSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      maxHeight: '65%',
      paddingBottom: 32,
    },
    filterSheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    filterSheetTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    filterList: { paddingHorizontal: 8, paddingTop: 8 },
    filterOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 15,
      borderRadius: 12,
      marginHorizontal: 4,
      marginVertical: 2,
    },
    filterOptionSelected: {
      backgroundColor: colors.primaryGlow,
    },
    filterOptionText: {
      fontSize: 16,
      color: colors.text,
    },
    filterOptionTextSelected: {
      color: colors.primary,
      fontWeight: '700',
    },
    filterDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 8,
    },
    filterCheckmark: {
      fontSize: 16,
      color: colors.primary,
      fontWeight: '700',
    },
  });
