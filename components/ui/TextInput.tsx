import { useState } from 'react';
import { TextInput as RNTextInput, View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';

interface TextInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: 'email' | 'password' | 'off' | 'name';
  editable?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  icon?: React.ReactNode;
  maxLength?: number;
  style?: ViewStyle;
}

export function TextInput({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  autoComplete = 'off',
  editable = true,
  multiline = false,
  numberOfLines = 1,
  icon,
  maxLength,
}: TextInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const borderColor = error
    ? colors.danger
    : isFocused
    ? colors.primary
    : colors.border;

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputWrapper, { borderColor }]}>
        {icon && <View style={styles.iconLeft}>{icon}</View>}
        <RNTextInput
          style={[
            styles.input,
            icon ? styles.inputWithIcon : null,
            multiline ? { height: numberOfLines * 24 + spacing.lg * 2, textAlignVertical: 'top' } : null,
          ]}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={secureTextEntry && !showPassword}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          editable={editable}
          multiline={multiline}
          numberOfLines={numberOfLines}
          maxLength={maxLength}
        />
        {secureTextEntry && (
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeButton}
          >
            {showPassword ? (
              <EyeOff size={18} color={colors.textSecondary} />
            ) : (
              <Eye size={18} color={colors.textSecondary} />
            )}
          </Pressable>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  iconLeft: {
    paddingLeft: spacing.lg,
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: spacing.lg,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
  },
  inputWithIcon: {
    paddingLeft: spacing.sm,
  },
  eyeButton: {
    paddingRight: spacing.lg,
    paddingLeft: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
    fontWeight: '500',
  },
});
