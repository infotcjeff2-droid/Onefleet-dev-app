import { View, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { AddVehicleForm } from '@/components/vehicle/AddVehicleForm';
import { colors } from '@/constants/theme';

export default function AddVehicleScreen() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      <AddVehicleForm editId={edit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
