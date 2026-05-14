import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';

interface SocialButtonProps {
  provider: 'Google' | 'Apple';
  onPress: () => void;
}

const providerConfig = {
  Google: {
    icon: 'G',
    bg: '#FFFFFF',
    text: '#1F1F1F',
    border: '#E0E0E0',
  },
  Apple: {
    icon: '',
    bg: '#FFFFFF',
    text: '#1F1F1F',
    border: '#E0E0E0',
  },
};

export function SocialButton({ provider, onPress }: SocialButtonProps) {
  const config = providerConfig[provider];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: config.bg, borderColor: config.border },
        pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={styles.iconContainer}>
        <Text style={[styles.icon, { color: config.text }]}>
          {provider === 'Google' ? (
            <Text style={styles.googleIcon}>
              <Text style={{ fontFamily: 'System' }}>G</Text>
            </Text>
          ) : (
            '  logo apple'
          )}
        </Text>
      </View>
      <Text style={[styles.text, { color: config.text }]}>
        Continue with {provider}
      </Text>
    </Pressable>
  );
}

export function SocialButtons() {
  const handleGoogle = () => {};
  const handleApple = () => {};

  return (
    <View style={styles.container}>
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or continue with</Text>
        <View style={styles.dividerLine} />
      </View>
      <View style={styles.buttons}>
        <SocialButton provider="Google" onPress={handleGoogle} />
        <SocialButton provider="Apple" onPress={handleApple} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing['2xl'],
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
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
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  iconContainer: {
    marginRight: spacing.sm,
  },
  icon: {
    fontSize: 20,
    fontWeight: '700',
  },
  googleIcon: {
    width: 20,
    height: 20,
    textAlign: 'center',
    lineHeight: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  text: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
});
