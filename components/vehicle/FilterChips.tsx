import { ScrollView, Pressable, Text, StyleSheet, View } from 'react-native';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';

const filters = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'inactive', label: 'Inactive' },
];

interface FilterChipsProps {
  selected: string;
  onSelect: (key: string) => void;
}

export function FilterChips({ selected, onSelect }: FilterChipsProps) {
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
