import { View, TextInput as RNTextInput, StyleSheet, Pressable } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  t?: (key: string) => string;
}

export function SearchBar({ value, onChangeText, placeholder, t }: SearchBarProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconLeft}>
        <Search size={18} color={colors.textSecondary} />
      </View>
      <RNTextInput
        style={styles.input}
        placeholder={placeholder ?? (t ? t('vehicles.searchPlaceholder') : 'Search vehicles...')}
        placeholderTextColor={colors.textTertiary}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChangeText('')}
          style={styles.clearButton}
          hitSlop={8}
        >
          <X size={16} color={colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    overflow: 'hidden',
  },
  iconLeft: {
    paddingLeft: spacing.lg,
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
  },
  clearButton: {
    paddingRight: spacing.lg,
    paddingLeft: spacing.sm,
  },
});
