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
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useVehicleStore } from '@/store/vehicleStore';
import { useDriverStore } from '@/store/driverStore';
import { useGps808Store } from '@/store/gps808Store';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { spacing, typography, borderRadius } from '@/constants/theme';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { ReactQuill, ReactQuillRef } from '@/components/ui/ReactQuill';
import { Vehicle, BodyType, FuelType, TransmissionType, VehicleStatus } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

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

  const assignedDriver = vehicle.assignedDriverId
    ? getDriverById(vehicle.assignedDriverId)
    : null;

  return (
    <Pressable
      onPress={onEdit}
      style={({ pressed }) => [
        styles.vehicleRow,
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
      <View style={styles.vehicleRowActions}>
        <Pressable onPress={onEdit} style={styles.rowActionBtn} hitSlop={8}>
          <Edit2 size={16} color={colors.primary} />
        </Pressable>
        <Pressable onPress={onDelete} style={styles.rowActionBtn} hitSlop={8}>
          <Trash2 size={16} color={colors.danger} />
        </Pressable>
      </View>
    </Pressable>
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
          notes: vehicle.notes,
          imageUrl: vehicle.imageUrl,
          devIdno: vehicle.devIdno || '',
          assignedDriverId: vehicle.assignedDriverId || '',
        });
      } else {
        setForm(empty);
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

    if (!result.canceled && result.assets[0]) {
      set('imageUrl', result.assets[0].uri);
    }
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
      // 確保 notes 被正確保存（即使是空字串）
      const formData = { ...form, notes: form.notes || '' };
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
              {form.imageUrl ? (
                <View style={styles.imagePreviewWrap}>
                  <Image source={{ uri: form.imageUrl }} style={styles.formImagePreview} resizeMode="cover" />
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
              <ReactQuill
                value={form.notes}
                onChange={(html) => set('notes', html)}
                placeholder={t('vehicles.notesPlaceholder')}
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

export default function VehicleManagementScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const { vehicles, loadVehicles, deleteVehicle } = useVehicleStore();
  const { loadDrivers } = useDriverStore();
  const { isConnected } = useGps808Store();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | 'all'>('all');
  const [formVisible, setFormVisible] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadVehicles();
    loadDrivers();
  }, [loadVehicles, loadDrivers]);

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
    Alert.alert(
      t('vehicles.deleteVehicle'),
      `${t('common.delete')} ${vehicle.make} ${vehicle.model}?`,
      [
        { text: t('common.cancel'), style: 'cancel' as const },
        {
          text: t('common.delete'),
          style: 'destructive' as const,
          onPress: async () => {
            await deleteVehicle(vehicle.id);
          },
        },
      ],
      { cancelable: true },
    );
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
      <Header
        title={t('nav.vehicleManagement')}
        showBack
        leftElement={
          <Pressable onPress={() => router.push('/(tabs)')} hitSlop={8}>
            <Image
              source={require('@/assets/onefleet_2560.png')}
              style={{ width: 90, height: 30 }}
              resizeMode="contain"
            />
          </Pressable>
        }
        rightAction={
          <Pressable onPress={handleAdd} style={[styles.addBtn, { backgroundColor: `${colors.primary}20` }]}>
            <Plus size={18} color={colors.primary} />
          </Pressable>
        }
      />

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
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
  },
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
  vehicleRowActions: { flexDirection: 'row', gap: spacing.sm },
  rowActionBtn: { padding: spacing.xs },
  divider: { height: 1, marginLeft: 48 + spacing.md },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '600', marginTop: spacing.md },
  emptyHint: { fontSize: typography.fontSize.sm, marginTop: spacing.xs },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: 40,
    maxHeight: '85%',
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
});
