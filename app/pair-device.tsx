import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
  Modal,
  TextInput as RNTextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  X,
  Wifi,
  WifiOff,
  Search,
  RefreshCw,
  CheckCircle2,
  Circle,
  Truck,
  Link2,
  Unlink,
  ChevronRight,
} from 'lucide-react-native';
import { useVehicleStore } from '@/store/vehicleStore';
import { useGps808Store } from '@/store/gps808Store';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { spacing, typography, borderRadius } from '@/constants/theme';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { gps808Api, Gps808Vehicle } from '@/utils/gps808Api';
import { Vehicle } from '@/types';

export default function PairDeviceScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const { vehicles, loadVehicles, updateVehicle } = useVehicleStore();
  const { isConnected, config } = useGps808Store();

  const [devices, setDevices] = useState<Gps808Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [pairModalVisible, setPairModalVisible] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Gps808Vehicle | null>(null);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await gps808Api.queryVehicleList(1, 200);
      if (res.result === 0 && res.infos) {
        setDevices(res.infos);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVehicles();
    loadDevices();
  }, [loadVehicles, loadDevices]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDevices();
    setRefreshing(false);
  };

  const filteredDevices = devices.filter((d) =>
    !deviceSearch ||
    d.devIdno?.toLowerCase().includes(deviceSearch.toLowerCase()) ||
    d.vehiIdno?.toLowerCase().includes(deviceSearch.toLowerCase()),
  );

  const unpairedVehicles = vehicles.filter((v) => !v.devIdno);
  const filteredVehicles = unpairedVehicles.filter(
    (v) =>
      !vehicleSearch ||
      v.plateNumber.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
      v.make.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
      v.model.toLowerCase().includes(vehicleSearch.toLowerCase()),
  );

  const pairedVehicles = vehicles.filter((v) => v.devIdno);

  const handlePair = (device: Gps808Vehicle, vehicle: Vehicle) => {
    if (!device.devIdno) return;
    Alert.alert(
      t('pair.title'),
      `${t('pair.deviceId')}: ${device.devIdno}\n${t('pair.vehiclePlate')}: ${vehicle.plateNumber}`,
      [
        { text: t('common.cancel'), style: 'cancel' as const },
        {
          text: t('pair.paired'),
          onPress: async () => {
            await updateVehicle(vehicle.id, { devIdno: device.devIdno });
            setPairModalVisible(false);
            setSelectedDevice(null);
            Alert.alert(t('common.success'), t('pair.pairSuccess'));
            await loadVehicles();
            await loadDevices();
          },
        },
      ],
    );
  };

  const handleUnpair = (vehicle: Vehicle) => {
    Alert.alert(t('pair.title'), t('pair.unpairConfirm'), [
      { text: t('common.cancel'), style: 'cancel' as const },
      {
        text: t('pair.unpaired'),
        style: 'destructive' as const,
        onPress: async () => {
          await updateVehicle(vehicle.id, { devIdno: '' });
          Alert.alert(t('common.success'), t('pair.unpairSuccess'));
          await loadVehicles();
        },
      },
    ]);
  };

  const inputWrapStyle = { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary };

  if (!isConnected) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header
          title={t('pair.title')}
          showBack
          leftElement={
            <Image
              source={require('@/assets/onefleet_2560.png')}
              style={{ width: 90, height: 30 }}
              resizeMode="contain"
            />
          }
        />
        <View style={styles.notConnected}>
          <WifiOff size={48} color={colors.textTertiary} />
          <Text style={[styles.notConnectedTitle, { color: colors.textSecondary }]}>
            808GPS {t('pair.offline')}
          </Text>
          <Text style={[styles.notConnectedHint, { color: colors.textTertiary }]}>
            {t('pair.noDevicesHint')}
          </Text>
          <Button
            title={t('nav.config')}
            onPress={() => router.push('/config')}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={t('pair.title')}
        showBack
        leftElement={
          <Image
            source={require('@/assets/onefleet_2560.png')}
            style={{ width: 90, height: 30 }}
            resizeMode="contain"
          />
        }
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentPadding}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Animated.View entering={FadeInDown.springify()}>
          <View style={[styles.infoCard, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}>
            <View style={styles.infoRow}>
              <Wifi size={14} color={colors.primary} />
              <Text style={[styles.infoText, { color: colors.primary }]}>
                {t('pair.deviceOnline')} · {config.account}
              </Text>
            </View>
            <Text style={[styles.infoSubText, { color: colors.primary }]}>
              {t('pair.titleDesc')}
            </Text>
          </View>
        </Animated.View>

        {/* Paired Vehicles */}
        {pairedVehicles.length > 0 && (
          <Animated.View entering={FadeInDown.springify().delay(100)}>
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                {t('pair.paired')} ({pairedVehicles.length})
              </Text>
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                {pairedVehicles.map((vehicle, index) => (
                  <View key={vehicle.id}>
                    <View style={styles.pairedRow}>
                      <View style={styles.pairedLeft}>
                        <View style={[styles.pairedIcon, { backgroundColor: `${colors.primary}20` }]}>
                          <Truck size={16} color={colors.primary} />
                        </View>
                        <View style={styles.pairedInfo}>
                          <Text style={[styles.pairedPlate, { color: colors.textPrimary }]}>
                            {vehicle.plateNumber}
                          </Text>
                          <Text style={[styles.pairedModel, { color: colors.textTertiary }]}>
                            {vehicle.make} {vehicle.model}
                          </Text>
                          <View style={[styles.devBadge, { backgroundColor: `${colors.primary}15` }]}>
                            <Link2 size={10} color={colors.primary} />
                            <Text style={[styles.devBadgeText, { color: colors.primary }]}>
                              {vehicle.devIdno}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <TouchableOpacity onPress={() => handleUnpair(vehicle)} style={styles.unpairBtn}>
                        <Unlink size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                    {index < pairedVehicles.length - 1 && (
                      <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    )}
                  </View>
                ))}
              </View>
            </View>
          </Animated.View>
        )}

        {/* Available Devices */}
        <Animated.View entering={FadeInDown.springify().delay(200)}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                {t('pair.selectDevice')}
              </Text>
              <Pressable onPress={onRefresh} style={styles.refreshBtn}>
                <RefreshCw size={14} color={colors.primary} />
                <Text style={[styles.refreshBtnText, { color: colors.primary }]}>{t('pair.refreshDevices')}</Text>
              </Pressable>
            </View>

            <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Search size={14} color={colors.textTertiary} />
              <RNTextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder={t('pair.searchDevice')}
                placeholderTextColor={colors.textTertiary}
                value={deviceSearch}
                onChangeText={setDeviceSearch}
              />
            </View>

            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.textTertiary }]}>
                  {t('pair.loadingDevices')}
                </Text>
              </View>
            ) : filteredDevices.length === 0 ? (
              <View style={styles.emptyState}>
                <WifiOff size={32} color={colors.textTertiary} />
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>{t('pair.noDevices')}</Text>
              </View>
            ) : (
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                {filteredDevices.map((device, index) => {
                  const alreadyPaired = vehicles.some((v) => v.devIdno === device.devIdno);
                  return (
                    <View key={device.devIdno}>
                      <View style={styles.deviceRow}>
                        <View style={styles.deviceLeft}>
                          <View
                            style={[
                              styles.deviceIcon,
                              {
                                backgroundColor: device.onlineStatus
                                  ? `${colors.primary}20`
                                  : `${colors.textTertiary}20`,
                              },
                            ]}
                          >
                            {device.onlineStatus ? (
                              <Wifi size={14} color={colors.primary} />
                            ) : (
                              <WifiOff size={14} color={colors.textTertiary} />
                            )}
                          </View>
                          <View style={styles.deviceInfo}>
                            <Text style={[styles.deviceIdno, { color: colors.textPrimary }]}>
                              {device.devIdno || '—'}
                            </Text>
                            <Text style={[styles.deviceVname, { color: colors.textTertiary }]}>
                              {device.vehiIdno || '—'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.deviceRight}>
                          {device.onlineStatus ? (
                            <View style={[styles.onlineBadge, { backgroundColor: `${colors.primary}15` }]}>
                              <Text style={[styles.onlineBadgeText, { color: colors.primary }]}>
                                {t('pair.online')}
                              </Text>
                            </View>
                          ) : (
                            <View style={[styles.onlineBadge, { backgroundColor: `${colors.textTertiary}15` }]}>
                              <Text style={[styles.onlineBadgeText, { color: colors.textTertiary }]}>
                                {t('pair.offline')}
                              </Text>
                            </View>
                          )}
                          <TouchableOpacity
                            onPress={() => {
                              if (alreadyPaired) {
                                Alert.alert(t('common.warning'), t('pair.paired'));
                                return;
                              }
                              setSelectedDevice(device);
                              setPairModalVisible(true);
                            }}
                            disabled={alreadyPaired}
                            style={[
                              styles.selectBtn,
                              {
                                backgroundColor: alreadyPaired
                                  ? `${colors.textTertiary}20`
                                  : `${colors.primary}20`,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.selectBtnText,
                                { color: alreadyPaired ? colors.textTertiary : colors.primary },
                              ]}
                            >
                              {alreadyPaired ? t('pair.paired') : t('common.select')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      {index < filteredDevices.length - 1 && (
                        <View style={[styles.divider, { backgroundColor: colors.border }]} />
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </Animated.View>
      </ScrollView>

      {/* Pair Modal */}
      <Modal visible={pairModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Animated.View
            entering={FadeInDown.springify()}
            style={[styles.modalContent, { backgroundColor: colors.card }]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {t('pair.title')}
              </Text>
              <Pressable onPress={() => { setPairModalVisible(false); setSelectedDevice(null); }}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {selectedDevice && (
              <View style={[styles.selectedDeviceCard, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}>
                <View style={styles.selectedDeviceRow}>
                  <Wifi size={16} color={colors.primary} />
                  <Text style={[styles.selectedDeviceId, { color: colors.primary }]}>
                    {selectedDevice.devIdno}
                  </Text>
                  <View style={[styles.onlineBadge, { backgroundColor: `${colors.primary}15` }]}>
                    <Text style={[styles.onlineBadgeText, { color: colors.primary }]}>
                      {selectedDevice.onlineStatus ? t('pair.online') : t('pair.offline')}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              {t('pair.selectVehicle')}
            </Text>

            <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border, marginHorizontal: spacing.lg }]}>
              <Search size={14} color={colors.textTertiary} />
              <RNTextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder={t('pair.searchVehicle')}
                placeholderTextColor={colors.textTertiary}
                value={vehicleSearch}
                onChangeText={setVehicleSearch}
              />
            </View>

            <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ paddingHorizontal: spacing.lg }}>
              {filteredVehicles.length === 0 ? (
                <View style={styles.emptyState}>
                  <Truck size={32} color={colors.textTertiary} />
                  <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                    {t('pair.noVehiclesHint')}
                  </Text>
                </View>
              ) : (
                filteredVehicles.map((vehicle) => (
                  <Pressable
                    key={vehicle.id}
                    onPress={() => handlePair(selectedDevice!, vehicle)}
                    style={({ pressed }) => [
                      styles.vehicleOption,
                      { backgroundColor: pressed ? colors.cardHover : 'transparent' },
                    ]}
                  >
                    <View style={[styles.vehicleOptionIcon, { backgroundColor: `${colors.secondary}20` }]}>
                      <Truck size={16} color={colors.secondary} />
                    </View>
                    <View style={styles.vehicleOptionInfo}>
                      <Text style={[styles.vehicleOptionPlate, { color: colors.textPrimary }]}>
                        {vehicle.plateNumber}
                      </Text>
                      <Text style={[styles.vehicleOptionModel, { color: colors.textTertiary }]}>
                        {vehicle.make} {vehicle.model}
                      </Text>
                    </View>
                    <ChevronRight size={16} color={colors.textTertiary} />
                  </Pressable>
                ))
              )}
            </ScrollView>

            <View style={[styles.modalActions, { borderTopColor: colors.border }]}>
              <Button
                title={t('common.cancel')}
                variant="ghost"
                onPress={() => { setPairModalVisible(false); setSelectedDevice(null); }}
                style={{ flex: 1 }}
              />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentPadding: { paddingBottom: 100 },
  notConnected: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  notConnectedTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', marginTop: spacing.lg },
  notConnectedHint: { fontSize: typography.fontSize.sm, marginTop: spacing.sm, textAlign: 'center' },
  infoCard: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  infoText: { fontSize: typography.fontSize.sm, fontWeight: '700' },
  infoSubText: { fontSize: typography.fontSize.xs, marginTop: spacing.xs },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  refreshBtnText: { fontSize: typography.fontSize.xs, fontWeight: '600' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 40,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: typography.fontSize.sm },
  loadingState: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  loadingText: { fontSize: typography.fontSize.sm },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyText: { fontSize: typography.fontSize.sm },
  card: { borderRadius: borderRadius.lg, overflow: 'hidden' },
  pairedRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  pairedLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pairedIcon: { width: 36, height: 36, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' },
  pairedInfo: { flex: 1 },
  pairedPlate: { fontSize: typography.fontSize.sm, fontWeight: '700' },
  pairedModel: { fontSize: typography.fontSize.xs, marginTop: 2 },
  devBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: borderRadius.sm, marginTop: 4, alignSelf: 'flex-start' },
  devBadgeText: { fontSize: 10, fontWeight: '600' },
  unpairBtn: { padding: spacing.sm },
  deviceRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  deviceLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  deviceIcon: { width: 36, height: 36, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' },
  deviceInfo: { flex: 1 },
  deviceIdno: { fontSize: typography.fontSize.sm, fontWeight: '600' },
  deviceVname: { fontSize: typography.fontSize.xs, marginTop: 2 },
  deviceRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  onlineBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  onlineBadgeText: { fontSize: 10, fontWeight: '600' },
  selectBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.md },
  selectBtnText: { fontSize: typography.fontSize.xs, fontWeight: '600' },
  divider: { height: 1, marginLeft: 36 + spacing.md + spacing.md },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, paddingBottom: 40, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 1 },
  modalTitle: { fontSize: typography.fontSize.lg, fontWeight: '700' },
  selectedDeviceCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1 },
  selectedDeviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selectedDeviceId: { flex: 1, fontSize: typography.fontSize.base, fontWeight: '700' },
  modalSubtitle: { fontSize: typography.fontSize.sm, fontWeight: '600', marginTop: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.lg },
  vehicleOption: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: borderRadius.md },
  vehicleOptionIcon: { width: 36, height: 36, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' },
  vehicleOptionInfo: { flex: 1, marginLeft: spacing.md },
  vehicleOptionPlate: { fontSize: typography.fontSize.sm, fontWeight: '600' },
  vehicleOptionModel: { fontSize: typography.fontSize.xs, marginTop: 2 },
  modalActions: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderTopWidth: 1 },
});
