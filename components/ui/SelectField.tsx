import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';

const isWeb = Platform.OS === 'web';

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectFieldProps<T extends string> {
  label?: string;
  placeholder?: string;
  value: T | '';
  options: SelectOption<T>[];
  onValueChange: (value: T) => void;
  error?: string;
  description?: string;
  disabled?: boolean;
}

export function SelectField<T extends string>({
  label,
  placeholder = '請選擇...',
  value,
  options,
  onValueChange,
  error,
  description,
  disabled = false,
}: SelectFieldProps<T>) {
  const [modalVisible, setModalVisible] = useState(false);

  const selectedOption = options.find((o) => o.value === value);

  const borderColor = error
    ? colors.danger
    : modalVisible
    ? colors.primary
    : colors.border;

  // Web: 使用原生 select 元素
  if (isWeb) {
    return (
      <View style={styles.container}>
        {label && <Text style={styles.label}>{label}</Text>}
        <View style={styles.webSelectWrapper}>
          <select
            value={value || ''}
            onChange={(e) => {
              const newValue = (e.target as HTMLSelectElement).value as T;
              onValueChange(newValue);
            }}
            disabled={disabled}
            style={{
              width: '100%',
              height: 48,
              borderRadius: 8,
              borderWidth: 1.5,
              borderColor: error ? colors.danger : colors.border,
              backgroundColor: colors.card,
              color: value ? colors.textPrimary : colors.textTertiary,
              fontSize: 16,
              paddingLeft: 16,
              paddingRight: 40,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              backgroundSize: 18,
              outline: 'none',
            }}
          >
            <option value="" disabled>
              {placeholder}
            </option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        {description && !error && (
          <Text style={styles.description}>{description}</Text>
        )}
      </View>
    );
  }

  // Native Mobile: 使用 Modal
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        onPress={() => !disabled && setModalVisible(true)}
        style={[
          styles.selector,
          { borderColor },
          disabled && styles.selectorDisabled,
        ]}
      >
        <Text
          style={[
            styles.selectorText,
            !selectedOption && styles.placeholderText,
          ]}
          numberOfLines={1}
        >
          {selectedOption?.label || placeholder}
        </Text>
        <ChevronDown
          size={18}
          color={disabled ? colors.textTertiary : colors.textSecondary}
          style={styles.chevron}
        />
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
      {description && !error && (
        <Text style={styles.description}>{description}</Text>
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        {/* Backdrop */}
        <Pressable
          style={styles.backdrop}
          onPress={() => setModalVisible(false)}
        />
        {/* Dropdown - sibling to backdrop, so clicks don't interfere */}
        <View style={styles.dropdownWrapper}>
          <View
            style={[styles.dropdown, { backgroundColor: colors.card }]}
          >
            <View style={[styles.dropdownHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.dropdownTitle, { color: colors.textPrimary }]}>
                {label || '請選擇'}
              </Text>
              <Pressable onPress={() => setModalVisible(false)} hitSlop={8}>
                <Text style={[styles.dropdownClose, { color: colors.primary }]}>
                  取消
                </Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.dropdownScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onValueChange(option.value);
                      setModalVisible(false);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      { borderBottomColor: colors.border },
                      pressed && { backgroundColor: `${colors.primary}10` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        { color: colors.textPrimary },
                        isSelected && { color: colors.primary, fontWeight: '600' },
                      ]}
                    >
                      {option.label}
                    </Text>
                    {isSelected && (
                      <Check size={18} color={colors.primary} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    height: 48,
  },
  selectorDisabled: {
    opacity: 0.5,
  },
  selectorText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    textAlign: 'left',
  },
  placeholderText: {
    color: colors.textTertiary,
  },
  chevron: {
    marginLeft: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
    fontWeight: '500',
  },
  description: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    pointerEvents: 'box-none',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dropdownWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  dropdown: {
    width: '100%',
    maxHeight: '60%',
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  dropdownTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
  },
  dropdownClose: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  dropdownScroll: {
    paddingVertical: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    fontSize: typography.fontSize.base,
  },
});
