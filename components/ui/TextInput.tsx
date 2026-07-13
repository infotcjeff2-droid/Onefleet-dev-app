import { useState } from 'react';
import { TextInput as RNTextInput, View, Text, StyleSheet, Pressable, ViewStyle, TextStyle } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';

interface TextInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  description?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'url';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /**
   * HTML `autocomplete` token.
   * - `username` / `current-password` / `new-password` → 讓瀏覽器（手機 Chrome/Safari）的密碼管理員能正確辨識
   * - `email` / `name` / `off` 等亦可
   */
  autoComplete?: 'email' | 'password' | 'username' | 'current-password' | 'new-password' | 'name' | 'url' | 'off';
  /** Web 專用：HTML `name` 屬性，與 autoComplete 配合後，瀏覽器才會把這組輸入視為可記憶的登入欄位 */
  name?: string;
  /** iOS / Android 原生專用：用 Strongbox / Keychain 提示用 */
  textContentType?: 'none' | 'URL' | 'emailAddress' | 'username' | 'password' | 'newPassword' | 'name';
  editable?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  icon?: React.ReactNode;
  maxLength?: number;
  inputStyle?: TextStyle;
  style?: ViewStyle;
}

export function TextInput({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  description,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  autoComplete = 'off',
  name,
  textContentType,
  editable = true,
  multiline = false,
  numberOfLines = 1,
  icon,
  maxLength,
  inputStyle,
}: TextInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const borderColor = error
    ? colors.danger
    : isFocused
    ? colors.primary
    : colors.border;

  // 密碼欄位尚未顯示時，告訴瀏覽器目前是當前密碼而不是新密碼
  const resolvedAutoComplete =
    autoComplete === 'password'
      ? secureTextEntry && !showPassword
        ? 'current-password'
        : 'off'
      : autoComplete;

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
            inputStyle,
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
          autoComplete={resolvedAutoComplete as any}
          textContentType={textContentType as any}
          // @ts-expect-error - Web 專用屬性（react-native-web 會轉成 name="..."）
          name={name}
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
      {description && !error && <Text style={styles.description}>{description}</Text>}
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
  description: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
});
