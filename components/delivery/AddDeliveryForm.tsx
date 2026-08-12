import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
  Image,
  TextInput as RNTextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  InteractionManager,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { MapPin, Truck, User, Check, ChevronLeft, Shuffle, Package, Plus, Minus, X, Search, Users } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDeliveryStore } from '@/store/deliveryStore';
import { useDriverStore, Driver } from '@/store/driverStore';
import { useVehicleStore } from '@/store/vehicleStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { useAuthStore } from '@/store/authStore';
import { useCustomerStore } from '@/store/customerStore';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { DeliveryCargoItem, Customer } from '@/types';

const { width: SCREEN_W } = Dimensions.get('window');

const HK_PICKUP_ADDRESSES = [
  '九龍灣宏照道 38 號企業廣場五期',
  '觀塘海濱道 83 號得利工業大廈',
  '荔枝角長沙灣道 883 號億利工業中心',
  '葵涌葵喜街 26-32 號金發工業大廈',
  '沙田火炭黃竹洋街 15-21 號華生工業大廈',
  '元朗宏樂街 18 號朗屏工業邨',
  '屯門建榮街 24-30 號冠榮中心',
  '大埔工業邨大埔仔塘肚街',
  '將軍澳工業邨駿光街 6 號',
  '香港仔黃竹坑道 62 號香華工業大廈',
  '柴灣祥利街 29 號永利中心',
  '北角渣華道 212 號海洋大廈',
  '灣仔告士打道 128 號信誼大廈',
  '上環永樂街 87 號遠東發展大廈',
  '中環干諾道中 68 號萬豪閣',
];

const HK_DROPOFF_ADDRESSES = [
  '中環皇后大道中 15 號置地廣場',
  '銅鑼灣時代廣場一座 38 樓',
  '尖沙咀海港城海洋中心 12 樓',
  '旺角朗豪坊辦公大樓 22 樓',
  '九龍站環球貿易廣場 80 樓',
  '香港大學薄扶林道 2 號',
  '理工大學紅磡校區 Z 座',
  '科技大學清水灣校園',
  '葵芳新都會廣場二期 30 樓',
  '荃灣廣場 18 樓',
  '沙田新城市廣場一期 10 樓',
  '將軍澳新都城中心二期 15 樓',
  '東涌東薈城 8 樓',
  '數碼港貝沙灣道 28 號',
  '跑馬地山村道 33 號',
];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateHKAddresses(): { pickup: string; dropoff: string } {
  const pickup = randomPick(HK_PICKUP_ADDRESSES);
  let dropoff = randomPick(HK_DROPOFF_ADDRESSES);
  while (dropoff === pickup) {
    dropoff = randomPick(HK_DROPOFF_ADDRESSES);
  }
  return { pickup, dropoff };
}

export type DeliveryFormMode = 'add' | 'confirm';

interface AddDeliveryFormProps {
  mode?: DeliveryFormMode;
  initialData?: {
    pickupAddress: string;
    dropoffAddress: string;
    isScheduled: boolean;
  };
}

/** 選擇的物品項目 */
interface SelectedItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitWeight: number;
  availableStock: number;
  editingQuantity: string;
  imageUrl?: string;
}

/** 取得物品扣除已選數量後的真實可用庫存 */
function getEffectiveStock(itemId: string, selectedItems: SelectedItem[], warehouseStocks: { itemId: string; quantity: number }[]): number {
  const stock = warehouseStocks.find((s) => s.itemId === itemId);
  const baseStock = stock?.quantity ?? 0;
  const selectedQty = selectedItems.find((s) => s.itemId === itemId)?.quantity ?? 0;
  return baseStock - selectedQty;
}

export function AddDeliveryForm({ mode = 'add', initialData }: AddDeliveryFormProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);

  const { addOrder } = useDeliveryStore();
  const { drivers, loadDrivers, getVehiclesByDriverId } = useDriverStore();
  const { vehicles, loadVehicles } = useVehicleStore();
  const managedDrivers = useUserManagementStore((state) => state.users).filter((u) => u.role === 'driver');
  const { items, loadItems, warehouseStocks, loadStocks, warehouses, loadWarehouses } = useInventoryStore();
  const { user, role } = useAuthStore();
  const { customers, loadCustomers, addCustomer } = useCustomerStore();

  // Driver 角色：直接用自己的 Clerk userId 作為 assignedDriverId，跳過司機選擇步驟
  const isDriverRole = role === 'driver';
  const myDriverId = user?.id ?? null;

  const [pickupAddress, setPickupAddress] = useState(initialData?.pickupAddress ?? '');
  const [dropoffAddress, setDropoffAddress] = useState(initialData?.dropoffAddress ?? '');
  const [isScheduled, setIsScheduled] = useState(initialData?.isScheduled ?? false);
  // Driver 角色：初始化時就鎖定自己為司機，不需要選擇
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(isDriverRole ? myDriverId : null);
  // Driver 角色：直接跳到司機確認步驟
  const [step, setStep] = useState<'address' | 'driver'>(isDriverRole ? 'driver' : 'address');

  // 物品選擇相關狀態
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);

  // 縮圖 Lightbox 狀態
  const [lightboxImage, setLightboxImage] = useState<{ uri: string; name: string } | null>(null);

  // 客戶選擇相關狀態
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [newCustomerNotes, setNewCustomerNotes] = useState('');

  // 鍵盤監聽 - 記錄鍵盤高度並滾動到目標位置
  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardWillShow', (e) => {
      const keyboardHeight = e.endCoordinates.height;
      // 滾動到視圖底部，預留一些空間
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
    loadDrivers();
    loadVehicles();
    loadItems();
    loadStocks();
    loadCustomers();
    if (loadWarehouses) loadWarehouses();
  }, []);

  // 獲取默認倉庫 ID
  const defaultWarehouseId = warehouses.find((wh) => wh.isDefault)?.id || warehouses[0]?.id || 'default-warehouse';

  // 合併司機列表
  console.log('[AddDeliveryForm] drivers:', drivers.length, 'managedDrivers:', managedDrivers.length);
  const mergedDrivers: Driver[] = useMemo(() => [
    ...drivers,
    ...managedDrivers
      .filter((md) => !drivers.some((d) => d.id === md.id))
      .map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone ?? '',
        email: u.email,
        vehiclePlate: '',
        status: 'available' as const,
      })),
  ], [drivers, managedDrivers]);
  console.log('[AddDeliveryForm] mergedDrivers:', mergedDrivers.map(d => ({ id: d.id, name: d.name })));

  // 活躍車輛
  const activeVehicles = vehicles.filter((v) => v.status === 'active');

  // 計算總重量
  const totalWeight = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + item.quantity * item.unitWeight, 0);
  }, [selectedItems]);

  // 計算物品描述
  const cargoDescription = useMemo(() => {
    return selectedItems.map((item) => `${item.itemName} x${item.quantity}`).join(', ') || '';
  }, [selectedItems]);

  // 選中的司機（driver 角色時，自己可能不在 mergedDrivers 中，需用 authStore 的 user.name）
  const selectedDriver = mergedDrivers.find((d) => d.id === selectedDriverId) ?? (
    isDriverRole && selectedDriverId ? { id: selectedDriverId, name: user?.name ?? '' } : null
  );

  // 根據選中的司機獲取其車輛
  const driverVehicles = useMemo(() => {
    if (!selectedDriverId) return [];
    return getVehiclesByDriverId(selectedDriverId, vehicles);
  }, [selectedDriverId, vehicles, getVehiclesByDriverId]);

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
            ? { ...i, quantity: i.quantity + 1 }
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
          availableStock: getEffectiveStock(item.id, prev, warehouseStocks),
          editingQuantity: '1',
          imageUrl: item.imageUrl,
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
      prev.map((i) => {
        if (i.itemId === itemId) {
          return { ...i, editingQuantity: cleanText };
        }
        return i;
      })
    );
  };

  // 確認數量（輸入結束時）
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

  // 步驟 1 驗證
  const isAddressValid = pickupAddress.trim().length > 0 && dropoffAddress.trim().length > 0;
  const isCargoValid = selectedItems.length > 0 && totalWeight > 0;
  const canProceedToStep2 = isAddressValid && isCargoValid;
  
  // 調試日誌
  console.log('[AddDeliveryForm] Debug:', {
    step,
    isAddressValid,
    isCargoValid,
    canProceedToStep2,
    selectedDriverId,
    selectedItemsCount: selectedItems.length,
    totalWeight,
  });

  const handleNext = () => {
    console.log('[handleNext] 函數被調用了!');
    console.log('[handleNext] isAddressValid:', isAddressValid);
    console.log('[handleNext] isCargoValid:', isCargoValid);
    console.log('[handleNext] canProceedToStep2:', canProceedToStep2);

    if (!canProceedToStep2) {
      console.log('[handleNext] 驗證失敗，準備顯示錯誤提示');
      if (!isAddressValid) {
        setErrorModal({ title: t('common.error'), message: '請填寫收貨和送貨地址' });
        return;
      }
      if (!isCargoValid) {
        setErrorModal({ title: t('common.error'), message: '請選擇至少一個配送物品' });
        return;
      }
      return;
    }
    console.log('[handleNext] 驗證通過，設置 step = driver');
    setStep('driver');
  };

  const handleBack = () => {
    if (step === 'driver') {
      setStep('address');
    } else {
      router.back();
    }
  };

  const handleConfirm = async () => {
    console.log('[handleConfirm] 函數被調用了!');
    
    // 司機選擇改為可選，不選司機時建立待處理的訂單
    const hasSelectedDriver = !!selectedDriverId;
    
    if (!hasSelectedDriver) {
      // 不選司機時，也需要檢查庫存
      const lowStockItems = selectedItems.filter((item) => {
        const effectiveStock = getEffectiveStock(item.itemId, selectedItems, warehouseStocks);
        return effectiveStock < 0;
      });

      if (lowStockItems.length > 0) {
        setErrorModal({
          title: t('common.error'),
          message: `以下物品庫存不足：\n${lowStockItems.map((i) => `- ${i.itemName}`).join('\n')}\n\n請減少數量後再試。`,
        });
        return;
      }
    } else {
      // 有選司機時檢查庫存
      const lowStockItems = selectedItems.filter((item) => {
        const effectiveStock = getEffectiveStock(item.itemId, selectedItems, warehouseStocks);
        return effectiveStock < 0;
      });

      if (lowStockItems.length > 0) {
        setErrorModal({
          title: t('common.error'),
          message: `以下物品庫存不足：\n${lowStockItems.map((i) => `- ${i.itemName}`).join('\n')}\n\n請減少數量後再試。`,
        });
        return;
      }
    }

    setIsSubmitting(true);
    setShowSuccessModal(false); // 重置 Modal 狀態

    try {
      console.log('[handleConfirm] 開始建立配送...');
      const now = new Date();
      // 取得出貨倉庫（用於詳情頁呈現「來源倉庫」）
      const warehouse = warehouses.find((wh) => wh.id === defaultWarehouseId);

      const cargoItems: DeliveryCargoItem[] = selectedItems.map((item) => {
        const inventoryItem = items.find((it) => it.id === item.itemId);
        const stockAtWarehouse = warehouseStocks.find(
          (s) => s.warehouseId === defaultWarehouseId && s.itemId === item.itemId,
        );
        return {
          itemId: item.itemId,
          itemName: item.itemName,
          quantity: item.quantity,
          unitWeight: item.unitWeight,
          totalWeight: item.quantity * item.unitWeight,
          imageUrl: inventoryItem?.imageUrl,
          warehouseId: defaultWarehouseId,
          warehouseName: warehouse?.name,
          warehouseImageUrl: warehouse?.imageUrl,
          warehouseStockAtOrder: stockAtWarehouse?.quantity,
        };
      });

      // 若司機有綁定車輛，取第一輛
      const assignedVehicleId = hasSelectedDriver && driverVehicles.length > 0 ? driverVehicles[0].id : undefined;
      console.log('[handleConfirm] 司機車輛:', assignedVehicleId);

      console.log('[handleConfirm] 呼叫 addOrder...');
      console.log(`[handleConfirm] hasSelectedDriver: ${hasSelectedDriver}, selectedDriverId: ${selectedDriverId}, selectedDriver: ${selectedDriver?.name}`);

      // 根據是否有選擇司機來設定狀態
      const orderStatus = hasSelectedDriver ? 'assigned' : 'pending';

      const result = await addOrder({
        customerName: customerName || (selectedDriver?.name ?? ''),
        customerPhone: customerPhone || (selectedDriver?.phone ?? ''),
        pickupAddress: pickupAddress.trim(),
        pickupTime: now.toISOString().slice(0, 19).replace('T', ' '),
        dropoffAddress: dropoffAddress.trim(),
        cargoDescription,
        cargoWeight: totalWeight,
        notes: notes || undefined,
        status: orderStatus,
        assignedDriverId: hasSelectedDriver ? selectedDriverId : undefined,
        assignedDriverName: hasSelectedDriver ? selectedDriver?.name : undefined,
        assignedVehicleId,
        warehouseId: defaultWarehouseId,
        warehouseName: warehouse?.name,
        warehouseImageUrl: warehouse?.imageUrl,
        cargoItems,
      });

      console.log('[handleConfirm] addOrder 完成, result:', result?.orderNo);

      // 扣減庫存（失敗不影響配送建立）
      console.log(`[handleConfirm] 使用倉庫 ID: ${defaultWarehouseId}`);
      for (const item of selectedItems) {
        console.log(`[handleConfirm] 嘗試扣減庫存: warehouseId=${defaultWarehouseId}, itemId=${item.itemId}, qty=${item.quantity}`);
        try {
          const deductResult = await useInventoryStore.getState().deductStock(defaultWarehouseId, item.itemId, item.quantity);
          console.log(`[handleConfirm] deductStock 結果: ${deductResult}`);
        } catch (stockError) {
          console.warn(`[handleConfirm] 庫存扣減失敗: item=${item.itemName}, qty=${item.quantity}`, stockError);
        }
      }

      console.log('[handleConfirm] 所有操作完成，即將顯示成功提示');

      // 直接顯示自訂成功 Modal（跨 Web/原生皆可正常運作）
      setIsSubmitting(false);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('[handleConfirm] Error:', error);
      setIsSubmitting(false);
      const errorMessage = `建立配送訂單失敗：${error instanceof Error ? error.message : '未知錯誤'}`;
      setErrorModal({ title: '錯誤', message: errorMessage });
    }
  };

  const handleDriverSelect = (driverId: string) => {
    // 傳入空字串表示「不選擇司機」,設為 null 以便與「未選擇」狀態一致
    setSelectedDriverId(driverId === '' ? null : driverId);
  };

  // 選擇客戶
  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? '');
    // 如果客戶有預設地址且送貨地址為空，自動填入
    if (customer.address && !dropoffAddress.trim()) {
      setDropoffAddress(customer.address);
    }
    setShowCustomerPicker(false);
    setCustomerSearchQuery('');
  };

  // 清除選擇的客戶
  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerName('');
    setCustomerPhone('');
  };

  // 新增客戶
  const handleAddNewCustomer = async () => {
    if (!newCustomerName.trim()) {
      setErrorModal({ title: '錯誤', message: '請輸入客戶名稱' });
      return;
    }

    try {
      const newCustomer = await addCustomer({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || undefined,
        address: newCustomerAddress.trim() || undefined,
        notes: newCustomerNotes.trim() || undefined,
      });

      handleSelectCustomer(newCustomer);
      setShowAddCustomer(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerAddress('');
      setNewCustomerNotes('');
    } catch (error) {
      setErrorModal({ title: '錯誤', message: '新增客戶失敗，請重試' });
    }
  };

  // 篩選客戶
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    const query = customerSearchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.phone?.toLowerCase().includes(query)
    );
  }, [customers, customerSearchQuery]);

  // CTA 按鈕處理
  const handleCtaPress = useCallback(() => {
    console.log('[handleCtaPress] 觸發, step:', step);
    if (step === 'address') {
      console.log('[handleCtaPress] 調用 handleNext');
      handleNext();
    } else {
      console.log('[handleCtaPress] 調用 handleConfirm');
      handleConfirm();
    }
  }, [step, handleNext, handleConfirm]);

  // 渲染步驟 1 - 地址和物品選擇
  const renderAddressStep = () => (
    <Animated.View entering={FadeInDown.springify()}>
      {/* 客戶資訊 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>客戶資訊</Text>
        <Card style={styles.card}>
          {/* 選擇客戶 - Select Field */}
          <Pressable
            style={styles.selectField}
            onPress={() => setShowCustomerPicker(true)}
          >
            <View style={styles.selectFieldLeft}>
              <Users size={18} color={selectedCustomer ? colors.primary : colors.textTertiary} />
              <View style={styles.selectFieldContent}>
                <Text style={styles.selectFieldLabel}>選擇客戶</Text>
                <Text style={[styles.selectFieldValue, selectedCustomer && styles.selectFieldValueSelected]}>
                  {selectedCustomer ? selectedCustomer.name : '請選擇客戶（可選）'}
                </Text>
              </View>
            </View>
            <View style={styles.selectFieldRight}>
              {selectedCustomer && (
                <Pressable
                  style={styles.clearButton}
                  onPress={handleClearCustomer}
                  hitSlop={8}
                >
                  <X size={16} color={colors.textTertiary} />
                </Pressable>
              )}
              <ChevronLeft size={18} color={colors.textTertiary} style={styles.selectChevron} />
            </View>
          </Pressable>

          {/* 已選擇客戶時顯示資訊 */}
          {selectedCustomer && (
            <View style={styles.selectedCustomerInfo}>
              <Text style={styles.selectedCustomerLabel}>客戶電話</Text>
              <Text style={styles.selectedCustomerValue}>{selectedCustomer.phone || '無'}</Text>
              {selectedCustomer.address && (
                <>
                  <Text style={[styles.selectedCustomerLabel, { marginTop: spacing.sm }]}>客戶地址</Text>
                  <Text style={styles.selectedCustomerValue}>{selectedCustomer.address}</Text>
                </>
              )}
            </View>
          )}

          {/* 未選擇客戶時顯示輸入框 */}
          {!selectedCustomer && (
            <>
              <View style={[styles.inputRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.md }]}>
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
            </>
          )}
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

          <Pressable
            style={styles.shuffleButton}
            onPress={() => {
              const { pickup, dropoff } = generateHKAddresses();
              setPickupAddress(pickup);
              setDropoffAddress(dropoff);
            }}
          >
            <Shuffle size={14} color={colors.primary} />
            <Text style={styles.shuffleButtonText}>隨機生成香港地址</Text>
          </Pressable>
        </View>
      </View>

      {/* 配送方式 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>配送方式</Text>
        <View style={styles.typeTabsContainer}>
          <Pressable
            style={[styles.typeTab, !isScheduled && styles.typeTabActive]}
            onPress={() => setIsScheduled(false)}
          >
            <Text style={[styles.typeTabText, !isScheduled && styles.typeTabTextActive]}>
              即時配送
            </Text>
          </Pressable>
          <Pressable
            style={[styles.typeTab, isScheduled && styles.typeTabActive]}
            onPress={() => setIsScheduled(true)}
          >
            <Text style={[styles.typeTabText, isScheduled && styles.typeTabTextActive]}>
              預約配送
            </Text>
          </Pressable>
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
              // 即時從 inventoryStore 取得最新 imageUrl，避免 selectedItems 缺少 imageUrl
              const liveImageUrl = item.imageUrl ?? items.find((it) => it.id === item.itemId)?.imageUrl;
              return (
                <Card key={item.itemId} style={[styles.itemCard, isLowStock && styles.itemCardLowStock]}>
                  {liveImageUrl ? (
                    <Pressable
                      onPress={() =>
                        setLightboxImage({ uri: liveImageUrl, name: item.itemName })
                      }
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.itemImageWrap,
                        pressed && styles.itemImagePressed,
                      ]}
                    >
                      <Image
                        source={{ uri: liveImageUrl }}
                        style={styles.itemImage}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ) : (
                    <View style={styles.itemImagePlaceholder}>
                      <Package size={18} color={colors.textTertiary} />
                    </View>
                  )}
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
  );

  // 渲染步驟 2 - 司機和車輛選擇
  const renderDriverStep = () => (
    <Animated.View entering={FadeInDown.springify()}>
      {/* 已選物品摘要 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>配送摘要</Text>
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Package size={16} color={colors.primary} />
            <Text style={styles.summaryText}>{selectedItems.length} 項物品</Text>
          </View>
          <View style={styles.summaryRow}>
            <Truck size={16} color={colors.primary} />
            <Text style={styles.summaryText}>總重量: {totalWeight.toFixed(2)} kg</Text>
          </View>

          {/* 物品明細列表 */}
          {selectedItems.length > 0 && (
            <View style={styles.summaryItemsList}>
              {selectedItems.map((item, index) => {
                // 從 inventoryStore 即時查找 imageUrl，避免 selectedItems 中缺少 imageUrl
                const liveImageUrl = item.imageUrl ?? items.find((it) => it.id === item.itemId)?.imageUrl;
                return (
                <View
                  key={item.itemId}
                  style={[
                    styles.summaryItemRow,
                    index === selectedItems.length - 1 && styles.summaryItemRowLast,
                  ]}
                >
                  {liveImageUrl ? (
                    <Pressable
                      onPress={() =>
                        setLightboxImage({ uri: liveImageUrl, name: item.itemName })
                      }
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.summaryItemImageWrap,
                        pressed && styles.summaryItemImagePressed,
                      ]}
                    >
                      <Image
                        source={{ uri: liveImageUrl }}
                        style={styles.summaryItemImage}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ) : (
                    <View style={styles.summaryItemImagePlaceholder}>
                      <Package size={18} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={styles.summaryItemContent}>
                    <Text style={styles.summaryItemName} numberOfLines={2}>
                      {item.itemName}
                    </Text>
                    <Text style={styles.summaryItemMeta}>
                      數量 {item.quantity} ・ 單件 {item.unitWeight} kg ・ 小計{' '}
                      {(item.quantity * item.unitWeight).toFixed(2)} kg
                    </Text>
                  </View>
                </View>
              );
              })}
            </View>
          )}

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <View style={[styles.pinDot, styles.pinDotPickup]} />
            <Text style={styles.summaryLabel}>取貨點</Text>
            <Text style={styles.summaryText} numberOfLines={2}>{pickupAddress}</Text>
          </View>
          <View style={styles.summaryRow}>
            <View style={[styles.pinDot, styles.pinDotDropoff]} />
            <Text style={styles.summaryLabel}>送貨點</Text>
            <Text style={styles.summaryText} numberOfLines={2}>{dropoffAddress}</Text>
          </View>
        </Card>
      </View>

      {/* 司機選擇 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>選擇司機</Text>
        <Text style={styles.sectionSubtitle}>
          選擇司機後，系統會自動顯示該司機的車輛。不選擇司機會建立待處理訂單，稍後再分配。
        </Text>

        {mergedDrivers.length === 0 ? (
          <Card style={styles.emptyCard}>
            <User size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>暫無可用司機</Text>
            <Text style={styles.emptyHint}>將建立待處理訂單，稍後再分配司機</Text>
          </Card>
        ) : (
          <>
            {/* 不選擇司機選項 */}
            <Pressable
              style={[styles.driverCard, selectedDriverId === null && styles.driverCardSelected]}
              onPress={() => handleDriverSelect('')}
            >
              <View style={styles.driverCardLeft}>
                <View style={[styles.driverAvatar, selectedDriverId === null && styles.driverAvatarSelected, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.driverAvatarText, selectedDriverId === null && styles.driverAvatarTextSelected]}>
                    ?
                  </Text>
                </View>
                <View style={styles.driverInfo}>
                  <Text style={[styles.driverName, selectedDriverId === null && styles.driverNameSelected]}>
                    不選擇司機
                  </Text>
                  <Text style={[styles.driverDetail, selectedDriverId === null && styles.driverDetailSelected]}>
                    建立待處理訂單，稍後再分配
                  </Text>
                </View>
              </View>
              <View style={[styles.checkCircle, selectedDriverId === null && styles.checkCircleSelected]}>
                {selectedDriverId === null && <Check size={14} color="#fff" />}
              </View>
            </Pressable>

            {/* 司機列表 */}
            {mergedDrivers.map((driver) => {
              const isSelected = selectedDriverId === driver.id;
              const driverCars = vehicles.filter((v) => v.assignedDriverId === driver.id);
              return (
                <Pressable
                  key={driver.id}
                  style={[styles.driverCard, isSelected && styles.driverCardSelected]}
                  onPress={() => handleDriverSelect(driver.id)}
                >
                  <View style={styles.driverCardLeft}>
                    <View style={[styles.driverAvatar, isSelected && styles.driverAvatarSelected]}>
                      <Text style={[styles.driverAvatarText, isSelected && styles.driverAvatarTextSelected]}>
                        {driver.name.charAt(0)}
                      </Text>
                    </View>
                    <View style={styles.driverInfo}>
                      <Text style={[styles.driverName, isSelected && styles.driverNameSelected]}>
                        {driver.name}
                      </Text>
                      <Text style={[styles.driverDetail, isSelected && styles.driverDetailSelected]}>
                        {driver.phone}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                    {isSelected && <Check size={14} color="#fff" />}
                  </View>
                </Pressable>
              );
            })}
          </>
        )}
      </View>
    </Animated.View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={12} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {step === 'address' ? t('delivery.newDelivery') : t('delivery.chooseDriver')}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              step === 'driver' && styles.progressFillFull,
            ]}
          />
        </View>
        <View style={styles.progressSteps}>
          <Text style={[styles.progressLabel, step === 'address' && styles.progressLabelActive]}>
            {step === 'address' ? '1' : '\u2713'}
          </Text>
          <Text style={[styles.progressLabel, step === 'driver' && styles.progressLabelActive]}>2</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'address' ? renderAddressStep() : renderDriverStep()}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomCta}>
        <Button
          title={isSubmitting ? '處理中...' : (step === 'address' ? '下一步' : t('delivery.createDelivery'))}
          variant="primary"
          size="lg"
          onPress={handleCtaPress}
          disabled={isSubmitting || (step === 'address' ? !canProceedToStep2 : false)}
        />
      </View>

      {/* 物品選擇 Modal */}
      <Modal
        visible={showItemPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowItemPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('delivery.selectItems') || '選擇配送物品'}</Text>
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
                      {item.imageUrl ? (
                        <Image
                          source={{ uri: item.imageUrl }}
                          style={styles.pickItemImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.pickItemImagePlaceholder}>
                          <Package size={20} color={colors.textTertiary} />
                        </View>
                      )}
                      <View style={styles.pickItemInfo}>
                        <Text style={styles.pickItemName}>{item.name}</Text>
                        <Text style={styles.pickItemMeta}>
                          單件 {item.unitWeight} kg | 庫存 {effectiveStock}
                        </Text>
                      </View>
                      {isAdded ? (
                        <View style={styles.addedBadge}>
                          <Check size={14} color={colors.primary} />
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

              {/* 確認按鈕 */}
              <View style={styles.modalFooter}>
                <Button
                  title={t('common.confirm') || '確認'}
                  variant="primary"
                  size="lg"
                  onPress={() => setShowItemPicker(false)}
                />
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* 成功提示 Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <Pressable style={styles.successModalOverlay} onPress={() => setShowSuccessModal(false)}>
          <Pressable style={styles.successModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.successIconContainer}>
              <Check size={32} color={colors.success || '#00A87A'} />
            </View>
            <Text style={styles.successTitle}>{t('common.success')}</Text>
            <Text style={styles.successMessage}>
              {locale === 'zh-TW'
                ? `配送訂單已成功建立！\n\n從：${pickupAddress}\n到：${dropoffAddress}`
                : `Delivery order created successfully!\n\nFrom: ${pickupAddress}\nTo: ${dropoffAddress}`}
            </Text>
            <Pressable
              style={styles.successButton}
              onPress={() => {
                setShowSuccessModal(false);
                // 使用 replace 回到配送頁面並刷新
                router.replace('/delivery' as any);
              }}
            >
              <Text style={styles.successButtonText}>OK</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 錯誤提示 Modal */}
      <Modal
        visible={errorModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setErrorModal(null)}
      >
        <Pressable style={styles.successModalOverlay} onPress={() => setErrorModal(null)}>
          <Pressable style={styles.successModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.successIconContainer, { backgroundColor: 'rgba(220, 53, 69, 0.15)' }]}>
              <Text style={{ fontSize: 32, fontWeight: '700', color: colors.danger }}>!</Text>
            </View>
            <Text style={styles.successTitle}>{errorModal?.title ?? t('common.error')}</Text>
            <Text style={styles.successMessage}>{errorModal?.message ?? ''}</Text>
            <Pressable
              style={[styles.successButton, { backgroundColor: colors.danger }]}
              onPress={() => setErrorModal(null)}
            >
              <Text style={styles.successButtonText}>確定</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      {/* 客戶選擇 Modal */}
      <Modal
        visible={showCustomerPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCustomerPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>選擇客戶</Text>
            <Pressable onPress={() => setShowCustomerPicker(false)} style={styles.modalCloseBtn}>
              <X size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* 新增客戶按鈕 */}
          <View style={styles.customerModalActions}>
            <Pressable
              style={styles.addCustomerBtn}
              onPress={() => {
                setShowCustomerPicker(false);
                setShowAddCustomer(true);
              }}
            >
              <Plus size={16} color={colors.primary} />
              <Text style={styles.addCustomerBtnText}>新增客戶</Text>
            </Pressable>
          </View>

          {/* 搜尋框 */}
          <View style={styles.searchContainer}>
            <Search size={18} color={colors.textTertiary} />
            <RNTextInput
              style={styles.searchInput}
              placeholder="搜尋客戶名稱或電話..."
              placeholderTextColor={colors.textTertiary}
              value={customerSearchQuery}
              onChangeText={setCustomerSearchQuery}
            />
            {customerSearchQuery.length > 0 && (
              <Pressable onPress={() => setCustomerSearchQuery('')}>
                <X size={16} color={colors.textTertiary} />
              </Pressable>
            )}
          </View>

          {filteredCustomers.length === 0 ? (
            <View style={styles.modalEmpty}>
              <Users size={48} color={colors.textTertiary} />
              <Text style={styles.emptyText}>找不到客戶</Text>
              <Text style={styles.emptyHint}>點擊上方按鈕新增客戶</Text>
            </View>
          ) : (
            <ScrollView style={styles.modalScroll}>
              {filteredCustomers.map((customer) => (
                <Pressable
                  key={customer.id}
                  style={[styles.customerCard, selectedCustomer?.id === customer.id && styles.customerCardSelected]}
                  onPress={() => handleSelectCustomer(customer)}
                >
                  <View style={styles.customerCardLeft}>
                    <View style={[styles.customerAvatar, selectedCustomer?.id === customer.id && styles.customerAvatarSelected]}>
                      <Text style={[styles.customerAvatarText, selectedCustomer?.id === customer.id && styles.customerAvatarTextSelected]}>
                        {customer.name.charAt(0)}
                      </Text>
                    </View>
                    <View style={styles.customerInfo}>
                      <Text style={[styles.customerName, selectedCustomer?.id === customer.id && styles.customerNameSelected]}>
                        {customer.name}
                      </Text>
                      <Text style={[styles.customerDetail, selectedCustomer?.id === customer.id && styles.customerDetailSelected]}>
                        {customer.phone || '無電話'}
                        {customer.address && ` • ${customer.address}`}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.checkCircle, selectedCustomer?.id === customer.id && styles.checkCircleSelected]}>
                    {selectedCustomer?.id === customer.id && <Check size={14} color="#fff" />}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* 確認按鈕 */}
          <View style={styles.modalFooter}>
            <Button
              title="確認"
              variant="primary"
              size="lg"
              onPress={() => setShowCustomerPicker(false)}
            />
          </View>
        </View>
      </Modal>

      {/* 新增客戶 Modal */}
      <Modal
        visible={showAddCustomer}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddCustomer(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>新增客戶</Text>
            <Pressable onPress={() => setShowAddCustomer(false)} style={styles.modalCloseBtn}>
              <X size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.modalScroll}>
            <View style={styles.addCustomerForm}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>客戶名稱 *</Text>
                <RNTextInput
                  style={styles.formInput}
                  placeholder="請輸入客戶名稱"
                  placeholderTextColor={colors.textTertiary}
                  value={newCustomerName}
                  onChangeText={setNewCustomerName}
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>聯絡電話</Text>
                <RNTextInput
                  style={styles.formInput}
                  placeholder="請輸入聯絡電話"
                  placeholderTextColor={colors.textTertiary}
                  value={newCustomerPhone}
                  onChangeText={setNewCustomerPhone}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>地址</Text>
                <RNTextInput
                  style={[styles.formInput, styles.formInputMultiline]}
                  placeholder="請輸入客戶地址"
                  placeholderTextColor={colors.textTertiary}
                  value={newCustomerAddress}
                  onChangeText={setNewCustomerAddress}
                  multiline
                  numberOfLines={3}
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>備註</Text>
                <RNTextInput
                  style={[styles.formInput, styles.formInputMultiline]}
                  placeholder="填寫客戶相關備註"
                  placeholderTextColor={colors.textTertiary}
                  value={newCustomerNotes}
                  onChangeText={setNewCustomerNotes}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          </ScrollView>

          <View style={styles.addCustomerFooter}>
            <View style={styles.buttonRow}>
              <Button
                title="取消"
                variant="secondary"
                size="lg"
                onPress={() => {
                  setShowAddCustomer(false);
                  setShowCustomerPicker(true);
                }}
                style={styles.buttonHalf}
              />
              <Button
                title="新增"
                variant="primary"
                size="lg"
                onPress={handleAddNewCustomer}
                style={styles.buttonHalf}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* 縮圖 Lightbox Modal */}
      <Modal
        visible={lightboxImage !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setLightboxImage(null)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.lightboxOverlay}
          onPress={() => setLightboxImage(null)}
        >
          <Pressable
            style={styles.lightboxCloseBtn}
            onPress={() => setLightboxImage(null)}
            hitSlop={12}
          >
            <X size={22} color="#fff" />
          </Pressable>
          {lightboxImage && (
            <View style={styles.lightboxContent}>
              <Image
                source={{ uri: lightboxImage.uri }}
                style={styles.lightboxImage}
                resizeMode="contain"
              />
              <Text style={styles.lightboxCaption} numberOfLines={2}>
                {lightboxImage.name}
              </Text>
            </View>
          )}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
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
  progressContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.surface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    width: '50%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  progressFillFull: {
    width: '100%',
  },
  progressSteps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  progressLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  progressLabelActive: {
    color: colors.primary,
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
  sectionSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
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
  shuffleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
    gap: spacing.xs,
  },
  shuffleButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  typeTabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: 4,
  },
  typeTab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  typeTabActive: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  typeTabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  typeTabTextActive: {
    color: colors.textPrimary,
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
    gap: spacing.md,
  },
  itemImage: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  itemImageWrap: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  itemImagePressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  itemImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
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
  quantityText: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.textPrimary,
    minWidth: 30,
    textAlign: 'center',
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
  summaryCard: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  summaryLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: colors.textTertiary,
    minWidth: 42,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  summaryItemsList: {
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  summaryItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  summaryItemRowLast: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  summaryItemImage: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  summaryItemImageWrap: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  summaryItemImagePressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  summaryItemImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryItemContent: {
    flex: 1,
  },
  summaryItemName: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  summaryItemMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  driverCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  driverCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  driverAvatarSelected: {
    backgroundColor: colors.primary,
  },
  driverAvatarText: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  driverAvatarTextSelected: {
    color: '#fff',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  driverNameSelected: {
    color: colors.primary,
  },
  driverDetail: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  driverDetailSelected: {
    color: colors.primary,
    opacity: 0.8,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  vehicleCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  vehicleCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  vehicleIconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  vehicleNameSelected: {
    color: colors.primary,
  },
  vehicleDetail: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  vehicleDetailSelected: {
    color: colors.primary,
    opacity: 0.8,
  },
  vehicleMileage: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  bottomCta: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  modalContainer: {
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
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successModalContent: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginHorizontal: spacing.xl,
    alignItems: 'center',
    minWidth: 280,
    maxWidth: 340,
  },
  successIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.successGlow || 'rgba(0, 168, 122, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  successButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    minWidth: 120,
    alignItems: 'center',
  },
  successButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.base,
    fontWeight: '600',
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
    gap: spacing.md,
  },
  pickItemCardAdded: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
    opacity: 0.7,
  },
  pickItemImage: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  pickItemImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  // Select Field 樣式
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectFieldLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectFieldContent: {
    marginLeft: spacing.md,
    flex: 1,
  },
  selectFieldLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectFieldValue: {
    fontSize: typography.fontSize.base,
    color: colors.textTertiary,
    marginTop: 2,
  },
  selectFieldValueSelected: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  selectFieldRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearButton: {
    padding: spacing.xs,
    marginRight: spacing.xs,
  },
  selectChevron: {
    transform: [{ rotate: '180deg' }],
  },
  selectedCustomerInfo: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  selectedCustomerLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  selectedCustomerValue: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  // 客戶選擇 Modal 樣式
  customerModalActions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  addCustomerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
    gap: spacing.xs,
  },
  addCustomerBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  customerCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  customerCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  customerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  customerAvatarSelected: {
    backgroundColor: colors.primary,
  },
  customerAvatarText: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  customerAvatarTextSelected: {
    color: '#fff',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  customerNameSelected: {
    color: colors.primary,
  },
  customerDetail: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  customerDetailSelected: {
    color: colors.primary,
    opacity: 0.8,
  },
  // 新增客戶表單樣式
  addCustomerForm: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  formGroup: {
    marginBottom: spacing.lg,
  },
  formLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  formInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
  },
  formInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  addCustomerFooter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  buttonHalf: {
    flex: 1,
  },

  // Lightbox 樣式
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  lightboxContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  lightboxImage: {
    width: '100%',
    flex: 1,
    marginVertical: spacing.lg,
  },
  lightboxCaption: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
});
