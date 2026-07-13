import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Check, X, Camera } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { SelectField } from '@/components/ui/SelectField';
import { useVehicleStore } from '@/store/vehicleStore';
import { useDriverStore } from '@/store/driverStore';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { BodyType, FuelType, TransmissionType, VehicleStatus } from '@/types';
import { useTranslation } from '@/i18n';
import { uploadVehicleImage } from '@/utils/supabaseStorage';

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

interface FormData {
  make: string;
  model: string;
  year: string;
  bodyType: BodyType;
  vin: string;
  plateNumber: string;
  devIdno: string;
  color: string;
  fuelType: FuelType;
  transmission: TransmissionType;
  mileage: string;
  status: VehicleStatus;
  purchaseDate: string;
  insuranceExpiry: string;
  registrationExpiry: string;
  notes: string;
  imageUrl: string;
  assignedDriverId: string;
}

const initialFormData: FormData = {
  make: '',
  model: '',
  year: new Date().getFullYear().toString(),
  bodyType: 'sedan',
  vin: '',
  plateNumber: '',
  devIdno: '',
  color: '',
  fuelType: 'gasoline',
  transmission: 'automatic',
  mileage: '0',
  status: 'active',
  purchaseDate: new Date().toISOString().split('T')[0],
  insuranceExpiry: '',
  registrationExpiry: '',
  notes: '',
  imageUrl: '',
  assignedDriverId: '',
};

interface AddVehicleFormProps {
  editId?: string;
}

export function AddVehicleForm({ editId }: AddVehicleFormProps) {
  const router = useRouter();
  const { t } = useTranslation();

  const STEPS = [
    t('vehicles.stepBasicInfo'),
    t('vehicles.stepDetails'),
    t('vehicles.stepStatus'),
  ];

  const bodyTypeOptions: { value: BodyType; label: string }[] = [
    { value: 'sedan', label: t('vehicles.sedan') },
    { value: 'suv', label: t('vehicles.suv') },
    { value: 'truck', label: t('vehicles.truck') },
    { value: 'van', label: t('vehicles.van') },
    { value: 'motorcycle', label: t('vehicles.motorcycle') },
    { value: 'other', label: t('vehicles.other') },
  ];

  const fuelTypeOptions: { value: FuelType; label: string }[] = [
    { value: 'gasoline', label: t('dashboard.gasoline') },
    { value: 'diesel', label: t('dashboard.diesel') },
    { value: 'electric', label: t('dashboard.electric') },
    { value: 'hybrid', label: t('dashboard.hybrid') },
  ];

  const transmissionOptions: { value: TransmissionType; label: string }[] = [
    { value: 'automatic', label: t('vehicles.automatic') },
    { value: 'manual', label: t('vehicles.manual') },
  ];

  const statusOptions: { value: VehicleStatus; label: string }[] = [
    { value: 'active', label: t('vehicles.active') },
    { value: 'maintenance', label: t('vehicles.maintenance') },
    { value: 'inactive', label: t('vehicles.inactive') },
  ];

  const { getVehicleById, addVehicle, updateVehicle } = useVehicleStore();
  const { drivers, loadDrivers } = useDriverStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const isEditMode = Boolean(editId);

  useEffect(() => {
    loadDrivers();
  }, [loadDrivers]);

  useEffect(() => {
    if (editId) {
      const existing = getVehicleById(editId);
      if (existing) {
        setForm({
          make: existing.make,
          model: existing.model,
          year: existing.year.toString(),
          bodyType: existing.bodyType,
          vin: existing.vin,
          plateNumber: existing.plateNumber,
          devIdno: existing.devIdno || '',
          color: existing.color,
          fuelType: existing.fuelType,
          transmission: existing.transmission,
          mileage: existing.mileage.toString(),
          status: existing.status,
          purchaseDate: existing.purchaseDate,
          insuranceExpiry: existing.insuranceExpiry,
          registrationExpiry: existing.registrationExpiry,
          notes: stripHtmlTags(existing.notes || ''),
          imageUrl: existing.imageUrl,
          assignedDriverId: existing.assignedDriverId || '',
        });
      }
    }
  }, [editId]);

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (currentStep === 0) {
      if (!form.make.trim()) newErrors.make = t('error.required');
      if (!form.model.trim()) newErrors.model = t('error.required');
      if (!form.year || isNaN(Number(form.year))) newErrors.year = t('error.required');
    }

    if (currentStep === 1) {
      if (!form.plateNumber.trim()) newErrors.plateNumber = t('error.required');
      if (!form.color.trim()) newErrors.color = t('error.required');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

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
      updateField('imageUrl', `__pending__:${result.assets[0].uri}`);
    }
  };

  const handleRemoveImage = () => {
    updateField('imageUrl', '');
  };

  const handleSubmit = async () => {
    if (!validateStep(step)) return;
    setIsSubmitting(true);
    try {
      let finalImageUrl = form.imageUrl;

      if (form.imageUrl && form.imageUrl.startsWith('__pending__:')) {
        const pendingUri = form.imageUrl.replace('__pending__:', '');
        const tempId = `temp_${Date.now()}`;
        try {
          finalImageUrl = await uploadVehicleImage(pendingUri, tempId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : '未知錯誤';
          Alert.alert(
            t('common.error'),
            `圖片上傳失敗：${msg}\n車輛資料仍會儲存（無圖片）`,
          );
          finalImageUrl = '';
        }
      }

      const vehicleData = {
        make: form.make,
        model: form.model,
        year: Number(form.year),
        bodyType: form.bodyType,
        vin: form.vin || 'N/A',
        plateNumber: form.plateNumber,
        devIdno: form.devIdno.trim() || undefined,
        color: form.color,
        fuelType: form.fuelType,
        transmission: form.transmission,
        mileage: Number(form.mileage) || 0,
        status: form.status,
        purchaseDate: form.purchaseDate || new Date().toISOString().split('T')[0],
        insuranceExpiry: form.insuranceExpiry || '',
        registrationExpiry: form.registrationExpiry || '',
        notes: form.notes || '',
        imageUrl: finalImageUrl,
        assignedDriverId: form.assignedDriverId || undefined,
      };

      if (isEditMode && editId) {
        await updateVehicle(editId, vehicleData);
      } else {
        await addVehicle(vehicleData);
      }
      router.canGoBack() ? router.back() : router.replace('/(tabs)');
    } catch {
      Alert.alert(t('common.error'), isEditMode ? t('vehicles.updateFailed') : t('vehicles.addFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const driverOptions = [
    { value: '', label: t('vehicles.selectDriverPlaceholder') },
    ...drivers.map((driver) => ({
      value: driver.id,
      label: `${driver.name} ${driver.phone ? `(${driver.phone})` : ''}`,
    })),
  ];

  // 從 __pending__: URI 中取出真實 URI 供 Image 元件顯示
  const displayImageUrl = form.imageUrl.startsWith('__pending__:')
    ? form.imageUrl.replace('__pending__:', '')
    : form.imageUrl;

  const selectedDriver = drivers.find((d) => d.id === form.assignedDriverId);

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {STEPS.map((s, i) => (
        <View key={s} style={styles.stepItem}>
          <View
            style={[
              styles.stepCircle,
              i < step && styles.stepCompleted,
              i === step && styles.stepActive,
            ]}
          >
            {i < step ? (
              <Check size={12} color="#FFF" />
            ) : (
              <Text style={[styles.stepNumber, i === step && styles.stepNumberActive]}>
                {i + 1}
              </Text>
            )}
          </View>
          <Text style={[styles.stepLabel, i === step && styles.stepLabelActive]}>
            {s}
          </Text>
          {i < STEPS.length - 1 && (
            <View style={[styles.stepLine, i < step && styles.stepLineCompleted]} />
          )}
        </View>
      ))}
    </View>
  );

  const renderStep0 = () => (
    <View>
      <Text style={styles.sectionTitle}>{t('vehicles.stepBasicInfo')}</Text>

      <Text style={styles.fieldLabel}>{t('vehicles.vehicleImage')}</Text>
      <View style={styles.imageUploadSection}>
        {displayImageUrl ? (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: displayImageUrl }} style={styles.imagePreview} resizeMode="cover" />
            <Pressable style={styles.removeImageBtn} onPress={handleRemoveImage}>
              <X size={16} color="#FFF" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.imageUploadPlaceholder, { borderColor: colors.border }]}
            onPress={handlePickImage}
          >
            <Camera size={32} color={colors.textTertiary} />
            <Text style={styles.imageUploadText}>{t('vehicles.uploadVehicleImage')}</Text>
          </Pressable>
        )}
        {displayImageUrl && (
          <Pressable
            style={[styles.changeImageBtn, { borderColor: colors.primary }]}
            onPress={handlePickImage}
          >
            <Text style={[styles.changeImageText, { color: colors.primary }]}>
              {t('vehicles.changeImage')}
            </Text>
          </Pressable>
        )}
      </View>

      <TextInput
        label={t('vehicles.make') + ' *'}
        placeholder={t('vehicles.makePlaceholder')}
        value={form.make}
        onChangeText={(v) => updateField('make', v)}
        error={errors.make}
        autoCapitalize="words"
      />
      <TextInput
        label={t('vehicles.model') + ' *'}
        placeholder={t('vehicles.modelPlaceholder')}
        value={form.model}
        onChangeText={(v) => updateField('model', v)}
        error={errors.model}
        autoCapitalize="words"
      />
      <TextInput
        label={t('vehicles.year') + ' *'}
        placeholder={t('vehicles.yearPlaceholder')}
        value={form.year}
        onChangeText={(v) => updateField('year', v)}
        error={errors.year}
        keyboardType="numeric"
        maxLength={4}
      />
      <SelectField
        label={t('vehicles.bodyType')}
        value={form.bodyType}
        options={bodyTypeOptions}
        onValueChange={(v) => updateField('bodyType', v)}
      />
    </View>
  );

  const renderStep1 = () => (
    <View>
      <Text style={styles.sectionTitle}>{t('vehicles.stepDetails')}</Text>

      <TextInput
        label={t('vehicles.plateNumber') + ' *'}
        placeholder={t('vehicles.platePlaceholder')}
        value={form.plateNumber}
        onChangeText={(v) => updateField('plateNumber', v.toUpperCase())}
        error={errors.plateNumber}
        autoCapitalize="characters"
      />
      <TextInput
        label="GPS Device ID (devIdno)"
        placeholder="e.g. 50000000000"
        value={form.devIdno}
        onChangeText={(v) => updateField('devIdno', v)}
        autoCapitalize="none"
        description={t('vehicles.devIdnoHelp')}
      />
      <TextInput
        label={t('vehicles.vin')}
        placeholder={t('vehicles.vinPlaceholder')}
        value={form.vin}
        onChangeText={(v) => updateField('vin', v.toUpperCase())}
        autoCapitalize="characters"
        maxLength={17}
      />
      <TextInput
        label={t('vehicles.color') + ' *'}
        placeholder={t('vehicles.colorPlaceholder')}
        value={form.color}
        onChangeText={(v) => updateField('color', v)}
        error={errors.color}
        autoCapitalize="words"
      />
      <SelectField
        label={t('vehicles.fuelType')}
        value={form.fuelType}
        options={fuelTypeOptions}
        onValueChange={(v) => updateField('fuelType', v)}
      />
      <SelectField
        label={t('vehicles.transmission')}
        value={form.transmission}
        options={transmissionOptions}
        onValueChange={(v) => updateField('transmission', v)}
      />
    </View>
  );

  const renderStep2 = () => (
    <View>
      <Text style={styles.sectionTitle}>{t('vehicles.stepStatus')}</Text>

      <TextInput
        label={t('vehicles.mileage')}
        placeholder={t('vehicles.mileagePlaceholder')}
        value={form.mileage}
        onChangeText={(v) => updateField('mileage', v)}
        keyboardType="numeric"
      />

      <SelectField
        label={t('vehicles.selectDriver')}
        value={form.assignedDriverId}
        options={driverOptions}
        onValueChange={(v) => updateField('assignedDriverId', v)}
        description={selectedDriver ? t('vehicles.driverAssigned', { name: selectedDriver.name }) : undefined}
      />

      <TextInput
        label={t('vehicles.purchaseDate')}
        placeholder="YYYY-MM-DD"
        value={form.purchaseDate}
        onChangeText={(v) => updateField('purchaseDate', v)}
      />
      <TextInput
        label={t('vehicles.insuranceExpiry')}
        placeholder="YYYY-MM-DD"
        value={form.insuranceExpiry}
        onChangeText={(v) => updateField('insuranceExpiry', v)}
      />
      <TextInput
        label={t('vehicles.registrationExpiry')}
        placeholder="YYYY-MM-DD"
        value={form.registrationExpiry}
        onChangeText={(v) => updateField('registrationExpiry', v)}
      />
      <SelectField
        label={t('vehicles.status')}
        value={form.status}
        options={statusOptions}
        onValueChange={(v) => updateField('status', v)}
      />
      <View style={styles.notesWrapper}>
        <Text style={styles.fieldLabel}>{t('vehicles.notes')}</Text>
        <TextInput
          value={form.notes}
          onChangeText={(text) => updateField('notes', text)}
          placeholder={t('vehicles.notesPlaceholder')}
          multiline
          numberOfLines={4}
          inputStyle={styles.notesInput}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 22 }} />
        <Text style={styles.headerTitle}>{isEditMode ? t('vehicles.editTitle') : t('vehicles.addTitle')}</Text>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} hitSlop={12}>
          <X size={22} color={colors.textSecondary} />
        </Pressable>
      </View>
      {renderStepIndicator()}

      <ScrollView
        style={styles.form}
        contentContainerStyle={styles.formContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 && (
          <Button
            title={t('common.back')}
            onPress={handleBack}
            variant="secondary"
            size="lg"
            style={{ flex: 1, marginRight: spacing.md }}
          />
        )}
        {step < STEPS.length - 1 ? (
          <Button
            title={t('common.next')}
            onPress={handleNext}
            variant="primary"
            size="lg"
            icon={<ChevronRight size={18} color="#FFF" />}
            style={{ flex: 1 }}
          />
        ) : (
          <Button
            title={isEditMode ? t('common.save') : t('vehicles.addTitle')}
            onPress={handleSubmit}
            variant="primary"
            size="lg"
            loading={isSubmitting}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCompleted: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepActive: {
    backgroundColor: colors.card,
    borderColor: colors.primary,
  },
  stepNumber: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: colors.textTertiary,
  },
  stepNumberActive: {
    color: colors.primary,
  },
  stepLabel: {
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  stepLabelActive: {
    color: colors.primary,
  },
  stepLine: {
    width: 32,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs,
  },
  stepLineCompleted: {
    backgroundColor: colors.primary,
  },
  form: {
    flex: 1,
  },
  formContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  imageUploadSection: {
    marginBottom: spacing.lg,
  },
  imageUploadPlaceholder: {
    height: 160,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  imageUploadText: {
    marginTop: spacing.sm,
    fontSize: typography.fontSize.sm,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  imagePreviewWrap: {
    position: 'relative',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: 160,
    borderRadius: borderRadius.lg,
  },
  removeImageBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeImageBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  changeImageText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  notesWrapper: {
    marginBottom: spacing.lg,
  },
  notesInput: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: spacing.md,
  },
});
