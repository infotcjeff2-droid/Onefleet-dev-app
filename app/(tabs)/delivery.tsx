import { useState, useRef } from 'react';
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
import { useDeliveryStore } from '@/store/deliveryStore';
import { mockDrivers } from '@/constants/mockData';
import { DeliveryOrder, DeliveryStatus } from '@/constants/mockData';
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
} from 'lucide-react-native';

const { width: SCREEN_W } = Dimensions.get('window');

const statusConfig: Record<DeliveryStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: colors.warning, bg: `${colors.warning}20` },
  assigned: { label: 'Assigned', color: colors.secondary, bg: `${colors.secondary}20` },
  in_transit: { label: 'In Transit', color: colors.accent, bg: `${colors.accent}20` },
  delivered: { label: 'Delivered', color: colors.success, bg: `${colors.success}20` },
  signed: { label: 'Signed', color: colors.primary, bg: `${colors.primary}20` },
};

function StatusBadge({ status }: { status: DeliveryStatus }) {
  const cfg = statusConfig[status];
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
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
}: {
  item: DeliveryOrder;
  isAdmin: boolean;
  onPress: () => void;
  onAssign: () => void;
  onStartTransit: () => void;
  onMarkDelivered: () => void;
  onSign: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.springify()}>
      <Card style={styles.deliveryCard} onPress={onPress}>
        <View style={styles.cardHeader}>
          <View style={styles.orderNoContainer}>
            <FileText size={14} color={colors.primary} />
            <Text style={styles.orderNo}>{item.orderNo}</Text>
          </View>
          <View style={styles.cardHeaderRight}>
            <StatusBadge status={item.status} />
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

        <View style={styles.cardActions}>
          {isAdmin && item.status === 'pending' && (
            <Button title="Assign Driver" size="sm" onPress={onAssign} fullWidth />
          )}
          {!isAdmin && item.status === 'assigned' && (
            <Button title="Start Transit" size="sm" onPress={onStartTransit} fullWidth icon={<Truck size={14} color="#fff" />} />
          )}
          {!isAdmin && item.status === 'delivered' && (
            <Button title="Sign Delivery" size="sm" onPress={onSign} fullWidth variant="secondary" icon={<CheckCircle size={14} color={colors.primary} />} />
          )}
        </View>

        {item.signatureData && (
          <View style={styles.signedIndicator}>
            <CheckCircle size={14} color={colors.success} />
            <Text style={styles.signedText}>Signed at {new Date(item.signedAt!).toLocaleString()}</Text>
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
}: {
  visible: boolean;
  onClose: () => void;
  onAssign: (driverId: string, driverName: string) => void;
}) {
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  const handleConfirm = () => {
    if (!selectedDriverId) {
      Alert.alert('Error', 'Please select a driver');
      return;
    }
    const driver = mockDrivers.find((d) => d.id === selectedDriverId);
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
            <Text style={styles.modalTitle}>Assign Driver</Text>
            <Pressable onPress={onClose} hitSlop={12}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <ScrollView style={styles.driverList}>
            {mockDrivers.map((driver) => (
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
            <Button title="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title="Confirm" onPress={handleConfirm} style={{ flex: 1 }} disabled={!selectedDriverId} />
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
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (signatureData: string) => void;
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
        ...currentLine.map((p) => ({ ...p, id: lineIdRef.current++ })),
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
            <Text style={styles.modalTitle}>Electronic Signature</Text>
            <Pressable onPress={onClose} hitSlop={12}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <Text style={styles.signatureHint}>Sign below to confirm delivery</Text>
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
              {currentLine.map((point, i) => (
                <View key={`current-${i}`} style={[styles.signatureDot, { left: point.x - 1, top: point.y - 1 }]} />
              ))}
              {!hasSignature && (
                <Text style={styles.signaturePlaceholder}>Draw your signature here</Text>
              )}
            </View>
          </Pressable>
          <View style={styles.modalActions}>
            <Button title="Clear" variant="ghost" onPress={handleClear} style={{ flex: 1 }} />
            <Button title="Confirm Signature" onPress={handleConfirm} style={{ flex: 2 }} disabled={!hasSignature} />
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
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (order: Omit<DeliveryOrder, 'id' | 'createdAt'>) => void;
}) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [cargoDescription, setCargoDescription] = useState('');
  const [cargoWeight, setCargoWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setCustomerName('');
    setCustomerPhone('');
    setPickupAddress('');
    setDropoffAddress('');
    setCargoDescription('');
    setCargoWeight('');
    setNotes('');
    setErrors({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!customerName.trim()) errs.customerName = 'Required';
    if (!customerPhone.trim()) errs.customerPhone = 'Required';
    if (!pickupAddress.trim()) errs.pickupAddress = 'Required';
    if (!dropoffAddress.trim()) errs.dropoffAddress = 'Required';
    if (!cargoDescription.trim()) errs.cargoDescription = 'Required';
    if (!cargoWeight.trim() || isNaN(Number(cargoWeight))) errs.cargoWeight = 'Enter a valid number';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const now = new Date();
    onSubmit({
      orderNo: '',
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickupAddress: pickupAddress.trim(),
      pickupTime: now.toISOString().slice(0, 16).replace('T', ' '),
      dropoffAddress: dropoffAddress.trim(),
      cargoDescription: cargoDescription.trim(),
      cargoWeight: Number(cargoWeight),
      notes: notes.trim() || undefined,
      status: 'pending',
    });
    reset();
    onClose();
  };

  const field = (
    label: string,
    value: string,
    setter: (v: string) => void,
    placeholder: string,
    error?: string,
    keyboardType: 'default' | 'phone-pad' = 'default'
  ) => (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <View style={[styles.formInputWrap, error && { borderColor: colors.danger }]}>
        <RNTextInput
          style={styles.formInput}
          value={value}
          onChangeText={setter}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          keyboardType={keyboardType}
        />
      </View>
      {error && <Text style={styles.formError}>{error}</Text>}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <Animated.View entering={FadeInUp.springify()} style={styles.newOrderModalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Order</Text>
            <Pressable onPress={handleClose} hitSlop={12}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <ScrollView style={styles.newOrderForm} showsVerticalScrollIndicator={false}>
            {field('Customer Name', customerName, setCustomerName, 'Enter customer name', errors.customerName)}
            {field('Phone', customerPhone, setCustomerPhone, '+1234567890', errors.customerPhone, 'phone-pad')}
            {field('Pickup Address', pickupAddress, setPickupAddress, 'Enter pickup address', errors.pickupAddress)}
            {field('Dropoff Address', dropoffAddress, setDropoffAddress, 'Enter dropoff address', errors.dropoffAddress)}
            {field('Cargo Description', cargoDescription, setCargoDescription, 'e.g. 20 boxes electronics', errors.cargoDescription)}
            {field('Cargo Weight (kg)', cargoWeight, setCargoWeight, '0', errors.cargoWeight, 'phone-pad')}
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Notes (optional)</Text>
              <View style={[styles.formInputWrap, styles.formInputWrapMultiline]}>
                <RNTextInput
                  style={[styles.formInput, styles.formInputMultiline]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Additional notes..."
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          </ScrollView>
          <View style={styles.modalActions}>
            <Button title="Cancel" variant="ghost" onPress={handleClose} style={{ flex: 1 }} />
            <Button title="Create Order" onPress={handleSubmit} style={{ flex: 1.5 }} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const today = new Date().toISOString().slice(0, 10);

export default function DeliveryScreen() {
  const router = useRouter();
  const { role } = useAuthStore();
  const { deliveries, assignDriver, updateStatus, addSignature, addOrder } = useDeliveryStore();
  const isAdmin = role === 'admin' || role === 'company';
  const isDriver = role === 'driver';

  const [activeTab, setActiveTab] = useState(0);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [signingDeliveryId, setSigningDeliveryId] = useState<string | null>(null);
  const [newOrderModalVisible, setNewOrderModalVisible] = useState(false);

  const displayDeliveries = isDriver
    ? deliveries.filter((d) => d.assignedDriverId === 'd001')
    : deliveries;

  const todayDeliveries = displayDeliveries.filter(
    (d) => d.pickupTime.slice(0, 10) === today
  );
  const pastDeliveries = displayDeliveries.filter(
    (d) => d.pickupTime.slice(0, 10) !== today
  );

  const tabs = ['Today', 'Past'];
  const counts = [todayDeliveries.length, pastDeliveries.length];
  const currentList = activeTab === 0 ? todayDeliveries : pastDeliveries;

  const handleAssign = (deliveryId: string) => {
    setSelectedDeliveryId(deliveryId);
    setAssignModalVisible(true);
  };

  const handleDriverAssign = (driverId: string, driverName: string) => {
    if (selectedDeliveryId) {
      assignDriver(selectedDeliveryId, driverId, driverName);
    }
  };

  const handleStartTransit = (deliveryId: string) => {
    Alert.alert('Start Transit', 'Mark this delivery as in transit?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => updateStatus(deliveryId, 'in_transit') },
    ]);
  };

  const handleMarkDelivered = (deliveryId: string) => {
    Alert.alert('Mark Delivered', 'Confirm delivery completed?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => updateStatus(deliveryId, 'delivered') },
    ]);
  };

  const handleSignPress = (deliveryId: string) => {
    setSigningDeliveryId(deliveryId);
    setSignatureModalVisible(true);
  };

  const handleSignatureConfirm = (signatureData: string) => {
    if (signingDeliveryId) {
      addSignature(signingDeliveryId, signatureData);
    }
  };

  const handleNewOrder = (order: Omit<DeliveryOrder, 'id' | 'createdAt'>) => {
    addOrder(order);
  };

  const pageTitle = isDriver ? 'My Deliveries' : isAdmin ? 'Delivery Management' : 'Deliveries';

  const stats = {
    total: displayDeliveries.length,
    pending: displayDeliveries.filter((d) => d.status === 'pending').length,
    assigned: displayDeliveries.filter((d) => d.status === 'assigned').length,
    inTransit: displayDeliveries.filter((d) => d.status === 'in_transit').length,
    done: displayDeliveries.filter((d) => d.status === 'delivered' || d.status === 'signed').length,
  };

  return (
    <View style={styles.container}>
      <Header
        title={pageTitle}
        rightAction={
          isAdmin ? (
            <Pressable
              style={styles.addButton}
              onPress={() => setNewOrderModalVisible(true)}
            >
              <Plus size={20} color={colors.primary} />
            </Pressable>
          ) : undefined
        }
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { label: 'Total', value: stats.total, color: colors.primary },
            { label: 'Pending', value: stats.pending, color: colors.warning },
            { label: 'Assigned', value: stats.assigned, color: colors.secondary },
            { label: 'In Transit', value: stats.inTransit, color: colors.accent },
            { label: 'Done', value: stats.done, color: colors.success },
          ].map((s) => (
            <View key={s.label} style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: s.color }]} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Tabs */}
        <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />

        {/* Order list */}
        <View style={styles.section}>
          {currentList.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Package size={32} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {activeTab === 0 ? "No today's orders" : 'No past orders'}
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
                onStartTransit={() => handleStartTransit(item.id)}
                onMarkDelivered={() => handleMarkDelivered(item.id)}
                onSign={() => handleSignPress(item.id)}
              />
            ))
          )}
        </View>
      </ScrollView>

      <AssignDriverModal
        visible={assignModalVisible}
        onClose={() => setAssignModalVisible(false)}
        onAssign={handleDriverAssign}
      />

      <SignatureModal
        visible={signatureModalVisible}
        onClose={() => setSignatureModalVisible(false)}
        onConfirm={handleSignatureConfirm}
      />

      <NewOrderModal
        visible={newOrderModalVisible}
        onClose={() => setNewOrderModalVisible(false)}
        onSubmit={handleNewOrder}
      />

      {isAdmin && (
        <Pressable
          style={styles.fab}
          onPress={() => setNewOrderModalVisible(true)}
        >
          <Plus size={28} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1 },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
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
  badgeText: { fontSize: typography.fontSize.xs, fontWeight: '700', textTransform: 'uppercase' },
  cardBody: { padding: spacing.lg },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm, gap: spacing.sm },
  infoText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  cardActions: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  signedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  signedText: { fontSize: typography.fontSize.xs, color: colors.success, fontWeight: '600' },
  emptyCard: { alignItems: 'center', paddingVertical: spacing['3xl'], gap: spacing.md },
  emptyText: { fontSize: typography.fontSize.sm, color: colors.textTertiary },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '80%',
    paddingBottom: spacing['3xl'],
  },
  newOrderModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '90%',
    paddingBottom: spacing['3xl'],
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  driverList: { maxHeight: 300, paddingHorizontal: spacing.lg },
  driverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  driverItemSelected: { backgroundColor: colors.primaryGlow, borderRadius: borderRadius.md, paddingHorizontal: spacing.sm },
  driverAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  driverAvatarText: { fontSize: typography.fontSize.lg, fontWeight: '700', color: '#fff' },
  driverInfo: { flex: 1 },
  driverName: { fontSize: typography.fontSize.base, fontWeight: '600', color: colors.textPrimary },
  driverDetail: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  radioCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioCircleSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  modalActions: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  signatureHint: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  signaturePad: { marginHorizontal: spacing.lg, height: 150, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', overflow: 'hidden', backgroundColor: colors.card },
  signaturePadInner: { flex: 1, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  signatureDot: { position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textPrimary },
  signaturePlaceholder: { fontSize: typography.fontSize.sm, color: colors.textTertiary, position: 'absolute' },
  newOrderForm: { paddingHorizontal: spacing.lg, maxHeight: 450 },
  formField: { marginTop: spacing.lg },
  formLabel: { fontSize: typography.fontSize.sm, fontWeight: '500', color: colors.textSecondary, marginBottom: spacing.sm },
  formInputWrap: { backgroundColor: colors.card, borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: colors.border, overflow: 'hidden' },
  formInput: { height: 48, paddingHorizontal: spacing.lg, color: colors.textPrimary, fontSize: typography.fontSize.base },
  formInputMultiline: { height: 80, paddingTop: spacing.md, textAlignVertical: 'top' },
  formInputWrapMultiline: { height: 80 },
  formError: { fontSize: typography.fontSize.xs, color: colors.danger, marginTop: spacing.xs, fontWeight: '500' },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
