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
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { getEffectiveDeliveryStatus, useDeliveryStore } from '@/store/deliveryStore';
import { DeliveryOrder, DeliveryStatus } from '@/constants/mockData';
import { useDriverStore, Driver } from '@/store/driverStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { colors, spacing, typography, borderRadius } from '@/constants/theme';
import { Header } from '@/components/ui/Header';
import {
  Package,
  MapPin,
  Clock,
  User,
  Phone,
  CheckCircle,
  Truck,
  FileText,
  X,
  Plus,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react-native';
import { useTranslation } from '@/i18n';

const { width: SCREEN_W } = Dimensions.get('window');

function StatusBadge({ status, t }: { status: DeliveryStatus; t: (key: string) => string }) {
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
  onMarkDelivered,
  onSign,
  t,
}: {
  item: DeliveryOrder;
  isAdmin: boolean;
  onPress: () => void;
  onAssign: () => void;
  onStartTransit: (item: DeliveryOrder) => void;
  onMarkDelivered: () => void;
  onSign: () => void;
  t: (key: string) => string;
}) {
  const isExpired = item.status === 'expired';

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <Card style={styles.deliveryCard} onPress={onPress}>
        <View style={styles.cardHeader}>
          <View style={styles.orderNoContainer}>
            <FileText size={14} color={colors.primary} />
            <Text style={styles.orderNo}>{item.orderNo}</Text>
          </View>
          <View style={styles.cardHeaderRight}>
            <StatusBadge status={item.status} t={t} />
            <ChevronRight size={16} color={colors.textTertiary} />
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <User size={14} color={colors.textSecondary} />
            <Text style={styles.infoText}>{item.customerName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Package size={14} color={colors.textSecondary} />
            <Text style={styles.infoText} numberOfLines={1}>{item.cargoDescription}</Text>
          </View>
          <View style={styles.infoRow}>
            <MapPin size={14} color={colors.danger} />
            <Text style={styles.infoText} numberOfLines={1}>{item.dropoffAddress}</Text>
          </View>
          <View style={styles.infoRow}>
            <Clock size={14} color={colors.textSecondary} />
            <Text style={styles.infoText}>{item.pickupTime}</Text>
          </View>
          {item.assignedDriverName && (
            <View style={styles.infoRow}>
              <Truck size={14} color={colors.textSecondary} />
              <Text style={styles.infoText}>{item.assignedDriverName}</Text>
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
          {isAdmin && item.status === 'pending' && (
            <Button title={t('delivery.assignDriver')} size="sm" onPress={onAssign} fullWidth />
          )}
          {!isAdmin && item.status === 'assigned' && (
            <Button title={t('delivery.startTransit')} size="sm" onPress={() => onStartTransit(item)} fullWidth icon={<Truck size={14} color="#fff" />} />
          )}
          {!isAdmin && item.status === 'in_transit' && (
            <Button title={t('delivery.markDelivered')} size="sm" onPress={onMarkDelivered} fullWidth variant="secondary" icon={<CheckCircle size={14} color={colors.primary} />} />
          )}
          {!isAdmin && item.status === 'delivered' && (
            <Button title={t('delivery.signDelivery')} size="sm" onPress={onSign} fullWidth variant="secondary" icon={<CheckCircle size={14} color={colors.primary} />} />
          )}
        </View>

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
}: {
  tabs: string[];
  activeTab: number;
  onTabChange: (i: number) => void;
  counts: number[];
}) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab, i) => (
        <Pressable
          key={tab}
          style={[styles.tab, activeTab === i && styles.tabActive]}
          onPress={() => onTabChange(i)}
        >
          <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>
            {tab}
          </Text>
          <View style={[styles.tabCountBadge, activeTab === i && styles.tabCountBadgeActive]}>
            <Text style={[styles.tabCountText, activeTab === i && styles.tabCountTextActive]}>
              {counts[i]}
            </Text>
          </View>
        </Pressable>
      ))}
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
  const validDriverIds = new Set([...storeDrivers.map((d) => d.id), ...managedDrivers.map((u) => u.id)]);
  const drivers = [
    ...storeDrivers,
    ...managedDrivers
      .filter((m) => !storeDrivers.some((d) => d.id === m.id))
      .map((u) => ({ id: u.id, name: u.name, phone: '', vehiclePlate: '', status: 'available' as const })),
  ];
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
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <Animated.View entering={FadeInUp.springify()} style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('delivery.selectDriverTitle')}</Text>
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
  onConfirm: (signatureData: string) => void;
  t: (key: string) => string;
}) {
  const [lines, setLines] = useState<{ x: number; y: number; id: number }[]>([]);
  const [currentLine, setCurrentLine] = useState<{ x: number; y: number }[]>([]);
  const lineIdRef = useRef(0);

  const handleTouch = (x: number, y: number) => {
    setCurrentLine((prev) => [...prev, { x, y }]);
  };

  const handleEndLine = () => {
    if (currentLine.length > 0) {
      setLines((prev) => [
        ...prev,
        ...currentLine.map((point) => ({ ...point, id: lineIdRef.current++ })),
      ]);
      setCurrentLine([]);
    }
  };

  const handleClear = () => {
    setLines([]);
    setCurrentLine([]);
  };

  const handleConfirm = () => {
    onConfirm(`signed-${Date.now()}`);
    handleClear();
    onClose();
  };

  const hasSignature = lines.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <Animated.View entering={FadeInUp.springify()} style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('delivery.electronicSignature')}</Text>
            <Pressable onPress={onClose} hitSlop={12}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <Text style={styles.signatureHint}>{t('delivery.signBelowConfirm')}</Text>
          <Pressable
            style={styles.signaturePad}
            onPressIn={(e) => {
              const { locationX, locationY } = e.nativeEvent;
              handleTouch(locationX, locationY);
            }}
            onTouchMove={(e) => {
              const { locationX, locationY } = e.nativeEvent;
              handleTouch(locationX, locationY);
            }}
            onPressOut={handleEndLine}
          >
            <View style={styles.signaturePadInner}>
              {lines.map((point) => (
                <View key={point.id} style={[styles.signatureDot, { left: point.x - 1, top: point.y - 1 }]} />
              ))}
              {currentLine.map((point, index) => (
                <View key={`current-${index}`} style={[styles.signatureDot, { left: point.x - 1, top: point.y - 1 }]} />
              ))}
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
  const drivers = useDriverStore((state) => state.drivers);
  const managedDrivers = useUserManagementStore((state) => state.users).filter((u) => u.role === 'driver');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [cargoDescription, setCargoDescription] = useState('');
  const [cargoWeight, setCargoWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  const mergedDrivers: Driver[] = [
    ...drivers,
    ...managedDrivers
      .filter((managedDriver) => !drivers.some((driver) => driver.id === managedDriver.id))
      .map((driver) => ({ id: driver.id, name: driver.name, phone: '', vehiclePlate: '', status: 'available' as const })),
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
      pickupTime: now.toISOString().slice(0, 16).replace('T', ' '),
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
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <Animated.View entering={FadeInUp.springify()} style={[styles.modalContent, styles.newOrderModalContent]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('delivery.newDelivery')}</Text>
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
  const router = useRouter();
  const { role, user } = useAuthStore();
  const { deliveries, assignDriver, updateStatus, addSignature, addOrder, syncExpiredDeliveries } = useDeliveryStore();
  const { loadDrivers } = useDriverStore();
  const loadUsers = useUserManagementStore((state) => state.loadUsers);

  useEffect(() => {
    loadDrivers();
    loadUsers();
    syncExpiredDeliveries();
  }, [loadDrivers, loadUsers, syncExpiredDeliveries]);

  const isAdmin = role === 'admin' || role === 'company';
  const isDriver = role === 'driver';

  const [activeTab, setActiveTab] = useState(0);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [signingDeliveryId, setSigningDeliveryId] = useState<string | null>(null);
  const [newOrderModalVisible, setNewOrderModalVisible] = useState(false);

  const normalizedDeliveries = deliveries.map((delivery) => ({ ...delivery, status: getEffectiveDeliveryStatus(delivery) }));
  const displayDeliveries = isDriver && user
    ? normalizedDeliveries.filter((delivery) => delivery.assignedDriverId === user.id)
    : normalizedDeliveries;

  const todayDeliveries = displayDeliveries.filter((delivery) => delivery.pickupTime.slice(0, 10) === today);
  const pastDeliveries = displayDeliveries.filter((delivery) => delivery.pickupTime.slice(0, 10) !== today);

  const tabs = [t('delivery.today'), t('delivery.past')];
  const counts = [todayDeliveries.length, pastDeliveries.length];
  const currentList = activeTab === 0 ? todayDeliveries : pastDeliveries;

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
    updateStatus(item.id, 'in_transit');
    router.replace(`/delivery/${item.id}`);
  };

  const handleMarkDelivered = (deliveryId: string) => {
    Alert.alert(t('delivery.markDelivered'), t('delivery.confirmDeliveryComplete'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), onPress: () => updateStatus(deliveryId, 'delivered') },
    ]);
  };

  const handleSignPress = (deliveryId: string) => {
    setSigningDeliveryId(deliveryId);
    setSignatureModalVisible(true);
  };

  const handleSignatureConfirm = (signatureData: string) => {
    if (signingDeliveryId) {
      addSignature(signingDeliveryId, signatureData);
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
      <Header title={pageTitle} />

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

        <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />

        <View style={styles.section}>
          {currentList.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Package size={32} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {activeTab === 0 ? t('delivery.noTodaysOrders') : t('delivery.noPastOrders')}
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
                onMarkDelivered={() => handleMarkDelivered(item.id)}
                onSign={() => handleSignPress(item.id)}
                t={t}
              />
            ))
          )}
        </View>
      </ScrollView>

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

      <Pressable style={styles.fab} onPress={() => setNewOrderModalVisible(true)}>
        <Plus size={28} color="#fff" />
      </Pressable>
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
  tabText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.primary },
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
  tabCountText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  tabCountTextActive: { color: '#fff' },
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
  cardBody: { padding: spacing.lg, gap: spacing.sm },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textSecondary },
  expiredNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  expiredNoticeText: { flex: 1, fontSize: typography.fontSize.xs, color: colors.danger, fontWeight: '600' },
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
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '82%',
    paddingBottom: spacing.xl,
  },
  newOrderModalContent: { maxHeight: '88%' },
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
