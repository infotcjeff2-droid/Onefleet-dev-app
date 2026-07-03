import 'react-native-reanimated';
import 'react-native-gesture-handler';
import '@/global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useVehicleStore } from '@/store/vehicleStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import { useAuthStore } from '@/store/authStore';
import { useGps808Store } from '@/store/gps808Store';
import { useGoogleMapsStore } from '@/store/googleMapsStore';
import { I18nProvider, useTranslation } from '@/i18n';
import { FontScaleProvider } from '@/contexts/FontScaleContext';
import { useEffect } from 'react';

function AppContent() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const authLoading = useAuthStore((s) => s.isLoading);
  const loadUsers = useUserManagementStore((s) => s.loadUsers);
  const syncUsers = useUserManagementStore((s) => s.syncUsers);
  const loadVehicles = useVehicleStore((s) => s.loadVehicles);
  const syncVehicles = useVehicleStore((s) => s.syncVehicles);
  const loadDeliveries = useDeliveryStore((s) => s.loadDeliveries);
  const syncDeliveries = useDeliveryStore((s) => s.syncDeliveries);
  const loadGpsConfig = useGps808Store((s) => s.loadConfig);
  const loadGoogleMapsConfig = useGoogleMapsStore((s) => s.loadConfig);
  const { isInitialized } = useTranslation();

  useEffect(() => {
    checkAuth();
    loadUsers().then(() => syncUsers());
    loadVehicles().then(() => syncVehicles());
    loadDeliveries().then(() => syncDeliveries());
    loadGpsConfig();
    loadGoogleMapsConfig();
  }, []);

  if (!isInitialized || authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }} />
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen
            name="vehicle/add"
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="vehicle/[id]" />
          <Stack.Screen name="delivery/[id]" />
          <Stack.Screen name="onefleet-system-admin/config" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="+not-found" />
        </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <I18nProvider>
          <FontScaleProvider>
            <AppContent />
          </FontScaleProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
