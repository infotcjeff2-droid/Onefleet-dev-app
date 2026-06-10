import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';

interface FilterChipsProps {
  selected: string;
  onSelect: (key: string) => void;
  t?: (key: string) => string;
}

export function FilterChips({ selected, onSelect, t }: FilterChipsProps) {
  const filters = [
    { key: 'all', label: t ? t('vehicles.all') : 'All' },
    { key: 'active', label: t ? t('vehicles.active') : 'Active' },
    { key: 'maintenance', label: t ? t('vehicles.maintenance') : 'Maintenance' },
    { key: 'inactive', label: t ? t('vehicles.inactive') : 'Inactive' },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {filters.map((f) => {
        const isSelected = selected === f.key;
        return (
          <Pressable
            key={f.key}
            onPress={() => onSelect(f.key)}
            style={[
              styles.chip,
              isSelected && styles.chipSelected,
            ]}
          >
            <Text
              style={[
                styles.chipText,
                isSelected && styles.chipTextSelected,
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
});
