import { View, StyleSheet, Image, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { VehicleList } from '@/components/vehicle/VehicleList';
import { colors } from '@/constants/theme';
import { Header } from '@/components/ui/Header';
import { useTranslation } from '@/i18n';

export default function VehiclesScreen() {
  const { t } = useTranslation();
  const router = useRouter();

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
