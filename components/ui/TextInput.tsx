import { useState } from 'react';
import {
  TextInput as RNTextInput,
  View,
  Text,
  StyleSheet,
  Pressable,
  ViewStyle,
  TextStyle,
  Platform,
} from 'react-native';
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

const IS_WEB = Platform.OS === 'web';

// Web 用純 CSSProperties（React DOM 會原樣設給 CSSStyleDeclaration）
const webBaseStyle: React.CSSProperties = {
  flex: 1,
  height: 48,
  paddingLeft: 16,
  paddingRight: 16,
  color: colors.textPrimary,
  fontSize: typography.fontSize.base,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontFamily: 'inherit',
};

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

  const isPasswordMasked = secureTextEntry && !showPassword;

  // 密碼欄位尚未顯示時，告訴瀏覽器目前是當前密碼而不是新密碼
  const resolvedAutoComplete =
    autoComplete === 'password'
      ? isPasswordMasked
        ? 'current-password'
        : 'off'
      : autoComplete;

  const nativeInputStyle = [
    styles.input,
    icon ? styles.inputWithIcon : null,
    multiline
      ? { height: numberOfLines * 24 + spacing.lg * 2, textAlignVertical: 'top' as const }
      : null,
    inputStyle,
  ];

  // Web：react-native-web 的 TextInput 內部用白名單 pickProps() 過濾 props，
  // `name` 並不在白名單內，導致瀏覽器的 password manager 抓不到欄位。
  // 所以 Web 直接渲染原生 <input> / <textarea>，讓 name / autocomplete / type 全部精準生效。
  const webInputStyle: React.CSSProperties = {
    ...webBaseStyle,
    ...(icon ? { paddingLeft: 8 } : null),
    ...(typeof inputStyle === 'object' && inputStyle
      ? (inputStyle as unknown as React.CSSProperties)
      : null),
    ...(multiline
      ? {
          height: numberOfLines * 24 + spacing.lg * 2,
          textAlignVertical: 'top',
          paddingTop: spacing.lg,
        }
      : null),
  };

  const webInputType: string = secureTextEntry
    ? isPasswordMasked
      ? 'password'
      : 'text'
    : keyboardType === 'email-address'
    ? 'email'
    : keyboardType === 'url'
    ? 'url'
    : 'text';

  const webInputMode: 'text' | 'email' | 'tel' | 'url' | 'numeric' | undefined =
    keyboardType === 'email-address'
      ? 'email'
      : keyboardType === 'numeric'
      ? 'numeric'
      : keyboardType === 'phone-pad'
      ? 'tel'
      : keyboardType === 'url'
      ? 'url'
      : undefined;

  const renderWebControl = () => {
    const sharedProps = {
      placeholder,
      value: value ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onChangeText(e.target.value),
      onFocus: () => setIsFocused(true),
      onBlur: () => setIsFocused(false),
      disabled: !editable,
      maxLength,
      name,
      autoComplete: resolvedAutoComplete,
      spellCheck: false,
      style: webInputStyle,
      'data-testid': name ? `web-input-${name}` : undefined,
    };

    if (multiline) {
      return (
        <textarea
          {...(sharedProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          rows={numberOfLines || 1}
        />
      );
    }
    return (
      <input
        {...(sharedProps as React.InputHTMLAttributes<HTMLInputElement>)}
        type={webInputType}
        inputMode={webInputMode}
        autoCapitalize={autoCapitalize}
      />
    );
  };

  const renderNativeInput = () => (
    <RNTextInput
      style={nativeInputStyle}
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
      editable={editable}
      multiline={multiline}
      numberOfLines={numberOfLines}
      maxLength={maxLength}
    />
  );

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputWrapper, { borderColor }]}>
        {icon && <View style={styles.iconLeft}>{icon}</View>}
        {IS_WEB ? renderWebControl() : renderNativeInput()}
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