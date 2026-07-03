import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';

export default function ProfileRedirect() {
  const router = useRouter();
  const role = useAuthStore((state) => state.role);
  const { colors } = useThemeStore();
  const { t } = useTranslation();

  useEffect(() => {
    if (role === 'admin') {
      router.replace('/onefleet-system-admin');
    } else {
      router.replace('/(tabs)/dashboard');
    }
  }, [role]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.text, { color: colors.textSecondary }]}>{t('common.loading')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 14 },
});
