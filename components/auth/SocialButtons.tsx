import { View, Text, StyleSheet, Pressable, Platform, Alert } from 'react-native';
import { Globe, CodeXml } from 'lucide-react-native';
import { useSSO, useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import { useCallback, useEffect, useState } from 'react';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

const isWeb = Platform.OS === 'web';

interface SocialButtonProps {
  provider: 'Google' | 'Github';
  onPress: () => void;
  disabled?: boolean;
}

export function SocialButton({ provider, onPress, disabled }: SocialButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
        disabled && { opacity: 0.5 },
      ]}
    >
      {provider === 'Google' ? (
        <Globe size={20} color={colors.textPrimary} />
      ) : (
        <CodeXml size={20} color={colors.textPrimary} />
      )}
      <Text style={styles.text}>
        Continue with {provider === 'Google' ? 'Google' : 'Github'}
      </Text>
    </Pressable>
  );
}

type Strategy = 'oauth_google' | 'oauth_github';

// 巢狀 SocialButton 元件（需要 Clerk）
function ClerkSocialButton({ provider, onPress, disabled }: SocialButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
        disabled && { opacity: 0.5 },
      ]}
    >
      {provider === 'Google' ? (
        <Globe size={20} color={colors.textPrimary} />
      ) : (
        <CodeXml size={20} color={colors.textPrimary} />
      )}
      <Text style={styles.text}>
        Continue with {provider === 'Google' ? 'Google' : 'Github'}
      </Text>
    </Pressable>
  );
}

export function SocialButtons() {
  const router = useRouter();
  const { setUser, setIsAuthenticated, setRole, isLoggingOut } = useAuthStore();

  // Web 環境下 ClerkProvider 未初始化，直接返回空（或顯示提示）
  if (isWeb) {
    return null;
  }

  const { user, isLoaded } = useUser();
  const { startSSOFlow } = useSSO();

  useEffect(() => {
    if (isLoggingOut) return;
    if (isLoaded && user) {
      const clerkUser = {
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress || '',
        name: user.fullName || user.firstName || 'User',
        role: 'user' as const,
        avatar: user.imageUrl,
      };
      setUser(clerkUser);
      setIsAuthenticated(true);
      setRole('user');
      router.replace('/(tabs)');
    }
  }, [user, isLoaded, setUser, setIsAuthenticated, setRole, router, isLoggingOut]);

  const runOAuth = useCallback(
    async (strategy: Strategy) => {
      try {
        const origin =
          typeof window !== 'undefined' ? window.location.origin : '';

        const redirectUrl =
          Platform.OS === 'web'
            ? `${origin}/sso-callback`
            : AuthSession.makeRedirectUri({
                scheme: 'fleetpro',
                path: 'sso-callback',
              });

        const { createdSessionId, setActive, authSession } = await startSSOFlow({
          strategy,
          redirectUrl,
        });

        if (createdSessionId && setActive) {
          await setActive({ session: createdSessionId });
          return;
        }

        if (authSession?.type === 'web' && authSession.url) {
          const { openAuthSessionAsync } = await import('expo-web-browser');
          await openAuthSessionAsync(authSession.url, redirectUrl);
        }
      } catch (err: any) {
        const message =
          err?.errors?.[0]?.message || err?.message || 'OAuth flow failed.';
        console.error(`[OAuth] ${strategy} error:`, err);
        if (Platform.OS !== 'web') {
          Alert.alert('Sign-in failed', message);
        }
      }
    },
    [startSSOFlow]
  );

  const handleGoogle = () => {
    void runOAuth('oauth_google');
  };

  const handleGithub = () => {
    void runOAuth('oauth_github');
  };

  return (
    <View style={styles.container}>
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>
      <ClerkSocialButton provider="Google" onPress={handleGoogle} />
      <View style={styles.buttonSpacer} />
      <ClerkSocialButton provider="Github" onPress={handleGithub} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: typography.fontSize.sm,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  buttonSpacer: {
    height: spacing.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  text: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginLeft: spacing.md,
  },
});