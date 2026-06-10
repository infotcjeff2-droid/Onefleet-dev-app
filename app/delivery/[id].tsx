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
import { getEffectiveDeliveryStatus, useDeliveryStore } from '@/store/deliveryStore';
import { DeliveryOrder, DeliveryStatus } from '@/constants/mockData';
import { useDriverStore } from '@/store/driverStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { colors, spacing, typography, borderRadius } from '@/constants/theme';
import {
  Package,
  Clock,
  User,
  Phone,
  Truck,
  FileText,
  X,
  CheckCircle,
  ArrowLeft,
  Scale,
  StickyNote,
  AlertTriangle,
} from 'lucide-react-native';
import { useTranslation } from '@/i18n';

const { width: SCREEN_W } = Dimensions.get('window');

function buildStatusConfig(t: (key: string) => string): Record<DeliveryStatus, { label: string; color: string; bg: string }> {
  return {
    pending: { label: t('delivery.pending'), color: colors.warning, bg: `${colors.warning}20` },
    assigned: { label: t('delivery.assigned'), color: colors.secondary, bg: `${colors.secondary}20` },
    in_transit: { label: t('delivery.inTransit'), color: colors.accent, bg: `${colors.accent}20` },
    delivered: { label: t('delivery.delivered'), color: colors.success, bg: `${colors.success}20` },
    signed: { label: t('delivery.signed'), color: colors.primary, bg: `${colors.primary}20` },
    expired: { label: t('delivery.expired'), color: colors.danger, bg: `${colors.danger}20` },
  };
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
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

function StatusBadge({ status, t }: { status: DeliveryStatus; t: (key: string) => string }) {
  const statusConfig = buildStatusConfig(t);
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
  drivers,
}: {
  visible: boolean;
  onClose: () => void;
  onAssign: (driverId: string, driverName: string) => void;
  drivers: Array<{ id: string; name: string; phone: string; vehiclePlate?: string }>;
}) {
  const { t } = useTranslation();
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      useDriverStore.getState().loadDrivers();
      useUserManagementStore.getState().loadUsers();
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      const validIds = new Set(drivers.map((driver) => driver.id));
      if (selectedDriverId && !validIds.has(selectedDriverId)) {
        setSelectedDriverId(null);
      }
    }
  }, [drivers, selectedDriverId, visible]);

  const handleConfirm = () => {
    if (!selectedDriverId) {
      Alert.alert(t('common.error'), t('delivery.selectDriver'));
      return;
    }

    const driver = drivers.find((item) => item.id === selectedDriverId);
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
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (signatureData: string) => void;
}) {
  const { t } = useTranslation();
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

export default function DeliveryDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role } = useAuthStore();
  const { deliveries, assignDriver, updateStatus, addSignature, removeDriver, syncExpiredDeliveries } = useDeliveryStore();
  const { drivers, loadDrivers } = useDriverStore();
  const { users: managedUsers, loadUsers } = useUserManagementStore();
  const isAdmin = role === 'admin' || role === 'company';

  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);

  useEffect(() => {
    syncExpiredDeliveries();
    const found = deliveries.find((delivery) => delivery.id === id);
    setOrder(found ? { ...found, status: getEffectiveDeliveryStatus(found) } : null);
  }, [id, deliveries, syncExpiredDeliveries]);

  useEffect(() => {
    loadDrivers();
    loadUsers();
  }, [loadDrivers, loadUsers]);

  useEffect(() => {
    if (order?.assignedDriverId) {
      const validIds = new Set([
        ...drivers.map((driver) => driver.id),
        ...managedUsers.filter((user) => user.role === 'driver').map((user) => user.id),
      ]);
      if (!validIds.has(order.assignedDriverId)) {
        removeDriver(order.id);
      }
    }
  }, [drivers, managedUsers, order, removeDriver]);

  if (!order) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}> 
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.notFound}>
          <FileText size={48} color={colors.textTertiary} />
          <Text style={styles.notFoundText}>Order not found</Text>
          <Button title="Go Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/delivery')} />
        </View>
      </View>
    );
  }

  const statusConfig = buildStatusConfig(t);
  const statusCfg = statusConfig[order.status];
  const isExpired = order.status === 'expired';

  const mergedDrivers = [
    ...drivers,
    ...managedUsers
      .filter((managedUser) => managedUser.role === 'driver' && !drivers.some((driver) => driver.id === managedUser.id))
      .map((driver) => ({ id: driver.id, name: driver.name, phone: '', vehiclePlate: '' })),
  ];

  const handleAssign = () => {
    if (isExpired) {
      Alert.alert(t('delivery.expired'), t('delivery.expiredReadonly'));
      return;
    }
    setAssignModalVisible(true);
  };

  const handleDriverAssign = (driverId: string, driverName: string) => {
    assignDriver(order.id, driverId, driverName);
  };

  const handleStartTransit = () => {
    Alert.alert(t('delivery.startTransit'), 'Mark this delivery as in transit?', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: () => {
          updateStatus(order.id, 'in_transit');
          router.replace({ pathname: '/delivery/[id]', params: { id: order.id } });
        },
      },
    ]);
  };

  const handleMarkDelivered = () => {
    Alert.alert(t('delivery.markDelivered'), t('delivery.confirmDeliveryComplete'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), onPress: () => updateStatus(order.id, 'delivered') },
    ]);
  };

  const handleSign = () => setSignatureModalVisible(true);

  const handleSignatureConfirm = (signatureData: string) => {
    addSignature(order.id, signatureData);
    router.replace('/(tabs)/delivery');
  };

  const actionButtons: { label: string; onPress: () => void; variant?: 'primary' | 'secondary'; icon?: React.ReactNode }[] = [];

  if (!isExpired) {
    if (isAdmin && order.status === 'pending') {
      actionButtons.push({ label: t('delivery.assignDriver'), onPress: handleAssign, variant: 'primary', icon: <Truck size={16} color="#fff" /> });
    }
    if (!isAdmin && order.status === 'assigned') {
      actionButtons.push({ label: t('delivery.startTransit'), onPress: handleStartTransit, variant: 'primary', icon: <Truck size={16} color="#fff" /> });
    }
    if (!isAdmin && order.status === 'in_transit') {
      actionButtons.push({ label: t('delivery.markDelivered'), onPress: handleMarkDelivered, variant: 'secondary', icon: <CheckCircle size={16} color={colors.primary} /> });
    }
    if (!isAdmin && order.status === 'delivered') {
      actionButtons.push({ label: t('delivery.signDelivery'), onPress: handleSign, variant: 'secondary', icon: <CheckCircle size={16} color={colors.primary} /> });
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/delivery')} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.topBarTitle}>{t('nav.deliveryDetail')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.springify()}>
          <Card style={styles.headerCard}>
            <View style={styles.headerTop}>
              <View style={styles.orderNoContainer}>
                <FileText size={18} color={colors.primary} />
                <Text style={styles.orderNo}>{order.orderNo}</Text>
              </View>
              <StatusBadge status={order.status} t={t} />
            </View>

            {isExpired && (
              <View style={styles.expiredBanner}>
                <AlertTriangle size={16} color={colors.danger} />
                <Text style={styles.expiredBannerText}>{t('delivery.expiredReadonly')}</Text>
              </View>
            )}

            <View style={[styles.statusTimeline, { borderLeftColor: statusCfg.color }]}> 
              {(['pending', 'assigned', 'in_transit', 'delivered', 'signed', 'expired'] as DeliveryStatus[]).map((status) => {
                const isCurrent = status === order.status;
                const isDone = isCurrent || (order.status === 'signed' && status !== 'expired') || (order.status === 'expired' && status === 'expired');
                return (
                  <View key={status} style={styles.timelineItem}>
                    <View
                      style={[
                        styles.timelineDot,
                        isDone && { backgroundColor: statusCfg.color, borderColor: statusCfg.color },
                        isCurrent && styles.timelineDotCurrent,
                      ]}
                    >
                      {isDone && <CheckCircle size={10} color="#fff" />}
                    </View>
                    <Text style={[styles.timelineLabel, isCurrent && { color: statusCfg.color, fontWeight: '700' }]}>
                      {statusConfig[status].label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        </Animated.View>

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

        <Animated.View entering={FadeInDown.delay(120).springify()}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Route</Text>
            <Card style={styles.infoCard}>
              <View style={styles.routeContainer}>
                <View style={styles.routeStop}>
                  <View style={[styles.routeIconCircle, { backgroundColor: `${colors.primary}20` }]}>
                    <View style={[styles.routeIconDot, { backgroundColor: colors.primary }]} />
                  </View>
                  <View style={styles.routeStopInfo}>
                    <Text style={styles.routeStopLabel}>PICKUP</Text>
                    <Text style={styles.routeStopAddress}>{order.pickupAddress}</Text>
                    <Text style={styles.routeStopTime}>{order.pickupTime}</Text>
                  </View>
                </View>

                <View style={styles.routeConnector}>
                  <View style={[styles.routeConnectorLine, { backgroundColor: colors.border }]} />
                </View>

                <View style={styles.routeStop}>
                  <View style={[styles.routeIconCircle, { backgroundColor: `${colors.danger}20` }]}>
                    <View style={[styles.routeIconDot, { backgroundColor: colors.danger }]} />
                  </View>
                  <View style={styles.routeStopInfo}>
                    <Text style={styles.routeStopLabel}>DROPOFF</Text>
                    <Text style={styles.routeStopAddress}>{order.dropoffAddress}</Text>
                    {order.dropoffTime && <Text style={styles.routeStopTime}>{order.dropoffTime}</Text>}
                  </View>
                </View>
              </View>
            </Card>
          </View>
        </Animated.View>

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
                        {t('delivery.signedAt')} {new Date(order.signedAt!).toLocaleString()}
                      </Text>
                    </View>
                  </>
                )}
              </Card>
            </View>
          </Animated.View>
        )}

        {actionButtons.length > 0 && (
          <Animated.View entering={FadeInDown.delay(240).springify()} style={styles.actionSection}>
            {actionButtons.map((button, index) => (
              <Button
                key={index}
                title={button.label}
                onPress={button.onPress}
                variant={button.variant || 'primary'}
                size="lg"
                fullWidth
                icon={button.icon}
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
        drivers={mergedDrivers}
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
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topBarTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  headerCard: { marginHorizontal: spacing.lg, marginTop: spacing.lg, padding: spacing.lg },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  orderNoContainer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  orderNo: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  badge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  badgeText: { fontSize: typography.fontSize.xs, fontWeight: '700' },
  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: `${colors.danger}10`,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  expiredBannerText: { flex: 1, color: colors.danger, fontSize: typography.fontSize.sm, fontWeight: '600' },
  statusTimeline: { borderLeftWidth: 2, paddingLeft: spacing.md, gap: spacing.sm },
  timelineItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  timelineDotCurrent: { transform: [{ scale: 1.05 }] },
  timelineLabel: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  sectionTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  infoCard: { padding: spacing.lg },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  infoIcon: { marginTop: 2 },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: typography.fontSize.xs, color: colors.textTertiary, marginBottom: 4, textTransform: 'uppercase' },
  infoValue: { fontSize: typography.fontSize.base, color: colors.textPrimary, lineHeight: 22 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  routeContainer: { gap: spacing.sm },
  routeStop: { flexDirection: 'row', gap: spacing.md },
  routeIconCircle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  routeIconDot: { width: 10, height: 10, borderRadius: 5 },
  routeStopInfo: { flex: 1 },
  routeStopLabel: { fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textTertiary, marginBottom: 4 },
  routeStopAddress: { fontSize: typography.fontSize.base, color: colors.textPrimary },
  routeStopTime: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 4 },
  routeConnector: { paddingLeft: 11, height: 20 },
  routeConnectorLine: { width: 2, flex: 1 },
  signedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  signedText: { fontSize: typography.fontSize.sm, color: colors.success, fontWeight: '600' },
  actionSection: { marginTop: spacing.xl, paddingHorizontal: spacing.lg, gap: spacing.md },
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
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  notFoundText: { fontSize: typography.fontSize.base, color: colors.textSecondary },
});
