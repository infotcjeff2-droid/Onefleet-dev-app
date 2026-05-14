import { View, StyleSheet } from 'react-native';
import { VehicleList } from '@/components/vehicle/VehicleList';
import { colors } from '@/constants/theme';
import { Header } from '@/components/ui/Header';

export default function VehiclesScreen() {
  return (
    <View style={styles.container}>
      <Header title="FleetPro" />
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
