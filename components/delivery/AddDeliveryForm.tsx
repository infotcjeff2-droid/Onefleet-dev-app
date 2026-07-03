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
import { MapPin, Truck, User, Check, ChevronLeft, Shuffle, Package, Plus, Minus, X } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDeliveryStore } from '@/store/deliveryStore';
import { useDriverStore, Driver } from '@/store/driverStore';
import { useVehicleStore } from '@/store/vehicleStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { DeliveryCargoItem } from '@/types';

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
}

export function AddDeliveryForm({ mode = 'add', initialData }: AddDeliveryFormProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);

  const { addOrder } = useDeliveryStore();
  const { drivers, loadDrivers, getVehiclesByDriverId } = useDriverStore();
  const { vehicles, loadVehicles } = useVehicleStore();
  const managedDrivers = useUserManagementStore((state) => state.users).filter((u) => u.role === 'driver');
  const { items, loadItems, warehouseStocks, loadStocks } = useInventoryStore();

  const [pickupAddress, setPickupAddress] = useState(initialData?.pickupAddress ?? '');
  const [dropoffAddress, setDropoffAddress] = useState(initialData?.dropoffAddress ?? '');
  const [isScheduled, setIsScheduled] = useState(initialData?.isScheduled ?? false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [step, setStep] = useState<'address' | 'driver'>('address');

  // 物品選擇相關狀態
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');

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
  }, []);

  // 合併司機列表
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

  // 選中的司機
  const selectedDriver = mergedDrivers.find((d) => d.id === selectedDriverId);

  // 根據選中的司機獲取其車輛
  const driverVehicles = useMemo(() => {
    if (!selectedDriverId) return [];
    return getVehiclesByDriverId(selectedDriverId, vehicles);
  }, [selectedDriverId, vehicles, getVehiclesByDriverId]);

  // 如果司機有綁定的車輛，自動選擇
  useEffect(() => {
    if (selectedDriverId && driverVehicles.length === 1) {
      setSelectedVehicleId(driverVehicles[0].id);
    }
  }, [selectedDriverId, driverVehicles]);

  // 獲取物品的可用庫存
  const getItemStock = (itemId: string): number => {
    const stock = warehouseStocks.find((s) => s.itemId === itemId);
    return stock?.quantity ?? 0;
  };

  // 添加物品
  const handleAddItem = (item: typeof items[0]) => {
    const existing = selectedItems.find((i) => i.itemId === item.id);
    if (existing) {
      setSelectedItems((prev) =>
        prev.map((i) =>
          i.itemId === item.id && i.quantity < getItemStock(item.id)
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
          availableStock: getItemStock(item.id),
        },
      ]);
    }
  };

  // 增加物品數量
  const handleIncreaseItem = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.map((i) => {
        if (i.itemId === itemId && i.quantity < i.availableStock) {
          return { ...i, quantity: i.quantity + 1 };
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
          return { ...i, quantity: i.quantity - 1 };
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

  const handleNext = () => {
    if (!canProceedToStep2) {
      if (!isAddressValid) {
        Alert.alert(t('common.error'), '請填寫收貨和送貨地址');
        return;
      }
      if (!isCargoValid) {
        Alert.alert(t('common.error'), '請選擇至少一個配送物品');
        return;
      }
      return;
    }
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
    if (!selectedDriverId || !selectedVehicleId) {
      Alert.alert(t('common.error'), '請選擇司機和車輛');
      return;
    }

    try {
      const now = new Date();
      const cargoItems: DeliveryCargoItem[] = selectedItems.map((item) => ({
        itemId: item.itemId,
        itemName: item.itemName,
        quantity: item.quantity,
        unitWeight: item.unitWeight,
        totalWeight: item.quantity * item.unitWeight,
      }));

      await addOrder({
        orderNo: '',
        customerName: customerName || (selectedDriver?.name ?? ''),
        customerPhone: customerPhone || (selectedDriver?.phone ?? ''),
        pickupAddress: pickupAddress.trim(),
        pickupTime: now.toISOString().slice(0, 19).replace('T', ' '),
        dropoffAddress: dropoffAddress.trim(),
        cargoDescription,
        cargoWeight: totalWeight,
        notes: notes || undefined,
        status: 'assigned',
        assignedDriverId: selectedDriverId,
        assignedDriverName: selectedDriver?.name,
        cargoItems,
      });

      // 扣減庫存
      for (const item of selectedItems) {
        // 從第一個倉庫扣減（簡化版）
        const warehouseId = 'default-warehouse';
        await useInventoryStore.getState().deductStock(warehouseId, item.itemId, item.quantity);
      }

      router.back();
    } catch {
      Alert.alert(t('common.error'), t('common.error'));
    }
  };

  const handleDriverSelect = (driverId: string) => {
    setSelectedDriverId(driverId);
    // 司機選擇後會自動觸發 useEffect 選擇其車輛
  };

  const handleVehicleSelect = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
  };

  // 渲染步驟 1 - 地址和物品選擇
  const renderAddressStep = () => (
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
            {selectedItems.map((item) => (
              <Card key={item.itemId} style={styles.itemCard}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.itemName}</Text>
                  <Text style={styles.itemMeta}>
                    單件重量: {item.unitWeight} kg | 庫存: {item.availableStock}
                  </Text>
                </View>
                <View style={styles.itemQuantity}>
                  <Pressable
                    style={styles.quantityBtn}
                    onPress={() => handleDecreaseItem(item.itemId)}
                  >
                    <Minus size={16} color={colors.primary} />
                  </Pressable>
                  <Text style={styles.quantityText}>{item.quantity}</Text>
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
            ))}

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
          <View style={styles.summaryRow}>
            <MapPin size={16} color={colors.accent} />
            <Text style={styles.summaryText} numberOfLines={1}>{pickupAddress}</Text>
          </View>
          <View style={styles.summaryRow}>
            <MapPin size={16} color={colors.danger} />
            <Text style={styles.summaryText} numberOfLines={1}>{dropoffAddress}</Text>
          </View>
        </Card>
      </View>

      {/* 司機選擇 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>選擇司機</Text>
        <Text style={styles.sectionSubtitle}>
          選擇司機後，系統會自動顯示該司機的車輛
        </Text>

        {mergedDrivers.length === 0 ? (
          <Card style={styles.emptyCard}>
            <User size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>暫無可用司機</Text>
          </Card>
        ) : (
          mergedDrivers.map((driver) => {
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
                      {driver.phone} {driverCars.length > 0 ? `| ${driverCars.length} 輛車` : ''}
                    </Text>
                  </View>
                </View>
                <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                  {isSelected && <Check size={14} color="#fff" />}
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      {/* 車輛選擇（根據司機過濾） */}
      {selectedDriverId && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>選擇車輛</Text>
          {driverVehicles.length > 0 ? (
            <>
              <Text style={styles.sectionSubtitle}>
                已過濾顯示 {selectedDriver?.name} 的車輛
              </Text>
              {driverVehicles.map((vehicle) => {
                const isSelected = selectedVehicleId === vehicle.id;
                return (
                  <Pressable
                    key={vehicle.id}
                    style={[styles.vehicleCard, isSelected && styles.vehicleCardSelected]}
                    onPress={() => handleVehicleSelect(vehicle.id)}
                  >
                    <View style={styles.vehicleCardLeft}>
                      <View style={styles.vehicleIconContainer}>
                        <Truck size={24} color={isSelected ? '#fff' : colors.primary} />
                      </View>
                      <View style={styles.vehicleInfo}>
                        <Text style={[styles.vehicleName, isSelected && styles.vehicleNameSelected]}>
                          {vehicle.make} {vehicle.model}
                        </Text>
                        <Text style={[styles.vehicleDetail, isSelected && styles.vehicleDetailSelected]}>
                          {vehicle.plateNumber} | {vehicle.color}
                        </Text>
                        {vehicle.mileage && (
                          <Text style={styles.vehicleMileage}>
                            里程: {vehicle.mileage.toLocaleString()} km
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                      {isSelected && <Check size={14} color="#fff" />}
                    </View>
                  </Pressable>
                );
              })}
            </>
          ) : (
            <Card style={styles.emptyCard}>
              <Truck size={32} color={colors.textTertiary} />
              <Text style={styles.emptyText}>此司機尚未綁定車輛</Text>
              <Text style={styles.emptyHint}>請在車輛管理中將車輛分配給此司機</Text>
            </Card>
          )}
        </View>
      )}
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
          title={step === 'address' ? '下一步' : t('delivery.createDelivery')}
          variant="primary"
          size="lg"
          onPress={step === 'address' ? handleNext : handleConfirm}
          disabled={step === 'address' ? !canProceedToStep2 : !selectedDriverId || !selectedVehicleId}
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
                  const stock = getItemStock(item.id);
                  const isAdded = selectedItems.some((i) => i.itemId === item.id);
                  return (
                    <Pressable
                      key={item.id}
                      style={[styles.pickItemCard, isAdded && styles.pickItemCardAdded]}
                      onPress={() => {
                        if (!isAdded && stock > 0) {
                          handleAddItem(item);
                        }
                      }}
                      disabled={isAdded || stock === 0}
                    >
                      <View style={styles.pickItemInfo}>
                        <Text style={styles.pickItemName}>{item.name}</Text>
                        <Text style={styles.pickItemMeta}>
                          單件 {item.unitWeight} kg | 庫存 {stock}
                        </Text>
                      </View>
                      {isAdded ? (
                        <View style={styles.addedBadge}>
                          <Check size={14} color={colors.primary} />
                          <Text style={styles.addedText}>已添加</Text>
                        </View>
                      ) : stock === 0 ? (
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
    gap: spacing.md,
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
});
