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
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import { mockDrivers } from '@/constants/mockData';
import { DeliveryOrder, DeliveryStatus } from '@/constants/mockData';
import { colors, spacing, typography, borderRadius } from '@/constants/theme';
import {
  Package,
  MapPin,
  Clock,
  User,
  Phone,
  Truck,
  FileText,
  X,
  CheckCircle,
  ChevronRight,
  ArrowLeft,
  Scale,
  StickyNote,
} from 'lucide-react-native';

const { width: SCREEN_W } = Dimensions.get('window');

const statusConfig: Record<DeliveryStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: colors.warning, bg: `${colors.warning}20` },
  assigned: { label: 'Assigned', color: colors.secondary, bg: `${colors.secondary}20` },
  in_transit: { label: 'In Transit', color: colors.accent, bg: `${colors.accent}20` },
  delivered: { label: 'Delivered', color: colors.success, bg: `${colors.success}20` },
  signed: { label: 'Signed', color: colors.primary, bg: `${colors.primary}20` },
};

function InfoRow({ icon, label, value, iconColor }: { icon: React.ReactNode; label: string; value: string; iconColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>{icon}</View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function StatusBadge({ status }: { status: DeliveryStatus }) {
  const cfg = statusConfig[status];
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
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

export default function DeliveryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role } = useAuthStore();
  const { deliveries, assignDriver, updateStatus, addSignature } = useDeliveryStore();
  const isAdmin = role === 'admin' || role === 'company';

  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);

  useEffect(() => {
    const found = deliveries.find((d) => d.id === id);
    setOrder(found || null);
  }, [id, deliveries]);

  if (!order) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.notFound}>
          <FileText size={48} color={colors.textTertiary} />
          <Text style={styles.notFoundText}>Order not found</Text>
          <Button title="Go Back" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const statusCfg = statusConfig[order.status];

  const handleAssign = () => setAssignModalVisible(true);

  const handleDriverAssign = (driverId: string, driverName: string) => {
    assignDriver(order.id, driverId, driverName);
  };

  const handleStartTransit = () => {
    Alert.alert('Start Transit', 'Mark this delivery as in transit?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => updateStatus(order.id, 'in_transit') },
    ]);
  };

  const handleMarkDelivered = () => {
    Alert.alert('Mark Delivered', 'Confirm delivery completed?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => updateStatus(order.id, 'delivered') },
    ]);
  };

  const handleSign = () => setSignatureModalVisible(true);

  const handleSignatureConfirm = (signatureData: string) => {
    addSignature(order.id, signatureData);
  };

  const actionButtons: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; icon?: React.ReactNode }[] = [];

  if (isAdmin && order.status === 'pending') {
    actionButtons.push({ label: 'Assign Driver', onPress: handleAssign, variant: 'primary', icon: <Truck size={16} color="#fff" /> });
  }
  if (!isAdmin && order.status === 'assigned') {
    actionButtons.push({ label: 'Start Transit', onPress: handleStartTransit, variant: 'primary', icon: <Truck size={16} color="#fff" /> });
  }
  if (!isAdmin && order.status === 'in_transit') {
    actionButtons.push({ label: 'Mark Delivered', onPress: handleMarkDelivered, variant: 'secondary', icon: <CheckCircle size={16} color={colors.primary} /> });
  }
  if (!isAdmin && order.status === 'delivered') {
    actionButtons.push({ label: 'Sign Delivery', onPress: handleSign, variant: 'secondary', icon: <CheckCircle size={16} color={colors.primary} /> });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.topBarTitle}>Order Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Order header card */}
        <Animated.View entering={FadeInDown.springify()}>
          <Card style={styles.headerCard}>
            <View style={styles.headerTop}>
              <View style={styles.orderNoContainer}>
                <FileText size={18} color={colors.primary} />
                <Text style={styles.orderNo}>{order.orderNo}</Text>
              </View>
              <StatusBadge status={order.status} />
            </View>
            <View style={[styles.statusTimeline, { borderLeftColor: statusCfg.color }]}>
              {(['pending', 'assigned', 'in_transit', 'delivered', 'signed'] as DeliveryStatus[]).map((s, i) => {
                const isDone =
                  (s === 'pending' && ['assigned', 'in_transit', 'delivered', 'signed'].includes(order.status)) ||
                  (s === 'assigned' && ['in_transit', 'delivered', 'signed'].includes(order.status)) ||
                  (s === 'in_transit' && ['delivered', 'signed'].includes(order.status)) ||
                  (s === 'delivered' && order.status === 'signed') ||
                  s === order.status;
                const isCurrent = s === order.status;
                return (
                  <View key={s} style={styles.timelineItem}>
                    <View style={[
                      styles.timelineDot,
                      isDone && { backgroundColor: statusCfg.color, borderColor: statusCfg.color },
                      isCurrent && styles.timelineDotCurrent,
                    ]}>
                      {isDone && <CheckCircle size={10} color="#fff" />}
                    </View>
                    <Text style={[styles.timelineLabel, isCurrent && { color: statusCfg.color, fontWeight: '700' }]}>
                      {statusConfig[s].label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        </Animated.View>

        {/* Customer info */}
        <Animated.View entering={FadeInDown.delay(80).springify()}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer</Text>
            <Card style={styles.infoCard}>
              <InfoRow icon={<User size={16} color={colors.textSecondary} />} label="Name" value={order.customerName} />
              <View style={styles.divider} />
              <InfoRow icon={<Phone size={16} color={colors.textSecondary} />} label="Phone" value={order.customerPhone} />
            </Card>
          </View>
        </Animated.View>

        {/* Pickup & Dropoff */}
        <Animated.View entering={FadeInDown.delay(120).springify()}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Route</Text>
            <Card style={styles.infoCard}>
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
                <View style={styles.routeLine} />
                <View style={[styles.routeDot, { backgroundColor: colors.danger }]} />
              </View>
              <View style={styles.routeInfo}>
                <View style={styles.routePoint}>
                  <Text style={styles.routeLabel}>Pickup</Text>
                  <Text style={styles.routeAddress}>{order.pickupAddress}</Text>
                  <Text style={styles.routeTime}>{order.pickupTime}</Text>
                </View>
                <View style={[styles.routePoint, { marginTop: spacing['2xl'] }]}>
                  <Text style={styles.routeLabel}>Dropoff</Text>
                  <Text style={styles.routeAddress}>{order.dropoffAddress}</Text>
                  {order.dropoffTime && <Text style={styles.routeTime}>{order.dropoffTime}</Text>}
                </View>
              </View>
            </Card>
          </View>
        </Animated.View>

        {/* Cargo */}
        <Animated.View entering={FadeInDown.delay(160).springify()}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cargo</Text>
            <Card style={styles.infoCard}>
              <InfoRow icon={<Package size={16} color={colors.textSecondary} />} label="Description" value={order.cargoDescription} />
              <View style={styles.divider} />
              <InfoRow icon={<Scale size={16} color={colors.textSecondary} />} label="Weight" value={`${order.cargoWeight} kg`} />
              {order.notes && (
                <>
                  <View style={styles.divider} />
                  <InfoRow icon={<StickyNote size={16} color={colors.textSecondary} />} label="Notes" value={order.notes} />
                </>
              )}
            </Card>
          </View>
        </Animated.View>

        {/* Driver */}
        {order.assignedDriverName && (
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Assigned Driver</Text>
              <Card style={styles.infoCard}>
                <InfoRow icon={<Truck size={16} color={colors.textSecondary} />} label="Name" value={order.assignedDriverName} />
                <View style={styles.divider} />
                <InfoRow icon={<Clock size={16} color={colors.textSecondary} />} label="Assigned At" value={order.pickupTime} />
                {order.signatureData && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.signedRow}>
                      <CheckCircle size={16} color={colors.success} />
                      <Text style={styles.signedText}>
                        Signed at {new Date(order.signedAt!).toLocaleString()}
                      </Text>
                    </View>
                  </>
                )}
              </Card>
            </View>
          </Animated.View>
        )}

        {/* Action buttons */}
        {actionButtons.length > 0 && (
          <Animated.View entering={FadeInDown.delay(240).springify()} style={styles.actionSection}>
            {actionButtons.map((btn, i) => (
              <Button
                key={i}
                title={btn.label}
                onPress={btn.onPress}
                variant={btn.variant || 'primary'}
                size="lg"
                fullWidth
                icon={btn.icon}
              />
            ))}
          </Animated.View>
        )}

        <View style={{ height: 100 }} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  topBarTitle: { fontSize: typography.fontSize.base, fontWeight: '600', color: colors.textPrimary },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  notFoundText: { fontSize: typography.fontSize.lg, color: colors.textSecondary, fontWeight: '600' },
  headerCard: { margin: spacing.lg, padding: spacing.lg },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  orderNoContainer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  orderNo: { fontSize: typography.fontSize.xl, fontWeight: '700', color: colors.textPrimary },
  badge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  badgeText: { fontSize: typography.fontSize.xs, fontWeight: '700', textTransform: 'uppercase' },
  statusTimeline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    marginLeft: spacing.sm,
  },
  timelineItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.md + 1,
  },
  timelineDotCurrent: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  timelineLabel: { fontSize: 10, color: colors.textTertiary, fontWeight: '600', marginTop: 2 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  sectionTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm, marginLeft: spacing.xs },
  infoCard: { padding: 0, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', padding: spacing.lg, gap: spacing.md },
  infoIcon: { marginTop: 2 },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: typography.fontSize.xs, color: colors.textTertiary, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  infoValue: { fontSize: typography.fontSize.base, color: colors.textPrimary, fontWeight: '500' },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg + 16 + spacing.md },
  routeRow: { width: 24, alignItems: 'center', paddingLeft: spacing.lg, paddingTop: spacing.lg },
  routeLine: { width: 2, flex: 1, backgroundColor: colors.border, minHeight: 60 },
  routeDot: { width: 12, height: 12, borderRadius: 6, marginLeft: -5 },
  routeInfo: { flex: 1, padding: spacing.lg, paddingTop: 0, marginTop: -spacing.lg },
  routePoint: {},
  routeLabel: { fontSize: typography.fontSize.xs, color: colors.textTertiary, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  routeAddress: { fontSize: typography.fontSize.sm, color: colors.textPrimary, fontWeight: '500' },
  routeTime: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  signedRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.sm },
  signedText: { fontSize: typography.fontSize.sm, color: colors.success, fontWeight: '600' },
  actionSection: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.md },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, maxHeight: '80%', paddingBottom: spacing['3xl'] },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  driverList: { maxHeight: 300, paddingHorizontal: spacing.lg },
  driverItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
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
});
