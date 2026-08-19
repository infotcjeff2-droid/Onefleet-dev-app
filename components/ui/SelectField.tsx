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
    flex: 1,
  },
  dropdownWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    pointerEvents: 'box-none',
  },
  dropdown: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
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
