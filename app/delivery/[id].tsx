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
  Animated as RNAnimated,
  TextInput as RNTextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DeliveryEditForm } from '@/components/delivery/DeliveryEditForm';
import { useAuthStore } from '@/store/authStore';
import { getEffectiveDeliveryStatus, useDeliveryStore } from '@/store/deliveryStore';
import { DeliveryOrder, DeliveryCargoItem, DeliveryStatus, SignatureStroke } from '@/types';
import { useDriverStore } from '@/store/driverStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useInventoryStore } from '@/store/inventoryStore';
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
  ChevronLeft,
  ChevronRight,
  Pencil,
  MapPin,
  Warehouse as WarehouseIcon,
  Hash,
} from 'lucide-react-native';
import { useTranslation } from '@/i18n';

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
    picked_up: { label: t('delivery.stepPickedUp'), color: colors.primary, bg: `${colors.primary}20` },
    in_transit: { label: t('delivery.stepInTransit'), color: colors.primary, bg: `${colors.primary}20` },
    delivered: { label: t('delivery.stepDelivered'), color: colors.primary, bg: `${colors.primary}20` },
    signed: { label: t('delivery.stepSigned'), color: colors.primary, bg: `${colors.primary}20` },
    completed: { label: t('delivery.orderCompleted'), color: colors.primary, bg: `${colors.primary}20` },
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

// ============ Cargo Items List Component ============
/**
 * 在詳情頁呈現「完整貨品清單」。
 * 行為：
 * 1. 若有 cargoItems：展開每個物品（圖、名、數量、單重、總重），並於頂部顯示來源倉庫
 * 2. 若沒有 cargoItems（舊單）：fallback 顯示 cargoDescription 字串 + 總重量
 * 3. 全空：顯示「尚未填寫貨品」提示
 */
function CargoItemsList({ order }: { order: DeliveryOrder }) {
  const { t } = useTranslation();
  const items = useInventoryStore((s) => s.items) ?? [];
  const warehouses = useInventoryStore((s) => s.warehouses) ?? [];
  const loadItems = useInventoryStore((s) => s.loadItems);
  const loadWarehouses = useInventoryStore((s) => s.loadWarehouses);

  useEffect(() => {
    if (items.length === 0 && typeof loadItems === 'function') {
      try {
        void loadItems();
      } catch (err) {
        console.warn('[CargoItemsList] loadItems failed', err);
      }
    }
    if (warehouses.length === 0 && typeof loadWarehouses === 'function') {
      try {
        void loadWarehouses();
      } catch (err) {
        console.warn('[CargoItemsList] loadWarehouses failed', err);
      }
    }
  }, [items.length, warehouses.length, loadItems, loadWarehouses]);

  // 防禦：order.cargoItems 可能是 undefined / null / 非陣列
  const rawCargoItems = (order as any).cargoItems;
  const cargoItems: DeliveryCargoItem[] = Array.isArray(rawCargoItems) ? rawCargoItems : [];

  // 取得每個物品的圖片 URL：優先使用建立時快取的 imageUrl，其次即時查 inventoryStore
  const resolveImageUrl = (cargo: DeliveryCargoItem): string | undefined => {
    if (cargo?.imageUrl) return cargo.imageUrl;
    const found = items.find((it) => it.id === cargo?.itemId);
    return found?.imageUrl;
  };

  // 取得來源倉庫圖片：優先 order 上的 imageUrl，其次即時查 inventoryStore.warehouses
  const resolveWarehouseImage = (): string | undefined => {
    const warehouseId = (order as any).warehouseId;
    const directUrl = (order as any).warehouseImageUrl;
    if (directUrl) return directUrl;
    if (warehouseId) {
      const found = warehouses.find((w) => w.id === warehouseId);
      return found?.imageUrl;
    }
    // 退而求其次：以名稱比對（舊單可能只有 warehouseName）
    if (order.warehouseName) {
      const matched = warehouses.find((w) => w.name === order.warehouseName);
      return matched?.imageUrl;
    }
    return undefined;
  };
  const warehouseImageUrl = resolveWarehouseImage();

  // ====== Fallback：舊單沒有 cargoItems 時顯示字串 ======
  if (cargoItems.length === 0) {
    const desc = (order.cargoDescription ?? '').toString().trim();
    const weight = typeof order.cargoWeight === 'number' ? order.cargoWeight : Number(order.cargoWeight) || 0;
    const hasDescription = desc.length > 0;
    const hasWeight = weight > 0;

    if (!hasDescription && !hasWeight) {
      // 兩者都沒有資料：顯示提示文字
      return (
        <Card style={styles.infoCard}>
          <Text style={styles.cargoSummarySubLabel}>尚未填寫貨品</Text>
        </Card>
      );
    }

    return (
      <Card style={styles.infoCard}>
        {hasDescription && (
          <InfoRow
            icon={<Package size={16} color={colors.textSecondary} />}
            label={t('delivery.description')}
            value={desc}
          />
        )}
        {hasDescription && hasWeight && <View style={styles.divider} />}
        {hasWeight && (
          <InfoRow
            icon={<Scale size={16} color={colors.textSecondary} />}
            label={t('delivery.weight')}
            value={`${weight} ${t('dashboard.kg')}`}
          />
        )}
      </Card>
    );
  }

  // ====== 主流程：有 cargoItems ======
  // 計算總計（用 reduce 安全版，任何欄位缺漏都不會 NaN）
  const safeNumber = (v: unknown): number => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);
  const totalWeight =
    cargoItems.reduce(
      (sum, c) => sum + safeNumber(c.totalWeight || safeNumber(c.quantity) * safeNumber(c.unitWeight)),
      0,
    ) || safeNumber(order.cargoWeight);
  const totalItems = cargoItems.reduce((sum, c) => sum + safeNumber(c.quantity), 0);

  return (
    <Card style={styles.infoCard}>
      {/* 來源倉庫（如果有） */}
      {order.warehouseName && (
        <View style={styles.cargoWarehouseRow}>
          {warehouseImageUrl ? (
            <Image source={{ uri: warehouseImageUrl }} style={styles.cargoWarehouseImage} resizeMode="cover" />
          ) : (
            <View style={[styles.cargoWarehouseImage, styles.cargoWarehouseImageFallback]}>
              <WarehouseIcon size={20} color={colors.textTertiary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>來源倉庫</Text>
            <Text style={styles.cargoWarehouseName}>{order.warehouseName}</Text>
          </View>
        </View>
      )}

      {order.warehouseName && <View style={styles.divider} />}

      {/* 物品清單 */}
      {cargoItems.map((cargo, idx) => {
        const img = resolveImageUrl(cargo);
        const itemTotalWeight = safeNumber(cargo.totalWeight) || safeNumber(cargo.quantity) * safeNumber(cargo.unitWeight);
        return (
          <View key={`${cargo.itemId || 'item'}-${idx}`}>
            <View style={styles.cargoItemRow}>
              <View style={styles.cargoItemImageWrapper}>
                {img ? (
                  <Image source={{ uri: img }} style={styles.cargoItemImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.cargoItemImage, styles.cargoItemImageFallback]}>
                    <Package size={20} color={colors.textTertiary} />
                  </View>
                )}
              </View>
              <View style={styles.cargoItemInfo}>
                <Text style={styles.cargoItemName} numberOfLines={2}>
                  {cargo.itemName}
                </Text>
                <View style={styles.cargoItemMetaRow}>
                  <View style={styles.cargoItemMeta}>
                    <Hash size={12} color={colors.textSecondary} />
                    <Text style={styles.cargoItemMetaText}>{safeNumber(cargo.quantity)} 件</Text>
                  </View>
                  <View style={styles.cargoItemMeta}>
                    <Scale size={12} color={colors.textSecondary} />
                    <Text style={styles.cargoItemMetaText}>{safeNumber(cargo.unitWeight)} kg/件</Text>
                  </View>
                </View>
              </View>
              <View style={styles.cargoItemTotalWrap}>
                <Text style={styles.cargoItemTotalValue}>{itemTotalWeight.toFixed(2)}</Text>
                <Text style={styles.cargoItemTotalUnit}>kg</Text>
              </View>
            </View>
            {idx < cargoItems.length - 1 && <View style={styles.divider} />}
          </View>
        );
      })}

      <View style={[styles.divider, { marginTop: spacing.sm }]} />

      {/* 總計 */}
      <View style={styles.cargoSummaryRow}>
        <View>
          <Text style={styles.cargoSummaryLabel}>貨品重量</Text>
          <Text style={styles.cargoSummarySubLabel}>{totalItems} 件物品</Text>
        </View>
        <Text style={styles.cargoSummaryValue}>{totalWeight.toFixed(2)} kg</Text>
      </View>
    </Card>
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
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Animated.View entering={FadeInDown.springify()} style={styles.modalContent}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('delivery.selectDriverTitle')}</Text>
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
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Animated.View entering={FadeInDown.springify()} style={styles.modalContent}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('delivery.electronicSignature')}</Text>
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
  photos: { id: string; uri: string; takenAt: string; locationAddress?: string }[];
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
            <Image source={{ uri: getPhotoUri(photo.uri) }} style={styles.photoImage} resizeMode="contain" />
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
          {/* 取貨相片顯示位置資訊 */}
          {isPickup && photo.locationAddress && (
            <View style={styles.photoLocationInfo}>
              <MapPin size={12} color={colors.accent} />
              <Text style={styles.photoLocationText} numberOfLines={1}>{photo.locationAddress}</Text>
            </View>
          )}
        </Pressable>
      ))}
      {/* 取貨相片不顯示新增按鈕（改為在 stepCard 中顯示即時拍照按鈕） */}
      {!isPickup && photos.length < maxPhotos && !disabled && (
        <Pressable style={styles.photoItem} onPress={onAddPhoto}>
          <View style={[styles.photoImage, styles.addPhotoPlaceholder]}>
            <Camera size={24} color={colors.textTertiary} />
          </View>
          <Text style={styles.photoMeta}>{t('delivery.addDeliveryPhoto')}</Text>
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
  transportCompleted = false,
}: {
  currentStep: StepKey;
  deliveryStep: StepKey;
  onStepPress: (step: StepKey) => void;
  stepConfig: Record<StepKey, { label: string; color: string; bg: string }>;
  order: DeliveryOrder;
  transportCompleted?: boolean;
}) {
  const { t } = useTranslation();
  const isExpired = order.status === 'expired';
  const isCompleted = order.isCompleted;

  // 【任務2】in_transit tab 標籤：已完成運輸時顯示「已運輸」
  const inTransitLabel = transportCompleted
    ? t('delivery.stepTransported')
    : t('delivery.stepInTransit');
  const inTransitColor = colors.primary;
  const inTransitBg = `${colors.primary}20`;

  // 動態調整 stepConfig
  const dynamicStepConfig = {
    ...stepConfig,
    in_transit: {
      label: inTransitLabel,
      color: inTransitColor,
      bg: inTransitBg,
    },
  };

  // 使用 currentStep 來判斷高亮（跟隨司機操作）
  const effectiveStep = isExpired ? 'expired' : currentStep;

  // 已完成的配送單顯示所有步驟標籤
  const displaySteps = isCompleted
    ? STEP_ORDER
    : isExpired
      ? ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'expired'] as StepKey[]
      : STEP_ORDER.slice(0, -1); // 非已完成時不顯示 completed 標籤

  const getStepStatus = (step: StepKey): 'completed' | 'current' | 'locked' | 'pendingLocked' | 'completedLocked' => {
    // 待處理步驟：已分配後顯示為綠色但不可按，未分配則鎖定但保留 warning 顏色
    if (step === 'pending') {
      if (currentStep !== 'pending') {
        // 已離開待處理步驟，顯示為綠色（已完成）但不可按
        return 'completedLocked';
      }
      return 'pendingLocked';
    }

    // 【任務5】已取貨步驟：如果已有取貨相片，即使當前不在此步驟也要顯示為已完成（綠色）
    if (step === 'picked_up') {
      // 有取貨相片時，無論當前在哪個步驟，都顯示為已完成
      const hasPickupPhotos = order.pickupPhotos && order.pickupPhotos.length > 0;
      const isCurrentlyOnThisStep = currentStep === 'picked_up';

      if (hasPickupPhotos) {
        // 有相片：顯示綠色完成狀態
        return isCurrentlyOnThisStep ? 'current' : 'completed';
      }
      // 沒有相片：維持原有邏輯
      const stepIdx = getStepIndex(step);
      const currentIdx = getStepIndex(effectiveStep);
      if (stepIdx < currentIdx) return 'completed';
      if (stepIdx === currentIdx) return 'current';
      return 'locked';
    }

    // 【任務5】已送達步驟：如果已有送達相片，即使當前不在此步驟也要顯示為已完成（綠色）
    if (step === 'delivered') {
      // 有送達相片時，無論當前在哪個步驟，都顯示為已完成
      const hasDeliveryPhotos = order.photos && order.photos.length > 0;
      const isCurrentlyOnThisStep = currentStep === 'delivered';

      if (hasDeliveryPhotos) {
        // 有相片：顯示綠色完成狀態
        return isCurrentlyOnThisStep ? 'current' : 'completed';
      }
      // 沒有相片：維持原有邏輯
      const stepIdx = getStepIndex(step);
      const currentIdx = getStepIndex(effectiveStep);
      if (stepIdx < currentIdx) return 'completed';
      if (stepIdx === currentIdx) return 'current';
      return 'locked';
    }

    // 【新】運輸中步驟：如果已有取貨相片，應該可以從已取貨 tab 點擊進入
    if (step === 'in_transit') {
      // 有取貨相片時，已取貨 tab 可以點擊進入運輸中
      const hasPickupPhotos = order.pickupPhotos && order.pickupPhotos.length > 0;
      const isCurrentlyOnThisStep = currentStep === 'in_transit';

      if (hasPickupPhotos) {
        // 有相片：顯示為可點擊的 completed 狀態（綠色勾勾），或者當前狀態
        return isCurrentlyOnThisStep ? 'current' : 'completed';
      }
      // 沒有相片：維持原有邏輯
      const stepIdx = getStepIndex(step);
      const currentIdx = getStepIndex(effectiveStep);
      if (stepIdx < currentIdx) return 'completed';
      if (stepIdx === currentIdx) return 'current';
      return 'locked';
    }

    // 已完成的配送單：所有步驟都是 completed，但當前查看的 tab 顯示為 current
    if (isCompleted) {
      if (step === currentStep) return 'current';
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
          const cfg = dynamicStepConfig[step];
          // 待處理步驟永遠不可按
          const isPendingLocked = status === 'pendingLocked';
          const isCompletedLocked = status === 'completedLocked';
          const isClickable = !isPendingLocked && !isCompletedLocked && (isCompleted || status === 'completed' || status === 'current');
          // 只有 locked（非特殊狀態）才套用半透明樣式
          const isSemiTransparent = status === 'locked';

          return (
            <Pressable
              key={step}
              style={[
                styles.stepTabItem,
                status === 'current' && styles.stepTabItemCurrent,
                status === 'completed' && styles.stepTabItemCompleted,
                isSemiTransparent && styles.stepTabItemLocked,
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
                  status === 'pendingLocked' && { backgroundColor: cfg.color }, // 保留待處理顏色
                  status === 'completedLocked' && { backgroundColor: colors.success }, // 綠色
                ]}
              >
                {status === 'completed' || status === 'completedLocked' ? (
                  <CheckCircle size={14} color="#fff" />
                ) : (
                  <Text style={[
                    styles.stepTabNumberText,
                    status === 'locked' && { color: colors.textTertiary },
                    status === 'pendingLocked' && { color: '#fff' }, // 白色數字在 warning 背景上
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
                  status === 'pendingLocked' && { color: cfg.color }, // 保留待處理顏色
                  status === 'completedLocked' && { color: colors.textTertiary }, // 灰字
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
    updateOrderDetails,
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
  const [editFormVisible, setEditFormVisible] = useState(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxUri, setLightboxUri] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<{ uri: string }[]>([]);
  const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPickupPhotoMode, setIsPickupPhotoMode] = useState(false);
  const [photoUriCache, setPhotoUriCache] = useState<Record<string, string>>({});

  // 【任務2】運輸中動畫狀態
  const [transportStarted, setTransportStarted] = useState(false);
  const [transportCompleted, setTransportCompleted] = useState(false); // 【新】已完成運輸但尚未切換到已送達
  const [transportDotCount, setTransportDotCount] = useState(0);
  const transportDotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animation value for step content fade in
  const stepContentFade = useRef(new RNAnimated.Value(1)).current;

  // 【重要】actionHandledRef：用於防止 action=pickup 設置的 picked_up 狀態被後續 useEffect 覆蓋
  const actionHandledRef = useRef(false);
  // 【重要】isProcessingRef：用於防止在處理相片/狀態變更時重置 currentStep
  const isProcessingRef = useRef(false);

  // 重置 actionHandledRef 當組件重新 mount（id 改變）時
  useEffect(() => {
    actionHandledRef.current = false;
  }, [id]);

  // 【任務2】同步運輸狀態：如果已有 inTransitAt，則設置 transportStarted 為 true
  useEffect(() => {
    // 已完成配送單：停止所有動畫，並設置 transportCompleted 為 true
    if (order?.isCompleted) {
      setTransportStarted(false);
      setTransportCompleted(true);
      if (transportDotIntervalRef.current) {
        clearInterval(transportDotIntervalRef.current);
        transportDotIntervalRef.current = null;
      }
      return;
    }

    if (order?.inTransitAt && !transportCompleted) {
      setTransportStarted(true);
      // 啟動循環動畫
      if (!transportDotIntervalRef.current) {
        transportDotIntervalRef.current = setInterval(() => {
          setTransportDotCount((prev) => (prev + 1) % 4);
        }, 500);
      }
    } else if (!order?.inTransitAt) {
      setTransportStarted(false);
      // 停止循環動畫
      if (transportDotIntervalRef.current) {
        clearInterval(transportDotIntervalRef.current);
        transportDotIntervalRef.current = null;
      }
    } else {
      // 已完成運輸，停止循環動畫
      if (transportDotIntervalRef.current) {
        clearInterval(transportDotIntervalRef.current);
        transportDotIntervalRef.current = null;
      }
    }
    return () => {
      if (transportDotIntervalRef.current) {
        clearInterval(transportDotIntervalRef.current);
        transportDotIntervalRef.current = null;
      }
    };
  }, [order?.inTransitAt, transportCompleted, order?.isCompleted]);

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
      const isExpired = found.status === 'expired';

      // 【重要】如果正在處理相片或狀態變更，不重置 currentStep
      if (isProcessingRef.current) {
        console.log('[DeliveryDetail] Skipping currentStep reset due to processing');
        return;
      }

      // 【重要】處理 URL action=pickup：如果司機從列表點擊「已取貨」進入，
      // 直接切換到 picked_up tab，避免被下面的 currentStep 重置覆蓋
      if (action === 'pickup' && !actionHandledRef.current) {
        actionHandledRef.current = true;
        const effectiveStep = isExpired ? 'expired' : STATUS_TO_STEP[found.status];
        console.log('[DeliveryDetail] action=pickup: order.status =', found.status, 'effectiveStep =', effectiveStep);
        if (effectiveStep === 'assigned') {
          setCurrentStep('picked_up');
          return; // 直接返回，不再執行下面的 currentStep 重置
        }
      }

      // 處理 URL action=transit：如果司機從列表點擊「標記已送達」進入，
      // 直接切換到 in_transit tab
      if (action === 'transit' && !actionHandledRef.current) {
        actionHandledRef.current = true;
        const effectiveStep = isExpired ? 'expired' : STATUS_TO_STEP[found.status];
        console.log('[DeliveryDetail] action=transit: order.status =', found.status, 'effectiveStep =', effectiveStep);
        if (effectiveStep === 'in_transit') {
          setCurrentStep('in_transit');
          return; // 直接返回，不再執行下面的 currentStep 重置
        }
      }

      // 【重要】如果 URL action 是 'pickup' 或 'transit' 且已經處理過，不要覆蓋 currentStep
      // 這是為了防止 deliveries 更新時覆蓋掉 action 設置的 tab 狀態
      if (actionHandledRef.current) {
        console.log('[DeliveryDetail] Skipping currentStep reset due to action already handled');
        return;
      }

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

  // 取貨相片：即時拍照並獲取位置資訊
  const handleTakePickupPhoto = async () => {
    if (Platform.OS === 'web') {
      // Web 平台：使用 HTML 檔案輸入開啟相機
      await handleWebPickupPhoto();
      return;
    }

    // 請求相機權限
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    if (cameraPermission.status !== 'granted') {
      Alert.alert(t('common.permissionDenied'), t('delivery.cameraPermissionRequired'));
      return;
    }

    // 請求位置權限
    const locationPermission = await Location.requestForegroundPermissionsAsync();
    if (locationPermission.status !== 'granted') {
      Alert.alert(t('common.permissionDenied'), t('delivery.locationPermissionRequired'));
      return;
    }

    // 拍攝相片
    const photoResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    await processPickupPhoto(photoResult);
  };

  // Web 平台專用：使用 input[type=file] capture 觸發相機
  const handleWebPickupPhoto = () => {
    return new Promise<void>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      // capture 屬性在手機瀏覽器會開啟相機
      input.capture = 'environment';
      input.style.display = 'none';

      input.onchange = async (event: any) => {
        const file = event.target.files?.[0];
        document.body.removeChild(input);

        if (!file) {
          resolve();
          return;
        }

        // 將 File 轉成 data URI
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUri = reader.result as string;
          const photoResult = {
            canceled: false,
            assets: [{ uri: dataUri }],
          };
          await processPickupPhoto(photoResult as any);
          resolve();
        };
        reader.onerror = () => {
          console.error('[Web] Failed to read file');
          resolve();
        };
        reader.readAsDataURL(file);
      };

      input.oncancel = () => {
        if (input.parentNode) document.body.removeChild(input);
        resolve();
      };

      document.body.appendChild(input);
      input.click();
    });
  };

  // 處理拍照後的相片邏輯（提取出來共用）
  const processPickupPhoto = async (photoResult: any) => {
    if (photoResult.canceled || !photoResult.assets || photoResult.assets.length === 0) {
      return; // 用戶取消拍攝
    }

    // 【重要】設置標記，防止 useEffect 重置 currentStep
    isProcessingRef.current = true;

    const photo = photoResult.assets[0];

    // 嘗試獲取位置資訊
    let locationInfo: { address?: string; latitude?: number; longitude?: number } = {};
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      locationInfo = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      // 嘗試反向地理編碼獲取地址
      try {
        const addresses = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        if (addresses.length > 0) {
          const addr = addresses[0];
          // 構建地址字串，過濾空值
          const addressParts: string[] = [];
          if (addr.streetNumber) addressParts.push(addr.streetNumber);
          if (addr.street) addressParts.push(addr.street);
          if (addr.district) addressParts.push(addr.district);
          if (addr.city) addressParts.push(addr.city);
          if (addr.region) addressParts.push(addr.region);
          locationInfo.address = addressParts.join('') || addr.formattedAddress || '未知地址';
        }
      } catch (geocodeError) {
        console.log('[DeliveryDetail] Reverse geocode failed:', geocodeError);
      }
    } catch (locationError) {
      console.log('[DeliveryDetail] Get location failed:', locationError);
      if (Platform.OS !== 'web') {
        Alert.alert(t('common.warning'), t('delivery.locationGetFailed'));
      }
    }

    // 直接上傳相片並帶入位置資訊
    setIsSyncing(true);
    try {
      await addPhoto(order.id, photo.uri, true, locationInfo);

      setIsSyncing(false);

      // 【修正 1】拍照取貨後，確保停留在「已取貨」tab
      // 檢查當前步驟，如果仍在 assigned 或 picked_up，確保切換到 picked_up
      // 這樣可以防止 useEffect 根據 store 狀態重置 currentStep
      if (currentStep === 'assigned') {
        setCurrentStep('picked_up');
      }

      // store 已經更新完，畫面會自動 re-render 顯示新照片
      // 不使用 router.replace()，避免頁面跳轉
    } catch (error) {
      setIsSyncing(false);
      Alert.alert(t('common.error'), t('delivery.photoUploadFailed'));
    } finally {
      // 【重要】處理完成後，重置標記
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1000); // 延遲 1 秒後重置，確保 store 更新完成
    }
  };

  // 【任務3】處理送達相片（與取貨類似，但不帶位置資訊）
  const processDeliveryPhoto = async (photoResult: any) => {
    if (photoResult.canceled || !photoResult.assets || photoResult.assets.length === 0) {
      return; // 用戶取消拍攝
    }

    const photo = photoResult.assets[0];

    // 送達相片不帶位置資訊
    setIsSyncing(true);
    try {
      await addPhoto(order.id, photo.uri, false, {});
      setIsSyncing(false);
      // store 已經更新完，畫面會自動 re-render 顯示新照片
    } catch (error) {
      setIsSyncing(false);
      Alert.alert(t('common.error'), t('delivery.photoUploadFailed'));
    }
  };

  // 【任務3】處理即時拍照送達
  const handleTakeDeliveryPhoto = async () => {
    if (Platform.OS === 'web') {
      // Web 平台：使用 HTML 檔案輸入開啟相機
      return new Promise<void>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.style.display = 'none';

        input.onchange = async (event: any) => {
          const file = event.target.files?.[0];
          document.body.removeChild(input);

          if (!file) {
            resolve();
            return;
          }

          const reader = new FileReader();
          reader.onload = async () => {
            const dataUri = reader.result as string;
            const photoResult = {
              canceled: false,
              assets: [{ uri: dataUri }],
            };
            await processDeliveryPhoto(photoResult as any);
            resolve();
          };
          reader.onerror = () => {
            console.error('[Web] Failed to read file');
            resolve();
          };
          reader.readAsDataURL(file);
        };

        input.oncancel = () => {
          if (input.parentNode) document.body.removeChild(input);
          resolve();
        };

        document.body.appendChild(input);
        input.click();
      });
    }

    // 請求相機權限
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    if (cameraPermission.status !== 'granted') {
      Alert.alert(t('common.permissionDenied'), t('delivery.cameraPermissionRequired'));
      return;
    }

    // 拍攝相片
    const photoResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    await processDeliveryPhoto(photoResult);
  };

  const isExpired = order.status === 'expired';
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

  // 【任務2】處理開始運輸
  const handleStartTransport = async () => {
    // 【重要】設置標記，防止 useEffect 重置 currentStep
    isProcessingRef.current = true;

    // 記錄取貨時間（如果尚未記錄）
    await recordPickupTime(order.id);
    // 【重要】記錄運輸開始時間，同時觸發 transportStarted 變為 true
    await recordInTransitTime(order.id);
    // 更新狀態為 in_transit
    await updateStatus(order.id, 'in_transit');

    // 設置本地狀態：已開始運輸
    setTransportStarted(true);
    // 啟動循環動畫
    transportDotIntervalRef.current = setInterval(() => {
      setTransportDotCount((prev) => (prev + 1) % 4);
    }, 500);

    // 【重要】處理完成後，重置標記
    setTimeout(() => {
      isProcessingRef.current = false;
    }, 1000);
  };

  // 【任務2】處理完成運輸
  const handleCompleteTransportAttempt = async () => {
    console.log('[DeliveryDetail] handleCompleteTransportAttempt called');

    // 【重要】設置標記，防止 useEffect 重置 currentStep
    isProcessingRef.current = true;

    try {
      // 停止動畫
      if (transportDotIntervalRef.current) {
        clearInterval(transportDotIntervalRef.current);
        transportDotIntervalRef.current = null;
      }

      // 設置本地狀態：已完成運輸但還在 in_transit tab
      setTransportCompleted(true);
      setTransportStarted(false); // 停止循環動畫

      // 記錄 delivered 時間（這是完成運輸的時間）
      await recordDeliveredTime(order.id);
      console.log('[DeliveryDetail] deliveredAt recorded');
    } catch (err) {
      console.error('[DeliveryDetail] handleCompleteTransportAttempt error:', err);
    } finally {
      // 處理完成後，重置標記
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1000);
    }

    // 不直接調用 updateStatus(delivered)，因為這會切換 tab
    // 用戶需要點擊「下一步 →」才會進入 delivered tab
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
      // 切換到運輸中 tab，顯示「開始運輸」按鈕
      setCurrentStep(nextStep);
      return;
    }

    // 【任務2】in_transit -> delivered：只有在已完成運輸的情況下才能切換
    if (currentStep === 'in_transit') {
      if (transportCompleted) {
        // 停止動畫
        if (transportDotIntervalRef.current) {
          clearInterval(transportDotIntervalRef.current);
          transportDotIntervalRef.current = null;
        }
        // 切換到已送達 tab
        await updateStatus(order.id, 'delivered');
        setCurrentStep(nextStep);
        return;
      }
      return; // 未完成運輸，不能切換
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
      // 添加動畫效果：淡出再淡入
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
    // Web 平台或不允許取貨拍照時，使用圖片庫選擇
    if (Platform.OS === 'web' || !isPickupPhotoMode) {
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
    }
  };

  const handleConfirmPhotos = async () => {
    const photosToUpload = [...pendingPhotos];
    const orderId = order.id;

    setIsSyncing(true);
    setPendingPhotos([]);
    setPhotoPreviewVisible(false);

    for (const photo of photosToUpload) {
      // 送達相片不帶位置資訊
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

  // ============ Edit Order Details ============
  const handleOpenEditModal = () => {
    setEditFormVisible(true);
  };

  const handleCloseEditModal = () => {
    setEditFormVisible(false);
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
              <CargoItemsList order={order} />
              {order.notes && (
                <>
                  <View style={[styles.divider, { marginHorizontal: spacing.lg, marginTop: spacing.md }]} />
                  <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
                    <InfoRow icon={<StickyNote size={16} color={colors.textSecondary} />} label={t('delivery.notes')} value={order.notes} />
                  </View>
                </>
              )}
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
              {isAdmin && order.assignedDriverName && (
                <View style={styles.stepAction}>
                  <Button
                    title={t('delivery.editOrderDetails')}
                    onPress={handleOpenEditModal}
                    variant="secondary"
                    icon={<Pencil size={16} color={colors.primary} />}
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
              <CargoItemsList order={order} />
              {order.notes && (
                <>
                  <View style={[styles.divider, { marginHorizontal: spacing.lg, marginTop: spacing.md }]} />
                  <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
                    <InfoRow icon={<StickyNote size={16} color={colors.textSecondary} />} label={t('delivery.notes')} value={order.notes} />
                  </View>
                </>
              )}
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
                {order.pickedUpAt ? `${t('delivery.pickupTimeRecorded')}: ${new Date(order.pickedUpAt).toLocaleString()}` : t('delivery.takePickupPhotoDescription')}
              </Text>
              {/* 即時拍照按鈕 */}
              {!order.isCompleted && (
                <Pressable 
                  style={({ pressed }) => [
                    styles.takePhotoButton,
                    pressed && styles.takePhotoButtonPressed
                  ]} 
                  onPress={handleTakePickupPhoto}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Camera size={20} color="#fff" />
                  <Text style={styles.takePhotoButtonText}>{t('delivery.takePickupPhoto')}</Text>
                </Pressable>
              )}
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
            {/* 【任務2】已完成運輸橫幅 */}
            {transportCompleted && (
              <Card style={[styles.stepCard, styles.transportCompletedBanner]}>
                <View style={styles.transportCompletedContainer}>
                  <CheckCircle size={48} color={colors.success} />
                  <View>
                    <Text style={styles.transportCompletedText}>
                      {t('delivery.transportCompleted')}
                    </Text>
                    {order.deliveredAt && (
                      <Text style={styles.transportCompletedTime}>
                        {new Date(order.deliveredAt).toLocaleString()}
                      </Text>
                    )}
                  </View>
                </View>
                <Text style={styles.transportCompletedHint}>
                  {t('delivery.clickNextToContinue')}
                </Text>
              </Card>
            )}

            <Card style={styles.stepCard}>
              {/* 【任務2】根據狀態顯示不同標題 */}
              <Text style={styles.stepTitle}>
                {transportCompleted ? t('delivery.transportCompleted') : t('delivery.stepInTransit')}
              </Text>
              <Text style={styles.stepDescription}>
                {order.inTransitAt ? `${t('delivery.inTransitTimeRecorded')}: ${new Date(order.inTransitAt).toLocaleString()}` : t('delivery.stepInTransit')}
              </Text>

              {/* 【任務2】運輸中狀態顯示 */}
              {transportCompleted ? (
                /* 已完成運輸：保持空白（橫幅已在外層顯示）*/
                null
              ) : transportStarted ? (
                <>
                  {/* 循環動畫：點點... */}
                  <View style={styles.transportAnimationContainer}>
                    <Text style={styles.transportAnimationText}>
                      {t('delivery.transportInProgress')}
                      {Array(transportDotCount + 1).fill('.').join('')}
                    </Text>
                  </View>
                  {/* 完成運輸按鈕 */}
                  {!order.isCompleted && !isAdmin && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.transportActionButton,
                        pressed && styles.transportActionButtonPressed,
                      ]}
                      onPress={handleCompleteTransportAttempt}
                    >
                      <CheckCircle size={20} color="#fff" />
                      <Text style={styles.transportActionButtonText}>
                        {t('delivery.transportCompleted')}
                      </Text>
                    </Pressable>
                  )}
                </>
              ) : (
                /* 開始運輸按鈕 */
                !order.isCompleted && !isAdmin && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.transportActionButton,
                      pressed && styles.transportActionButtonPressed,
                    ]}
                    onPress={handleStartTransport}
                  >
                    <Truck size={20} color="#fff" />
                    <Text style={styles.transportActionButtonText}>
                      {t('delivery.startTransport')}
                    </Text>
                  </Pressable>
                )
              )}
            </Card>

            {/* 【任務2】開始運輸後顯示：開始運輸時間、貨品資料
                注：完成運輸後也繼續顯示這些資料，因為 inTransitAt 仍有值 */}
            {(transportStarted || transportCompleted) && (
              <>
                {/* 開始運輸時間 */}
                <View style={styles.stepInfoSection}>
                  <Text style={styles.sectionTitle}>{t('delivery.transportStartedTime')}</Text>
                  <Card style={styles.infoCard}>
                    <View style={styles.infoRow}>
                      <Truck size={16} color={colors.accent} />
                      <Text style={styles.infoRowText}>
                        {order.inTransitAt ? new Date(order.inTransitAt).toLocaleString() : t('delivery.transportStarted')}
                      </Text>
                    </View>
                  </Card>
                </View>

                {/* 完成運輸時間 */}
                {transportCompleted && order.deliveredAt && (
                  <View style={styles.stepInfoSection}>
                    <Text style={styles.sectionTitle}>{t('delivery.transportCompletedTime')}</Text>
                    <Card style={styles.infoCard}>
                      <View style={styles.infoRow}>
                        <CheckCircle size={16} color={colors.success} />
                        <Text style={styles.infoRowText}>
                          {new Date(order.deliveredAt).toLocaleString()}
                        </Text>
                      </View>
                    </Card>
                  </View>
                )}

                {/* 貨品資料 */}
                <View style={styles.stepInfoSection}>
                  <Text style={styles.sectionTitle}>{t('delivery.cargoInfo')}</Text>
                  <Card style={styles.infoCard}>
                    <InfoRow icon={<Package size={16} color={colors.textSecondary} />} label={t('delivery.cargo')} value={order.cargoDescription} />
                    <View style={styles.divider} />
                    <InfoRow icon={<Scale size={16} color={colors.textSecondary} />} label={t('delivery.weight')} value={`${order.cargoWeight} ${t('dashboard.kg')}`} />
                    {order.cargoItems && order.cargoItems.length > 0 && (
                      <>
                        <View style={styles.divider} />
                        <InfoRow icon={<Hash size={16} color={colors.textSecondary} />} label={t('delivery.cargoItems')} value={`${order.cargoItems.length} ${t('delivery.items')}`} />
                      </>
                    )}
                  </Card>
                </View>
              </>
            )}

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

              {/* 【任務3】即時拍照按鈕 - 僅在未完成訂單時顯示 */}
              {!order.isCompleted && (
                <Pressable
                  style={({ pressed }) => [
                    styles.takePhotoButton,
                    pressed && styles.takePhotoButtonPressed
                  ]}
                  onPress={handleTakeDeliveryPhoto}
                >
                  <Camera size={20} color="#fff" />
                  <Text style={styles.takePhotoButtonText}>{t('delivery.takeDeliveryPhoto')}</Text>
                </Pressable>
              )}

              {/* 【任務3】提示：完成訂單後仍可上載相片 */}
              {order.isCompleted && (
                <Text style={styles.deliveredPhotoHint}>
                  {t('delivery.addDeliveryPhotoAfterComplete')}
                </Text>
              )}
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
                disabled={false} // 【任務3】始終可以上傳/刪除相片
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

            {/* 【任務4】已簽收 tab：顯示前面所有步驟的詳細資訊 */}
            {/* 客戶資訊 */}
            <View style={styles.stepInfoSection}>
              <Text style={styles.sectionTitle}>{t('delivery.customer')}</Text>
              <Card style={styles.infoCard}>
                <InfoRow icon={<User size={16} color={colors.textSecondary} />} label={t('delivery.name')} value={order.customerName} />
                <View style={styles.divider} />
                <InfoRow icon={<Phone size={16} color={colors.textSecondary} />} label={t('delivery.phone')} value={order.customerPhone} />
              </Card>
            </View>

            {/* 路線資訊 */}
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

            {/* 貨品資訊 */}
            <View style={styles.stepInfoSection}>
              <Text style={styles.sectionTitle}>{t('delivery.cargo')}</Text>
              <CargoItemsList order={order} />
            </View>

            {/* 司機資訊 */}
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

            {/* 取貨相片 */}
            {order.pickupPhotos && order.pickupPhotos.length > 0 && (
              <View style={styles.stepInfoSection}>
                <Text style={styles.sectionTitle}>{t('delivery.pickupPhotos')}</Text>
                <PhotoGallery
                  photos={order.pickupPhotos}
                  onAddPhoto={() => {}}
                  onDeletePhoto={() => {}}
                  onViewPhoto={(uri) => {
                    setLightboxUri(uri);
                    setLightboxVisible(true);
                  }}
                  isPickup={true}
                  disabled={true}
                />
              </View>
            )}

            {/* 送達相片 */}
            {order.photos && order.photos.length > 0 && (
              <View style={styles.stepInfoSection}>
                <Text style={styles.sectionTitle}>{t('delivery.deliveryPhotos')}</Text>
                <PhotoGallery
                  photos={order.photos}
                  onAddPhoto={() => {}}
                  onDeletePhoto={() => {}}
                  onViewPhoto={(uri) => {
                    setLightboxUri(uri);
                    setLightboxVisible(true);
                  }}
                  isPickup={false}
                  disabled={true}
                />
              </View>
            )}

            {/* 簽名資訊 */}
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
  const canGoPrev = currentIdx > 1 && !order.isCompleted;

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

    // 【任務2】in_transit:
    // - 未開始運輸：隱藏下一步按鈕，顯示「開始運輸」按鈕
    // - 已開始運輸但未完成：隱藏下一步按鈕，顯示「完成運輸」按鈕
    // - 已完成運輸：顯示下一步按鈕，點擊後切換到 delivered
    if (currentStep === 'in_transit') {
      if (transportCompleted) {
        return true; // 已完成運輸，顯示下一步按鈕
      }
      return false; // 未完成運輸，隱藏下一步按鈕
    }

    // delivered -> signed: 需要先上傳送達相片（訂單完成後也可上傳相片）
    if (currentStep === 'delivered') return true;

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
        transportCompleted={transportCompleted}
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
            title={`${t('delivery.nextStep')} `}
            onPress={handleNextStep}
            icon={<ChevronRight size={16} color="#fff" />}
            iconPosition="right"
            style={{ flex: 1 }}
          />
        </View>
      )}

      {/* 已簽收且未完成時顯示「完成貨單」按鈕在最底部 */}
      {currentStep === 'signed' && order.signatureData && !isAdmin && !order.isCompleted && (
        <View style={[styles.bottomActions, { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }]}>
          <Button
            title={`${t('delivery.completeOrder')} `}
            onPress={handleCompleteOrder}
            icon={<CheckCircle size={16} color="#fff" />}
            iconPosition="right"
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

      {/* Edit Order Form - Full screen with same UI as AddDeliveryForm */}
      <DeliveryEditForm
        visible={editFormVisible}
        onClose={handleCloseEditModal}
        order={order}
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

      <Modal visible={photoPreviewVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View entering={FadeInDown.springify()} style={styles.modalContent}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('delivery.photoPreview')}</Text>
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
    opacity: 0.6,
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
  // 即時拍照按鈕樣式
  takePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  takePhotoButtonPressed: {
    backgroundColor: colors.primaryDark,
    opacity: 0.9,
  },
  takePhotoButtonText: {
    color: '#fff',
    fontSize: typography.fontSize.base,
    fontWeight: '700',
  },
  // 【任務3】已送達提示樣式
  deliveredPhotoHint: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  // 【任務2】開始運輸按鈕樣式
  // 【任務2】統一運輸按鈕樣式
  transportActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  transportActionButtonPressed: {
    backgroundColor: colors.accentDark,
    opacity: 0.9,
  },
  transportActionButtonText: {
    color: '#fff',
    fontSize: typography.fontSize.base,
    fontWeight: '700',
  },
  // 【任務2】完成運輸後顯示容器
  transportCompletedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
  },
  transportCompletedText: {
    fontSize: typography.fontSize.md,
    color: colors.success,
    fontWeight: '700',
  },
  transportCompletedTime: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  transportCompletedBanner: {
    backgroundColor: '#f0fdf4',
    borderColor: colors.success,
    borderWidth: 2,
    marginBottom: spacing.lg,
  },
  transportCompletedHint: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // 【任務2】運輸中循環動畫樣式
  transportAnimationContainer: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  transportAnimationText: {
    fontSize: typography.fontSize.md,
    color: colors.accent,
    fontWeight: '600',
  },
  transportHint: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  // 相片位置資訊樣式
  photoLocationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  photoLocationText: {
    fontSize: typography.fontSize.xs,
    color: colors.accent,
    flex: 1,
  },
  stepInfoSection: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  sectionTitle: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoCard: { padding: spacing.lg },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  infoRowText: { fontSize: typography.fontSize.base, color: colors.textPrimary, fontWeight: typography.fontWeight.medium, flex: 1 },
  infoIcon: { marginTop: 2 },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: typography.fontSize.xs, color: colors.textTertiary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: typography.fontWeight.semibold },
  infoValue: { fontSize: typography.fontSize.base, color: colors.textPrimary, fontWeight: typography.fontWeight.medium, lineHeight: 22 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  // Cargo Items List styles
  cargoWarehouseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  cargoWarehouseIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cargoWarehouseImage: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
  },
  cargoWarehouseImageFallback: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cargoWarehouseName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary,
    marginTop: 2,
  },
  cargoItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  cargoItemImageWrapper: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  cargoItemImage: {
    width: '100%',
    height: '100%',
  },
  cargoItemImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cargoItemInfo: {
    flex: 1,
  },
  cargoItemName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary,
  },
  cargoItemMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: 4,
  },
  cargoItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cargoItemMetaText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  cargoItemTotalWrap: {
    alignItems: 'flex-end',
  },
  cargoItemTotalValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary,
  },
  cargoItemTotalUnit: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
  cargoSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  cargoSummaryLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cargoSummarySubLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cargoSummaryValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
  },
  routeContainer: { gap: spacing.sm },
  routeStop: { flexDirection: 'row', gap: spacing.md },
  routeIconCircle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  routeIconDot: { width: 10, height: 10, borderRadius: 5 },
  routeStopInfo: { flex: 1 },
  routeStopLabel: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  routeStopAddress: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.medium, color: colors.textPrimary, lineHeight: 22 },
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
  photoImage: { width: '100%', height: '100%' },
  photoMeta: { fontSize: typography.fontSize.xs, color: colors.textTertiary, padding: spacing.sm, textAlign: 'center' },
  photoImageWrapper: { width: '100%', aspectRatio: 1, position: 'relative', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
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
    fontSize: typography.fontSize.base,
    fontWeight: '600',
    color: colors.success,
  },
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
