import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Alert,
  Dimensions,
  TextInput as RNTextInput,
  Image,
  Platform,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';
import { router } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { getEffectiveDeliveryStatus, useDeliveryStore } from '@/store/deliveryStore';
import { DeliveryOrder, DeliveryStatus } from '@/types';
import { useDriverStore, Driver } from '@/store/driverStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { colors, spacing, typography, borderRadius } from '@/constants/theme';
import { Header } from '@/components/ui/Header';
import {
  Package,
  MapPin,
  Clock,
  User,
  CheckCircle,
  Truck,
  FileText,
  X,
  Plus,
  ChevronRight,
  AlertTriangle,
  Image as ImageIcon,
} from 'lucide-react-native';
import { useTranslation } from '@/i18n';

const { width: SCREEN_W } = Dimensions.get('window');

function StatusBadge({ status, isCompleted, t }: { status: DeliveryStatus; isCompleted?: boolean; t: (key: string) => string }) {
  // 已完成的配送單顯示特殊狀態
  if (isCompleted) {
    return (
      <View style={[styles.badge, { backgroundColor: `${colors.success}20` }]}>
        <Text style={[styles.badgeText, { color: colors.success }]}>{t('delivery.orderCompleted')}</Text>
      </View>
    );
  }

  const statusConfig: Record<DeliveryStatus, { labelKey: string; color: string; bg: string }> = {
    pending: { labelKey: 'delivery.pending', color: colors.warning, bg: `${colors.warning}20` },
    assigned: { labelKey: 'delivery.assigned', color: colors.secondary, bg: `${colors.secondary}20` },
    in_transit: { labelKey: 'delivery.inTransit', color: colors.accent, bg: `${colors.accent}20` },
    delivered: { labelKey: 'delivery.delivered', color: colors.success, bg: `${colors.success}20` },
    signed: { labelKey: 'delivery.signed', color: colors.primary, bg: `${colors.primary}20` },
    expired: { labelKey: 'delivery.expired', color: colors.danger, bg: `${colors.danger}20` },
  };
  const cfg = statusConfig[status];
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{t(cfg.labelKey)}</Text>
    </View>
  );
}

function DeliveryCard({
  item,
  isAdmin,
  onPress,
  onAssign,
  onStartTransit,
  onSign,
  t,
}: {
  item: DeliveryOrder;
  isAdmin: boolean;
  onPress: () => void;
  onAssign: () => void;
  onStartTransit: (item: DeliveryOrder) => void;
  onSign: () => void;
  t: (key: string) => string;
}) {
  const isExpired = item.status === 'expired';

  // Get first pickup photo URI
  const firstPickupPhoto = item.pickupPhotos && item.pickupPhotos.length > 0 ? item.pickupPhotos[0] : null;

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <Card style={styles.deliveryCard} onPress={onPress}>
        <View style={styles.cardHeader}>
          <View style={styles.orderNoContainer}>
            <FileText size={14} color={colors.primary} />
            <Text style={styles.orderNo}>{item.orderNo}</Text>
          </View>
          <View style={styles.cardHeaderRight}>
            <StatusBadge status={item.status} isCompleted={item.isCompleted} t={t} />
            <ChevronRight size={16} color={colors.textTertiary} />
          </View>
        </View>

        <View style={styles.cardBody}>
          {/* Left Column - Text Info */}
          <View style={styles.cardBodyLeft}>
            <View style={styles.infoRow}>
              <User size={16} color={colors.textSecondary} />
              <Text style={styles.infoTextLarge}>{item.customerName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Package size={16} color={colors.textSecondary} />
              <Text style={styles.infoTextLarge} numberOfLines={1}>{item.cargoDescription}</Text>
            </View>
            <View style={styles.infoRow}>
              <MapPin size={16} color={colors.danger} />
              <Text style={styles.infoTextLarge} numberOfLines={1}>{item.dropoffAddress}</Text>
            </View>
            <View style={styles.infoRow}>
              <Clock size={16} color={colors.textSecondary} />
              <Text style={styles.infoTextLarge}>
                {(() => {
                  const d = new Date(item.pickupTime);
                  const year = d.getFullYear();
                  const month = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  const hours = String(d.getHours()).padStart(2, '0');
                  const minutes = String(d.getMinutes()).padStart(2, '0');
                  return `${year}-${month}-${day} ${hours}:${minutes}`;
                })()}
              </Text>
            </View>
            {item.assignedDriverName && (
              <View style={styles.infoRow}>
                <Truck size={16} color={colors.textSecondary} />
                <Text style={styles.infoTextLarge}>{item.assignedDriverName}</Text>
              </View>
            )}
          </View>

          {/* Right Column - Pickup Photo */}
          {firstPickupPhoto && (
            <View style={styles.cardBodyRight}>
              <Image
                source={{ uri: firstPickupPhoto.uri }}
                style={styles.pickupPhotoThumb}
                resizeMode="contain"
              />
            </View>
          )}
        </View>

        {isExpired && (
          <View style={styles.expiredNotice}>
            <AlertTriangle size={14} color={colors.danger} />
            <Text style={styles.expiredNoticeText}>{t('delivery.expiredReadonly')}</Text>
          </View>
        )}

        <View style={styles.cardActions}>
          {isAdmin && !item.assignedDriverId && (
            <Button title={t('delivery.assignDriver')} size="sm" onPress={onAssign} fullWidth />
          )}
          {!isAdmin && item.status === 'assigned' && (
            <Button title={t('delivery.stepPickedUp')} size="sm" onPress={() => onStartTransit(item)} fullWidth icon={<Package size={14} color="#fff" />} />
          )}
          {!isAdmin && item.status === 'in_transit' && (
            <Button title={t('delivery.markDelivered')} size="sm" onPress={() => router.replace(`/delivery/${item.id}?action=transit`)} fullWidth variant="secondary" icon={<CheckCircle size={14} color={colors.primary} />} />
          )}
          {!isAdmin && item.status === 'delivered' && (
            <Button title={t('delivery.signDelivery')} size="sm" onPress={onSign} fullWidth variant="secondary" icon={<CheckCircle size={14} color={colors.primary} />} />
          )}
        </View>

        {item.photos && item.photos.length > 0 && (
          <View style={styles.photoIndicator}>
            <ImageIcon size={14} color={colors.accent} />
            <Text style={styles.photoIndicatorText}>{item.photos.length} 張圖片</Text>
          </View>
        )}

        {item.signatureData && (
          <View style={styles.signedIndicator}>
            <CheckCircle size={14} color={colors.success} />
            <Text style={styles.signedText}>{t('delivery.signedAt')} {new Date(item.signedAt!).toLocaleString()}</Text>
          </View>
        )}
      </Card>
    </Animated.View>
  );
}

function TabBar({
  tabs,
  activeTab,
  onTabChange,
  counts,
  disabledTabs = [],
}: {
  tabs: string[];
  activeTab: number;
  onTabChange: (i: number) => void;
  counts: number[];
  disabledTabs?: number[];
}) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab, i) => {
        const isDisabled = disabledTabs.includes(i);
        return (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === i && styles.tabActive, isDisabled && styles.tabDisabled]}
            onPress={() => !isDisabled && onTabChange(i)}
            disabled={isDisabled}
          >
            <Text style={[styles.tabText, activeTab === i && styles.tabTextActive, isDisabled && styles.tabTextDisabled]}>
              {tab}
            </Text>
            <View style={[styles.tabCountBadge, activeTab === i && styles.tabCountBadgeActive, isDisabled && styles.tabCountBadgeDisabled]}>
              <Text style={[styles.tabCountText, activeTab === i && styles.tabCountTextActive, isDisabled && styles.tabCountTextDisabled]}>
                {counts[i]}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function AssignDriverModal({
  visible,
  onClose,
  onAssign,
  removeDriver,
  deliveries,
  selectedDeliveryId,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  onAssign: (driverId: string, driverName: string) => void;
  removeDriver: (deliveryId: string) => void;
  deliveries: DeliveryOrder[];
  selectedDeliveryId: string | null;
  t: (key: string) => string;
}) {
  const storeDrivers = useDriverStore((state) => state.drivers);
  const managedDrivers = useUserManagementStore((state) => state.users).filter((u) => u.role === 'driver');

  // 優先使用 managedDrivers（使用 Clerk user ID），避免與 storeDrivers 衝突
  const drivers = [
    ...managedDrivers
      .filter((m) => !storeDrivers.some((d) => d.id === m.id))
      .map((u) => ({ id: u.id, name: u.name, phone: u.phone || '', vehiclePlate: '', status: 'available' as const })),
    ...storeDrivers.map((d) => ({ ...d, vehiclePlate: d.vehiclePlate || '' })),
  ];

  // 所有有效的司機 ID（用於驗證已指派司機的有效性）
  const validDriverIds = new Set([...storeDrivers.map((d) => d.id), ...managedDrivers.map((u) => u.id)]);

  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  useEffect(() => {
    useDriverStore.getState().loadDrivers();
    useUserManagementStore.getState().loadUsers();
  }, [visible]);

  useEffect(() => {
    if (visible && selectedDeliveryId) {
      const delivery = deliveries.find((d) => d.id === selectedDeliveryId);
      if (delivery?.assignedDriverId && !validDriverIds.has(delivery.assignedDriverId)) {
        removeDriver(selectedDeliveryId);
        Alert.alert(t('delivery.driverRemoved'), t('delivery.driverRemovedMsg'));
      }
    }
  }, [visible, selectedDeliveryId, deliveries, validDriverIds, removeDriver, t]);

  const handleConfirm = () => {
    if (!selectedDriverId) {
      Alert.alert(t('common.error'), t('delivery.selectDriver'));
      return;
    }
    const driver = drivers.find((d) => d.id === selectedDriverId);
    if (driver) {
      onAssign(selectedDriverId, driver.name);
      setSelectedDriverId(null);
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Animated.View entering={FadeInDown.springify()} style={styles.modalContent}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('delivery.selectDriverTitle')}</Text>
            <Pressable onPress={onClose} hitSlop={12}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <ScrollView style={styles.driverList}>
            {drivers.map((driver) => (
              <Pressable
                key={driver.id}
                onPress={() => setSelectedDriverId(driver.id)}
                style={[styles.driverItem, selectedDriverId === driver.id && styles.driverItemSelected]}
              >
                <View style={styles.driverAvatar}>
                  <Text style={styles.driverAvatarText}>{driver.name.charAt(0)}</Text>
                </View>
                <View style={styles.driverInfo}>
                  <Text style={styles.driverName}>{driver.name}</Text>
                  <Text style={styles.driverDetail}>{driver.vehiclePlate} | {driver.phone}</Text>
                </View>
                <View style={[styles.radioCircle, selectedDriverId === driver.id && styles.radioCircleSelected]}>
                  {selectedDriverId === driver.id && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.modalActions}>
            <Button title={t('common.cancel')} variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title={t('common.confirm')} onPress={handleConfirm} style={{ flex: 1 }} disabled={!selectedDriverId} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function SignatureModal({
  visible,
  onClose,
  onConfirm,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (signatureData: string, strokes: { x: number; y: number; id: number }[][]) => void;
  t: (key: string) => string;
}) {
  const [lines, setLines] = useState<{ x: number; y: number; id: number }[][]>([]);
  const [currentLine, setCurrentLine] = useState<{ x: number; y: number; id: number }[]>([]);
  const lineIdRef = useRef(0);
  const isDrawingRef = useRef(false);
  const currentLineRef = useRef<{ x: number; y: number; id: number }[]>([]);
  const linesRef = useRef<{ x: number; y: number; id: number }[][]>([]);

  const isWeb = Platform.OS === 'web';

  const handleTouch = (x: number, y: number) => {
    const newPoint = { x, y, id: lineIdRef.current++ };
    currentLineRef.current = [...currentLineRef.current, newPoint];
    setCurrentLine([...currentLineRef.current]);
  };

  const handleEndLine = () => {
    if (currentLineRef.current.length > 0) {
      linesRef.current = [...linesRef.current, [...currentLineRef.current]];
      setLines([...linesRef.current]);
      currentLineRef.current = [];
      setCurrentLine([]);
    }
    isDrawingRef.current = false;
  };

  const handleClear = () => {
    linesRef.current = [];
    currentLineRef.current = [];
    setLines([]);
    setCurrentLine([]);
  };

  const handleConfirm = () => {
    onConfirm(`signed-${Date.now()}`, linesRef.current);
    handleClear();
    onClose();
  };

  const hasSignature = lines.length > 0 || currentLine.length > 0;

  const handlePointerDown = (e: any) => {
    isDrawingRef.current = true;
    currentLineRef.current = [];
    let x: number, y: number;
    if (isWeb) {
      x = e.clientX - (e.currentTarget?.getBoundingClientRect?.().left ?? 0);
      y = e.clientY - (e.currentTarget?.getBoundingClientRect?.().top ?? 0);
    } else {
      x = e.nativeEvent?.locationX ?? 0;
      y = e.nativeEvent?.locationY ?? 0;
    }
    handleTouch(x, y);
  };

  const handlePointerMove = (e: any) => {
    if (!isDrawingRef.current) return;
    let x: number, y: number;
    if (isWeb) {
      x = e.clientX - (e.currentTarget?.getBoundingClientRect?.().left ?? 0);
      y = e.clientY - (e.currentTarget?.getBoundingClientRect?.().top ?? 0);
    } else {
      x = e.nativeEvent?.locationX ?? 0;
      y = e.nativeEvent?.locationY ?? 0;
    }
    handleTouch(x, y);
  };

  const handlePointerUp = () => {
    handleEndLine();
  };

  const signaturePadWebStyle = isWeb ? { touchAction: 'none' as const } : {};

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Animated.View entering={FadeInDown.springify()} style={styles.modalContent}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('delivery.electronicSignature')}</Text>
            <Pressable onPress={onClose} hitSlop={12}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <Text style={styles.signatureHint}>{t('delivery.signBelowConfirm')}</Text>
          <Pressable
            style={[styles.signaturePad, signaturePadWebStyle]}
            onPointerDown={isWeb ? handlePointerDown : undefined}
            onPointerMove={isWeb ? handlePointerMove : undefined}
            onPointerUp={isWeb ? handlePointerUp : undefined}
            onPointerLeave={isWeb ? handlePointerUp : undefined}
          >
            <View style={styles.signaturePadInner}>
              <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                {lines.map((stroke) =>
                  stroke.length > 1
                    ? stroke.slice(1).map((pt, i) => (
                        <Line
                          key={`l-${stroke[0].id}-${i}`}
                          x1={stroke[i].x}
                          y1={stroke[i].y}
                          x2={pt.x}
                          y2={pt.y}
                          stroke={colors.textPrimary}
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))
                    : null
                )}
                {currentLine.length > 1 &&
                  currentLine.slice(1).map((pt, i) => (
                    <Line
                      key={`c-${i}`}
                      x1={currentLine[i].x}
                      y1={currentLine[i].y}
                      x2={pt.x}
                      y2={pt.y}
                      stroke={colors.textPrimary}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
              </Svg>
              {!hasSignature && (
                <Text style={styles.signaturePlaceholder}>{t('delivery.drawSignatureHere')}</Text>
              )}
            </View>
          </Pressable>
          <View style={styles.modalActions}>
            <Button title={t('delivery.clear')} variant="ghost" onPress={handleClear} style={{ flex: 1 }} />
            <Button title={t('delivery.confirmSignature')} onPress={handleConfirm} style={{ flex: 2 }} disabled={!hasSignature} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function NewOrderModal({
  visible,
  onClose,
  onSubmit,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (order: Omit<DeliveryOrder, 'id' | 'createdAt'>) => void;
  t: (key: string) => string;
}) {
  const storeDrivers = useDriverStore((state) => state.drivers);
  const managedDrivers = useUserManagementStore((state) => state.users).filter((u) => u.role === 'driver');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [cargoDescription, setCargoDescription] = useState('');
  const [cargoWeight, setCargoWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  // 優先使用 managedDrivers（使用 Clerk user ID），避免與 storeDrivers 衝突
  const mergedDrivers: Driver[] = [
    ...managedDrivers
      .filter((m) => !storeDrivers.some((d) => d.id === m.id))
      .map((driver) => ({ id: driver.id, name: driver.name, phone: driver.phone || '', vehiclePlate: '', status: 'available' as const })),
    ...storeDrivers.map((d) => ({ ...d, vehiclePlate: d.vehiclePlate || '' })),
  ];

  const reset = () => {
    setCustomerName('');
    setCustomerPhone('');
    setPickupAddress('');
    setDropoffAddress('');
    setCargoDescription('');
    setCargoWeight('');
    setNotes('');
    setSelectedDriverId(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (!customerName.trim() || !customerPhone.trim() || !pickupAddress.trim() || !dropoffAddress.trim()) {
      Alert.alert(t('common.error'), t('delivery.required'));
      return;
    }

    const selectedDriver = mergedDrivers.find((driver) => driver.id === selectedDriverId);
    const now = new Date();
    onSubmit({
      orderNo: '',
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickupAddress: pickupAddress.trim(),
      pickupTime: now.toISOString().slice(0, 19).replace('T', ' '),
      dropoffAddress: dropoffAddress.trim(),
      cargoDescription: cargoDescription.trim(),
      cargoWeight: cargoWeight.trim() ? Number(cargoWeight) : 0,
      notes: notes.trim() || undefined,
      status: selectedDriver ? 'assigned' : 'pending',
      assignedDriverId: selectedDriverId ?? undefined,
      assignedDriverName: selectedDriver?.name,
    });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Animated.View entering={FadeInDown.springify()} style={[styles.modalContent, styles.newOrderModalContent]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('delivery.newDelivery')}</Text>
            <Pressable onPress={handleClose} hitSlop={12}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <ScrollView style={styles.formScrollView} showsVerticalScrollIndicator={false}>
            <RNTextInput style={styles.input} placeholder={t('delivery.customerName')} value={customerName} onChangeText={setCustomerName} />
            <RNTextInput style={styles.input} placeholder={t('delivery.phone')} value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" />
            <RNTextInput style={styles.input} placeholder={t('delivery.pickupAddress')} value={pickupAddress} onChangeText={setPickupAddress} />
            <RNTextInput style={styles.input} placeholder={t('delivery.dropoffAddress')} value={dropoffAddress} onChangeText={setDropoffAddress} />
            <RNTextInput style={styles.input} placeholder={t('delivery.cargoDescription')} value={cargoDescription} onChangeText={setCargoDescription} />
            <RNTextInput style={styles.input} placeholder={t('delivery.cargoWeight')} value={cargoWeight} onChangeText={setCargoWeight} keyboardType="numeric" />
            <RNTextInput style={[styles.input, styles.notesInput]} placeholder={t('delivery.notes')} value={notes} onChangeText={setNotes} multiline />
            <Text style={styles.fieldLabel}>{t('delivery.chooseDriver')}</Text>
            {mergedDrivers.map((driver) => (
              <Pressable
                key={driver.id}
                onPress={() => setSelectedDriverId(driver.id)}
                style={[styles.driverItem, selectedDriverId === driver.id && styles.driverItemSelected]}
              >
                <View style={styles.driverAvatar}>
                  <Text style={styles.driverAvatarText}>{driver.name.charAt(0)}</Text>
                </View>
                <View style={styles.driverInfo}>
                  <Text style={styles.driverName}>{driver.name}</Text>
                  <Text style={styles.driverDetail}>{driver.vehiclePlate} | {driver.phone}</Text>
                </View>
                <View style={[styles.radioCircle, selectedDriverId === driver.id && styles.radioCircleSelected]}>
                  {selectedDriverId === driver.id && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.modalActions}>
            <Button title={t('common.cancel')} variant="ghost" onPress={handleClose} style={{ flex: 1 }} />
            <Button title={t('delivery.createDelivery')} onPress={handleSubmit} style={{ flex: 1.5 }} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const today = new Date().toISOString().slice(0, 10);

export default function DeliveryScreen() {
  const { t } = useTranslation();
  const { role, user } = useAuthStore();
  const { deliveries, assignDriver, updateStatus, addSignature, addOrder } = useDeliveryStore();
  const { loadDrivers } = useDriverStore();
  const loadUsers = useUserManagementStore((state) => state.loadUsers);

  useEffect(() => {
    // 確保先載入本地數據，再同步遠端數據
    const init = async () => {
      console.log('[DeliveryScreen] init - loading deliveries...');
      await useDeliveryStore.getState().loadDeliveries();
      console.log('[DeliveryScreen] init - after loadDeliveries, deliveries:', useDeliveryStore.getState().deliveries.length);
      
      // 延遲同步，等待新增訂單的冷卻期結束
      console.log('[DeliveryScreen] init - waiting for cooldown before sync...');
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      console.log('[DeliveryScreen] init - syncing deliveries...');
      await useDeliveryStore.getState().syncDeliveries();
      console.log('[DeliveryScreen] init - after syncDeliveries, deliveries:', useDeliveryStore.getState().deliveries.length);
      loadDrivers();
      loadUsers();
    };
    init();
  }, []);

  const isAdmin = role === 'admin' || role === 'company';
  const isDriver = role === 'driver';

  const [activeTab, setActiveTab] = useState(0);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [signingDeliveryId, setSigningDeliveryId] = useState<string | null>(null);
  const [newOrderModalVisible, setNewOrderModalVisible] = useState(false);

  const normalizedDeliveries = deliveries.map((delivery) => ({ ...delivery, status: getEffectiveDeliveryStatus(delivery) }));
  console.log('[DeliveryScreen] === DEBUG INFO ===');
  console.log('[DeliveryScreen] isDriver:', isDriver, '| user.id:', user?.id, '| user.name:', user?.name);
  console.log('[DeliveryScreen] All deliveries:', normalizedDeliveries.map(d => ({ id: d.id, assignedDriverId: d.assignedDriverId, assignedDriverName: d.assignedDriverName, status: d.status })));

  // ★ 對於司機：如果用戶名匹配，但 ID 不匹配，更新 user.id 為實際的司機 ID
  // 這樣下次查詢時會正確過濾
  useEffect(() => {
    if (isDriver && user && !user.id.startsWith('d') && normalizedDeliveries.length > 0) {
      // user.id 看起來不像 managed_driver 的 ID (例如 d123456)
      // 查找是否有相同名稱的 assigned 司機
      const matchedDelivery = normalizedDeliveries.find(
        (d) => d.assignedDriverName === user.name && d.assignedDriverId
      );
      if (matchedDelivery && matchedDelivery.assignedDriverId && matchedDelivery.assignedDriverId !== user.id) {
        console.log('[DeliveryScreen] Updating user.id to match:', matchedDelivery.assignedDriverId);
        const updatedUser = { ...user, id: matchedDelivery.assignedDriverId! };
        useAuthStore.setState({ user: updatedUser });
      }
    }
  }, [isDriver, user, normalizedDeliveries.length]);

  const displayDeliveries = isDriver && user
    ? normalizedDeliveries
        .filter((delivery) => {
          // ★ 雙重匹配：同時匹配 assignedDriverId 和 assignedDriverName
          // 確保即使 ID 格式不一致（例如 demo 帳號登入），仍能匹配
          const matchById = delivery.assignedDriverId === user.id;
          const matchByName = !!user.name && !!delivery.assignedDriverName && delivery.assignedDriverName === user.name;
          const match = matchById || matchByName;
          console.log('[DeliveryScreen] Filtering: delivery', delivery.id, 'assignedDriverId:', delivery.assignedDriverId, 'assignedDriverName:', delivery.assignedDriverName, 'user.id:', user.id, 'user.name:', user.name, 'match:', match);
          return match;
        })
        .sort((a, b) => {
          // 由新至舊排序（最新建立的在前）
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateB - dateA;
        })
    : normalizedDeliveries.sort((a, b) => {
        // 由新至舊排序（最新建立的在前）
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
  console.log('[DeliveryScreen] displayDeliveries count:', displayDeliveries.length);

  const activeStatuses: DeliveryStatus[] = ['pending', 'assigned', 'in_transit'];

  // 今日：只顯示今天新增且狀態為 pending/assigned/in_transit 的單
  // 用於「待處理」tab（管理員關心今天的新單）
  const todayDeliveries = displayDeliveries.filter((delivery) =>
    delivery.pickupTime.slice(0, 10) === today && activeStatuses.includes(delivery.status)
  );

  // 待處理列表：今天 + pending 狀態
  const pendingDeliveries = todayDeliveries.filter((delivery) => delivery.status === 'pending');
  
  // 已分配列表：顯示「所有」assigned 狀態的單（不限日期）
  // 司機需要看到所有被分配給自己的單，不論 pickupTime 是今天還是明天
  const assignedDeliveries = displayDeliveries.filter((delivery) => delivery.status === 'assigned');
  
  // 配送中列表：顯示「所有」in_transit 狀態的單
  const inTransitDeliveries = displayDeliveries.filter((delivery) => delivery.status === 'in_transit');

  // 已簽收：顯示所有已簽收的單
  const signedDeliveries = displayDeliveries.filter((delivery) => delivery.status === 'signed');

  // 已過期：顯示「pickupTime 在今天之前」且「未簽收」的單
  // 無論狀態是 pending / assigned / in_transit / delivered / expired，
  // 只要日期不是今天且尚未簽收，都視為過期並集中在此頁籤。
  const expiredDeliveries = displayDeliveries.filter((delivery) =>
    delivery.status !== 'signed' && delivery.pickupTime.slice(0, 10) < today
  );

  // 已簽收的單按月份分組
  const getMonthKey = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  // 取得當月、前一個月、前兩個月的月份鍵（按序號）
  const getCurrentAndPrevMonths = () => {
    const now = new Date();
    const months: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  };

  const availableMonthKeys = getCurrentAndPrevMonths();

  // 動態生成月份名稱
  const getMonthName = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    return `${year}年${parseInt(month)}月`;
  };

  const signedByMonth = signedDeliveries.reduce((acc, delivery) => {
    const key = getMonthKey(delivery.signedAt || delivery.createdAt);
    if (!acc[key]) acc[key] = [];
    acc[key].push(delivery);
    return acc;
  }, {} as Record<string, DeliveryOrder[]>);

  // 只顯示有資料的月份（但在可選月份範圍內）
  const availableMonths = availableMonthKeys.filter(key => signedByMonth[key] && signedByMonth[key].length > 0);

  // 處理 Tab 切換和月份選擇
  const [signedSelectedMonth, setSignedSelectedMonth] = useState<string>(availableMonths[0] || '');
  const [monthSelectorVisible, setMonthSelectorVisible] = useState(false);

  // ★ 根據角色生成 tabs
  // 管理員/公司：顯示 待處理、已分配、配送中、已簽收、已過期
  // 司機：只顯示 已分配、配送中、已簽收、已過期（沒有「待處理」）
  const tabs = isDriver
    ? [t('delivery.assigned'), t('delivery.inTransit'), t('delivery.signed'), t('delivery.past')]
    : [t('delivery.pending'), t('delivery.assigned'), t('delivery.inTransit'), t('delivery.signed'), t('delivery.past')];
  const counts = isDriver
    ? [assignedDeliveries.length, inTransitDeliveries.length, signedDeliveries.length, expiredDeliveries.length]
    : [pendingDeliveries.length, assignedDeliveries.length, inTransitDeliveries.length, signedDeliveries.length, expiredDeliveries.length];

  // 根據 Tab 和月份過濾顯示的列表
  const getCurrentList = () => {
    if (isDriver) {
      if (activeTab === 0) return assignedDeliveries;
      if (activeTab === 1) return inTransitDeliveries;
      if (activeTab === 2) {
        return signedSelectedMonth ? signedByMonth[signedSelectedMonth] || [] : [];
      }
      return expiredDeliveries;
    }
    if (activeTab === 0) return pendingDeliveries;
    if (activeTab === 1) return assignedDeliveries;
    if (activeTab === 2) return inTransitDeliveries;
    if (activeTab === 3) {
      // 已簽收：默認顯示本月，選擇月份後顯示該月
      return signedSelectedMonth ? signedByMonth[signedSelectedMonth] || [] : [];
    }
    return expiredDeliveries;
  };

  const currentList = getCurrentList();

  const handleAssign = (deliveryId: string) => {
    const delivery = normalizedDeliveries.find((item) => item.id === deliveryId);
    if (delivery?.status === 'expired') {
      Alert.alert(t('delivery.expired'), t('delivery.expiredReadonly'));
      return;
    }

    setSelectedDeliveryId(deliveryId);
    setAssignModalVisible(true);
  };

  const handleDriverAssign = (driverId: string, driverName: string) => {
    if (selectedDeliveryId) {
      assignDriver(selectedDeliveryId, driverId, driverName);
    }
  };

  const handleStartTransit = (item: DeliveryOrder) => {
    // 司機點擊「已取貨」，直接跳到 detail 頁面的取貨 tab
    router.replace(`/delivery/${item.id}?action=pickup`);
  };

  const handleSignPress = (deliveryId: string) => {
    setSigningDeliveryId(deliveryId);
    setSignatureModalVisible(true);
  };

  const handleSignatureConfirm = async (signatureData: string, strokes: { x: number; y: number; id: number }[][]) => {
    if (signingDeliveryId) {
      await addSignature(signingDeliveryId, signatureData, strokes);
      router.replace('/(tabs)/delivery');
    }
  };

  const handleNewOrder = (order: Omit<DeliveryOrder, 'id' | 'createdAt'>) => {
    addOrder(order);
  };

  const pageTitle = isDriver ? t('delivery.myDeliveries') : isAdmin ? t('delivery.management') : t('delivery.title');

  const stats = {
    total: displayDeliveries.length,
    pending: displayDeliveries.filter((delivery) => delivery.status === 'pending').length,
    assigned: displayDeliveries.filter((delivery) => delivery.status === 'assigned').length,
    inTransit: displayDeliveries.filter((delivery) => delivery.status === 'in_transit').length,
    done: displayDeliveries.filter((delivery) => ['delivered', 'signed', 'expired'].includes(delivery.status)).length,
  };

  return (
    <View style={styles.container}>
      <Header
        title={pageTitle}
        leftElement={
          <Pressable onPress={() => router.push('/(tabs)')} hitSlop={8}>
            <Image
              source={require('@/assets/onefleet_2560.png')}
              style={{ width: 90, height: 30 }}
              resizeMode="contain"
            />
          </Pressable>
        }
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.statsRow}>
          {[
            { labelKey: 'delivery.total', value: stats.total, color: colors.primary },
            { labelKey: 'delivery.pending', value: stats.pending, color: colors.warning },
            { labelKey: 'delivery.assigned', value: stats.assigned, color: colors.secondary },
            { labelKey: 'delivery.inTransit', value: stats.inTransit, color: colors.accent },
            { labelKey: 'delivery.done', value: stats.done, color: colors.success },
          ].map((stat) => (
            <View key={stat.labelKey} style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: stat.color }]} />
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{t(stat.labelKey)}</Text>
            </View>
          ))}
        </View>

        <TabBar 
          tabs={tabs} 
          activeTab={activeTab} 
          onTabChange={(i) => {
            setActiveTab(i);
            // 司機模式：已簽收是 index 2；管理員模式：已簽收是 index 3
            const signedTabIndex = isDriver ? 2 : 3;
            if (i === signedTabIndex) {
              // 切換到已簽收時，默認顯示本月
              setSignedSelectedMonth(availableMonths[0] || '');
            }
          }} 
          counts={counts}
        />

        {/* 已簽收 Tab 的月份切換按鈕 */}
        {(activeTab === (isDriver ? 2 : 3)) && availableMonths.length > 1 && (
          <Pressable style={styles.monthSwitchBtn} onPress={() => setMonthSelectorVisible(true)}>
            <Text style={styles.monthSwitchBtnText}>
              {getMonthName(signedSelectedMonth)} ▾
            </Text>
          </Pressable>
        )}

        <View style={styles.section}>
          {activeTab === 3 && availableMonths.length === 0 ? (
            <Card style={styles.emptyCard}>
              <CheckCircle size={32} color={colors.textTertiary} />
              <Text style={styles.emptyText}>{t('delivery.noSignedOrders')}</Text>
            </Card>
          ) : currentList.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Package size={32} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {activeTab === 0 ? t('delivery.noPendingOrders') :
                 activeTab === 1 ? t('delivery.noAssignedOrders') :
                 activeTab === 2 ? t('delivery.noInTransitOrders') :
                 activeTab === 3 ? t('delivery.noSignedOrders') :
                 t('delivery.noExpiredOrders')}
              </Text>
            </Card>
          ) : (
            currentList.map((item) => (
              <DeliveryCard
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                onPress={() => router.push({ pathname: '/delivery/[id]', params: { id: item.id } })}
                onAssign={() => handleAssign(item.id)}
                onStartTransit={handleStartTransit}
                onSign={() => handleSignPress(item.id)}
                t={t}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* 月份選擇 Modal */}
      <Modal visible={monthSelectorVisible} transparent animationType="fade">
        <Pressable style={styles.monthModalOverlay} onPress={() => setMonthSelectorVisible(false)}>
          <Animated.View entering={FadeInUp.springify()} style={styles.monthModalContent}>
            <View style={styles.monthModalHeader}>
              <Text style={styles.monthModalTitle}>{t('delivery.signedMonthSelect') || '選擇月份'}</Text>
              <Pressable onPress={() => setMonthSelectorVisible(false)} hitSlop={12}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <View style={styles.monthModalGrid}>
              {availableMonths.map((monthKey) => (
                <Pressable
                  key={monthKey}
                  style={[styles.monthModalButton, signedSelectedMonth === monthKey && styles.monthModalButtonActive]}
                  onPress={() => {
                    setSignedSelectedMonth(monthKey);
                    setMonthSelectorVisible(false);
                  }}
                >
                  <Text style={[styles.monthModalButtonText, signedSelectedMonth === monthKey && styles.monthModalButtonTextActive]}>
                    {getMonthName(monthKey)}
                  </Text>
                  <Text style={[styles.monthModalCount, signedSelectedMonth === monthKey && styles.monthModalCountActive]}>
                    {signedByMonth[monthKey].length} {t('delivery.signedOrders') || '單'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        </Pressable>
      </Modal>

      <AssignDriverModal
        visible={assignModalVisible}
        onClose={() => setAssignModalVisible(false)}
        onAssign={handleDriverAssign}
        removeDriver={useDeliveryStore.getState().removeDriver}
        deliveries={normalizedDeliveries}
        selectedDeliveryId={selectedDeliveryId}
        t={t}
      />

      <SignatureModal
        visible={signatureModalVisible}
        onClose={() => setSignatureModalVisible(false)}
        onConfirm={handleSignatureConfirm}
        t={t}
      />

      <NewOrderModal
        visible={newOrderModalVisible}
        onClose={() => setNewOrderModalVisible(false)}
        onSubmit={handleNewOrder}
        t={t}
      />

      {isAdmin && (
        <Pressable style={styles.fab} onPress={() => router.push('/delivery/add')}>
          <Plus size={28} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1 },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statDot: { width: 8, height: 8, borderRadius: 4, marginBottom: spacing.xs },
  statValue: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: 9, color: colors.textTertiary, fontWeight: '600', textTransform: 'uppercase' },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  tabActive: { backgroundColor: colors.primaryGlow },
  tabDisabled: { opacity: 0.5 },
  tabText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.primary },
  tabTextDisabled: { color: colors.textTertiary },
  tabCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tabCountBadgeActive: { backgroundColor: colors.primary },
  tabCountBadgeDisabled: { backgroundColor: colors.surface },
  tabCountText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  tabCountTextActive: { color: '#fff' },
  tabCountTextDisabled: { color: colors.textTertiary },

  // 月份選擇器樣式
  monthSelectorContainer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  monthSelectorTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  monthSelectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  monthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    minWidth: 100,
  },
  monthButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  monthButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  monthButtonTextActive: {
    color: '#fff',
  },
  monthCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textTertiary,
  },
  monthCountActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  backToMonthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  backToMonthSelectorText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },

  // 月份切換按鈕（已簽收 Tab）
  monthSwitchBtn: {
    alignSelf: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthSwitchBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },

  // 月份選擇 Modal 樣式
  monthModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthModalContent: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: SCREEN_W * 0.85,
    maxWidth: 400,
  },
  monthModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  monthModalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  monthModalGrid: {
    gap: spacing.sm,
  },
  monthModalButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  monthModalButtonActive: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
  },
  monthModalButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  monthModalButtonTextActive: {
    color: colors.primary,
  },
  monthModalCount: {
    fontSize: typography.fontSize.sm,
    color: colors.textTertiary,
  },
  monthModalCountActive: {
    color: colors.primary,
  },

  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, paddingBottom: 100 },
  deliveryCard: { marginBottom: spacing.md, padding: 0, overflow: 'hidden' },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  orderNoContainer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  orderNo: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.textPrimary },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  badgeText: { fontSize: 12, fontWeight: '700' },
  cardBody: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardBodyLeft: { flex: 1, gap: spacing.sm },
  cardBodyRight: {
    width: 90,
    height: 90,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  pickupPhotoThumb: {
    width: '100%',
    height: '100%',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textSecondary },
  infoTextLarge: { flex: 1, fontSize: typography.fontSize.base, color: colors.textSecondary, fontWeight: '500' },
  expiredNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  expiredNoticeText: { flex: 1, fontSize: typography.fontSize.xs, color: colors.danger, fontWeight: '600' },
  photoIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  photoIndicatorText: { fontSize: typography.fontSize.xs, color: colors.accent, fontWeight: '600' },
  cardActions: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  signedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  signedText: { fontSize: typography.fontSize.xs, color: colors.success, fontWeight: '600' },
  emptyCard: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.textSecondary, fontSize: typography.fontSize.base },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    paddingBottom: spacing.xl,
  },
  newOrderModalContent: { maxWidth: 520 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  driverList: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  driverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  driverItemSelected: { borderColor: colors.primary, backgroundColor: colors.primaryGlow },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
  driverInfo: { flex: 1 },
  driverName: { fontSize: typography.fontSize.base, fontWeight: '600', color: colors.textPrimary },
  driverDetail: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  signatureHint: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  signaturePad: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    height: 220,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  signaturePadInner: { flex: 1 },
  signaturePlaceholder: {
    position: 'absolute',
    alignSelf: 'center',
    top: '45%',
    color: colors.textTertiary,
    fontSize: typography.fontSize.sm,
  },
  signatureDot: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.textPrimary,
  },
  formScrollView: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  notesInput: { minHeight: 96, textAlignVertical: 'top' },
  fieldLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
});
