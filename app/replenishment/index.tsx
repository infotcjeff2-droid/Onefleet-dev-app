import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { ReplenishmentOrder, ReplenishmentStatus } from '@/types';
import {
  Package,
  X,
  CheckCircle,
  Truck,
  PackageCheck,
  Clock,
  AlertTriangle,
} from 'lucide-react-native';

const STATUS_CONFIG: Record<ReplenishmentStatus, { 
  label: string; 
  color: string; 
  icon: React.ReactNode;
  description: string;
}> = {
  pending: {
    label: '待處理',
    color: '#F59E0B',
    icon: <Clock size={14} color="#F59E0B" />,
    description: '等待補貨',
  },
  ordered: {
    label: '已下單',
    color: '#3B82F6',
    icon: <Package size={14} color="#3B82F6" />,
    description: '已向供應商下單',
  },
  shipped: {
    label: '已出貨',
    color: '#8B5CF6',
    icon: <Truck size={14} color="#8B5CF6" />,
    description: '供應商已出貨',
  },
  received: {
    label: '已收貨',
    color: '#22C55E',
    icon: <PackageCheck size={14} color="#22C55E" />,
    description: '已入庫',
  },
};

export default function ReplenishmentPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const {
    replenishmentOrders,
    loadReplenishment,
    updateReplenishmentStatus,
  } = useInventoryStore();

  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReplenishmentStatus | 'all'>('all');

  useEffect(() => {
    loadReplenishment();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReplenishment();
    setRefreshing(false);
  };

  const handleStatusChange = (order: ReplenishmentOrder, newStatus: ReplenishmentStatus) => {
    const statusNames: Record<ReplenishmentStatus, string> = {
      pending: '待處理',
      ordered: '已下單',
      shipped: '已出貨',
      received: '已收貨',
    };

    Alert.alert(
      '更新補貨狀態',
      `將「${order.itemName}」的狀態更新為「${statusNames[newStatus]}」？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '確認',
          onPress: () => updateReplenishmentStatus(order.id, newStatus),
        },
      ]
    );
  };

  const filteredOrders = statusFilter === 'all'
    ? replenishmentOrders
    : replenishmentOrders.filter((o) => o.status === statusFilter);

  const pendingCount = replenishmentOrders.filter((o) => o.status === 'pending').length;
  const totalDeficit = replenishmentOrders
    .filter((o) => o.status === 'pending')
    .reduce((sum, o) => sum + o.deficitQuantity, 0);

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <X size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>補貨訂單管理</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <AlertTriangle size={24} color="#F59E0B" />
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{pendingCount}</Text>
            <Text style={styles.statLabel}>待補貨</Text>
          </View>
          <View style={styles.statCard}>
            <Package size={24} color={colors.primary} />
            <Text style={styles.statValue}>{totalDeficit}</Text>
            <Text style={styles.statLabel}>總缺口</Text>
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterContainer}>
          {(['all', 'pending', 'ordered', 'shipped', 'received'] as const).map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.filterTab,
                statusFilter === status && styles.filterTabActive,
              ]}
              onPress={() => setStatusFilter(status)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  statusFilter === status && styles.filterTabTextActive,
                ]}
              >
                {status === 'all' ? '全部' : STATUS_CONFIG[status].label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Orders List */}
        {filteredOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <Package size={64} color={colors.textTertiary} />
            <Text style={styles.emptyText}>尚無補貨訂單</Text>
            <Text style={styles.emptySubtext}>
              當庫存不足時，系統會自動建立補貨訂單
            </Text>
          </View>
        ) : (
          filteredOrders.map((order) => {
            const config = STATUS_CONFIG[order.status];
            return (
              <View key={order.id} style={styles.orderCard}>
                {/* Header */}
                <View style={styles.orderHeader}>
                  <View style={styles.orderTitleRow}>
                    <Package size={20} color={colors.primary} />
                    <Text style={styles.itemName}>{order.itemName}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: config.color + '20' }]}>
                    {config.icon}
                    <Text style={[styles.statusText, { color: config.color }]}>
                      {config.label}
                    </Text>
                  </View>
                </View>

                {/* Details */}
                <View style={styles.orderDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>倉庫:</Text>
                    <Text style={styles.detailValue}>{order.warehouseName}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>需補貨數量:</Text>
                    <Text style={[styles.detailValue, styles.deficitValue]}>
                      {order.deficitQuantity} 件
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>建立時間:</Text>
                    <Text style={styles.detailValue}>
                      {new Date(order.createdAt).toLocaleDateString('zh-TW')}
                    </Text>
                  </View>
                </View>

                {/* Status Actions */}
                <View style={styles.statusActions}>
                  <Text style={styles.actionsLabel}>更新狀態:</Text>
                  <View style={styles.actionButtons}>
                    {(['pending', 'ordered', 'shipped', 'received'] as ReplenishmentStatus[]).map((status) => {
                      const statusConfig = STATUS_CONFIG[status];
                      const isActive = order.status === status;
                      return (
                        <TouchableOpacity
                          key={status}
                          style={[
                            styles.actionButton,
                            isActive && { backgroundColor: statusConfig.color + '30' },
                          ]}
                          onPress={() => !isActive && handleStatusChange(order, status)}
                          disabled={isActive}
                        >
                          <Text
                            style={[
                              styles.actionButtonText,
                              isActive && { color: statusConfig.color },
                            ]}
                          >
                            {statusConfig.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
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
    backButton: {
      padding: 8,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    headerSpacer: {
      width: 40,
    },
    content: {
      flex: 1,
      padding: 16,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 20,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    statValue: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
      marginTop: 8,
    },
    statLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    filterContainer: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
      flexWrap: 'wrap',
    },
    filterTab: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterTabActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterTabText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    filterTabTextActive: {
      color: '#fff',
      fontWeight: '600',
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 60,
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
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    orderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    orderTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    itemName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
    },
    orderDetails: {
      marginTop: 16,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    detailLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    detailValue: {
      fontSize: 14,
      color: colors.text,
      fontWeight: '500',
    },
    deficitValue: {
      color: '#FF0000',
      fontWeight: '700',
      fontSize: 16,
    },
    statusActions: {
      marginTop: 16,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    actionsLabel: {
      fontSize: 12,
      color: colors.textTertiary,
      marginBottom: 8,
    },
    actionButtons: {
      flexDirection: 'row',
      gap: 8,
    },
    actionButton: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    actionButtonText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
    },
  });
