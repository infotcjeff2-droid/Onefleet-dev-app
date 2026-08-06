import { useState, useRef, useEffect, useCallback } from 'react';
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
  Platform,
  TouchableOpacity,
  Animated as RNAnimated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown, FadeInUp, FadeIn, useAnimatedStyle, withSpring, useSharedValue } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { getEffectiveDeliveryStatus, useDeliveryStore } from '@/store/deliveryStore';
import { DeliveryOrder, DeliveryStatus, SignatureStroke } from '@/types';
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
  ArrowRight,
  Scale,
  StickyNote,
  AlertTriangle,
  Camera,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Pencil,
} from 'lucide-react-native';
import { useTranslation } from '@/i18n';

const { width: SCREEN_W } = Dimensions.get('window');

type StepKey = 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'signed' | 'completed' | 'expired';

const STEP_ORDER: StepKey[] = ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'signed', 'completed'];

const STATUS_TO_STEP: Record<DeliveryStatus, StepKey> = {
  pending: 'pending',
  assigned: 'assigned',
  in_transit: 'in_transit',
  delivered: 'delivered',
  signed: 'signed',
  expired: 'expired',
};

const STEP_TO_STATUS: Record<StepKey, DeliveryStatus> = {
  pending: 'pending',
  assigned: 'assigned',
  picked_up: 'assigned',
  in_transit: 'in_transit',
  delivered: 'delivered',
  signed: 'signed',
  completed: 'signed',
  expired: 'expired',
};

function buildStepConfig(t: (key: string) => string): Record<StepKey, { label: string; color: string; bg: string }> {
  return {
    pending: { label: t('delivery.stepPending'), color: colors.warning, bg: `${colors.warning}20` },
    assigned: { label: t('delivery.stepAssigned'), color: colors.secondary, bg: `${colors.secondary}20` },
    picked_up: { label: t('delivery.stepPickedUp'), color: colors.accent, bg: `${colors.accent}20` },
    in_transit: { label: t('delivery.stepInTransit'), color: colors.primary, bg: `${colors.primary}20` },
    delivered: { label: t('delivery.stepDelivered'), color: colors.success, bg: `${colors.success}20` },
    signed: { label: t('delivery.stepSigned'), color: colors.primary, bg: `${colors.primary}20` },
    completed: { label: t('delivery.orderCompleted'), color: colors.success, bg: `${colors.success}20` },
    expired: { label: t('delivery.stepExpired'), color: colors.danger, bg: `${colors.danger}20` },
  };
}

function getStepIndex(step: StepKey): number {
  return STEP_ORDER.indexOf(step);
}

function isStepReachable(currentStatus: StepKey, targetStatus: StepKey): boolean {
  const currentIdx = getStepIndex(currentStatus);
  const targetIdx = getStepIndex(targetStatus);
  return targetIdx <= currentIdx;
}

// ============ InfoRow Component ============
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

// ============ Assign Driver Modal ============
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

// ============ Signature Display Component ============
function SignatureDisplay({ strokes }: { strokes: SignatureStroke[][] }) {
  if (!strokes || strokes.length === 0) return null;

  // Calculate bounding box of the signature
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  strokes.forEach((stroke) => {
    stroke.forEach((pt) => {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    });
  });

  const padding = 16;
  const originalWidth = maxX - minX + padding * 2;
  const originalHeight = maxY - minY + padding * 2;

  // Target display size (larger to show full signature)
  const displayWidth = 320;
  const displayHeight = 160;

  // Calculate scale to fit within display area while maintaining aspect ratio
  const scaleX = displayWidth / originalWidth;
  const scaleY = displayHeight / originalHeight;
  const scale = Math.min(scaleX, scaleY, 1); // Don't upscale, only downscale

  const scaledWidth = originalWidth * scale;
  const scaledHeight = originalHeight * scale;

  // Offset to center the signature
  const offsetX = (displayWidth - scaledWidth) / 2 - (minX - padding) * scale;
  const offsetY = (displayHeight - scaledHeight) / 2 - (minY - padding) * scale;

  return (
    <Svg width={displayWidth} height={displayHeight}>
      {strokes.map((stroke, si) =>
        stroke.length > 1
          ? stroke.slice(1).map((pt, i) => (
              <Line
                key={`s-${si}-${i}`}
                x1={stroke[i].x * scale + offsetX}
                y1={stroke[i].y * scale + offsetY}
                x2={pt.x * scale + offsetX}
                y2={pt.y * scale + offsetY}
                stroke={colors.textPrimary}
                strokeWidth={2.5 / scale}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))
          : null
      )}
    </Svg>
  );
}

// ============ Signature Modal ============
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
  const isDrawingRef = useRef(false);
  const currentLineRef = useRef<{ x: number; y: number; id: number }[]>([]);
  const linesRef = useRef<{ x: number; y: number; id: number }[][]>([]);

  const handleTouch = useCallback((x: number, y: number) => {
    const newPoint = { x, y, id: lineIdRef.current++ };
    currentLineRef.current = [...currentLineRef.current, newPoint];
    setCurrentLine([...currentLineRef.current]);
  }, []);

  const handleEndLine = useCallback(() => {
    if (currentLineRef.current.length > 0) {
      linesRef.current = [...linesRef.current, [...currentLineRef.current]];
      setLines([...linesRef.current]);
      currentLineRef.current = [];
      setCurrentLine([]);
    }
    isDrawingRef.current = false;
  }, []);

  const handleClear = useCallback(() => {
    linesRef.current = [];
    currentLineRef.current = [];
    setLines([]);
    setCurrentLine([]);
  }, []);

  const handleConfirm = () => {
    const finalLines = linesRef.current;
    onConfirm(`signed-${Date.now()}`, finalLines);
    handleClear();
    onClose();
  };

  const hasSignature = lines.length > 0 || currentLine.length > 0;

  const isWeb = Platform.OS === 'web';

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
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <Animated.View entering={FadeInUp.springify()} style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('delivery.electronicSignature')}</Text>
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

// ============ Photo Gallery Component ============
function PhotoGallery({
  photos,
  onAddPhoto,
  onDeletePhoto,
  onViewPhoto,
  isPickup,
  maxPhotos = 5,
  disabled = false,
}: {
  photos: { id: string; uri: string; takenAt: string }[];
  onAddPhoto: () => void;
  onDeletePhoto: (photoId: string) => void;
  onViewPhoto: (uri: string) => void;
  isPickup: boolean;
  maxPhotos?: number;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [photoUriCache, setPhotoUriCache] = useState<Record<string, string>>({});

  useEffect(() => {
    if (photos) {
      const cache: Record<string, string> = {};
      photos.forEach((photo) => {
        if (!cache[photo.uri]) {
          const separator = photo.uri.includes('?') ? '&' : '?';
          cache[photo.uri] = `${photo.uri}${separator}nocache=${Date.now()}`;
        }
      });
      setPhotoUriCache(cache);
    }
  }, [photos]);

  const getPhotoUri = (uri: string) => {
    if (photoUriCache[uri]) return photoUriCache[uri];
    const separator = uri.includes('?') ? '&' : '?';
    const newUri = `${uri}${separator}nocache=${Date.now()}`;
    setPhotoUriCache((prev) => ({ ...prev, [uri]: newUri }));
    return newUri;
  };

  return (
    <View style={styles.photosGallery}>
      {photos.map((photo) => (
        <Pressable
          key={photo.id}
          style={styles.photoItem}
          onPress={() => onViewPhoto(photo.uri)}
        >
          <View style={styles.photoImageWrapper}>
            <Image source={{ uri: getPhotoUri(photo.uri) }} style={styles.photoImage} resizeMode="cover" />
            {!disabled && (
              <Pressable
                style={styles.photoDeleteBtn}
                onPress={() => onDeletePhoto(photo.id)}
                hitSlop={8}
              >
                <Text style={styles.photoDeleteIcon}>X</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.photoMeta}>{new Date(photo.takenAt).toLocaleString()}</Text>
        </Pressable>
      ))}
      {photos.length < maxPhotos && !disabled && (
        <Pressable style={styles.photoItem} onPress={onAddPhoto}>
          <View style={[styles.photoImage, styles.addPhotoPlaceholder]}>
            <Camera size={24} color={colors.textTertiary} />
          </View>
          <Text style={styles.photoMeta}>{isPickup ? t('delivery.addPickupPhoto') : t('delivery.addDeliveryPhoto')}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ============ Step Tab Bar Component ============
function StepTabBar({
  currentStep,
  deliveryStep,
  onStepPress,
  stepConfig,
  order,
}: {
  currentStep: StepKey;
  deliveryStep: StepKey;
  onStepPress: (step: StepKey) => void;
  stepConfig: Record<StepKey, { label: string; color: string; bg: string }>;
  order: DeliveryOrder;
}) {
  const { t } = useTranslation();
  const isExpired = order.status === 'expired';
  const isCompleted = order.isCompleted;

  // 使用 currentStep 來判斷高亮（跟隨司機操作）
  const effectiveStep = isExpired ? 'expired' : currentStep;

  // 已完成的配送單顯示所有步驟標籤
  const displaySteps = isCompleted
    ? STEP_ORDER
    : isExpired
      ? ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'expired'] as StepKey[]
      : STEP_ORDER.slice(0, -1); // 非已完成時不顯示 completed 標籤

  const getStepStatus = (step: StepKey): 'completed' | 'current' | 'locked' => {
    // 已完成的配送單：所有步驟都是 completed
    if (isCompleted) {
      if (step === 'completed') return 'current';
      return 'completed';
    }

    if (step === 'expired') {
      return step === effectiveStep ? 'current' : 'completed';
    }
    const stepIdx = getStepIndex(step);
    const currentIdx = getStepIndex(effectiveStep);
    if (stepIdx < currentIdx) return 'completed';
    if (stepIdx === currentIdx) return 'current';
    return 'locked';
  };

  return (
    <View style={styles.stepTabBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepTabContent}>
        {displaySteps.map((step, index) => {
          const status = getStepStatus(step);
          const cfg = stepConfig[step];
          // 已完成的配送單所有步驟都可以點擊，否則只有 completed 或 current 狀態可以點擊
          const isClickable = isCompleted || status === 'completed' || status === 'current';

          return (
            <Pressable
              key={step}
              style={[
                styles.stepTabItem,
                status === 'current' && styles.stepTabItemCurrent,
                status === 'completed' && styles.stepTabItemCompleted,
                status === 'locked' && styles.stepTabItemLocked,
              ]}
              onPress={() => isClickable && onStepPress(step)}
              disabled={!isClickable}
            >
              <View
                style={[
                  styles.stepTabNumber,
                  status === 'current' && { backgroundColor: cfg.color },
                  status === 'completed' && { backgroundColor: colors.success },
                  status === 'locked' && { backgroundColor: colors.border },
                ]}
              >
                {status === 'completed' ? (
                  <CheckCircle size={14} color="#fff" />
                ) : (
                  <Text style={[
                    styles.stepTabNumberText,
                    status === 'locked' && { color: colors.textTertiary },
                  ]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepTabLabel,
                  status === 'current' && { color: cfg.color, fontWeight: '700' },
                  status === 'locked' && { color: colors.textTertiary },
                ]}
                numberOfLines={1}
              >
                {cfg.label}
              </Text>
              {status === 'current' && (
                <View style={[styles.stepTabIndicator, { backgroundColor: cfg.color }]} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ============ Main Component ============
export default function DeliveryDetailScreen() {
  const { t } = useTranslation();
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role } = useAuthStore();
  const {
    deliveries,
    assignDriver,
    updateStatus,
    addSignature,
    addPhoto,
    removePhoto,
    removeDriver,
    recordPickupTime,
    recordInTransitTime,
    recordDeliveredTime,
    completeDelivery,
  } = useDeliveryStore();
  const { drivers, loadDrivers } = useDriverStore();
  const { users: managedUsers, loadUsers } = useUserManagementStore();
  const isAdmin = role === 'admin' || role === 'company';

  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [currentStep, setCurrentStep] = useState<StepKey>('pending');
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxUri, setLightboxUri] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<{ uri: string }[]>([]);
  const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPickupPhotoMode, setIsPickupPhotoMode] = useState(false);
  const [photoUriCache, setPhotoUriCache] = useState<Record<string, string>>({});

  // Animation value for step content fade in
  const stepContentFade = useRef(new RNAnimated.Value(1)).current;

  // 處理 URL 參數中的 action
  useEffect(() => {
    if (action === 'pickup' && currentStep === 'assigned') {
      // 司機從列表點擊「已取貨」進入，直接切換到取貨 tab
      setCurrentStep('picked_up');
    }
  }, [action, currentStep]);

  const stepConfig = buildStepConfig(t);

  useEffect(() => {
    if (order?.pickupPhotos) {
      const cache: Record<string, string> = {};
      order.pickupPhotos.forEach((photo) => {
        if (!cache[photo.uri]) {
          const separator = photo.uri.includes('?') ? '&' : '?';
          cache[photo.uri] = `${photo.uri}${separator}nocache=${Date.now()}`;
        }
      });
      setPhotoUriCache(cache);
    }
  }, [order?.pickupPhotos]);

  useEffect(() => {
    const found = deliveries.find((delivery) => delivery.id === id);
    if (found) {
      setOrder(found);
      const isExpired = getEffectiveDeliveryStatus(found) === 'expired';
      // 已完成的配送單預設顯示 completed 標籤
      if (found.isCompleted) {
        setCurrentStep('completed');
      } else {
        const step = isExpired ? 'expired' : STATUS_TO_STEP[found.status];
        setCurrentStep(step);
      }
    }
  }, [id, deliveries]);

  useEffect(() => {
    useDeliveryStore.getState().loadDeliveries();
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

  const isExpired = getEffectiveDeliveryStatus(order) === 'expired';
  const deliveryStep: StepKey = isExpired ? 'expired' : STATUS_TO_STEP[order.status];

  const mergedDrivers = [
    ...drivers,
    ...managedUsers
      .filter((managedUser) => managedUser.role === 'driver' && !drivers.some((driver) => driver.id === managedUser.id))
      .map((driver) => ({ id: driver.id, name: driver.name, phone: '', vehiclePlate: '' })),
  ];

  const getPhotoUri = (uri: string) => {
    if (photoUriCache[uri]) return photoUriCache[uri];
    const separator = uri.includes('?') ? '&' : '?';
    const newUri = `${uri}${separator}nocache=${Date.now()}`;
    setPhotoUriCache((prev) => ({ ...prev, [uri]: newUri }));
    return newUri;
  };

  // ============ Handlers ============
  const handleAssign = () => {
    if (isExpired) {
      Alert.alert(t('delivery.expired'), t('delivery.expiredReadonly'));
      return;
    }
    setAssignModalVisible(true);
  };

  const handleDriverAssign = async (driverId: string, driverName: string) => {
    await assignDriver(order.id, driverId, driverName);
  };

  const handleStepPress = (step: StepKey) => {
    if (step === currentStep) return;
    
    // Fade out then fade in
    RNAnimated.sequence([
      RNAnimated.timing(stepContentFade, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      RNAnimated.timing(stepContentFade, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
    
    setCurrentStep(step);
  };

  const handleNextStep = async () => {
    const currentIdx = getStepIndex(currentStep);
    if (currentIdx >= STEP_ORDER.length - 1) return;

    const nextStep = STEP_ORDER[currentIdx + 1];

    // 根據不同步驟處理
    if (currentStep === 'assigned' && nextStep === 'picked_up') {
      // 已分配司機後，司機進入取貨階段
      setCurrentStep(nextStep);
      return;
    }

    if (currentStep === 'picked_up' && nextStep === 'in_transit') {
      // 已取貨需要先上傳相片
      if (!order.pickupPhotos || order.pickupPhotos.length === 0) {
        Alert.alert(t('common.warning'), t('delivery.pickupPhotoRequired'));
        return;
      }
      // 記錄取貨時間並切換狀態
      await recordPickupTime(order.id);
      if (Platform.OS === 'web') {
        await updateStatus(order.id, 'in_transit');
        router.replace({ pathname: '/delivery/[id]', params: { id: order.id } });
      } else {
        Alert.alert(t('delivery.startTransit'), t('delivery.markInTransitConfirm'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm'),
            onPress: () => updateStatus(order.id, 'in_transit').then(() => {
              router.replace({ pathname: '/delivery/[id]', params: { id: order.id } });
            }),
          },
        ]);
        return;
      }
      setCurrentStep(nextStep);
      return;
    }

    if (currentStep === 'in_transit' && nextStep === 'delivered') {
      // 運輸中 -> 已送達：記錄運輸時間，切換到已送達步驟
      await recordInTransitTime(order.id);
      if (Platform.OS === 'web') {
        await updateStatus(order.id, 'delivered');
        router.replace({ pathname: '/delivery/[id]', params: { id: order.id } });
      } else {
        Alert.alert(t('delivery.markDelivered'), t('delivery.confirmDeliveryComplete'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm'),
            onPress: () => updateStatus(order.id, 'delivered').then(() => {
              router.replace({ pathname: '/delivery/[id]', params: { id: order.id } });
            }),
          },
        ]);
        return;
      }
      setCurrentStep(nextStep);
      return;
    }

    if (currentStep === 'delivered' && nextStep === 'signed') {
      // 已送達 -> 已簽收：需要上傳送達相片
      if (!order.photos || order.photos.length === 0) {
        Alert.alert(t('common.warning'), t('delivery.deliveryPhotoRequired'));
        return;
      }
      await recordDeliveredTime(order.id);
      setCurrentStep(nextStep);
      return;
    }

    // 預設情況下直接切換步驟
    setCurrentStep(nextStep);
  };

  const handlePrevStep = () => {
    const currentIdx = getStepIndex(currentStep);
    if (currentIdx > 0) {
      setCurrentStep(STEP_ORDER[currentIdx - 1]);
    }
  };

  const handleSign = () => setSignatureModalVisible(true);

  const handleCompleteOrder = () => {
    const confirmAction = async () => {
      await completeDelivery(order.id);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`${t('delivery.completeOrderConfirmTitle')}\n\n${t('delivery.completeOrderConfirmMessage')}`)) {
        confirmAction();
      }
    } else {
      Alert.alert(
        t('delivery.completeOrderConfirmTitle'),
        t('delivery.completeOrderConfirmMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.confirm'), onPress: confirmAction },
        ]
      );
    }
  };

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
      setPendingPhotos(result.assets);
      setPhotoPreviewVisible(true);
    }
  };

  const handleConfirmPhotos = async () => {
    const photosToUpload = [...pendingPhotos];
    const orderId = order.id;

    setIsSyncing(true);
    setPendingPhotos([]);
    setPhotoPreviewVisible(false);

    for (const photo of photosToUpload) {
      await addPhoto(orderId, photo.uri, isPickupPhotoMode);
    }

    if (typeof window !== 'undefined' && Platform.OS === 'web') {
      await new Promise<void>((resolve) => setTimeout(resolve, 800));
      window.location.reload();
    } else {
      setIsSyncing(false);
      router.replace({ pathname: '/delivery/[id]', params: { id: orderId } });
    }
  };

  const handleCancelPhotos = () => {
    setPendingPhotos([]);
    setPhotoPreviewVisible(false);
  };

  const handleDeletePhoto = async (photoId: string, isPickup: boolean) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(t('delivery.deletePhotoMessage'))
      : null;

    if (Platform.OS === 'web' && confirmed) {
      setIsSyncing(true);
      await removePhoto(order.id, photoId, isPickup);
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      window.location.reload();
    } else if (Platform.OS !== 'web') {
      Alert.alert(
        t('delivery.deletePhotoTitle'),
        t('delivery.deletePhotoMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: async () => {
              await removePhoto(order.id, photoId, isPickup);
            },
          },
        ]
      );
    }
  };

  const handleSignatureConfirm = async (
    signatureData: string,
    strokes: { x: number; y: number; id: number }[][]
  ) => {
    await addSignature(order.id, signatureData, strokes);
    setSignatureModalVisible(false);
    router.replace({ pathname: '/delivery/[id]', params: { id: order.id } });
  };

  // ============ Step Content Rendering ============
  const renderStepContent = () => {
    const currentIdx = getStepIndex(currentStep);
    const isLastStep = currentIdx >= STEP_ORDER.length - 1 || currentStep === 'expired';

    switch (currentStep) {
      case 'pending':
        return (
          <Animated.View entering={FadeInDown.springify()}>
            <Card style={styles.stepCard}>
              <Text style={styles.stepTitle}>{t('delivery.stepPending')}</Text>
              <Text style={styles.stepDescription}>
                {t('delivery.stepFlow')} - {t('delivery.stepPending')}
              </Text>
              {isAdmin && (
                <View style={styles.stepAction}>
                  <Button
                    title={t('delivery.assignDriver')}
                    onPress={handleAssign}
                    icon={<Truck size={16} color="#fff" />}
                  />
                </View>
              )}
            </Card>
            <View style={styles.stepInfoSection}>
              <Text style={styles.sectionTitle}>{t('delivery.customer')}</Text>
              <Card style={styles.infoCard}>
                <InfoRow icon={<User size={16} color={colors.textSecondary} />} label={t('delivery.name')} value={order.customerName} />
                <View style={styles.divider} />
                <InfoRow icon={<Phone size={16} color={colors.textSecondary} />} label={t('delivery.phone')} value={order.customerPhone} />
              </Card>
            </View>
            <View style={styles.stepInfoSection}>
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
            <View style={styles.stepInfoSection}>
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
        );

      case 'assigned':
        return (
          <Animated.View entering={FadeInDown.springify()}>
            <Card style={styles.stepCard}>
              <Text style={styles.stepTitle}>{t('delivery.stepAssigned')}</Text>
              <Text style={styles.stepDescription}>
                {order.assignedDriverName ? `${t('delivery.driverAssigned')} ${order.assignedDriverName}` : t('delivery.selectDriver')}
              </Text>
              {!order.assignedDriverName && !isAdmin && (
                <View style={styles.stepAction}>
                  <Button
                    title={t('delivery.assignDriver')}
                    onPress={handleAssign}
                    icon={<Truck size={16} color="#fff" />}
                  />
                </View>
              )}
            </Card>
            <View style={styles.stepInfoSection}>
              <Text style={styles.sectionTitle}>{t('delivery.customer')}</Text>
              <Card style={styles.infoCard}>
                <InfoRow icon={<User size={16} color={colors.textSecondary} />} label={t('delivery.name')} value={order.customerName} />
                <View style={styles.divider} />
                <InfoRow icon={<Phone size={16} color={colors.textSecondary} />} label={t('delivery.phone')} value={order.customerPhone} />
              </Card>
            </View>
            <View style={styles.stepInfoSection}>
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
            <View style={styles.stepInfoSection}>
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
            {order.assignedDriverName && (
              <View style={styles.stepInfoSection}>
                <Text style={styles.sectionTitle}>{t('delivery.assignedDriver')}</Text>
                <Card style={styles.infoCard}>
                  <InfoRow icon={<Truck size={16} color={colors.textSecondary} />} label={t('delivery.name')} value={order.assignedDriverName} />
                  <View style={styles.divider} />
                  <InfoRow icon={<Clock size={16} color={colors.textSecondary} />} label={t('delivery.assignedAt')} value={order.assignedAt ? new Date(order.assignedAt).toLocaleString() : '-'} />
                </Card>
              </View>
            )}
          </Animated.View>
        );

      case 'picked_up':
        return (
          <Animated.View entering={FadeInDown.springify()}>
            <Card style={styles.stepCard}>
              <Text style={styles.stepTitle}>{t('delivery.stepPickedUp')}</Text>
              <Text style={styles.stepDescription}>
                {order.pickedUpAt ? `${t('delivery.pickUpTimeRecorded')}: ${new Date(order.pickedUpAt).toLocaleString()}` : t('delivery.addPickupPhoto')}
              </Text>
            </Card>
            <View style={styles.stepInfoSection}>
              <Text style={styles.sectionTitle}>{t('delivery.pickupPhotos')}</Text>
              <PhotoGallery
                photos={order.pickupPhotos || []}
                onAddPhoto={() => {
                  setIsPickupPhotoMode(true);
                  handleAddPhoto();
                }}
                onDeletePhoto={(photoId) => handleDeletePhoto(photoId, true)}
                onViewPhoto={(uri) => {
                  setLightboxUri(uri);
                  setLightboxVisible(true);
                }}
                isPickup={true}
                disabled={order.isCompleted}
              />
            </View>
          </Animated.View>
        );

      case 'in_transit':
        return (
          <Animated.View entering={FadeInDown.springify()}>
            <Card style={styles.stepCard}>
              <Text style={styles.stepTitle}>{t('delivery.stepInTransit')}</Text>
              <Text style={styles.stepDescription}>
                {order.inTransitAt ? `${t('delivery.inTransitTimeRecorded')}: ${new Date(order.inTransitAt).toLocaleString()}` : t('delivery.stepInTransit')}
              </Text>
            </Card>
            <View style={styles.stepInfoSection}>
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
                    <View style={[styles.routeConnectorLine, { backgroundColor: colors.accent }]} />
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
        );

      case 'delivered':
        return (
          <Animated.View entering={FadeInDown.springify()}>
            <Card style={styles.stepCard}>
              <Text style={styles.stepTitle}>{t('delivery.stepDelivered')}</Text>
              <Text style={styles.stepDescription}>
                {order.deliveredAt ? `${t('delivery.deliveredTimeRecorded')}: ${new Date(order.deliveredAt).toLocaleString()}` : t('delivery.addDeliveryPhoto')}
              </Text>
            </Card>
            <View style={styles.stepInfoSection}>
              <Text style={styles.sectionTitle}>{t('delivery.deliveryPhotos')}</Text>
              <PhotoGallery
                photos={order.photos || []}
                onAddPhoto={() => {
                  setIsPickupPhotoMode(false);
                  handleAddPhoto();
                }}
                onDeletePhoto={(photoId) => handleDeletePhoto(photoId, false)}
                onViewPhoto={(uri) => {
                  setLightboxUri(uri);
                  setLightboxVisible(true);
                }}
                isPickup={false}
                disabled={order.isCompleted}
              />
            </View>
          </Animated.View>
        );

      case 'signed':
        return (
          <Animated.View entering={FadeInDown.springify()}>
            <Card style={styles.stepCard}>
              <Text style={styles.stepTitle}>{t('delivery.stepSigned')}</Text>
              <Text style={styles.stepDescription}>
                {order.signedAt ? `${t('delivery.signedTimeRecorded')}: ${new Date(order.signedAt).toLocaleString()}` : t('delivery.electronicSignature')}
              </Text>
              {!order.signatureData && !isAdmin && (
                <View style={styles.stepAction}>
                  <Button
                    title={t('delivery.signDelivery')}
                    onPress={handleSign}
                    icon={<Pencil size={16} color={colors.primary} />}
                    variant="secondary"
                  />
                </View>
              )}
            </Card>
            {order.signatureData && order.signatureStrokes && order.signatureStrokes.length > 0 && (
              <View style={styles.stepInfoSection}>
                <Text style={styles.sectionTitle}>{t('delivery.electronicSignature')}</Text>
                <Card style={styles.signatureDisplayCard}>
                  <SignatureDisplay strokes={order.signatureStrokes} />
                  <Text style={styles.signatureMeta}>{t('delivery.signedAt')} {new Date(order.signedAt!).toLocaleString()}</Text>
                </Card>
              </View>
            )}
          </Animated.View>
        );

      case 'completed':
        return (
          <Animated.View entering={FadeInDown.springify()}>
            <Card style={styles.stepCard}>
              <Text style={styles.stepDescription}>
                {t('delivery.completedAt')}: {order.completedAt ? new Date(order.completedAt).toLocaleString() : '-'}
              </Text>
            </Card>
            {/* 顯示所有已完成配送的資訊摘要 */}
            <View style={styles.stepInfoSection}>
              <Text style={styles.sectionTitle}>{t('delivery.summary')}</Text>
              <Card style={styles.infoCard}>
                <InfoRow icon={<FileText size={16} color={colors.textSecondary} />} label={t('delivery.orderNo')} value={order.orderNo} />
                <View style={styles.divider} />
                <InfoRow icon={<User size={16} color={colors.textSecondary} />} label={t('delivery.customer')} value={order.customerName} />
                <View style={styles.divider} />
                <InfoRow icon={<Package size={16} color={colors.textSecondary} />} label={t('delivery.cargo')} value={order.cargoDescription} />
                <View style={styles.divider} />
                <InfoRow icon={<Scale size={16} color={colors.textSecondary} />} label={t('delivery.weight')} value={`${order.cargoWeight} ${t('dashboard.kg')}`} />
              </Card>
            </View>
            {/* 司機可以查看簽收資料 */}
            {order.signatureData && (
              <View style={styles.stepInfoSection}>
                <Text style={styles.sectionTitle}>{t('delivery.signature')}</Text>
                <Card style={styles.signatureDisplayCard}>
                  {order.signatureStrokes && order.signatureStrokes.length > 0 && (
                    <SignatureDisplay strokes={order.signatureStrokes} />
                  )}
                  <Text style={styles.signatureMeta}>{t('delivery.signedAt')} {order.signedAt ? new Date(order.signedAt).toLocaleString() : '-'}</Text>
                </Card>
              </View>
            )}
          </Animated.View>
        );

      case 'expired':
        return (
          <Animated.View entering={FadeInDown.springify()}>
            <Card style={styles.stepCard}>
              <View style={styles.expiredBanner}>
                <AlertTriangle size={20} color={colors.danger} />
                <Text style={styles.expiredBannerText}>{t('delivery.expiredReadonly')}</Text>
              </View>
            </Card>
          </Animated.View>
        );

      default:
        return null;
    }
  };

  const currentIdx = getStepIndex(currentStep);
  const canGoNext = currentIdx < STEP_ORDER.length - 1 && currentStep !== 'expired';
  const canGoPrev = currentIdx > 0 && !order.isCompleted;

  const showNextButton = () => {
    // 已完成配送後不顯示任何操作按鈕
    if (order.isCompleted) return false;

    // 管理員不能操作步驟
    if (isAdmin) return false;

    // 司機在以下步驟可按下一步
    // assigned -> picked_up: 需要先上傳取貨相片（按鈕會根據相片存在動態啟用）
    if (currentStep === 'assigned') return order.assignedDriverId ? true : false;

    // picked_up -> in_transit: 需要先上傳取貨相片
    if (currentStep === 'picked_up') return (order.pickupPhotos && order.pickupPhotos.length > 0);

    // in_transit -> delivered: 任何時候都可按下一步（記錄運輸時間並切換狀態）
    if (currentStep === 'in_transit') return true;

    // delivered -> signed: 需要先上傳送達相片
    if (currentStep === 'delivered') return (order.photos && order.photos.length > 0);

    // 已簽收後不顯示下一步按鈕，用戶可自由查看各 Tab
    if (currentStep === 'signed') return false;

    return false;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/delivery')} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.topBarTitleContainer}>
          <FileText size={18} color={colors.primary} />
          <Text style={styles.topBarTitle}>{order.orderNo}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {isSyncing && (
        <View style={styles.syncingOverlay}>
          <View style={styles.syncingBox}>
            <Text style={styles.syncingText}>{t('delivery.uploading')}</Text>
            <Text style={styles.syncingSubtext}>{t('common.wait')}</Text>
          </View>
        </View>
      )}

      <StepTabBar
        currentStep={currentStep}
        deliveryStep={deliveryStep}
        onStepPress={handleStepPress}
        stepConfig={stepConfig}
        order={order}
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} pointerEvents={isSyncing ? 'none' : 'auto'}>
        <Animated.View style={{ opacity: stepContentFade }}>
          {renderStepContent()}
        </Animated.View>
        <View style={{ height: 100 }} />
      </ScrollView>

      {!isAdmin && showNextButton() && (
        <View style={styles.bottomActions}>
          {canGoPrev && (
            <Button
              title={t('delivery.previousStep')}
              onPress={handlePrevStep}
              variant="ghost"
              icon={<ChevronLeft size={16} color={colors.primary} />}
            />
          )}
          <Button
            title={t('delivery.nextStep')}
            onPress={handleNextStep}
            icon={<ChevronRight size={16} color="#fff" />}
            style={{ flex: 1 }}
          />
        </View>
      )}

      {/* 已簽收且未完成時顯示「完成貨單」按鈕在最底部 */}
      {currentStep === 'signed' && order.signatureData && !isAdmin && !order.isCompleted && (
        <View style={[styles.bottomActions, { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }]}>
          <Button
            title={t('delivery.completeOrder')}
            onPress={handleCompleteOrder}
            icon={<CheckCircle size={16} color="#fff" />}
            style={{ flex: 1 }}
          />
        </View>
      )}

      {/* 已完成配送後顯示提示 */}
      {order.isCompleted && (
        <View style={[styles.bottomActions, { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }]}>
          <View style={styles.completedBanner}>
            <CheckCircle size={16} color={colors.success} />
            <Text style={styles.completedBannerText}>{t('delivery.orderCompleted')}</Text>
          </View>
        </View>
      )}

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

      <Modal visible={lightboxVisible} transparent animationType="fade" onRequestClose={() => setLightboxVisible(false)}>
        <View style={styles.lightboxOverlay}>
          <Pressable style={styles.lightboxCloseArea} onPress={() => setLightboxVisible(false)} />
          <Image source={{ uri: lightboxUri }} style={styles.lightboxImage} resizeMode="contain" />
          <Pressable style={styles.lightboxCloseBtn} onPress={() => setLightboxVisible(false)}>
            <Text style={styles.lightboxCloseText}>X</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal visible={photoPreviewVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Animated.View entering={FadeInUp.springify()} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('delivery.photoPreview')}</Text>
              <Pressable onPress={handleCancelPhotos} hitSlop={12}><X size={20} color={colors.textSecondary} /></Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewScrollView}>
              {pendingPhotos.map((photo, index) => (
                <View key={index} style={styles.previewPhotoItem}>
                  <Image source={{ uri: photo.uri }} style={styles.previewPhotoImage} resizeMode="cover" />
                </View>
              ))}
            </ScrollView>
            <Text style={styles.previewCountText}>
              {pendingPhotos.length} {t('delivery.photosSelected')}
            </Text>
            <View style={styles.modalActions}>
              <Button
                title={t('common.cancel')}
                variant="ghost"
                onPress={handleCancelPhotos}
                style={{ flex: 1 }}
              />
              <Button
                title={t('common.confirm')}
                onPress={handleConfirmPhotos}
                style={{ flex: 1 }}
              />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1 },
  syncingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  syncingBox: {
    backgroundColor: colors.card,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  syncingText: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  syncingSubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
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
  topBarTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  topBarTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  stepTabBar: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepTabContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  stepTabItem: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 70,
    position: 'relative',
  },
  stepTabItemCurrent: {
    backgroundColor: colors.surface,
  },
  stepTabItemCompleted: {
    opacity: 0.8,
  },
  stepTabItemLocked: {
    opacity: 0.5,
  },
  stepTabNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepTabNumberText: {
    color: '#fff',
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
  },
  stepTabLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  stepTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 3,
    borderRadius: 2,
  },
  stepCard: { marginHorizontal: spacing.lg, marginTop: spacing.lg, padding: spacing.lg },
  stepTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  stepDescription: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  stepAction: { marginTop: spacing.md },
  stepInfoSection: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
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
  photoImageWrapper: { width: '100%', aspectRatio: 1, position: 'relative', backgroundColor: colors.surface },
  photoDeleteBtn: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  photoDeleteIcon: { color: '#fff', fontSize: 12, fontWeight: '700' },
  addPhotoPlaceholder: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addPhotoIcon: { fontSize: 32, color: colors.textTertiary, fontWeight: '300' },
  lightboxOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  lightboxCloseArea: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  lightboxImage: { width: '100%', height: '80%' },
  lightboxCloseBtn: { position: 'absolute', top: 60, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  lightboxCloseText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  bottomActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  completedBanner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: `${colors.success}15`,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: `${colors.success}30`,
  },
  completedBannerText: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.success,
  },
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
  signatureDisplayCard: { padding: spacing.md, alignItems: 'center', backgroundColor: colors.card, borderRadius: borderRadius.lg },
  signatureMeta: { fontSize: typography.fontSize.xs, color: colors.textTertiary, marginTop: spacing.sm },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  notFoundText: { fontSize: typography.fontSize.base, color: colors.textSecondary },
  previewScrollView: { paddingHorizontal: spacing.lg, maxHeight: 300 },
  previewPhotoItem: {
    width: 200,
    height: 200,
    marginRight: spacing.md,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  previewPhotoImage: { width: '100%', height: '100%' },
  previewCountText: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: `${colors.danger}10`,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  expiredBannerText: { flex: 1, color: colors.danger, fontSize: typography.fontSize.sm, fontWeight: '600' },
});
