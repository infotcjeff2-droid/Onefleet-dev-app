import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, LayoutChangeEvent, Alert } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Mail, Lock, User, ArrowLeft } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { useTranslation } from '@/i18n';
import { useUserManagementStore } from '@/store/userManagementStore';
import { colors, spacing, typography, borderRadius } from '@/constants/theme';

const isWeb = Platform.OS === 'web';

const GRADIENT_COLORS = [
  '#ff6b6b',
  '#feca57',
  '#48dbfb',
  '#ff9ff3',
  '#54a0ff',
  '#5f27cd',
  '#ff6b6b',
] as const;

const BORDER_WIDTH = 3;
const ANIMATION_DURATION = 3000;

function AnimatedGradientBorder({ children, borderWidth = BORDER_WIDTH, style }: { children: React.ReactNode; borderWidth?: number; style?: object }) {
  const [formSize, setFormSize] = useState({ width: 320, height: 600 });
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const translateX2 = useSharedValue(0);
  const translateY2 = useSharedValue(0);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(1, { duration: ANIMATION_DURATION, easing: Easing.linear }),
      -1,
      false
    );
    translateY.value = withRepeat(
      withTiming(1, { duration: ANIMATION_DURATION * 1.5, easing: Easing.linear }),
      -1,
      false
    );
    translateX2.value = withRepeat(
      withTiming(1, { duration: ANIMATION_DURATION * 1.2, easing: Easing.linear }),
      -1,
      false
    );
    translateY2.value = withRepeat(
      withTiming(1, { duration: ANIMATION_DURATION * 0.8, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setFormSize({ width, height });
    }
  };

  const gradientStyle = useAnimatedStyle(() => {
    const offsetX = interpolate(translateX.value, [0, 1], [0, formSize.width]);
    const offsetY = interpolate(translateY.value, [0, 1], [0, formSize.height]);
    return {
      transform: [
        { translateX: -offsetX },
        { translateY: -offsetY },
      ],
    };
  });

  const gradientStyle2 = useAnimatedStyle(() => {
    const offsetX = interpolate(translateX2.value, [0, 1], [0, -formSize.width]);
    const offsetY = interpolate(translateY2.value, [0, 1], [0, -formSize.height]);
    return {
      transform: [
        { translateX: offsetX },
        { translateY: offsetY },
      ],
      opacity: 0.6,
    };
  });

  const totalSize = Math.sqrt(formSize.width * formSize.width + formSize.height * formSize.height) * 2;

  return (
    <View style={[styles.gradientBorderOuter, style]} onLayout={handleLayout}>
      <Animated.View style={[styles.gradientBorderBg, gradientStyle, { width: totalSize, height: totalSize }]}>
        <LinearGradient
          colors={[...GRADIENT_COLORS]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { width: totalSize, height: totalSize }]}
        />
      </Animated.View>
      <Animated.View style={[styles.gradientBorderBg2, gradientStyle2, { width: totalSize, height: totalSize }]}>
        <LinearGradient
          colors={[...GRADIENT_COLORS].reverse()}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { width: totalSize, height: totalSize }]}
        />
      </Animated.View>
      <View
        style={[
          styles.gradientBorderContent,
          {
            margin: borderWidth,
            borderRadius: borderRadius.xl,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export default function RegisterScreen() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const addUser = useUserManagementStore((s) => s.addUser);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const getPasswordStrength = (pwd: string) => {
    if (pwd.length === 0) return null;
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 1) return { label: t('auth.weak'), color: colors.danger, pct: 25 };
    if (score === 2) return { label: t('auth.fair'), color: colors.warning, pct: 50 };
    if (score === 3) return { label: t('auth.good'), color: colors.secondary, pct: 75 };
    return { label: t('auth.strong'), color: colors.success, pct: 100 };
  };

  const strength = getPasswordStrength(password);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = t('error.nameRequired');
    if (!email.trim()) newErrors.email = t('error.emailRequired');
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = t('error.invalidEmailFormat');
    if (!password) newErrors.password = t('error.passwordRequired');
    else if (password.length < 6) newErrors.password = t('error.passwordMinLength');
    if (password !== confirmPassword) newErrors.confirmPassword = t('error.passwordsDoNotMatch');
    if (!agreeTerms) newErrors.terms = t('error.termsRequired');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    const result = await addUser(name, email, password, 'driver');
    setIsSubmitting(false);
    if (result.success) {
      if (isWeb) {
        window.alert('✅ 註冊成功！即將跳轉至登入頁面。');
        router.replace('/(auth)/login');
      } else {
        Alert.alert(
          t('common.success'),
          locale === 'zh-TW' ? '✅ 註冊成功！即將跳轉至登入頁面。' : '✅ Registration successful! Redirecting to login.',
          [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
        );
      }
    } else {
      const errKey = result.error?.includes('already') ? 'error.emailAlreadyExists' : 'error.unknownError';
      setErrors((e) => ({ ...e, email: t(errKey) }));
      if (isWeb) {
        window.alert(`❌ 註冊失敗\n\n${result.error || '未知錯誤'}\n\n請稍後再試。`);
      } else {
        Alert.alert(
          locale === 'zh-TW' ? '❌ 註冊失敗' : '❌ Registration Failed',
          locale === 'zh-TW' ? `${result.error || t('error.unknownError')}` : `${result.error || 'An unknown error occurred'}`
        );
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(auth)/login')} style={styles.backButton}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.topBarTitle}>{t('auth.signUpTab')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AnimatedGradientBorder style={styles.formBorderWrapper}>
          <Text style={styles.title}>{t('auth.welcomeSignUp')}</Text>
          <Text style={styles.subtitle}>{t('auth.welcomeSignUpSub')}</Text>

          <TextInput
            label={t('auth.fullName')}
            placeholder={t('auth.namePlaceholder')}
            value={name}
            onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: '' })); }}
            error={errors.name}
            autoCapitalize="words"
            icon={<User size={18} color={colors.textSecondary} />}
          />

          <TextInput
            label={t('auth.email')}
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChangeText={(v) => { setEmail(v); setErrors((e) => ({ ...e, email: '' })); }}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            icon={<Mail size={18} color={colors.textSecondary} />}
          />

          <TextInput
            label={t('auth.password')}
            placeholder={t('auth.passwordPlaceholder')}
            value={password}
            onChangeText={(v) => { setPassword(v); setErrors((e) => ({ ...e, password: '' })); }}
            error={errors.password}
            secureTextEntry
            autoComplete="password"
            icon={<Lock size={18} color={colors.textSecondary} />}
          />

          {strength && (
            <View style={styles.strengthContainer}>
              <View style={styles.strengthBar}>
                <View
                  style={[
                    styles.strengthFill,
                    { width: strength.pct, backgroundColor: strength.color },
                  ]}
                />
              </View>
              <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
            </View>
          )}

          <TextInput
            label={t('auth.confirmPassword')}
            placeholder={t('auth.confirmPasswordPlaceholder')}
            value={confirmPassword}
            onChangeText={(v) => { setConfirmPassword(v); setErrors((e) => ({ ...e, confirmPassword: '' })); }}
            error={errors.confirmPassword}
            secureTextEntry
            autoComplete="password"
            icon={<Lock size={18} color={colors.textSecondary} />}
          />

          <Pressable style={styles.termsRow} onPress={() => setAgreeTerms(!agreeTerms)}>
            <View style={[styles.checkbox, agreeTerms && styles.checkboxChecked]}>
              {agreeTerms && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              {t('auth.termsText')}{' '}
              <Text style={styles.termsLink}>{t('auth.termsLink')}</Text>{' '}
              and{' '}
              <Text style={styles.termsLink}>{t('auth.privacyPolicy')}</Text>
            </Text>
          </Pressable>
          {errors.terms && <Text style={styles.termsError}>{errors.terms}</Text>}

          <Button
            title={t('auth.signUp')}
            onPress={handleRegister}
            loading={isSubmitting}
            fullWidth
            size="lg"
          />

          <View style={styles.bottomLink}>
            <Text style={styles.bottomLinkText}>{t('auth.alreadyHaveAccount')} </Text>
            <Link href="/login" asChild>
              <Pressable>
                <Text style={styles.bottomLinkAction}>{t('auth.signInLink')}</Text>
              </Pressable>
            </Link>
          </View>
        </AnimatedGradientBorder>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  topBarTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing['3xl'],
  },
  formBorderWrapper: {
    marginBottom: spacing['2xl'],
  },
  gradientBorderOuter: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: borderRadius.xl,
  },
  gradientBorderBg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  gradientBorderBg2: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  gradientBorderContent: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing['2xl'],
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    paddingTop: spacing['2xl'],
  },
  subtitle: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    marginBottom: spacing['2xl'],
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    backgroundColor: colors.surface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.md,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  termsText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  termsLink: {
    color: '#2563eb',
    fontWeight: '600',
  },
  termsError: {
    fontSize: typography.fontSize.xs,
    color: colors.danger,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  bottomLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  bottomLinkText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  bottomLinkAction: {
    fontSize: typography.fontSize.sm,
    color: '#2563eb',
    fontWeight: '600',
  },
});
