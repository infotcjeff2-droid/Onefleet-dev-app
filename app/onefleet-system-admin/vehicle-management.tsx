import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
  Modal,
  TextInput as RNTextInput,
  Image,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import {
  Plus,
  X,
  Truck,
  Search,
  Edit2,
  Trash2,
  Wifi,
  WifiOff,
  Camera,
  Building2,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useVehicleStore } from '@/store/vehicleStore';
import { useDriverStore } from '@/store/driverStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useGps808Store } from '@/store/gps808Store';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { spacing, typography, borderRadius, layout } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { TextInput } from '@/components/ui/TextInput';
import { Vehicle, BodyType, FuelType, TransmissionType, VehicleStatus } from '@/types';
import { uploadVehicleImage } from '@/utils/supabaseStorage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type VehicleForm = Omit<Vehicle, 'id' | 'createdAt'>;

const BODY_TYPES: BodyType[] = ['sedan', 'suv', 'truck', 'van', 'motorcycle', 'other'];
const FUEL_TYPES: FuelType[] = ['gasoline', 'diesel', 'electric', 'hybrid'];
const TRANSMISSIONS: TransmissionType[] = ['automatic', 'manual'];
const STATUSES: VehicleStatus[] = ['active', 'maintenance', 'inactive'];

function StatusDot({ status }: { status: VehicleStatus }) {
  const colors = useThemeStore((s) => s.colors);
  const colorMap: Record<VehicleStatus, string> = {
    active: '#22C55E',
    maintenance: '#F59E0B',
    inactive: '#EF4444',
  };
  return (
    <View style={[styles.statusDot, { backgroundColor: colorMap[status] }]} />
  );
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function VehicleRow({
  vehicle,
  onEdit,
  onDelete,
}: {
  vehicle: Vehicle;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const { getDriverById } = useDriverStore();
  const { getCompanyById } = useUserManagementStore();

  const assignedDriver = vehicle.assignedDriverId
    ? getDriverById(vehicle.assignedDriverId)
    : null;

  const assignedCompany = assignedDriver?.companyId
    ? getCompanyById(assignedDriver.companyId)
    : null;

  return (
    <View
      style={[
        styles.vehicleRow,
        { backgroundColor: 'transparent' },
      ]}
    >
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          onEdit();
        }}
        style={({ pressed }) => [
          styles.vehicleRowLeftPressable,
          { backgroundColor: pressed ? colors.cardHover : 'transparent' },
        ]}
      >
        <View style={styles.vehicleRowLeft}>
          <View style={[styles.vehicleThumb, { backgroundColor: `${colors.primary}20` }]}>
            {vehicle.imageUrl ? (
              <Image source={{ uri: vehicle.imageUrl }} style={styles.vehicleThumbImage} resizeMode="cover" />
            ) : (
              <Truck size={20} color={colors.primary} />
            )}
          </View>
          <View style={styles.vehicleRowInfo}>
            <View style={styles.vehicleRowNameRow}>
              <Text style={[styles.vehicleRowName, { color: colors.textPrimary }]} numberOfLines={1}>
                {vehicle.make} {vehicle.model}
              </Text>
              <StatusDot status={vehicle.status} />
            </View>
            <Text style={[styles.vehicleRowPlate, { color: colors.textTertiary }]}>
              {vehicle.plateNumber}
            </Text>
            {assignedDriver && (
              <Text style={[styles.vehicleRowDriver, { color: colors.textTertiary }]} numberOfLines={1}>
                {t('vehicles.driver')}: {assignedDriver.name}
              </Text>
            )}
            {assignedCompany && (
              <View style={[styles.companyBadge, { backgroundColor: `${colors.secondary}15` }]}>
                <Building2 size={10} color={colors.secondary} />
                <Text style={[styles.companyBadgeText, { color: colors.secondary }]}>
                  {assignedCompany.nameZh || assignedCompany.name}
                </Text>
              </View>
            )}
            {vehicle.devIdno && (
              <View style={[styles.gpsBadge, { backgroundColor: `${colors.primary}15` }]}>
                {vehicle.status === 'active' ? (
                  <Wifi size={10} color={colors.primary} />
                ) : (
                  <WifiOff size={10} color={colors.textTertiary} />
                )}
                <Text style={[styles.gpsBadgeText, { color: colors.primary }]}>
                  {vehicle.devIdno}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
      <View style={[styles.vehicleRowActions, { position: 'absolute', right: 8, top: '50%', transform: [{ translateY: -22 }] }]}>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onEdit();
          }}
          style={({ pressed }) => [
            styles.rowActionBtn,
            { backgroundColor: pressed ? `${colors.primary}15` : 'transparent' },
          ]}
        >
          <Edit2 size={18} color={colors.primary} />
        </Pressable>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onDelete();
          }}
          style={({ pressed }) => [
            styles.rowActionBtn,
            styles.deleteBtn,
            { backgroundColor: pressed ? `${colors.danger}15` : 'transparent' },
          ]}
        >
          <Trash2 size={18} color={colors.danger} />
        </Pressable>
      </View>
    </View>
  );
}

function VehicleFormModal({
  visible,
  vehicle,
  onClose,
  onSaved,
}: {
  visible: boolean;
  vehicle: Vehicle | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const { addVehicle, updateVehicle } = useVehicleStore();
  const { drivers, loadDrivers } = useDriverStore();

  const empty: VehicleForm = {
    make: '',
    model: '',
    year: new Date().getFullYear(),
    bodyType: 'sedan',
    vin: '',
    plateNumber: '',
    color: '',
    fuelType: 'gasoline',
    transmission: 'automatic',
    mileage: 0,
    status: 'active',
    purchaseDate: '',
    insuranceExpiry: '',
    registrationExpiry: '',
    notes: '',
    imageUrl: '',
    devIdno: '',
    assignedDriverId: '',
  };

  const [form, setForm] = useState<VehicleForm>(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      loadDrivers();
    }
  }, [visible, loadDrivers]);

  useEffect(() => {
    if (visible) {
      if (vehicle) {
        setForm({
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          bodyType: vehicle.bodyType,
          vin: vehicle.vin,
          plateNumber: vehicle.plateNumber,
          color: vehicle.color,
          fuelType: vehicle.fuelType,
          transmission: vehicle.transmission,
          mileage: vehicle.mileage,
          status: vehicle.status,
          purchaseDate: vehicle.purchaseDate,
          insuranceExpiry: vehicle.insuranceExpiry,
          registrationExpiry: vehicle.registrationExpiry,
          notes: stripHtmlTags(vehicle.notes || ''),
          imageUrl: vehicle.imageUrl,
          devIdno: vehicle.devIdno || '',
          assignedDriverId: vehicle.assignedDriverId || '',
        });
      } else {
        setForm({ ...empty });
      }
      setError('');
    }
  }, [visible, vehicle]);

  const set = (key: keyof VehicleForm, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('profile.photoPermissionDenied'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    // 直接設定 blob URI 供即時預覽，實際上傳在 submit 時做
    set('imageUrl', result.assets[0].uri);
    // 把挑選的 URI 存起來，等 submit 時一起上傳
    set('imageUrl', `__pending__:${result.assets[0].uri}`);
  };

  const handleRemoveImage = () => {
    set('imageUrl', '');
  };

  const handleSubmit = async () => {
    if (!form.make.trim()) { setError(t('error.required')); return; }
    if (!form.model.trim()) { setError(t('error.required')); return; }
    if (!form.plateNumber.trim()) { setError(t('error.required')); return; }
    setLoading(true);
    setError('');

    try {
      let finalImageUrl = form.imageUrl;

      // 如果有挑選新圖片（以 __pending__: 開頭），就上傳到 Supabase
      if (form.imageUrl && form.imageUrl.startsWith('__pending__:')) {
        const pendingUri = form.imageUrl.replace('__pending__:', '');
        console.log('[Fleet Pro] 開始上傳圖片，URI:', pendingUri.substring(0, 80));
        const tempId = `temp_${Date.now()}`;
        try {
          finalImageUrl = await uploadVehicleImage(pendingUri, tempId);
          console.log('[Fleet Pro] ✅ 圖片上傳成功，URL:', finalImageUrl);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          Alert.alert(
            t('common.error'),
            `圖片上傳失敗：${msg}\n車輛資料仍會儲存（無圖片）`,
          );
          console.error('[Fleet Pro] ❌ 圖片上傳失敗:', err);
          finalImageUrl = '';
        }
      } else {
        console.log('[Fleet Pro] 無新圖片，維持現有 URL:', form.imageUrl || '(空)');
      }

      const formData = { ...form, imageUrl: finalImageUrl };

      if (vehicle) {
        await updateVehicle(vehicle.id, formData);
        Alert.alert(t('common.success'), t('vehicles.saved'));
      } else {
        await addVehicle(formData);
        Alert.alert(t('common.success'), t('vehicles.saved'));
      }
      onClose();
      onSaved();
    } catch {
      setError(t('error.unknownError'));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary };
  const labelStyle = { color: colors.textSecondary };
  const InputWrap = ({ children }: { children: React.ReactNode }) => (
    <View style={[styles.formInputWrap, inputStyle]}>{children}</View>
  );
  const inputProps = { style: [styles.formInput, inputStyle] as object, placeholderTextColor: colors.textTertiary };

  const bodyTypeOptions = BODY_TYPES.map((bt) => ({
    value: bt,
    label: t(`vehicles.${bt}`),
  }));

  const fuelTypeOptions = FUEL_TYPES.map((ft) => ({
    value: ft,
    label: t(`dashboard.${ft}`),
  }));

  const transmissionOptions = TRANSMISSIONS.map((tr) => ({
    value: tr,
    label: t(`vehicles.${tr}`),
  }));

  const statusOptions = STATUSES.map((st) => ({
    value: st,
    label: t(`vehicles.${st}`),
  }));

  const driverOptions = [
    { value: '', label: t('vehicles.selectDriverPlaceholder') },
    ...drivers.map((driver) => ({
      value: driver.id,
      label: `${driver.name} ${driver.phone ? `(${driver.phone})` : ''}`,
    })),
  ];

  const displayImageUrl = form.imageUrl.startsWith('__pending__:')
    ? form.imageUrl.replace('__pending__:', '')
    : form.imageUrl;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <Animated.View
          entering={FadeInDown.springify()}
          style={[styles.modalContent, { backgroundColor: colors.card }]}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {vehicle ? t('vehicles.editTitle') : t('vehicles.addTitle')}
            </Text>
            <Pressable onPress={onClose}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>

          <ScrollView style={{ maxHeight: SCREEN_WIDTH * 1.4 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* 車輛圖片 - 移到最頂 */}
            <View style={[styles.formField, { paddingHorizontal: spacing.lg, marginTop: spacing.lg }]}>
              <Text style={[styles.formLabel, labelStyle]}>{t('vehicles.vehicleImage')}</Text>
              {displayImageUrl ? (
                <View style={styles.imagePreviewWrap}>
                  <Image source={{ uri: displayImageUrl }} style={styles.formImagePreview} resizeMode="cover" />
                  <View style={styles.imageActions}>
                    <Pressable style={[styles.imageActionBtn, { backgroundColor: colors.primary }]} onPress={handlePickImage}>
                      <Text style={styles.imageActionText}>{t('vehicles.changeImage')}</Text>
                    </Pressable>
                    <Pressable style={[styles.imageActionBtn, { backgroundColor: colors.danger }]} onPress={handleRemoveImage}>
                      <Text style={styles.imageActionText}>{t('common.delete')}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={[styles.imageUploadPlaceholder, { borderColor: colors.border }]}
                  onPress={handlePickImage}
                >
                  <Camera size={32} color={colors.textTertiary} />
                  <Text style={[styles.imageUploadText, { color: colors.textTertiary }]}>
                    {t('vehicles.uploadVehicleImage')}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* 選擇司機 */}
            <View style={styles.formField}>
              <SelectField
                label={t('vehicles.selectDriver')}
                value={form.assignedDriverId || ''}
                options={driverOptions}
                onValueChange={(v) => set('assignedDriverId', v || undefined)}
              />
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, labelStyle]}>{t('vehicles.make')} *</Text>
              <InputWrap>
                <RNTextInput {...inputProps} value={form.make} onChangeText={(v) => set('make', v)} placeholder={t('vehicles.makePlaceholder')} />
              </InputWrap>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, labelStyle]}>{t('vehicles.model')} *</Text>
              <InputWrap>
                <RNTextInput {...inputProps} value={form.model} onChangeText={(v) => set('model', v)} placeholder={t('vehicles.modelPlaceholder')} />
              </InputWrap>
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formField, { flex: 1 }]}>
                <Text style={[styles.formLabel, labelStyle]}>{t('vehicles.year')}</Text>
                <InputWrap>
                  <RNTextInput {...inputProps} value={String(form.year)} onChangeText={(v) => set('year', parseInt(v) || 0)} keyboardType="number-pad" placeholder={t('vehicles.yearPlaceholder')} />
                </InputWrap>
              </View>
              <View style={[styles.formField, { flex: 1 }]}>
                <Text style={[styles.formLabel, labelStyle]}>{t('vehicles.color')}</Text>
                <InputWrap>
                  <RNTextInput {...inputProps} value={form.color} onChangeText={(v) => set('color', v)} placeholder={t('vehicles.colorPlaceholder')} />
                </InputWrap>
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, labelStyle]}>{t('vehicles.plateNumber')} *</Text>
              <InputWrap>
                <RNTextInput {...inputProps} value={form.plateNumber} onChangeText={(v) => set('plateNumber', v.toUpperCase())} placeholder={t('vehicles.platePlaceholder')} autoCapitalize="characters" />
              </InputWrap>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, labelStyle]}>{t('vehicles.vin')}</Text>
              <InputWrap>
                <RNTextInput {...inputProps} value={form.vin} onChangeText={(v) => set('vin', v)} placeholder={t('vehicles.vinPlaceholder')} autoCapitalize="characters" />
              </InputWrap>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, labelStyle]}>{t('vehicles.devIdno')}</Text>
              <InputWrap>
                <RNTextInput {...inputProps} value={form.devIdno} onChangeText={(v) => set('devIdno', v)} placeholder="e.g. 808GPS-001" autoCapitalize="none" />
              </InputWrap>
              <Text style={[styles.formHint, { color: colors.textTertiary }]}>{t('vehicles.devIdnoHelp')}</Text>
            </View>

            {/* 車身類型 - SelectField */}
            <View style={styles.formField}>
              <SelectField
                label={t('vehicles.bodyType')}
                value={form.bodyType}
                options={bodyTypeOptions}
                onValueChange={(v) => set('bodyType', v)}
              />
            </View>

            {/* 燃料類型 - SelectField */}
            <View style={styles.formField}>
              <SelectField
                label={t('vehicles.fuelType')}
                value={form.fuelType}
                options={fuelTypeOptions}
                onValueChange={(v) => set('fuelType', v)}
              />
            </View>

            {/* 變速箱 - SelectField */}
            <View style={styles.formField}>
              <SelectField
                label={t('vehicles.transmission')}
                value={form.transmission}
                options={transmissionOptions}
                onValueChange={(v) => set('transmission', v)}
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formField, { flex: 1 }]}>
                <Text style={[styles.formLabel, labelStyle]}>{t('vehicles.mileage')}</Text>
                <InputWrap>
                  <RNTextInput {...inputProps} value={String(form.mileage)} onChangeText={(v) => set('mileage', parseInt(v) || 0)} keyboardType="number-pad" placeholder={t('vehicles.mileagePlaceholder')} />
                </InputWrap>
              </View>
            </View>

            {/* 狀態 - SelectField */}
            <View style={styles.formField}>
              <SelectField
                label={t('vehicles.status')}
                value={form.status}
                options={statusOptions}
                onValueChange={(v) => set('status', v)}
              />
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, labelStyle]}>{t('vehicles.purchaseDate')}</Text>
              <InputWrap>
                <RNTextInput {...inputProps} value={form.purchaseDate} onChangeText={(v) => set('purchaseDate', v)} placeholder="YYYY-MM-DD" />
              </InputWrap>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, labelStyle]}>{t('vehicles.insuranceExpiry')}</Text>
              <InputWrap>
                <RNTextInput {...inputProps} value={form.insuranceExpiry} onChangeText={(v) => set('insuranceExpiry', v)} placeholder="YYYY-MM-DD" />
              </InputWrap>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, labelStyle]}>{t('vehicles.registrationExpiry')}</Text>
              <InputWrap>
                <RNTextInput {...inputProps} value={form.registrationExpiry} onChangeText={(v) => set('registrationExpiry', v)} placeholder="YYYY-MM-DD" />
              </InputWrap>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, labelStyle]}>{t('vehicles.notes')}</Text>
              <TextInput
                value={form.notes}
                onChangeText={(text) => set('notes', text)}
                placeholder={t('vehicles.notesPlaceholder')}
                multiline
                numberOfLines={4}
                inputStyle={styles.notesInput}
              />
            </View>

            {error ? <Text style={[styles.formError, { color: colors.danger }]}>{error}</Text> : null}
          </ScrollView>

          <View style={[styles.modalActions, { borderTopColor: colors.border }]}>
            <Button title={t('common.cancel')} variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title={t('common.save')} onPress={handleSubmit} loading={loading} style={{ flex: 1.5 }} />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DeleteConfirmModal({
  visible,
  vehicleName,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  vehicleName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={[styles.modalBackdrop, { backgroundColor: 'rgba(0,0,0,0.6)' }]} onPress={onCancel}>
          <Pressable style={[styles.deleteConfirmBox, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.deleteConfirmIcon, { backgroundColor: `${colors.danger}15` }]}>
              <Trash2 size={32} color={colors.danger} />
            </View>
            <Text style={[styles.deleteConfirmTitle, { color: colors.textPrimary }]}>
              {t('vehicles.deleteVehicle')}
            </Text>
            <Text style={[styles.deleteConfirmText, { color: colors.textSecondary }]}>
              {t('common.delete')} {vehicleName}?
            </Text>
            <View style={styles.deleteConfirmActions}>
              <Pressable
                style={[styles.deleteConfirmBtn, { borderColor: colors.border }]}
                onPress={onCancel}
              >
                <Text style={[styles.deleteConfirmBtnText, { color: colors.textSecondary }]}>
                  {t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.deleteConfirmBtn, styles.deleteConfirmBtnDanger, { backgroundColor: colors.danger }]}
                onPress={onConfirm}
              >
                <Text style={[styles.deleteConfirmBtnText, { color: '#FFF' }]}>
                  {t('common.delete')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function VehicleManagementScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const { vehicles, loadVehicles, deleteVehicle } = useVehicleStore();
  const { drivers, loadDrivers } = useDriverStore();
  const { users, loadUsers } = useUserManagementStore();
  const { isConnected } = useGps808Store();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | 'all'>('all');
  const [formVisible, setFormVisible] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [deleteConfirmVehicle, setDeleteConfirmVehicle] = useState<Vehicle | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadVehicles();
    loadDrivers();
    loadUsers();
  }, [loadVehicles, loadDrivers, loadUsers]);

  const filtered = vehicles.filter((v) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      v.make.toLowerCase().includes(q) ||
      v.model.toLowerCase().includes(q) ||
      v.plateNumber.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || v.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleDelete = (vehicle: Vehicle) => {
    setDeleteConfirmVehicle(vehicle);
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmVehicle) {
      await deleteVehicle(deleteConfirmVehicle.id);
      setDeleteConfirmVehicle(null);
    }
  };

  const handleEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setFormVisible(true);
  };

  const handleAdd = () => {
    setEditingVehicle(null);
    setFormVisible(true);
  };

  const statusColors: Record<VehicleStatus | 'all', string> = {
    all: colors.textPrimary,
    active: '#22C55E',
    maintenance: '#F59E0B',
    inactive: '#EF4444',
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={[styles.headerBorder, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <View style={styles.header}>
            <View style={styles.leftSection}>
              <Pressable
                onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
                style={styles.backButton}
                hitSlop={12}
              >
                <View style={[styles.backArrow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.backArrowText, { color: colors.textPrimary }]}>{'<'}</Text>
                </View>
              </Pressable>
            </View>

            <View style={styles.logoTitleContainer}>
              <Pressable onPress={() => router.push('/(tabs)')} hitSlop={8}>
                <Image
                  source={require('@/assets/onefleet_2560.png')}
                  style={{ width: 90, height: 30 }}
                  resizeMode="contain"
                />
              </Pressable>
              <View style={styles.titleSpacer} />
            </View>
            <View style={styles.titleOverlay} pointerEvents="none">
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{t('nav.vehicleManagement')}</Text>
            </View>

            <View style={styles.rightSection} />
          </View>
        </View>
      </SafeAreaView>

      {/* Floating Add Button - Top Right - Hidden */}
      {false && (
      <Pressable
        onPress={handleAdd}
        style={({ pressed }) => [
          styles.floatingAddBtn,
          {
            backgroundColor: colors.primary,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          },
        ]}
      >
        <Plus size={24} color="#FFF" />
      </Pressable>
      )}

      <View style={styles.searchBar}>
        <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Search size={16} color={colors.textTertiary} />
          <RNTextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder={t('vehicles.searchPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <View style={styles.filterRow}>
        {(['all', 'active', 'maintenance', 'inactive'] as const).map((st) => (
          <Pressable
            key={st}
            onPress={() => setStatusFilter(st)}
            style={[
              styles.filterChip,
              {
                borderColor: statusFilter === st ? colors.primary : colors.border,
                backgroundColor: statusFilter === st ? `${colors.primary}20` : 'transparent',
              },
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: statusFilter === st ? colors.primary : colors.textSecondary },
              ]}
            >
              {t(`vehicles.${st}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {isConnected && (
        <View style={[styles.gpsStatusBar, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}>
          <Wifi size={12} color={colors.primary} />
          <Text style={[styles.gpsStatusText, { color: colors.primary }]}>808GPS {t('pair.online')}</Text>
        </View>
      )}

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Truck size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              {t('vehicles.noVehicles')}
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
              {t('vehicles.addFirst')}
            </Text>
            <Button title={t('vehicles.addTitle')} onPress={handleAdd} style={{ marginTop: spacing.lg }} />
          </View>
        ) : (
          filtered.map((vehicle, index) => (
            <View key={vehicle.id}>
              <VehicleRow
                vehicle={vehicle}
                onEdit={() => handleEdit(vehicle)}
                onDelete={() => handleDelete(vehicle)}
              />
              {index < filtered.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </View>
          ))
        )}
      </ScrollView>

      <VehicleFormModal
        visible={formVisible}
        vehicle={editingVehicle}
        onClose={() => { setFormVisible(false); setEditingVehicle(null); }}
        onSaved={() => { loadVehicles(); }}
      />

      <DeleteConfirmModal
        visible={deleteConfirmVehicle !== null}
        vehicleName={deleteConfirmVehicle ? `${deleteConfirmVehicle.make} ${deleteConfirmVehicle.model}` : ''}
        onCancel={() => setDeleteConfirmVehicle(null)}
        onConfirm={handleConfirmDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {},
  headerBorder: { borderBottomWidth: 1 },
  header: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  leftSection: { alignItems: 'flex-start', justifyContent: 'center', minWidth: 50 },
  backButton: { padding: spacing.sm, marginLeft: -spacing.sm },
  backArrow: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  backArrowText: { fontSize: 16, fontWeight: '700' },
  logoTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  logoWrap: { marginRight: spacing.sm },
  titleSpacer: { width: 0, flex: 1 },
  titleOverlay: {
    position: 'absolute',
    top: 0,
    left: spacing.lg,
    right: spacing.lg,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: typography.fontSize.lg, fontWeight: '600' },
  rightSection: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 50 },
  floatingAddBtn: {
    position: 'absolute',
    top: layout.headerHeight + 10,
    right: spacing.lg,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  searchBar: { paddingHorizontal: spacing.lg, paddingTop: 8, paddingBottom: spacing.sm },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: typography.fontSize.base },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  filterChipText: { fontSize: typography.fontSize.xs, fontWeight: '600' },
  gpsStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  gpsStatusText: { fontSize: typography.fontSize.xs, fontWeight: '600' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    position: 'relative',
  },
  vehicleRowLeftPressable: { flex: 1 },
  vehicleRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  vehicleThumb: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  vehicleThumbImage: { width: 48, height: 48 },
  vehicleRowInfo: { flex: 1 },
  vehicleRowNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  vehicleRowName: { fontSize: typography.fontSize.base, fontWeight: '600', flex: 1, color: '#000' },
  vehicleRowPlate: { fontSize: typography.fontSize.sm, marginTop: 2 },
  vehicleRowDriver: { fontSize: typography.fontSize.xs, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  gpsBadgeText: { fontSize: typography.fontSize.xs, fontWeight: '600' },
  companyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  companyBadgeText: { fontSize: typography.fontSize.xs, fontWeight: '600' },
  vehicleRowActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', zIndex: 10 },
  rowActionBtn: {
    padding: spacing.md,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    zIndex: 11,
  },
  deleteBtn: { marginLeft: spacing.xs },
  divider: { height: 1, marginLeft: 48 + spacing.md },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '600', marginTop: spacing.md },
  emptyHint: { fontSize: typography.fontSize.sm, marginTop: spacing.xs },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  deleteConfirmBox: {
    width: 300,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  deleteConfirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  deleteConfirmTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  deleteConfirmText: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  deleteConfirmBtnDanger: {
    borderWidth: 0,
  },
  deleteConfirmBtnText: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: typography.fontSize.lg, fontWeight: '700' },
  formField: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  formRow: { flexDirection: 'row', gap: spacing.md },
  formInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  formInput: { flex: 1, fontSize: typography.fontSize.base },
  formLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', marginBottom: spacing.sm },
  formHint: { fontSize: typography.fontSize.xs, marginTop: spacing.xs },
  formError: { fontSize: typography.fontSize.sm, marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  imageUploadPlaceholder: {
    height: 140,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9f9f9',
  },
  imageUploadText: {
    marginTop: spacing.sm,
    fontSize: typography.fontSize.sm,
    fontWeight: '500',
  },
  imagePreviewWrap: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  formImagePreview: {
    width: '100%',
    height: 140,
  },
  imageActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  imageActionBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  imageActionText: {
    color: '#fff',
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  notesInput: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: spacing.md,
  },
});
