import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { Link, useRouter, Redirect } from 'expo-router';
import { Mail, Lock, Shield, Truck } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { SocialButtons } from '@/components/auth/SocialButtons';
import { colors, spacing, typography, borderRadius } from '@/constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading, login, checkAuth } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>FleetPro</Text>
        </View>
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password');
      return;
    }
    setError('');
    setIsSubmitting(true);
    const result = await login(email.trim(), password);
    setIsSubmitting(false);
    if (result.success) {
      router.replace('/(tabs)');
    } else {
      setError(result.error || 'Login failed');
      setPassword('');
    }
  };

  const handleDemoLogin = async () => {
    setEmail('demo@fleetpro.com');
    setPassword('demo123');
    setError('');
    setIsSubmitting(true);
    const result = await login('demo@fleetpro.com', 'demo123');
    setIsSubmitting(false);
    if (result.success) {
      router.replace('/(tabs)');
    }
  };

  const handleAdminLogin = async () => {
    setEmail('admin@fleetpro.com');
    setPassword('admin123');
    setError('');
    setIsSubmitting(true);
    const result = await login('admin@fleetpro.com', 'admin123');
    setIsSubmitting(false);
    if (result.success) {
      router.replace('/(tabs)');
    }
  };

  const handleDriverLogin = async () => {
    setEmail('driver');
    setPassword('driver');
    setError('');
    setIsSubmitting(true);
    const result = await login('driver', 'driver');
    setIsSubmitting(false);
    if (result.success) {
      router.replace('/(tabs)');
    }
  };

  const handleCompanyLogin = async () => {
    setEmail('company');
    setPassword('company');
    setError('');
    setIsSubmitting(true);
    const result = await login('company', 'company');
    setIsSubmitting(false);
    if (result.success) {
      router.replace('/(tabs)');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>FleetPro</Text>
            <View style={styles.logoBadge}>
              <Shield size={12} color={colors.primary} />
            </View>
          </View>
          <Text style={styles.tagline}>Vehicle Fleet Management</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.welcomeTitle}>Welcome back</Text>
          <Text style={styles.welcomeSubtitle}>Sign in to manage your fleet</Text>

          <TextInput
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={(v) => { setEmail(v); setError(''); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            icon={<Mail size={18} color={colors.textSecondary} />}
            error={error && !error.includes('password') ? error : undefined}
          />

          <TextInput
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={(v) => { setPassword(v); setError(''); }}
            secureTextEntry
            autoComplete="password"
            icon={<Lock size={18} color={colors.textSecondary} />}
            error={error && error.includes('password') ? error : undefined}
          />

          <View style={styles.forgotRow}>
            <Pressable>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          </View>

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={isSubmitting}
            fullWidth
            size="lg"
          />

          <SocialButtons />

          <View style={styles.demoSection}>
            <Pressable
              onPress={handleDemoLogin}
              style={({ pressed }) => [
                styles.demoButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.demoButtonText}>Try Demo Account</Text>
            </Pressable>
            <View style={styles.roleButtonsRow}>
              <Pressable
                onPress={handleAdminLogin}
                style={({ pressed }) => [
                  styles.roleButton,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Shield size={14} color={colors.primary} />
                <Text style={styles.roleButtonText}>Admin</Text>
              </Pressable>
              <Pressable
                onPress={handleCompanyLogin}
                style={({ pressed }) => [
                  styles.roleButton,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.roleIconBox, { backgroundColor: colors.secondaryGlow }]}>
                  <Text style={styles.roleIconText}>C</Text>
                </View>
                <Text style={styles.roleButtonText}>Company</Text>
              </Pressable>
              <Pressable
                onPress={handleDriverLogin}
                style={({ pressed }) => [
                  styles.roleButton,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.roleIconBox, { backgroundColor: colors.accentSecondary + '30' }]}>
                  <Truck size={12} color={colors.accentSecondary} />
                </View>
                <Text style={styles.roleButtonText}>Driver</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account?</Text>
          <Link href="/register" asChild>
            <Pressable>
              <Text style={styles.footerLink}> Sign up</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: 80,
    paddingBottom: spacing['3xl'],
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  logoText: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  logoBadge: {
    marginLeft: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  form: {
    marginBottom: spacing['2xl'],
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
  forgotRow: {
    alignItems: 'flex-end',
    marginBottom: spacing['2xl'],
    marginTop: -spacing.sm,
  },
  forgotText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  demoSection: {
    marginTop: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.md,
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
  adminButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  adminButtonText: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    fontWeight: '500',
    textDecorationLine: 'underline',
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  footerText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  footerLink: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
});
