import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  Dimensions,
  TextInput as RNTextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { MapPin, Truck, Package, Plus, Minus, X, ChevronLeft } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDeliveryStore } from '@/store/deliveryStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { DeliveryOrder } from '@/types';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';

const { width: SCREEN_W } = Dimensions.get('window');

interface DeliveryEditFormProps {
  visible: boolean;
  onClose: () => void;
  order: DeliveryOrder;
}

/** 選擇的物品項目 */
interface SelectedItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitWeight: number;
  editingQuantity: string;
}

/** 取得物品扣除已選數量後的真實可用庫存 */
function getEffectiveStock(itemId: string, selectedItems: SelectedItem[], warehouseStocks: { itemId: string; quantity: number }[]): number {
  const stock = warehouseStocks.find((s) => s.itemId === itemId);
  const baseStock = stock?.quantity ?? 0;
  const selectedQty = selectedItems.find((s) => s.itemId === itemId)?.quantity ?? 0;
  return baseStock - selectedQty;
}

export function DeliveryEditForm({ visible, onClose, order }: DeliveryEditFormProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);

  const { updateOrderDetails } = useDeliveryStore();
  const { items, loadItems, warehouseStocks, loadStocks, warehouses, loadWarehouses } = useInventoryStore();

  // 編輯表單狀態
  const [customerName, setCustomerName] = useState(order.customerName);
  const [customerPhone, setCustomerPhone] = useState(order.customerPhone || '');
  const [pickupAddress, setPickupAddress] = useState(order.pickupAddress);
  const [dropoffAddress, setDropoffAddress] = useState(order.dropoffAddress);
  const [cargoDescription, setCargoDescription] = useState(order.cargoDescription);
  const [cargoWeight, setCargoWeight] = useState(String(order.cargoWeight || ''));
  const [notes, setNotes] = useState(order.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 物品選擇相關狀態
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [showItemPicker, setShowItemPicker] = useState(false);

  // 鍵盤監聽
  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardWillShow', (e) => {
      const keyboardHeight = e.endCoordinates.height;
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: keyboardHeight,
          animated: true,
        });
      }, 50);
    });
    return () => {
      showSubscription.remove();
    };
  }, []);

  useEffect(() => {
    loadItems();
    loadStocks();
    if (loadWarehouses) loadWarehouses();
  }, []);

  // 初始化物品
  useEffect(() => {
    // 從 cargoItems 或 cargoDescription 初始化物品列表
    if (order.cargoItems && order.cargoItems.length > 0) {
      setSelectedItems(order.cargoItems.map(item => ({
        itemId: item.itemId,
        itemName: item.itemName,
        quantity: item.quantity,
        unitWeight: item.unitWeight,
        editingQuantity: String(item.quantity),
      })));
    } else if (order.cargoDescription) {
      // 如果沒有 cargoItems 但有描述，創建一個虛擬物品
      setSelectedItems([{
        itemId: 'manual-item',
        itemName: order.cargoDescription,
        quantity: 1,
        unitWeight: order.cargoWeight || 1,
        editingQuantity: '1',
      }]);
    }
  }, [order]);

  // 計算總重量
  const totalWeight = useMemo(() => {
    if (selectedItems.length > 0) {
      return selectedItems.reduce((sum, item) => sum + item.quantity * item.unitWeight, 0);
    }
    return parseFloat(cargoWeight) || 0;
  }, [selectedItems, cargoWeight]);

  // 獲取物品的可用庫存
  const getItemStock = (itemId: string): number => {
    const stock = warehouseStocks.find((s) => s.itemId === itemId);
    return stock?.quantity ?? 0;
  };

  // 添加物品
  const handleAddItem = (item: typeof items[0]) => {
    const existing = selectedItems.find((i) => i.itemId === item.id);
    if (existing) {
      const currentEffectiveStock = getEffectiveStock(item.id, selectedItems, warehouseStocks);
      setSelectedItems((prev) =>
        prev.map((i) =>
          i.itemId === item.id && i.quantity < currentEffectiveStock
            ? { ...i, quantity: i.quantity + 1, editingQuantity: String(i.quantity + 1) }
            : i
        )
      );
    } else {
      setSelectedItems((prev) => [
        ...prev,
        {
          itemId: item.id,
          itemName: item.name,
          quantity: 1,
          unitWeight: item.unitWeight,
          editingQuantity: '1',
        },
      ]);
    }
  };

  // 增加物品數量
  const handleIncreaseItem = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.map((i) => {
        if (i.itemId === itemId) {
          const effectiveStock = getEffectiveStock(itemId, prev, warehouseStocks);
          const newQty = Math.min(i.quantity + 1, effectiveStock);
          return { ...i, quantity: newQty, editingQuantity: String(newQty) };
        }
        return i;
      })
    );
  };

  // 減少物品數量
  const handleDecreaseItem = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.map((i) => {
        if (i.itemId === itemId && i.quantity > 1) {
          const newQty = i.quantity - 1;
          return { ...i, quantity: newQty, editingQuantity: String(newQty) };
        }
        return i;
      })
    );
  };

  // 直接輸入物品數量
  const handleQuantityChange = (itemId: string, text: string) => {
    const cleanText = text.replace(/[^0-9]/g, '');
    setSelectedItems((prev) =>
      prev.map((i) =>
        i.itemId === itemId ? { ...i, editingQuantity: cleanText } : i
      )
    );
  };

  // 確認數量
  const handleQuantityBlur = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.map((i) => {
        if (i.itemId === itemId) {
          const num = parseInt(i.editingQuantity, 10);
          if (isNaN(num) || num < 1) {
            return { ...i, quantity: 1, editingQuantity: '1' };
          }
          const effectiveStock = getEffectiveStock(itemId, prev, warehouseStocks);
          const clamped = Math.min(Math.max(num, 1), effectiveStock);
          return { ...i, quantity: clamped, editingQuantity: String(clamped) };
        }
        return i;
      })
    );
  };

  // 移除物品
  const handleRemoveItem = (itemId: string) => {
    setSelectedItems((prev) => prev.filter((i) => i.itemId !== itemId));
  };

  // 驗證
  const isFormValid = () => {
    return customerName.trim().length > 0 &&
      pickupAddress.trim().length > 0 &&
      dropoffAddress.trim().length > 0;
  };

  // 保存
  const handleSave = async () => {
    if (!isFormValid()) {
      Alert.alert(t('common.error'), t('delivery.required'));
      return;
    }

    setIsSubmitting(true);

    try {
      // 生成 cargoDescription
      const finalCargoDescription = selectedItems.length > 0
        ? selectedItems.map((i) => `${i.itemName} x${i.quantity}`).join(', ')
        : cargoDescription;

      const finalCargoWeight = selectedItems.length > 0 ? totalWeight : (parseFloat(cargoWeight) || 0);

      // 決定倉庫：保留原本的 warehouseId / warehouseName（編輯時不切倉庫）
      const finalWarehouseId = order.warehouseId;
      const finalWarehouseName = order.warehouseName
        ?? (finalWarehouseId ? warehouses.find((w) => w.id === finalWarehouseId)?.name : undefined);

      // 若有選擇物品，把完整 cargoItems 帶回去（包含圖、倉庫、當下庫存）
      const finalCargoItems = selectedItems.length > 0
        ? selectedItems.map((s) => {
            const inventoryItem = items.find((it) => it.id === s.itemId);
            const stockAtWarehouse = finalWarehouseId
              ? warehouseStocks.find((st) => st.warehouseId === finalWarehouseId && st.itemId === s.itemId)
              : undefined;
            return {
              itemId: s.itemId,
              itemName: s.itemName,
              quantity: s.quantity,
              unitWeight: s.unitWeight,
              totalWeight: s.quantity * s.unitWeight,
              imageUrl: inventoryItem?.imageUrl,
              warehouseId: finalWarehouseId,
              warehouseName: finalWarehouseName,
              warehouseStockAtOrder: stockAtWarehouse?.quantity,
            };
          })
        : undefined;

      await updateOrderDetails(order.id, {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        pickupAddress: pickupAddress.trim(),
        dropoffAddress: dropoffAddress.trim(),
        cargoDescription: finalCargoDescription,
        cargoWeight: finalCargoWeight,
        notes: notes.trim() || undefined,
        ...(finalWarehouseId !== undefined ? { warehouseId: finalWarehouseId } : {}),
        ...(finalWarehouseName !== undefined ? { warehouseName: finalWarehouseName } : {}),
        ...(finalCargoItems ? { cargoItems: finalCargoItems } : {}),
      });

      setIsSubmitting(false);
      onClose();
      
      // 刷新頁面
      setTimeout(() => {
        router.replace({ pathname: '/delivery/[id]', params: { id: order.id } });
      }, 100);
    } catch (error) {
      setIsSubmitting(false);
      Alert.alert(t('common.error'), error instanceof Error ? error.message : '保存失敗');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          style={styles.modalContent}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12} style={styles.backBtn}>
              <ChevronLeft size={22} color={colors.textSecondary} />
            </Pressable>
            <Text style={styles.headerTitle}>{t('delivery.editOrderDetails')}</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View entering={FadeInDown.springify()}>
              {/* 客戶資訊 */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>客戶資訊</Text>
                <Card style={styles.card}>
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>客戶名稱</Text>
                    <RNTextInput
                      style={styles.input}
                      placeholder="請輸入客戶名稱"
                      placeholderTextColor={colors.textTertiary}
                      value={customerName}
                      onChangeText={setCustomerName}
                    />
                  </View>
                  <View style={[styles.inputRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.md }]}>
                    <Text style={styles.inputLabel}>聯絡電話</Text>
                    <RNTextInput
                      style={styles.input}
                      placeholder="請輸入聯絡電話"
                      placeholderTextColor={colors.textTertiary}
                      value={customerPhone}
                      onChangeText={setCustomerPhone}
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={[styles.inputRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.md }]}>
                    <Text style={styles.inputLabel}>備註</Text>
                    <RNTextInput
                      style={[styles.input, styles.notesInput]}
                      placeholder="填寫配送相關備註"
                      placeholderTextColor={colors.textTertiary}
                      value={notes}
                      onChangeText={setNotes}
                      multiline
                      numberOfLines={2}
                    />
                  </View>
                </Card>
              </View>

              {/* 地址選擇 */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('delivery.pickup')} & {t('delivery.dropoff')}</Text>
                <View style={styles.addressCard}>
                  <View style={styles.addressRow}>
                    <View style={[styles.pinDot, styles.pinDotPickup]} />
                    <View style={styles.addressInputWrapper}>
                      <Text style={styles.addressLabel}>{t('delivery.pickup')}</Text>
                      <RNTextInput
                        style={styles.addressInput}
                        placeholder={t('delivery.pickupAddress')}
                        placeholderTextColor={colors.textTertiary}
                        value={pickupAddress}
                        onChangeText={setPickupAddress}
                      />
                    </View>
                  </View>

                  <View style={styles.addressDivider} />

                  <View style={styles.addressRow}>
                    <View style={[styles.pinDot, styles.pinDotDropoff]} />
                    <View style={styles.addressInputWrapper}>
                      <Text style={styles.addressLabel}>{t('delivery.dropoff')}</Text>
                      <RNTextInput
                        style={styles.addressInput}
                        placeholder={t('delivery.dropoffAddress')}
                        placeholderTextColor={colors.textTertiary}
                        value={dropoffAddress}
                        onChangeText={setDropoffAddress}
                      />
                    </View>
                  </View>
                </View>
              </View>

              {/* 配送物品 */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>配送物品</Text>
                  <Pressable style={styles.addItemButton} onPress={() => setShowItemPicker(true)}>
                    <Plus size={16} color={colors.primary} />
                    <Text style={styles.addItemButtonText}>新增物品</Text>
                  </Pressable>
                </View>

                {selectedItems.length === 0 ? (
                  <Card style={styles.emptyCard}>
                    <Package size={32} color={colors.textTertiary} />
                    <Text style={styles.emptyText}>尚未選擇配送物品</Text>
                    <Text style={styles.emptyHint}>點擊上方按鈕從庫存添加物品</Text>
                  </Card>
                ) : (
                  <>
                    {selectedItems.map((item) => {
                      const effectiveStock = getEffectiveStock(item.itemId, selectedItems, warehouseStocks);
                      const isLowStock = effectiveStock <= 0;
                      return (
                        <Card key={item.itemId} style={[styles.itemCard, isLowStock && styles.itemCardLowStock]}>
                          <View style={styles.itemInfo}>
                            <Text style={styles.itemName}>{item.itemName}</Text>
                            <Text style={[styles.itemMeta, isLowStock && styles.itemMetaLowStock]}>
                              單件重量: {item.unitWeight} kg | 庫存: {effectiveStock}
                              {isLowStock && ' ⚠️ 庫存不足'}
                            </Text>
                          </View>
                          <View style={styles.itemQuantity}>
                            <Pressable
                              style={styles.quantityBtn}
                              onPress={() => handleDecreaseItem(item.itemId)}
                            >
                              <Minus size={16} color={colors.primary} />
                            </Pressable>
                            <RNTextInput
                              style={styles.quantityInput}
                              value={item.editingQuantity}
                              onChangeText={(text) => handleQuantityChange(item.itemId, text)}
                              onBlur={() => handleQuantityBlur(item.itemId)}
                              keyboardType="number-pad"
                              selectTextOnFocus
                            />
                            <Pressable
                              style={styles.quantityBtn}
                              onPress={() => handleIncreaseItem(item.itemId)}
                            >
                              <Plus size={16} color={colors.primary} />
                            </Pressable>
                          </View>
                          <Pressable style={styles.removeBtn} onPress={() => handleRemoveItem(item.itemId)}>
                            <X size={16} color={colors.danger} />
                          </Pressable>
                        </Card>
                      );
                    })}

                    {/* 總重量 */}
                    <Card style={styles.totalCard}>
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>總重量</Text>
                        <Text style={styles.totalValue}>{totalWeight.toFixed(2)} kg</Text>
                      </View>
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>物品總數</Text>
                        <Text style={styles.totalValue}>{selectedItems.length} 項</Text>
                      </View>
                    </Card>
                  </>
                )}
              </View>
            </Animated.View>
          </ScrollView>

          {/* Bottom CTA */}
          <View style={styles.bottomCta}>
            <Button
              title={t('common.cancel')}
              variant="ghost"
              onPress={onClose}
              style={{ flex: 1, marginRight: spacing.sm }}
            />
            <Button
              title={isSubmitting ? '處理中...' : t('common.save')}
              variant="primary"
              size="lg"
              onPress={handleSave}
              disabled={isSubmitting || !isFormValid()}
              style={{ flex: 1 }}
            />
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* 物品選擇 Modal */}
      <Modal
        visible={showItemPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowItemPicker(false)}
      >
        <View style={styles.pickerModalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>選擇配送物品</Text>
            <Pressable onPress={() => setShowItemPicker(false)} style={styles.modalCloseBtn}>
              <X size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {items.length === 0 ? (
            <View style={styles.modalEmpty}>
              <Package size={48} color={colors.textTertiary} />
              <Text style={styles.emptyText}>庫存中暫無物品</Text>
              <Text style={styles.emptyHint}>請先在倉庫管理中添加物品</Text>
            </View>
          ) : (
            <>
              <ScrollView style={styles.modalScroll}>
                {items.map((item) => {
                  const effectiveStock = getEffectiveStock(item.id, selectedItems, warehouseStocks);
                  const isAdded = selectedItems.some((i) => i.itemId === item.id);
                  return (
                    <Pressable
                      key={item.id}
                      style={[styles.pickItemCard, isAdded && styles.pickItemCardAdded]}
                      onPress={() => {
                        if (!isAdded && effectiveStock > 0) {
                          handleAddItem(item);
                        }
                      }}
                      disabled={isAdded || effectiveStock === 0}
                    >
                      <View style={styles.pickItemInfo}>
                        <Text style={styles.pickItemName}>{item.name}</Text>
                        <Text style={styles.pickItemMeta}>
                          單件 {item.unitWeight} kg | 庫存 {effectiveStock}
                        </Text>
                      </View>
                      {isAdded ? (
                        <View style={styles.addedBadge}>
                          <Text style={styles.addedText}>已添加</Text>
                        </View>
                      ) : effectiveStock === 0 ? (
                        <View style={styles.outOfStockBadge}>
                          <Text style={styles.outOfStockText}>缺貨</Text>
                        </View>
                      ) : (
                        <View style={styles.addIcon}>
                          <Plus size={16} color={colors.primary} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.modalFooter}>
                <Button
                  title="確認"
                  variant="primary"
                  size="lg"
                  onPress={() => setShowItemPicker(false)}
                />
              </View>
            </>
          )}
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  card: {
    padding: spacing.lg,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginRight: spacing.md,
    minWidth: 70,
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    padding: 0,
  },
  notesInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  addressCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.md,
  },
  pinDotPickup: {
    backgroundColor: colors.primary,
  },
  pinDotDropoff: {
    backgroundColor: colors.accent,
  },
  addressInputWrapper: {
    flex: 1,
  },
  addressLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textTertiary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressInput: {
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
  },
  addressDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
    marginLeft: 24,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  addItemButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
    gap: spacing.md,
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  emptyHint: {
    fontSize: typography.fontSize.sm,
    color: colors.textTertiary,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  itemMeta: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemCardLowStock: {
    borderWidth: 2,
    borderColor: colors.danger,
    backgroundColor: '#FFF5F5',
  },
  itemMetaLowStock: {
    color: colors.danger,
    fontWeight: '700',
  },
  itemQuantity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginRight: spacing.md,
  },
  quantityBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityInput: {
    width: 56,
    height: 36,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.card,
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
  removeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalCard: {
    padding: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.primaryGlow,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  totalLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.primary,
  },
  bottomCta: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  // Picker Modal styles
  pickerModalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalScroll: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  modalFooter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pickItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  pickItemCardAdded: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
    opacity: 0.7,
  },
  pickItemInfo: {
    flex: 1,
  },
  pickItemName: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  pickItemMeta: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  addedBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.card,
  },
  addedText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  outOfStockBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.danger + '20',
  },
  outOfStockText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.danger,
  },
  addIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
