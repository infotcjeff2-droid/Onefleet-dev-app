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
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { getEffectiveDeliveryStatus, useDeliveryStore } from '@/store/deliveryStore';
import { DeliveryOrder, DeliveryStatus } from '@/types';
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
  Camera,
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
  onConfirm: (signatureData: string, strokes: { x: number; y: number; id: number }[][]) => void;
}) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<{ x: number; y: number; id: number }[][]>([]);
  const [currentLine, setCurrentLine] = useState<{ x: number; y: number; id: number }[]>([]);
  const lineIdRef = useRef(0);

  const handleTouch = (x: number, y: number) => {
    setCurrentLine((prev) => [...prev, { x, y, id: lineIdRef.current++ }]);
  };

  const handleEndLine = () => {
    if (currentLine.length > 0) {
      setLines((prev) => [...prev, currentLine]);
      setCurrentLine([]);
    }
  };

  const handleClear = () => {
    setLines([]);
    setCurrentLine([]);
  };

  const handleConfirm = () => {
    onConfirm(`signed-${Date.now()}`, lines);
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
                <Svg style={StyleSheet.absoluteFill}>
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
            <Pressable style={styles.clearSignatureBtn} onPress={handleClear}>
              <Text style={styles.clearSignatureBtnText}>{t('delivery.clearSignature')}</Text>
            </Pressable>
          <View style={styles.modalActions}>
            <Button
              title={t('common.cancel')}
              variant="ghost"
              onPress={() => {
                handleClear();
                onClose();
              }}
              style={{ flex: 1 }}
            />
            <Button
              title={t('delivery.confirmSignature')}
              onPress={handleConfirm}
              style={{ flex: 2 }}
              disabled={!hasSignature}
            />
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
  const { deliveries, assignDriver, updateStatus, addSignature, addPhoto, removePhoto, removeDriver } = useDeliveryStore();
  const { drivers, loadDrivers } = useDriverStore();
  const { users: managedUsers, loadUsers } = useUserManagementStore();
  const isAdmin = role === 'admin' || role === 'company';

  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxUri, setLightboxUri] = useState('');

  useEffect(() => {
    const found = deliveries.find((delivery) => delivery.id === id);
    setOrder(found || null);
  }, [id, deliveries]);

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
          <Text style={styles.notFoundText}>{t('delivery.orderNotFound')}</Text>
          <Button title={t('delivery.goBack')} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/delivery')} />
        </View>
      </View>
    );
  }

  const statusConfig = buildStatusConfig(t);
  const statusCfg = statusConfig[order.status];
  const isExpired = order.status !== 'signed' && order.status !== 'expired' && getEffectiveDeliveryStatus(order) === 'expired';

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
    Alert.alert(t('delivery.startTransit'), t('delivery.markInTransitConfirm'), [
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
      {
        text: t('common.confirm'),
        onPress: async () => {
          await updateStatus(order.id, 'delivered');
          router.replace({ pathname: '/delivery/[id]', params: { id: order.id } });
        },
      },
    ]);
  };

  const handleSign = () => setSignatureModalVisible(true);

  const handleAddPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.permissionDenied'), t('delivery.photoPermissionRequired'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      selectionLimit: 5,
    });
    if (!result.canceled && result.assets.length > 0) {
      for (const asset of result.assets) {
        await addPhoto(order.id, asset.uri);
      }
    }
  };

  const handleSignatureConfirm = (
    signatureData: string,
    strokes: { x: number; y: number; id: number }[][]
  ) => {
    addSignature(order.id, signatureData, strokes);
    setSignatureModalVisible(false);
    router.replace({ pathname: '/delivery/[id]', params: { id: order.id } });
  };

  const actionButtons: { label: string; onPress: () => void; variant?: 'primary' | 'secondary'; icon?: React.ReactNode }[] = [];

  const rawOrder = deliveries.find((d) => d.id === id);
  const rawStatus = rawOrder?.status ?? order.status;

  if (!isExpired) {
    if (isAdmin && rawStatus === 'pending') {
      actionButtons.push({ label: t('delivery.assignDriver'), onPress: handleAssign, variant: 'primary', icon: <Truck size={16} color="#fff" /> });
    }
    if (!isAdmin && rawStatus === 'assigned') {
      actionButtons.push({ label: t('delivery.startTransit'), onPress: handleStartTransit, variant: 'primary', icon: <Truck size={16} color="#fff" /> });
    }
    if (!isAdmin && rawStatus === 'in_transit') {
      actionButtons.push({ label: t('delivery.markDelivered'), onPress: handleMarkDelivered, variant: 'secondary', icon: <CheckCircle size={16} color={colors.primary} /> });
    }
    if (!isAdmin && rawStatus === 'delivered') {
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
            <Text style={styles.sectionTitle}>{t('delivery.customer')}</Text>
            <Card style={styles.infoCard}>
              <InfoRow icon={<User size={16} color={colors.textSecondary} />} label={t('delivery.name')} value={order.customerName} />
              <View style={styles.divider} />
              <InfoRow icon={<Phone size={16} color={colors.textSecondary} />} label={t('delivery.phone')} value={order.customerPhone} />
            </Card>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).springify()}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('delivery.route')}</Text>
            <Card style={styles.infoCard}>
              <View style={styles.routeContainer}>
                <View style={styles.routeStop}>
                  <View style={[styles.routeIconCircle, { backgroundColor: `${colors.primary}20` }]}>
                    <View style={[styles.routeIconDot, { backgroundColor: colors.primary }]} />
                  </View>
                  <View style={styles.routeStopInfo}>
                    <Text style={styles.routeStopLabel}>{t('delivery.pickup').toUpperCase()}</Text>
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
                    <Text style={styles.routeStopLabel}>{t('delivery.dropoff').toUpperCase()}</Text>
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
            <Text style={styles.sectionTitle}>{t('delivery.cargo')}</Text>
            <Card style={styles.infoCard}>
              <InfoRow icon={<Package size={16} color={colors.textSecondary} />} label={t('delivery.description')} value={order.cargoDescription} />
              <View style={styles.divider} />
              <InfoRow icon={<Scale size={16} color={colors.textSecondary} />} label={t('delivery.weight')} value={`${order.cargoWeight} ${t('dashboard.kg')}`} />
              {order.notes && (
                <>
                  <View style={styles.divider} />
                  <InfoRow icon={<StickyNote size={16} color={colors.textSecondary} />} label={t('delivery.notes')} value={order.notes} />
                </>
              )}
            </Card>
          </View>
        </Animated.View>

        {order.assignedDriverName && (
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('delivery.assignedDriver')}</Text>
              <Card style={styles.infoCard}>
                <InfoRow icon={<Truck size={16} color={colors.textSecondary} />} label={t('delivery.name')} value={order.assignedDriverName} />
                <View style={styles.divider} />
                <InfoRow icon={<Clock size={16} color={colors.textSecondary} />} label={t('delivery.assignedAt')} value={order.pickupTime} />
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

        {((!isAdmin && (rawStatus === 'in_transit' || rawStatus === 'delivered' || rawStatus === 'signed')) || (order.photos && order.photos.length > 0)) && (
          <Animated.View entering={FadeInDown.delay(220).springify()}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('delivery.photos')}</Text>
              <View style={styles.photosGallery}>
                {order.photos && order.photos.map((photo) => (
                  <Pressable
                    key={photo.id}
                    style={styles.photoItem}
                    onPress={() => {
                      setLightboxUri(photo.uri);
                      setLightboxVisible(true);
                    }}
                  >
                    <View style={styles.photoImageWrapper}>
                      <Image source={{ uri: photo.uri }} style={styles.photoImage} resizeMode="cover" />
                      <Pressable
                        style={styles.photoDeleteBtn}
                        onPress={() => {
                          Alert.alert(
                            t('delivery.deletePhotoTitle'),
                            t('delivery.deletePhotoMessage'),
                            [
                              { text: t('common.cancel'), style: 'cancel' },
                              {
                                text: t('common.delete'),
                                style: 'destructive',
                                onPress: () => removePhoto(order.id, photo.id),
                              },
                            ]
                          );
                        }}
                        hitSlop={8}
                      >
                        <Text style={styles.photoDeleteIcon}>X</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.photoMeta}>{new Date(photo.takenAt).toLocaleString()}</Text>
                  </Pressable>
                ))}
                {(!order.photos || order.photos.length < 5) && (
                  <Pressable style={styles.photoItem} onPress={handleAddPhoto}>
                    <View style={[styles.photoImage, styles.addPhotoPlaceholder]}>
                      <Text style={styles.addPhotoIcon}>+</Text>
                    </View>
                    <Text style={styles.photoMeta}>{t('delivery.addPhoto')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </Animated.View>
        )}

        {order.signatureData && order.signatureStrokes && order.signatureStrokes.length > 0 && (() => {
          const allPoints = order.signatureStrokes.flat();
          const xs = allPoints.map((p) => p.x);
          const ys = allPoints.map((p) => p.y);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const sigW = maxX - minX || 1;
          const sigH = maxY - minY || 1;
          const pad = 20;
          const svgW = 300;
          const svgH = 120;
          const scaleX = (svgW - pad * 2) / sigW;
          const scaleY = (svgH - pad * 2) / sigH;
          const scale = Math.min(scaleX, scaleY);
          const offsetX = (svgW - sigW * scale) / 2 - minX * scale;
          const offsetY = (svgH - sigH * scale) / 2 - minY * scale;
          const sx = (v: number) => v * scale + offsetX;
          const sy = (v: number) => v * scale + offsetY;
          return (
            <Animated.View entering={FadeInDown.delay(220).springify()}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('delivery.electronicSignature')}</Text>
                <Card style={styles.signatureDisplayCard}>
                  <Svg width={svgW} height={svgH}>
                    {order.signatureStrokes!.map((stroke, si) =>
                      stroke.length > 1
                        ? stroke.slice(1).map((pt, i) => (
                            <Line
                              key={`s-${si}-${i}`}
                              x1={sx(stroke[i].x)}
                              y1={sy(stroke[i].y)}
                              x2={sx(pt.x)}
                              y2={sy(pt.y)}
                              stroke={colors.textPrimary}
                              strokeWidth={2.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          ))
                        : null
                    )}
                  </Svg>
                  <Text style={styles.signatureMeta}>{t('delivery.signedAt')} {new Date(order.signedAt!).toLocaleString()}</Text>
                </Card>
              </View>
            </Animated.View>
          );
        })()}

        <Modal visible={lightboxVisible} transparent animationType="fade" onRequestClose={() => setLightboxVisible(false)}>
          <View style={styles.lightboxOverlay}>
            <Pressable style={styles.lightboxCloseArea} onPress={() => setLightboxVisible(false)} />
            <Image source={{ uri: lightboxUri }} style={styles.lightboxImage} resizeMode="contain" />
            <Pressable style={styles.lightboxCloseBtn} onPress={() => setLightboxVisible(false)}>
              <Text style={styles.lightboxCloseText}>✕</Text>
            </Pressable>
          </View>
        </Modal>

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
  signatureDisplayCard: { padding: spacing.md, alignItems: 'center', backgroundColor: colors.card, borderRadius: borderRadius.lg },
  signatureMeta: { fontSize: typography.fontSize.xs, color: colors.textTertiary, marginTop: spacing.sm },
  photosGallery: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoItem: {
    width: '31%',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  photoImage: { width: '100%', aspectRatio: 1 },
  photoMeta: { fontSize: typography.fontSize.xs, color: colors.textTertiary, padding: spacing.sm, textAlign: 'center' },
  photoImageWrapper: { width: '100%', aspectRatio: 1, position: 'relative' },
  photoDeleteBtn: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  photoDeleteIcon: { color: '#fff', fontSize: 12, fontWeight: '700' },
  addPhotoPlaceholder: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addPhotoIcon: { fontSize: 32, color: colors.textTertiary, fontWeight: '300' },
  lightboxOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  lightboxCloseArea: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  lightboxImage: { width: '100%', height: '80%' },
  lightboxCloseBtn: { position: 'absolute', top: 60, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  lightboxCloseText: { color: '#fff', fontSize: 20, fontWeight: '600' },
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
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  signatureHint: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  signaturePad: {
    marginTop: spacing.md,
    height: 180,
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
  clearSignatureBtn: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  clearSignatureBtnText: {
    fontSize: typography.fontSize.sm,
    color: colors.danger,
    fontWeight: '600',
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
