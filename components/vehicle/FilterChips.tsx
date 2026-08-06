import { View, Pressable, Text, StyleSheet } from 'react-native';
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
    <View style={styles.container}>
      {filters.map((f) => {
        const isSelected = selected === f.key;
        return (
          <Pressable
            key={f.key}
            onPress={() => onSelect(f.key)}
            style={[
              styles.tab,
              isSelected && styles.tabSelected,
              f.key === 'all' && styles.tabFirst,
              f.key === 'inactive' && styles.tabLast,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                isSelected && styles.tabTextSelected,
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const SELECTED_BG = 'rgb(37, 99, 235)';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
  },
  tabFirst: {
    borderTopLeftRadius: borderRadius.sm,
    borderBottomLeftRadius: borderRadius.sm,
  },
  tabLast: {
    borderTopRightRadius: borderRadius.sm,
    borderBottomRightRadius: borderRadius.sm,
  },
  tabSelected: {
    backgroundColor: SELECTED_BG,
    shadowColor: SELECTED_BG,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextSelected: {
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
