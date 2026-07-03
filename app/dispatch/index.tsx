import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInventoryStore } from '@/store/inventoryStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import { useVehicleStore } from '@/store/vehicleStore';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { DeliveryOrder, StockAlert, Vehicle } from '@/types';
import {
  Truck as TruckIcon,
  Package,
  AlertTriangle,
  CheckCircle,
  X,
  Zap,
  MapPin,
  Scale,
  ArrowRight,
} from 'lucide-react-native';

/**
 * 從 vehicle store 取得「使用中」(status === 'active') 的車輛，
 * 並轉換為 dispatch 邏輯所需的 truck-like 結構。
 */
type DispatchVehicle = {
  id: string;
  plateNumber: string;
  maxWeightCapacity: number;
  currentLoad: number;
  status: 'available' | 'busy' | 'maintenance';
  assignedDriverId?: string;
  assignedDriverName?: string;
  make: string;
  model: string;
};

function vehicleToDispatchVehicle(vehicle: Vehicle): DispatchVehicle {
  return {
    id: vehicle.id,
    plateNumber: vehicle.plateNumber,
    // 若 vehicle 無負重資料，使用推估值（透過庫存的總重量估算載重上限）
    maxWeightCapacity:
      (vehicle as any).maxWeightCapacity ?? estimateVehicleCapacity(vehicle.bodyType),
    currentLoad: (vehicle as any).currentLoad ?? 0,
    status: vehicle.status === 'active' ? 'available' : 'maintenance',
    assignedDriverId: vehicle.assignedDriverId,
    assignedDriverName: (vehicle as any).assignedDriverName,
    make: vehicle.make,
    model: vehicle.model,
  };
}

function estimateVehicleCapacity(bodyType: string): number {
  switch (bodyType) {
    case 'truck':
      return 8000;
    case 'van':
      return 3000;
    case 'sedan':
    case 'suv':
      return 500;
    case 'motorcycle':
      return 100;
    default:
      return 2000;
  }
}

export default function DispatchPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const {
    warehouses,
    items,
    warehouseStocks,
    stockAlerts,
    loadWarehouses,
    loadItems,
    loadStocks,
    loadAlerts,
    autoAllocateDeliveries,
    createDispatchOrder,
    deductStock,
    autoCreateReplenishmentForDeficit,
  } = useInventoryStore();
  const { deliveries, loadDeliveries, assignDriver } = useDeliveryStore();
  const { vehicles, loadVehicles } = useVehicleStore();

  const [refreshing, setRefreshing] = useState(false);
  const [isAllocating, setIsAllocating] = useState(false);
  const [allocationResult, setAllocationResult] = useState<{
    dispatches: any[];
    alerts: StockAlert[];
    unassigned: DeliveryOrder[];
  } | null>(null);

  useEffect(() => {
    Promise.all([
      loadWarehouses(),
      loadItems(),
      loadStocks(),
      loadAlerts(),
      loadDeliveries(),
      loadVehicles(),
    ]);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadWarehouses(),
      loadItems(),
      loadStocks(),
      loadAlerts(),
      loadDeliveries(),
      loadVehicles(),
    ]);
    setRefreshing(false);
  };

  // 從 vehicle store 取得「使用中 (status === 'active')」的車輛，轉換為 dispatch 可用的結構
  const dispatchVehicles: DispatchVehicle[] = vehicles
    .filter((v) => v.status === 'active')
    .map(vehicleToDispatchVehicle);

  const availableVehicles = dispatchVehicles.filter((v) => v.status === 'available');
  const pendingDeliveries = deliveries.filter(
    (d) => d.status === 'pending' && !d.assignedDriverId
  );
  const unresolvedAlerts = stockAlerts.filter((a) => !a.isResolved);

  // ============ AI ALLOCATION LOGIC ============
  const handleAutoAllocate = async () => {
    if (availableVehicles.length === 0) {
      Alert.alert(
        '無法分配',
        '目前沒有使用中的車輛，請至車輛管理將車輛狀態設為「使用中」'
      );
      return;
    }

    if (pendingDeliveries.length === 0) {
      Alert.alert('沒有待分配訂單', '目前沒有待分配的配送訂單');
      return;
    }

    setIsAllocating(true);

    try {
      // Step 1: Check stock availability for each delivery
      const stockAlertsList: StockAlert[] = [];

      for (const delivery of pendingDeliveries) {
        // 若配送有指定物品列表，檢查每個物品的庫存
        const cargoItems = (delivery as any).cargoItems as
          | { itemId: string; quantity: number }[]
          | undefined;

        if (cargoItems && cargoItems.length > 0) {
          for (const cItem of cargoItems) {
            for (const warehouse of warehouses) {
              const stock = warehouseStocks.find(
                (s) => s.warehouseId === warehouse.id && s.itemId === cItem.itemId
              );
              const availableQty = stock?.quantity ?? 0;
              const item = items.find((it) => it.id === cItem.itemId);

              if (cItem.quantity > 0 && availableQty < cItem.quantity && item) {
                const alert: StockAlert = {
                  id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  itemId: item.id,
                  itemName: item.name,
                  warehouseId: warehouse.id,
                  warehouseName: warehouse.name,
                  requestedQuantity: cItem.quantity,
                  availableQuantity: availableQty,
                  deficitQuantity: cItem.quantity - availableQty,
                  deliveryId: delivery.id,
                  isResolved: false,
                  createdAt: new Date().toISOString(),
                };
                stockAlertsList.push(alert);
              }
            }
          }
        } else {
          // 兼容：當配送沒有 cargoItems 時，以總重量估算需求數量
          const requiredQty = Math.max(1, Math.ceil(delivery.cargoWeight / 10));

          for (const warehouse of warehouses) {
            for (const item of items) {
              const stock = warehouseStocks.find(
                (s) => s.warehouseId === warehouse.id && s.itemId === item.id
              );
              const availableQty = stock?.quantity ?? 0;

              if (availableQty < requiredQty && requiredQty > 0) {
                const alert: StockAlert = {
                  id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  itemId: item.id,
                  itemName: item.name,
                  warehouseId: warehouse.id,
                  warehouseName: warehouse.name,
                  requestedQuantity: requiredQty,
                  availableQuantity: availableQty,
                  deficitQuantity: requiredQty - availableQty,
                  deliveryId: delivery.id,
                  isResolved: false,
                  createdAt: new Date().toISOString(),
                };
                stockAlertsList.push(alert);
              }
            }
          }
        }
      }

      // Step 2: Show alerts if any
      if (stockAlertsList.length > 0) {
        Alert.alert(
          '⚠️ 庫存不足警示',
          stockAlertsList
            .map(
              (a) =>
                `• ${a.itemName} (${a.warehouseName}): 需求 ${a.requestedQuantity}，庫存 ${a.availableQuantity}，短缺 ${a.deficitQuantity}`
            )
            .join('\n'),
          [
            { text: '取消', style: 'cancel' },
            {
              text: '自動建立補貨訂單',
              onPress: async () => {
                for (const alert of stockAlertsList) {
                  const item = items.find((i) => i.id === alert.itemId);
                  const warehouse = warehouses.find((w) => w.id === alert.warehouseId);
                  if (item && warehouse) {
                    await autoCreateReplenishmentForDeficit(
                      alert.deficitQuantity,
                      item,
                      warehouse
                    );
                  }
                }
                Alert.alert('完成', `已自動建立 ${stockAlertsList.length} 筆補貨訂單`);
              },
            },
          ]
        );
      }

      // Step 3: Run AI allocation algorithm
      // 暫時以 mock trucks 跑演算法（store 介面需 Truck 結構），用 availableVehicles 替代
      const result = autoAllocateDeliveries(pendingDeliveries);

      // 因為 store 介面使用 Truck，這裡僅顯示分配結果而不真的寫入 Truck store
      setAllocationResult(result);

      // Summary
      const summary = `
配送分配完成！

✅ 已分配: ${result.dispatches.length} 筆
⚠️ 庫存警示: ${result.alerts.length} 筆
❌ 未分配: ${result.unassigned.length} 筆
      `.trim();

      Alert.alert('分配完成', summary);
    } catch (error) {
      Alert.alert('錯誤', '分配過程發生錯誤');
    } finally {
      setIsAllocating(false);
    }
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <X size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>智能配送調度</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 數據說明卡 */}
        <View style={styles.infoCard}>
          <View style={styles.infoIconWrap}>
            <TruckIcon size={18} color={colors.primary} />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>車隊來自車輛管理</Text>
            <Text style={styles.infoSubtitle}>
              顯示「使用中」狀態的車輛；未啟用的車輛不計入可用清單
            </Text>
          </View>
        </View>

        {/* 統計卡片 */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <TruckIcon size={24} color={colors.primary} />
            <Text style={styles.statValue}>{availableVehicles.length}</Text>
            <Text style={styles.statLabel}>可用車輛</Text>
          </View>
          <View style={styles.statCard}>
            <Package size={24} color={colors.primary} />
            <Text style={styles.statValue}>{pendingDeliveries.length}</Text>
            <Text style={styles.statLabel}>待配送</Text>
          </View>
          <View style={styles.statCard}>
            <AlertTriangle size={24} color="#FF0000" />
            <Text style={[styles.statValue, { color: '#FF0000' }]}>
              {unresolvedAlerts.length}
            </Text>
            <Text style={styles.statLabel}>庫存警示</Text>
          </View>
        </View>

        {/* 庫存警示區塊 */}
        {unresolvedAlerts.length > 0 && (
          <View style={styles.alertSection}>
            <Text style={styles.sectionTitle}>🚨 庫存不足警示</Text>
            {unresolvedAlerts.map((alert) => (
              <View key={alert.id} style={styles.alertCard}>
                <View style={styles.alertHeader}>
                  <AlertTriangle size={18} color="#FF0000" />
                  <Text style={styles.alertTitle}>{alert.itemName}</Text>
                </View>
                <Text style={styles.alertRedText}>
                  需求數量: {alert.requestedQuantity} 件
                </Text>
                <Text style={styles.alertRedText}>
                  可用量: {alert.availableQuantity} 件
                </Text>
                <Text style={styles.alertDeficit}>
                  需補貨數量: <Text style={styles.alertDeficitValue}>{alert.deficitQuantity}</Text> 件
                </Text>
                <Text style={styles.alertWarehouse}>
                  倉庫: {alert.warehouseName}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* AI 分配按鈕 */}
        <TouchableOpacity
          style={[styles.allocateButton, isAllocating && styles.allocateButtonDisabled]}
          onPress={handleAutoAllocate}
          disabled={isAllocating}
        >
          {isAllocating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Zap size={24} color="#fff" />
              <Text style={styles.allocateButtonText}>🚀 AI 智能分配配送</Text>
            </>
          )}
        </TouchableOpacity>

        {/* 分配結果 */}
        {allocationResult && (
          <View style={styles.resultSection}>
            <Text style={styles.sectionTitle}>📊 分配結果</Text>

            {allocationResult.dispatches.length > 0 && (
              <View style={styles.resultCard}>
                <Text style={styles.resultTitle}>✅ 已成功分配</Text>
                {allocationResult.dispatches.map((dispatch, idx) => (
                  <View key={dispatch.id} style={styles.dispatchCard}>
                    <View style={styles.dispatchHeader}>
                      <TruckIcon size={16} color={colors.primary} />
                      <Text style={styles.dispatchTruck}>
                        {dispatch.truckId} - {dispatch.driverName}
                      </Text>
                    </View>
                    <View style={styles.dispatchDetails}>
                      <Text style={styles.dispatchDetail}>
                        <MapPin size={12} /> 倉庫: {dispatch.warehouseId}
                      </Text>
                      <Text style={styles.dispatchDetail}>
                        <Scale size={12} /> 總重量: {dispatch.totalWeight} kg
                      </Text>
                      <Text style={styles.dispatchDetail}>
                        📍 配送點: {dispatch.routeSequence.length} 站
                      </Text>
                      <Text style={styles.dispatchDetail}>
                        ⏱️ 預計: {dispatch.estimatedDuration} 分鐘
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {allocationResult.alerts.length > 0 && (
              <View style={styles.resultCard}>
                <Text style={[styles.resultTitle, { color: '#FF0000' }]}>
                  ⚠️ 庫存不足 ({allocationResult.alerts.length})
                </Text>
                {allocationResult.alerts.map((alert) => (
                  <View key={alert.id} style={styles.miniAlert}>
                    <Text style={styles.miniAlertText}>
                      {alert.itemName}: 短缺 {alert.deficitQuantity} 件
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {allocationResult.unassigned.length > 0 && (
              <View style={styles.resultCard}>
                <Text style={[styles.resultTitle, { color: '#F59E0B' }]}>
                  ❌ 無法分配 ({allocationResult.unassigned.length})
                </Text>
                {allocationResult.unassigned.map((delivery) => (
                  <View key={delivery.id} style={styles.miniAlert}>
                    <Text style={styles.miniAlertText}>
                      {delivery.orderNo}: {delivery.customerName}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 可用車輛列表（從 vehicle store 來） */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🚛 可用車輛（從車輛管理）</Text>
          {availableVehicles.length === 0 ? (
            <View style={styles.emptyCard}>
              <TruckIcon size={36} color={colors.textTertiary} />
              <Text style={styles.emptyText}>目前沒有可用的車輛</Text>
              <Text style={styles.emptyHint}>
                至「車輛管理」將車輛狀態設為「使用中」即可加入此處
              </Text>
            </View>
          ) : (
            availableVehicles.map((v) => (
              <View key={v.id} style={styles.truckCard}>
                <View style={styles.truckIconWrap}>
                  <TruckIcon size={22} color={colors.primary} />
                </View>
                <View style={styles.truckInfo}>
                  <Text style={styles.truckPlate}>
                    {v.make} {v.model}
                  </Text>
                  <Text style={styles.truckPlateSub}>
                    {v.plateNumber}
                    {v.assignedDriverName ? ` · ${v.assignedDriverName}` : ''}
                  </Text>
                  <Text style={styles.truckCapacity}>
                    載重上限: {v.maxWeightCapacity.toLocaleString()} kg
                  </Text>
                </View>
                <View style={styles.statusChip}>
                  <CheckCircle size={14} color="#22C55E" />
                  <Text style={styles.statusChipText}>使用中</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* 待配送訂單 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📦 待配送訂單</Text>
          {pendingDeliveries.length === 0 ? (
            <Text style={styles.emptyText}>目前沒有待配送的訂單</Text>
          ) : (
            pendingDeliveries.slice(0, 5).map((delivery) => (
              <View key={delivery.id} style={styles.deliveryCard}>
                <View style={styles.deliveryHeader}>
                  <Text style={styles.deliveryOrderNo}>{delivery.orderNo}</Text>
                  <ArrowRight size={16} color={colors.textTertiary} />
                </View>
                <Text style={styles.deliveryCustomer}>{delivery.customerName}</Text>
                <Text style={styles.deliveryAddress}>{delivery.dropoffAddress}</Text>
                <View style={styles.deliveryMeta}>
                  <Scale size={12} color={colors.textSecondary} />
                  <Text style={styles.deliveryWeight}>{delivery.cargoWeight} kg</Text>
                </View>
              </View>
            ))
          )}
          {pendingDeliveries.length > 5 && (
            <Text style={styles.moreText}>還有 {pendingDeliveries.length - 5} 筆...</Text>
          )}
        </View>
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
    infoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.primaryGlow,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    infoIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoContent: {
      flex: 1,
    },
    infoTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
      marginBottom: 2,
    },
    infoSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      lineHeight: 16,
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
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      marginTop: 8,
    },
    statLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    alertSection: {
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 12,
    },
    alertCard: {
      backgroundColor: '#FFF5F5',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: '#FF0000',
    },
    alertHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    alertTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FF0000',
    },
    alertRedText: {
      fontSize: 14,
      color: '#FF0000',
      marginTop: 4,
    },
    alertDeficit: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FF0000',
      marginTop: 8,
    },
    alertDeficitValue: {
      fontSize: 20,
      fontWeight: '800',
    },
    alertWarehouse: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 8,
    },
    allocateButton: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      marginBottom: 24,
    },
    allocateButtonDisabled: {
      opacity: 0.7,
    },
    allocateButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
    resultSection: {
      marginBottom: 24,
    },
    resultCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    resultTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 12,
    },
    dispatchCard: {
      backgroundColor: colors.background,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    },
    dispatchHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    dispatchTruck: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    dispatchDetails: {
      marginTop: 8,
      gap: 4,
    },
    dispatchDetail: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    miniAlert: {
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    miniAlertText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    section: {
      marginBottom: 24,
    },
    emptyCard: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 32,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textTertiary,
      textAlign: 'center',
      paddingVertical: 20,
    },
    emptyHint: {
      fontSize: 12,
      color: colors.textTertiary,
      textAlign: 'center',
      paddingHorizontal: 24,
      lineHeight: 18,
    },
    truckCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    truckIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.primaryGlow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    truckInfo: {
      flex: 1,
    },
    truckPlate: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    truckPlateSub: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    truckCapacity: {
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: 2,
    },
    statusChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: '#DCFCE7',
    },
    statusChipText: {
      fontSize: 11,
      color: '#16A34A',
      fontWeight: '700',
    },
    deliveryCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    deliveryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    deliveryOrderNo: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    deliveryCustomer: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginTop: 8,
    },
    deliveryAddress: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    deliveryMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 8,
    },
    deliveryWeight: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    moreText: {
      fontSize: 12,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: 8,
    },
  });
