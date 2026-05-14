import { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { useVehicleStore } from '@/store/vehicleStore';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { BodyType, FuelType, TransmissionType, VehicleStatus } from '@/types';

const STEPS = ['Basic Info', 'Details', 'Status'];

interface FormData {
  make: string;
  model: string;
  year: string;
  bodyType: BodyType;
  vin: string;
  plateNumber: string;
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
}

const initialFormData: FormData = {
  make: '',
  model: '',
  year: new Date().getFullYear().toString(),
  bodyType: 'sedan',
  vin: '',
  plateNumber: '',
  color: '',
  fuelType: 'gasoline',
  transmission: 'automatic',
  mileage: '0',
  status: 'active',
  purchaseDate: new Date().toISOString().split('T')[0],
  insuranceExpiry: '',
  registrationExpiry: '',
  notes: '',
  imageUrl: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&q=80',
};

const bodyTypes: { key: BodyType; label: string }[] = [
  { key: 'sedan', label: 'Sedan' },
  { key: 'suv', label: 'SUV' },
  { key: 'truck', label: 'Truck' },
  { key: 'van', label: 'Van' },
  { key: 'motorcycle', label: 'Motorcycle' },
  { key: 'other', label: 'Other' },
];

const fuelTypes: { key: FuelType; label: string }[] = [
  { key: 'gasoline', label: 'Gasoline' },
  { key: 'diesel', label: 'Diesel' },
  { key: 'electric', label: 'Electric' },
  { key: 'hybrid', label: 'Hybrid' },
];

const transmissions: { key: TransmissionType; label: string }[] = [
  { key: 'automatic', label: 'Automatic' },
  { key: 'manual', label: 'Manual' },
];

const statuses: { key: VehicleStatus; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'inactive', label: 'Inactive' },
];

interface AddVehicleFormProps {
  editId?: string;
}

export function AddVehicleForm({ editId }: AddVehicleFormProps) {
  const router = useRouter();
  const { getVehicleById, addVehicle, updateVehicle } = useVehicleStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const isEditMode = Boolean(editId);

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
          color: existing.color,
          fuelType: existing.fuelType,
          transmission: existing.transmission,
          mileage: existing.mileage.toString(),
          status: existing.status,
          purchaseDate: existing.purchaseDate,
          insuranceExpiry: existing.insuranceExpiry,
          registrationExpiry: existing.registrationExpiry,
          notes: existing.notes,
          imageUrl: existing.imageUrl,
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
      if (!form.make.trim()) newErrors.make = 'Make is required';
      if (!form.model.trim()) newErrors.model = 'Model is required';
      if (!form.year || isNaN(Number(form.year))) newErrors.year = 'Valid year is required';
    }

    if (currentStep === 1) {
      if (!form.plateNumber.trim()) newErrors.plateNumber = 'Plate number is required';
      if (!form.color.trim()) newErrors.color = 'Color is required';
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

  const handleSubmit = async () => {
    if (!validateStep(step)) return;
    setIsSubmitting(true);
    try {
      const vehicleData = {
        make: form.make,
        model: form.model,
        year: Number(form.year),
        bodyType: form.bodyType,
        vin: form.vin || 'N/A',
        plateNumber: form.plateNumber,
        color: form.color,
        fuelType: form.fuelType,
        transmission: form.transmission,
        mileage: Number(form.mileage) || 0,
        status: form.status,
        purchaseDate: form.purchaseDate || new Date().toISOString().split('T')[0],
        insuranceExpiry: form.insuranceExpiry || '',
        registrationExpiry: form.registrationExpiry || '',
        notes: form.notes || '',
        imageUrl: form.imageUrl,
      };

      if (isEditMode && editId) {
        await updateVehicle(editId, vehicleData);
      } else {
        await addVehicle(vehicleData);
      }
      router.back();
    } catch {
      Alert.alert('Error', `Failed to ${isEditMode ? 'update' : 'add'} vehicle`);
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const renderSelector = <T extends string>(
    options: { key: T; label: string }[],
    selected: T,
    onSelect: (key: T) => void
  ) => (
    <View style={styles.selectorGrid}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          onPress={() => onSelect(o.key)}
          style={[
            styles.selectorItem,
            selected === o.key && styles.selectorItemSelected,
          ]}
        >
          <Text
            style={[
              styles.selectorText,
              selected === o.key && styles.selectorTextSelected,
            ]}
          >
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const renderStep0 = () => (
    <View>
      <TextInput
        label="Make *"
        placeholder="e.g. Toyota"
        value={form.make}
        onChangeText={(v) => updateField('make', v)}
        error={errors.make}
        autoCapitalize="words"
      />
      <TextInput
        label="Model *"
        placeholder="e.g. Camry"
        value={form.model}
        onChangeText={(v) => updateField('model', v)}
        error={errors.model}
        autoCapitalize="words"
      />
      <TextInput
        label="Year *"
        placeholder="e.g. 2024"
        value={form.year}
        onChangeText={(v) => updateField('year', v)}
        error={errors.year}
        keyboardType="numeric"
        maxLength={4}
      />
      <Text style={styles.fieldLabel}>Body Type</Text>
      {renderSelector(bodyTypes, form.bodyType, (v) => updateField('bodyType', v))}
    </View>
  );

  const renderStep1 = () => (
    <View>
      <TextInput
        label="Plate Number *"
        placeholder="e.g. ABC-1234"
        value={form.plateNumber}
        onChangeText={(v) => updateField('plateNumber', v.toUpperCase())}
        error={errors.plateNumber}
        autoCapitalize="characters"
      />
      <TextInput
        label="VIN"
        placeholder="Vehicle Identification Number"
        value={form.vin}
        onChangeText={(v) => updateField('vin', v.toUpperCase())}
        autoCapitalize="characters"
        maxLength={17}
      />
      <TextInput
        label="Color *"
        placeholder="e.g. Pearl White"
        value={form.color}
        onChangeText={(v) => updateField('color', v)}
        error={errors.color}
        autoCapitalize="words"
      />
      <Text style={styles.fieldLabel}>Fuel Type</Text>
      {renderSelector(fuelTypes, form.fuelType, (v) => updateField('fuelType', v))}
      <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Transmission</Text>
      {renderSelector(transmissions, form.transmission, (v) => updateField('transmission', v))}
    </View>
  );

  const renderStep2 = () => (
    <View>
      <TextInput
        label="Current Mileage"
        placeholder="e.g. 15000"
        value={form.mileage}
        onChangeText={(v) => updateField('mileage', v)}
        keyboardType="numeric"
      />
      <TextInput
        label="Purchase Date"
        placeholder="YYYY-MM-DD"
        value={form.purchaseDate}
        onChangeText={(v) => updateField('purchaseDate', v)}
      />
      <TextInput
        label="Insurance Expiry"
        placeholder="YYYY-MM-DD"
        value={form.insuranceExpiry}
        onChangeText={(v) => updateField('insuranceExpiry', v)}
      />
      <TextInput
        label="Registration Expiry"
        placeholder="YYYY-MM-DD"
        value={form.registrationExpiry}
        onChangeText={(v) => updateField('registrationExpiry', v)}
      />
      <Text style={styles.fieldLabel}>Status</Text>
      {renderSelector(statuses, form.status, (v) => updateField('status', v))}
      <TextInput
        label="Notes"
        placeholder="Additional notes..."
        value={form.notes}
        onChangeText={(v) => updateField('notes', v)}
        multiline
        numberOfLines={3}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 22 }} />
        <Text style={styles.headerTitle}>{isEditMode ? 'Edit Vehicle' : 'Add Vehicle'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
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
            title="Back"
            onPress={handleBack}
            variant="secondary"
            size="lg"
            style={{ flex: 1, marginRight: spacing.md }}
          />
        )}
        {step < STEPS.length - 1 ? (
          <Button
            title="Next"
            onPress={handleNext}
            variant="primary"
            size="lg"
            icon={<ChevronRight size={18} color="#FFF" />}
            style={{ flex: 1 }}
          />
        ) : (
          <Button
            title={isEditMode ? 'Save Changes' : 'Add Vehicle'}
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
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  selectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  selectorItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  selectorItemSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectorText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  selectorTextSelected: {
    color: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row',
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
