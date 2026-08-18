import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, Image, LayoutChangeEvent, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter, Redirect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import { Mail, Lock } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { SocialButtons } from '@/components/auth/SocialButtons';
import { LoginBackground } from '@/components/ui/LoginBackground';
import { colors, spacing, typography, borderRadius } from '@/constants/theme';
import { useTranslation } from '@/i18n';

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

interface AnimatedGradientBorderProps {
  children: React.ReactNode;
  borderWidth?: number;
  style?: object;
}

function AnimatedGradientBorder({ children, borderWidth = BORDER_WIDTH, style }: AnimatedGradientBorderProps) {
  const [formSize, setFormSize] = useState({ width: 320, height: 500 });
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const translateX2 = useSharedValue(0);
  const translateY2 = useSharedValue(0);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(1, { duration: ANIMATION_DURATION, easing: Easing.linear }),
      -1,
      true
    );
    translateY.value = withRepeat(
      withTiming(1, { duration: ANIMATION_DURATION, easing: Easing.linear }),
      -1,
      true
    );
    translateX2.value = withRepeat(
      withTiming(1, { duration: ANIMATION_DURATION, easing: Easing.linear }),
      -1,
      true
    );
    translateY2.value = withRepeat(
      withTiming(1, { duration: ANIMATION_DURATION, easing: Easing.linear }),
      -1,
      true
    );
  }, []);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setFormSize({ width, height });
    }
  }, []);

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

type AuthTab = 'signin' | 'signup';

const REMEMBER_ME_KEY = 'remembered_credentials';

function getRememberedCredentials(): { email: string; password: string } | null {
  if (!isWeb) return null;
  try {
    const stored = localStorage.getItem(REMEMBER_ME_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch { /* ignore */ }
  return null;
}

function saveRememberedCredentials(email: string, password: string) {
  if (!isWeb) return;
  try {
    localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({ email, password }));
  } catch { /* ignore */ }
}

function clearRememberedCredentials() {
  if (!isWeb) return;
  try {
    localStorage.removeItem(REMEMBER_ME_KEY);
  } catch { /* ignore */ }
}

function DevelopmentPopup({ visible, message, onHide }: { visible: boolean; message: string; onHide: () => void }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withSequence(
        withTiming(1, { duration: 300 }),
        withTiming(1, { duration: 1500 }),
        withTiming(0, { duration: 300 }, () => {
          runOnJS(onHide)();
        })
      );
    } else {
      opacity.value = 0;
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!visible && opacity.value === 0) return null;

  return (
    <Animated.View style={[styles.developmentPopup, animatedStyle]}>
      <View style={styles.developmentPopupContent}>
        <Text style={styles.developmentPopupIcon}>🚧</Text>
        <Text style={styles.developmentPopupText}>{message}</Text>
      </View>
    </Animated.View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isAuthenticated, isLoading, login, checkAuth } = useAuthStore();
  const loadUsers = useUserManagementStore((s) => s.loadUsers);

  const [activeTab, setActiveTab] = useState<AuthTab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showDevPopup, setShowDevPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');

  useEffect(() => {
    loadUsers();
    checkAuth();
    const remembered = getRememberedCredentials();
    if (remembered) {
      setEmail(remembered.email);
      setPassword(remembered.password);
      setRememberMe(true);
    }
  }, []);

  const showDevelopmentPopup = (message: string) => {
    setPopupMessage(message);
    setShowDevPopup(true);
  };

  if (isLoading) {
    return (
      <LoginBackground>
        <View style={styles.loadingContainer}>
          <View style={styles.logoContainer}>
            <Image
              source={require('@/assets/onefleet_2560.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        </View>
      </LoginBackground>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError(t('auth.enterEmailPassword'));
      return;
    }
    setError('');
    setIsSubmitting(true);
    const result = await login(email.trim(), password);
    setIsSubmitting(false);
    if (result.success) {
      if (rememberMe) {
        saveRememberedCredentials(email.trim(), password);
      } else {
        clearRememberedCredentials();
      }
      router.replace('/(tabs)');
    } else {
      setError(result.error || t('auth.loginFailed'));
      setPassword('');
      if (isWeb) {
        window.alert(`❌ 登入失敗\n\n${result.error || t('auth.loginFailed')}\n\n請檢查您的電子郵件和密碼後再試一次。`);
      } else {
        Alert.alert(
          locale === 'zh-TW' ? '❌ 登入失敗' : '❌ Login Failed',
          result.error || t('auth.loginFailed')
        );
      }
    }
  };

  const handleNavigateToSignup = () => {
    showDevelopmentPopup(locale === 'zh-TW' ? '註冊功能開發中' : 'Registration under development');
  };

  const handleNavigateToSignin = () => {
    setActiveTab('signin');
  };

  const handleNavigateToSignupTab = () => {
    setActiveTab('signup');
  };

  const handleForgotPassword = () => {
    showDevelopmentPopup(locale === 'zh-TW' ? '忘記密碼功能開發中' : 'Forgot password feature under development');
  };

  const handleDismissDevelopmentPopup = () => {
    setShowDevPopup(false);
  };

  const isSignupTab = activeTab === 'signup';

  return (
    <LoginBackground>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image
              source={require('@/assets/onefleet_2560.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        </View>

        <AnimatedGradientBorder style={styles.formBorderWrapper}>
          {/* Tab Switcher */}
          <View style={styles.tabContainer}>
            <Pressable
              style={[styles.tab, activeTab === 'signin' && styles.tabActive]}
              onPress={handleNavigateToSignin}
            >
              <Text style={[styles.tabText, activeTab === 'signin' && styles.tabTextActive]}>
                {t('auth.signInTab')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, activeTab === 'signup' && styles.tabActive]}
              onPress={handleNavigateToSignupTab}
            >
              <Text style={[styles.tabText, activeTab === 'signup' && styles.tabTextActive]}>
                {t('auth.signUpTab')}
              </Text>
            </Pressable>
          </View>

          {activeTab === 'signin' ? (
            <>
              <Text style={styles.welcomeTitle}>{t('auth.welcomeSignIn')}</Text>
              <Text style={styles.welcomeSubtitle}>{t('auth.welcomeSignInSub')}</Text>
            </>
          ) : (
            <>
              <Text style={styles.welcomeTitle}>{t('auth.welcomeSignUp')}</Text>
              <Text style={styles.welcomeSubtitle}>{t('auth.welcomeSignUpSub')}</Text>
            </>
          )}

          <View style={isSignupTab ? styles.formWithOverlay : undefined}>
            <TextInput
              label={t('auth.email')}
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChangeText={(v) => { setEmail(v); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="username"
              textContentType="username"
              name="email"
              icon={<Mail size={18} color={colors.textSecondary} />}
              error={error && !error.includes(t('auth.password')) ? error : undefined}
            />

            <TextInput
              label={t('auth.password')}
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChangeText={(v) => { setPassword(v); setError(''); }}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              name="password"
              icon={<Lock size={18} color={colors.textSecondary} />}
              error={error && error.includes(t('auth.password')) ? error : undefined}
            />

            {activeTab === 'signin' && (
              <View style={styles.rememberRow}>
                <Pressable style={styles.rememberMeContainer} onPress={() => setRememberMe(!rememberMe)}>
                  <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                    {rememberMe && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.rememberText}>{t('auth.rememberMe')}</Text>
                </Pressable>
                <Pressable onPress={handleForgotPassword}>
                  <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
                </Pressable>
              </View>
            )}

            <Button
              title={activeTab === 'signin' ? t('auth.signIn') : t('auth.signUp')}
              onPress={activeTab === 'signin' ? handleLogin : handleNavigateToSignup}
              loading={isSubmitting}
              fullWidth
              size="login"
            />

            <SocialButtons />

            {activeTab === 'signin' && (
              <View style={styles.bottomLink}>
                <Text style={styles.bottomLinkText}>{t('auth.needAccount')} </Text>
                <Pressable onPress={handleNavigateToSignupTab}>
                  <Text style={styles.bottomLinkAction}>{t('auth.haveAccountLink')}</Text>
                </Pressable>
              </View>
            )}

            {activeTab === 'signup' && (
              <View style={styles.bottomLink}>
                <Text style={styles.bottomLinkText}>{t('auth.alreadyHaveAccount')} </Text>
                <Pressable onPress={handleNavigateToSignin}>
                  <Text style={styles.bottomLinkAction}>{t('auth.signInLink')}</Text>
                </Pressable>
              </View>
            )}

            {/* Development Overlay for Signup Tab */}
            {isSignupTab && (
              <View style={styles.overlayContainer} pointerEvents="box-none">
                <View style={styles.overlay} />
                <View style={styles.overlayContent}>
                  <Text style={styles.overlayIcon}>🚧</Text>
                  <Text style={styles.overlayText}>
                    {locale === 'zh-TW' ? '開發中' : 'Under Development'}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </AnimatedGradientBorder>

      </ScrollView>

      {/* Development Popup */}
      <DevelopmentPopup
        visible={showDevPopup}
        message={popupMessage}
        onHide={handleDismissDevelopmentPopup}
      />
      </KeyboardAvoidingView>
    </LoginBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: 80,
    paddingBottom: spacing['4xl'],
    minHeight: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  logoImage: {
    width: 300,
    height: 100,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 4,
    marginBottom: spacing.xl,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 13,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#2563eb',
  },
  tabText: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: '#FFFFFF',
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
    paddingTop: spacing.xl,
    paddingBottom: spacing['2xl'],
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
  },
  welcomeTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  welcomeSubtitle: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    marginBottom: spacing['2xl'],
  },
  rememberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: -spacing.xs,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.sm,
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
  rememberText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  forgotText: {
    fontSize: typography.fontSize.sm,
    color: '#2563eb',
    fontWeight: '600',
  },
  bottomLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
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
  demoSection: {
    marginTop: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  demoButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  demoButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  roleButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  roleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  roleButtonText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  roleIconBox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleIconText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondary,
  },
  // Development Popup styles
  developmentPopup: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -100 }, { translateY: -50 }],
    width: 200,
    zIndex: 1000,
  },
  developmentPopupContent: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  developmentPopupIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  developmentPopupText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.base,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Form with overlay wrapper
  formWithOverlay: {
    position: 'relative',
  },
  // Overlay styles for signup tab
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: borderRadius.md,
  },
  overlayContent: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  overlayIcon: {
    fontSize: 40,
    marginBottom: spacing.md,
  },
  overlayText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
  },
});
