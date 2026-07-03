import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
  Image,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { InventoryItem } from '@/types';
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  X,
  ArrowLeft,
  Scale,
  Warehouse as WarehouseIcon,
  Tag,
  Hash,
  ChevronDown,
  Upload,
} from 'lucide-react-native';

const ITEM_CATEGORIES = [
  '電子零件',
  '食品',
  '紡織品',
  '五金零件',
  '包裝材料',
  '機械設備',
  '化工原料',
  '醫療器材',
  '辦公用品',
  '其他',
];

function computeNextSku(existingSkus: string[]): string {
  const numbers = existingSkus
    .map((sku) => {
      const match = sku.match(/(\d+)(?!.*\d)/);
      return match ? parseInt(match[1], 10) : NaN;
    })
    .filter((n) => Number.isFinite(n));
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `SKU-${String(max + 1).padStart(3, '0')}`;
}

interface ItemFormData {
  name: string;
  sku: string;
  category: string;
  unitWeight: string;
  totalQuantity: string;
  imageUrl: string;
  defaultWarehouseId: string;
}

const EMPTY_FORM: ItemFormData = {
  name: '',
  sku: '',
  category: '',
  unitWeight: '',
  totalQuantity: '0',
  imageUrl: '',
  defaultWarehouseId: '',
};

export default function InventoryManagement() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const {
    items,
    warehouses,
    warehouseStocks,
    isLoading,
    loadItems,
    loadWarehouses,
    loadStocks,
    addItem,
    updateItem,
    deleteItem,
    getTotalStock,
    getStockAtWarehouse,
  } = useInventoryStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // ref 用於同步寫入 SKU：避免 React state batching 造成 Modal render 時 value 尚未更新
  const skuFieldRef = useRef('');

  const [form, setForm] = useState<ItemFormData>(EMPTY_FORM);

  useEffect(() => {
    loadItems();
    loadWarehouses();
    loadStocks();
  }, []);

  // 開啟「新增」modal 時，自動補上下一個 SKU 與預設分類，確保欄位一打開就有值
  // useLayoutEffect 在 paint 前執行，避免閃爍
  const wasModalOpen = useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (modalVisible && !editingItem && !wasModalOpen.current) {
      // 每次開啟新增 modal 都重新抓最新倉庫資料，確保列表為實際資料
      loadWarehouses();
      loadStocks();
      const nextSku = computeNextSku(
        items.map((i) => i.sku).filter(Boolean) as string[],
      );
      skuFieldRef.current = nextSku;
      setForm({
        ...EMPTY_FORM,
        sku: nextSku,
        category: ITEM_CATEGORIES[0],
        defaultWarehouseId: warehouses[0]?.id ?? '',
      });
    }
    wasModalOpen.current = modalVisible;
  }, [modalVisible, editingItem]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadItems(), loadWarehouses(), loadStocks()]);
    setRefreshing(false);
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingItem(null);
  };

  const openAddModal = () => {
    const nextSku = computeNextSku(items.map((i) => i.sku).filter(Boolean) as string[]);
    // 先同步寫入 ref，確保 Modal render 時 TextInput 的 value 已是最新的 SKU
    skuFieldRef.current = nextSku;
    setForm({
      ...EMPTY_FORM,
      sku: nextSku,
      category: ITEM_CATEGORIES[0],
      defaultWarehouseId: warehouses[0]?.id ?? '',
    });
    setEditingItem(null);
    setShowCategoryPicker(false);
    setModalVisible(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setForm({
      name: item.name ?? '',
      sku: item.sku ?? '',
      category: item.category ?? '',
      unitWeight: item.unitWeight != null ? String(item.unitWeight) : '',
      totalQuantity: item.totalQuantity != null ? String(item.totalQuantity) : '0',
      imageUrl: item.imageUrl ?? '',
      defaultWarehouseId: item.defaultWarehouseId ?? '',
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('錯誤', '請輸入物品名稱');
      return;
    }

    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      category: form.category.trim() || undefined,
      unitWeight: parseFloat(form.unitWeight) || 0,
      totalQuantity: parseInt(form.totalQuantity, 10) || 0,
      imageUrl: form.imageUrl.trim() || undefined,
      defaultWarehouseId: form.defaultWarehouseId || undefined,
    };

    try {
      let savedItemId: string | null = null;

      if (editingItem) {
        await updateItem(editingItem.id, payload);
        savedItemId = editingItem.id;
      } else {
        const newItem = await addItem(payload);
        savedItemId = newItem.id;
      }

      // 若有預設倉庫且數量 > 0，把初始數量加到該倉庫的 stock
      if (
        payload.defaultWarehouseId &&
        savedItemId &&
        payload.totalQuantity > 0
      ) {
        // 編輯模式下，僅在數量變動時才更新（避免重複疊加）
        if (editingItem) {
          const prevQty = editingItem.totalQuantity ?? 0;
          const delta = payload.totalQuantity - prevQty;
          if (delta > 0) {
            await useInventoryStore.getState().addStock(
              payload.defaultWarehouseId,
              savedItemId,
              delta
            );
          } else if (delta < 0) {
            // 若數量減少，扣減對應庫存
            const deductQty = Math.abs(delta);
            await useInventoryStore.getState().deductStock(
              payload.defaultWarehouseId,
              savedItemId,
              deductQty
            );
          }
        } else {
          // 新增模式：直接加入全部數量
          await useInventoryStore.getState().addStock(
            payload.defaultWarehouseId,
            savedItemId,
            payload.totalQuantity
          );
        }
      }

      // 從 storage 重新載入以保證 UI 與 store 同步
      await loadStocks();
      await loadItems();

      console.log('[handleSave] stocks reloaded, verifying...');
      const storeState = useInventoryStore.getState();
      const checkStock = storeState.getTotalStock(savedItemId ?? '');
      console.log(`[handleSave] savedItemId=${savedItemId}, totalStock=${checkStock}, stockCount=${storeState.warehouseStocks.length}`);

      // 延後一幀再關 modal，確保 React 已套用 store state 後才卸載 Modal
      setTimeout(() => {
        setModalVisible(false);
        resetForm();
      }, 50);
    } catch (error) {
      Alert.alert('錯誤', '儲存失敗，請重試');
    }
  };

  const handleDelete = (item: InventoryItem) => {
    Alert.alert(
      '確認刪除',
      `確定要刪除物品「${item.name}」嗎？\n（相關倉庫庫存與補貨單也會一併移除）`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '刪除',
          style: 'destructive',
          onPress: async () => {
            if (deletingId) return;
            setDeletingId(item.id);
            try {
              await deleteItem(item.id);
              await Promise.all([loadItems(), loadStocks()]);
            } catch (error) {
              Alert.alert('錯誤', '刪除失敗，請重試');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const handlePickImage = async () => {
    if (isUploadingImage) return;
    setIsUploadingImage(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.canAskAgain === false) {
        Alert.alert('需要相簿權限', '請於系統設定允許存取相片以選擇圖片');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        setForm((f) => ({ ...f, imageUrl: result.assets[0].uri }));
      }
    } catch (err) {
      Alert.alert('錯誤', '圖片選擇失敗，請重試');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleClearImage = () => {
    setForm((f) => ({ ...f, imageUrl: '' }));
  };

  const styles = createStyles(colors);
  const getWarehouseName = (id: string | undefined) => {
    if (!id) return null;
    return warehouses.find((w) => w.id === id)?.name ?? null;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>庫存物品管理</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
          <Plus size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Item List */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Package size={64} color={colors.textTertiary} />
            <Text style={styles.emptyText}>尚無庫存物品</Text>
            <Text style={styles.emptySubtext}>點擊右上角新增物品</Text>
          </View>
        ) : (
          items.map((item) => {
            const totalStock = getTotalStock(item.id);
            const defaultWhName = getWarehouseName(item.defaultWarehouseId);
            const stockAtDefault = item.defaultWarehouseId
              ? getStockAtWarehouse(item.defaultWarehouseId, item.id)
              : 0;

            return (
              <TouchableOpacity
                key={item.id}
                style={styles.itemCard}
                onPress={() => openEditModal(item)}
              >
                {/* 物品圖片 */}
                <View style={styles.itemImageWrap}>
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.itemImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.itemImage, styles.placeholderImage]}>
                      <Package size={24} color={colors.textTertiary} />
                    </View>
                  )}
                </View>

                {/* 物品資訊 */}
                <View style={styles.itemInfo}>
                  <View style={styles.itemNameRow}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.sku && (
                      <View style={styles.skuChip}>
                        <Text style={styles.skuText}>{item.sku}</Text>
                      </View>
                    )}
                  </View>

                  {item.category && (
                    <View style={styles.categoryRow}>
                      <Tag size={11} color={colors.textTertiary} />
                      <Text style={styles.categoryText}>{item.category}</Text>
                    </View>
                  )}

                  <View style={styles.itemMetaRow}>
                    <View style={styles.metaItem}>
                      <Scale size={12} color={colors.textSecondary} />
                      <Text style={styles.metaText}>{item.unitWeight} kg/件</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Package size={12} color={colors.textSecondary} />
                      <Text style={styles.metaText}>總 {totalStock} 件</Text>
                    </View>
                  </View>

                  {/* 倉庫歸屬 */}
                  {defaultWhName && (
                    <View style={styles.warehouseChip}>
                      <WarehouseIcon size={12} color={colors.primary} />
                      <Text style={styles.warehouseChipText}>
                        {defaultWhName} · {stockAtDefault} 件
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation?.();
                      openEditModal(item);
                    }}
                    hitSlop={8}
                    style={styles.actionButton}
                  >
                    <Edit2 size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleDelete(item);
                    }}
                    hitSlop={8}
                    disabled={deletingId === item.id}
                    style={[
                      styles.actionButton,
                      deletingId === item.id && styles.actionButtonDisabled,
                    ]}
                  >
                    <Trash2
                      size={18}
                      color={deletingId === item.id ? colors.textTertiary : colors.danger}
                    />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem ? '編輯物品' : '新增物品'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
              {/* 物品圖片 */}
              <Text style={styles.inputLabel}>物品圖片</Text>
              <TouchableOpacity
                style={styles.imagePicker}
                onPress={handlePickImage}
                disabled={isUploadingImage}
                activeOpacity={0.85}
              >
                {form.imageUrl ? (
                  <Image
                    source={{ uri: form.imageUrl }}
                    style={styles.pickerImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.pickerPlaceholder}>
                    <Upload size={32} color={colors.textTertiary} />
                    <Text style={styles.pickerText}>
                      {isUploadingImage ? '上載中…' : '點擊從相簿選擇圖片'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {form.imageUrl ? (
                <TouchableOpacity
                  style={styles.imageClearRow}
                  onPress={handleClearImage}
                >
                  <Text style={styles.imageClearText}>移除已選圖片</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={styles.inputLabel}>物品名稱 *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(text) => setForm((f) => ({ ...f, name: text }))}
                placeholder="例如：電子元件 A型"
                placeholderTextColor={colors.textTertiary}
              />

              <View style={styles.rowInputs}>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>SKU / 條碼</Text>
                  <TextInput
                    key={form.sku || 'sku-new'}
                    style={styles.input}
                    value={form.sku}
                    onChangeText={(text) => setForm((f) => ({ ...f, sku: text }))}
                    placeholder="SKU-001"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>分類</Text>
                  <TouchableOpacity
                    style={styles.dropdownField}
                    onPress={() => setShowCategoryPicker(true)}
                  >
                    {form.category ? (
                      <Text style={styles.dropdownText}>{form.category}</Text>
                    ) : (
                      <Text style={styles.dropdownPlaceholder}>選擇分類</Text>
                    )}
                    <ChevronDown size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.inputLabel}>單位重量 (kg)</Text>
              <TextInput
                style={styles.input}
                value={form.unitWeight}
                onChangeText={(text) => setForm((f) => ({ ...f, unitWeight: text }))}
                placeholder="例如：2.5"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>總數量</Text>
              <TextInput
                style={styles.input}
                value={form.totalQuantity}
                onChangeText={(text) => setForm((f) => ({ ...f, totalQuantity: text }))}
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numeric"
              />

              {/* 倉庫選擇 */}
              <Text style={styles.inputLabel}>存放倉庫</Text>
              {warehouses.length === 0 ? (
                <View style={styles.noWarehouseHint}>
                  <WarehouseIcon size={14} color={colors.textTertiary} />
                  <Text style={styles.noWarehouseText}>
                    尚未建立倉庫，請先至倉庫管理新增
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.warehouseSelector}>
                    {warehouses.map((wh) => {
                      const isSelected = form.defaultWarehouseId === wh.id;
                      return (
                        <TouchableOpacity
                          key={wh.id}
                          style={[
                            styles.warehouseOption,
                            isSelected && styles.warehouseOptionSelected,
                          ]}
                          onPress={() =>
                            setForm((f) => ({ ...f, defaultWarehouseId: wh.id }))
                          }
                        >
                          {wh.imageUrl ? (
                            <Image
                              source={{ uri: wh.imageUrl }}
                              style={styles.warehouseOptionImage}
                            />
                          ) : (
                            <View
                              style={[
                                styles.warehouseOptionImage,
                                styles.placeholderImage,
                              ]}
                            >
                              <WarehouseIcon size={14} color={colors.textTertiary} />
                            </View>
                          )}
                          <Text
                            style={[
                              styles.warehouseOptionText,
                              isSelected && styles.warehouseOptionTextSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {wh.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* 選擇倉庫後顯示容量與已存放資訊（即時預覽含當前編輯的數量） */}
                  {form.defaultWarehouseId && (() => {
                    const selectedWh = warehouses.find(
                      (w) => w.id === form.defaultWarehouseId,
                    );
                    if (!selectedWh) return null;

                    // 即時計算「預覽中」的庫存狀態：
                    // 1. 先取出該倉庫在 store 中已有的 stock
                    // 2. 編輯模式：若當前編輯的 item 已存在於此倉庫 stock，則替換為 form.totalQuantity（不重複計入）
                    // 3. 編輯模式：若 defaultWarehouseId 已變更，從舊倉庫扣除舊 item 數量（但本卡片只看新倉庫）
                    // 4. 新增模式：把 form.totalQuantity 視為將新增到該倉庫的數量
                    const rawStocks = warehouseStocks.filter(
                      (s) => s.warehouseId === form.defaultWarehouseId,
                    );

                    const pendingQty = Math.max(
                      0,
                      parseInt(form.totalQuantity, 10) || 0,
                    );
                    const isEditCurrentItem =
                      editingItem?.id &&
                      rawStocks.some(
                        (s) => s.itemId === editingItem!.id,
                      );

                    // 預覽：替換當前編輯物品的數量（若存在於此倉庫）
                    const previewStocks = isEditCurrentItem
                      ? rawStocks.map((s) =>
                          s.itemId === editingItem!.id
                            ? { ...s, quantity: pendingQty }
                            : s,
                        )
                      : rawStocks;

                    // 預覽：若為新增物品或編輯後的物品不在此倉庫中，加入「即將新增」的記錄
                    const willAddNewItem =
                      !isEditCurrentItem && pendingQty > 0;
                    const effectiveStocks = willAddNewItem
                      ? [
                          ...previewStocks,
                          {
                            id: '__preview__',
                            warehouseId: form.defaultWarehouseId!,
                            itemId: '__preview__',
                            quantity: pendingQty,
                            updatedAt: new Date().toISOString(),
                          },
                        ]
                      : previewStocks;

                    const distinctItemCount = effectiveStocks.length;
                    const totalStock = effectiveStocks.reduce(
                      (sum, s) => sum + (s.quantity || 0),
                      0,
                    );
                    const capacity = selectedWh.storageCapacity;
                    const usedPct =
                      capacity && capacity > 0
                        ? Math.min(Math.round((totalStock / capacity) * 100), 100)
                        : null;
                    const usageColor =
                      usedPct === null
                        ? colors.textSecondary
                        : usedPct > 80
                        ? colors.danger
                        : usedPct > 60
                        ? colors.warning
                        : colors.success;

                    return (
                      <View style={styles.warehouseInfoCard}>
                        <View style={styles.warehouseInfoHeader}>
                          <WarehouseIcon size={14} color={colors.primary} />
                          <Text style={styles.warehouseInfoHeaderText}>
                            {selectedWh.name} 即時預覽
                          </Text>
                          {willAddNewItem && (
                            <View style={styles.previewBadge}>
                              <Text style={styles.previewBadgeText}>將新增</Text>
                            </View>
                          )}
                          {isEditCurrentItem && (
                            <View style={styles.previewBadge}>
                              <Text style={styles.previewBadgeText}>即時更新</Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.warehouseInfoRow}>
                          <View style={styles.warehouseInfoItem}>
                            <Package size={14} color={colors.primary} />
                            <Text style={styles.warehouseInfoLabel}>已存放物品</Text>
                            <Text style={styles.warehouseInfoValue}>
                              {distinctItemCount} 種
                            </Text>
                          </View>
                          <View style={styles.warehouseInfoDivider} />
                          <View style={styles.warehouseInfoItem}>
                            <Package size={14} color={colors.primary} />
                            <Text style={styles.warehouseInfoLabel}>總存貨量</Text>
                            <Text style={styles.warehouseInfoValue}>
                              {totalStock.toLocaleString()} 件
                            </Text>
                          </View>
                        </View>

                        {capacity != null && capacity > 0 && (
                          <>
                            <View style={styles.warehouseInfoRow}>
                              <View style={styles.warehouseInfoItem}>
                                <WarehouseIcon size={14} color={colors.primary} />
                                <Text style={styles.warehouseInfoLabel}>容量上限</Text>
                                <Text style={styles.warehouseInfoValue}>
                                  {capacity.toLocaleString()} 件
                                </Text>
                              </View>
                              <View style={styles.warehouseInfoDivider} />
                              <View style={styles.warehouseInfoItem}>
                                <Scale size={14} color={colors.primary} />
                                <Text style={styles.warehouseInfoLabel}>使用率</Text>
                                <Text
                                  style={[
                                    styles.warehouseInfoValue,
                                    { color: usageColor },
                                  ]}
                                >
                                  {usedPct !== null ? `${usedPct}%` : '—'}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.usageBarTrack}>
                              <View
                                style={[
                                  styles.usageBarFill,
                                  {
                                    width: `${usedPct ?? 0}%`,
                                    backgroundColor: usageColor,
                                  },
                                ]}
                              />
                            </View>
                          </>
                        )}
                      </View>
                    );
                  })()}
                </>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>儲存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 分類選擇下拉 */}
      <Modal
        visible={showCategoryPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <Pressable style={styles.dropdownOverlay} onPress={() => setShowCategoryPicker(false)}>
          <Pressable style={styles.categorySheet}>
            <View style={styles.categorySheetHeader}>
              <Text style={styles.categorySheetTitle}>選擇分類</Text>
              <TouchableOpacity onPress={() => setShowCategoryPicker(false)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.categoryList} showsVerticalScrollIndicator={false}>
              {ITEM_CATEGORIES.map((cat) => {
                const isSelected = form.category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryOption,
                      isSelected && styles.categoryOptionSelected,
                    ]}
                    onPress={() => {
                      setForm((f) => ({ ...f, category: cat }));
                      setShowCategoryPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        isSelected && styles.categoryOptionTextSelected,
                      ]}
                    >
                      {cat}
                    </Text>
                    {isSelected && (
                      <Text style={styles.categoryCheckmark}>✓</Text>
                    )}
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
    backButton: {
      padding: 8,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    addButton: {
      padding: 8,
    },
    content: {
      flex: 1,
      padding: 16,
    },
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
    },
    itemCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 12,
      marginBottom: 12,
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    itemImageWrap: {
      width: 84,
      height: 84,
      borderRadius: 10,
      overflow: 'hidden',
    },
    itemImage: {
      width: '100%',
      height: '100%',
    },
    placeholderImage: {
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemInfo: {
      flex: 1,
    },
    itemNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    itemName: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    skuChip: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    skuText: {
      fontSize: 10,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 6,
    },
    categoryText: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    itemMetaRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 6,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metaText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    warehouseChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: colors.primaryGlow,
    },
    warehouseChipText: {
      fontSize: 11,
      color: colors.primary,
      fontWeight: '600',
    },
    cardActions: {
      justifyContent: 'center',
      gap: 6,
    },
    actionButton: {
      padding: 6,
    },
    actionButtonDisabled: {
      opacity: 0.5,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '92%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    modalForm: {
      padding: 20,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
      marginTop: 14,
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dropdownField: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 50,
    },
    dropdownText: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
    },
    dropdownPlaceholder: {
      fontSize: 16,
      color: colors.textTertiary,
    },
    dropdownOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    categorySheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      maxHeight: '65%',
      paddingBottom: 32,
    },
    categorySheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    categorySheetTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    categoryList: {
      paddingHorizontal: 8,
      paddingTop: 8,
    },
    categoryOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 15,
      borderRadius: 12,
      marginHorizontal: 4,
      marginVertical: 2,
    },
    categoryOptionSelected: {
      backgroundColor: colors.primaryGlow,
    },
    categoryOptionText: {
      fontSize: 16,
      color: colors.text,
    },
    categoryOptionTextSelected: {
      color: colors.primary,
      fontWeight: '700',
    },
    categoryCheckmark: {
      fontSize: 16,
      color: colors.primary,
      fontWeight: '700',
    },
    imagePicker: {
      width: '100%',
      height: 160,
      borderRadius: 12,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    pickerImage: {
      width: '100%',
      height: '100%',
    },
    pickerPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    pickerText: {
      fontSize: 13,
      color: colors.textTertiary,
    },
    imageClearRow: {
      marginTop: 8,
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    imageClearText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    rowInputs: {
      flexDirection: 'row',
      gap: 12,
    },
    halfInput: {
      flex: 1,
    },
    noWarehouseHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    noWarehouseText: {
      fontSize: 13,
      color: colors.textTertiary,
    },
    warehouseSelector: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    warehouseOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: colors.background,
      borderWidth: 1.5,
      borderColor: colors.border,
      maxWidth: '100%',
    },
    warehouseOptionSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryGlow,
    },
    warehouseOptionImage: {
      width: 22,
      height: 22,
      borderRadius: 6,
    },
    warehouseOptionText: {
      fontSize: 12,
      color: colors.text,
      fontWeight: '600',
    },
    warehouseOptionTextSelected: {
      color: colors.primary,
    },
    warehouseInfoCard: {
      marginTop: 12,
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.primaryGlow,
      borderWidth: 1,
      borderColor: colors.primary,
      gap: 10,
    },
    warehouseInfoHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    warehouseInfoHeaderText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
      flex: 1,
    },
    previewBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: colors.primary,
    },
    previewBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#fff',
    },
    usageBarTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    usageBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    warehouseInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    warehouseInfoItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    warehouseInfoDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border,
      marginHorizontal: 8,
    },
    warehouseInfoLabel: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    warehouseInfoValue: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    modalActions: {
      flexDirection: 'row',
      padding: 20,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    cancelButton: {
      flex: 1,
      padding: 16,
      borderRadius: 12,
      backgroundColor: colors.background,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    saveButton: {
      flex: 1,
      padding: 16,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    saveButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#fff',
    },
  });
