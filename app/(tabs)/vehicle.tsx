import { View, StyleSheet, Image, Pressable } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { VehicleList } from '@/components/vehicle/VehicleList';
import { colors } from '@/constants/theme';
import { Header } from '@/components/ui/Header';
import { useTranslation } from '@/i18n';
import { useAuthStore } from '@/store/authStore';

export default function VehiclesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { role } = useAuthStore();

  // 司機不能訪問車輛頁面，直接重定向到首頁
  if (role === 'driver') {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={styles.container}>
      <Header
        title={t('nav.vehicles')}
        leftElement={
          <Pressable onPress={() => router.push('/(tabs)')} hitSlop={8}>
            <Image
              source={require('@/assets/onefleet_2560.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </Pressable>
        }
      />
      <VehicleList />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerLogo: {
    width: 90,
    height: 30,
  },
});
