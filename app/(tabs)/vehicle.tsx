import { View, StyleSheet } from 'react-native';
import { VehicleList } from '@/components/vehicle/VehicleList';
import { colors } from '@/constants/theme';
import { Header } from '@/components/ui/Header';
import { useTranslation } from '@/i18n';

export default function VehiclesScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Header title={t('nav.vehicles')} />
      <VehicleList />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
