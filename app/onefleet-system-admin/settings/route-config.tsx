import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Image,
  Switch,
  TextInput,
  Platform,
} from 'react-native';

// Web alert helper - 使用 window.alert 確保 Web 環境有視覺回饋
const webAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};
import { useRouter } from 'expo-router';
import {
  ChevronRight,
  Map,
  Route,
  Settings,
  Truck,
  Zap,
  CheckCircle,
  XCircle,
  Globe,
  Shield,
  Key,
  Save,
  RefreshCw,
  Navigation,
  Clock,
  DollarSign,
  Car,
} from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { useThemeStore } from '@/store/themeStore';
import { useRouteConfigStore, ROUTE_PROVIDERS, ROUTE_STRATEGIES, START_LOCATION_MODES, END_LOCATION_MODES } from '@/store/routeConfigStore';
import { useTranslation } from '@/i18n';
import { spacing, typography } from '@/constants/theme';
import type { RouteProvider, RouteStrategy, StartLocationMode, EndLocationMode } from '@/types';

export default function RouteConfigScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const {
    config,
    isLoading,
    isSaving,
    isConfigured,
    loadConfig,
    saveApiKey,
    saveStrategyConfig,
    clearConfig,
    testApiConnection,
  } = useRouteConfigStore();

  // Local state for editing
  const [activeTab, setActiveTab] = useState<'api' | 'tsp'>('api');
  const [selectedProvider, setSelectedProvider] = useState<RouteProvider>(config.provider);
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testingResult, setTestingResult] = useState<boolean | null>(null);

  // TSP 設定
  const [enableTsp, setEnableTsp] = useState(config.enableTspOptimization);
  const [strategy, setStrategy] = useState<RouteStrategy>(config.defaultStrategy);
  const [startMode, setStartMode] = useState<StartLocationMode>(config.defaultStartLocation);
  const [endMode, setEndMode] = useState<EndLocationMode>(config.defaultEndLocation);
  const [depotAddress, setDepotAddress] = useState(config.depotAddress || '');
  const [avoidTolls, setAvoidTolls] = useState(config.avoidTolls || false);
  const [avoidHighways, setAvoidHighways] = useState(config.avoidHighways || false);
  const [considerTraffic, setConsiderTraffic] = useState(config.considerTraffic ?? true);

  // 載入設定
  useEffect(() => {
    loadConfig();
  }, []);

  // 同步本地狀態與 store
  useEffect(() => {
    setSelectedProvider(config.provider);
    setEnableTsp(config.enableTspOptimization);
    setStrategy(config.defaultStrategy);
    setStartMode(config.defaultStartLocation);
    setEndMode(config.defaultEndLocation);
    setDepotAddress(config.depotAddress || '');
    setAvoidTolls(config.avoidTolls || false);
    setAvoidHighways(config.avoidHighways || false);
    setConsiderTraffic(config.considerTraffic ?? true);
  }, [config]);

  // 測試 API 連線
  const handleTestApi = async () => {
    if (!apiKey.trim() && selectedProvider !== 'osrm') {
      webAlert(t('common.error'), '請輸入 API Key');
      return;
    }

    setTesting(true);
    setTestingResult(null);

    try {
      const result = await testApiConnection(
        selectedProvider === 'osrm' ? 'test' : apiKey.trim(),
        selectedProvider
      );
      setTestingResult(result);
      if (result) {
        webAlert(t('common.success'), 'API 連線測試成功');
      } else {
        webAlert(t('common.error'), 'API 連線測試失敗，請檢查 API Key 是否正確');
      }
    } catch {
      setTestingResult(false);
      webAlert(t('common.error'), 'API 連線測試失敗');
    } finally {
      setTesting(false);
    }
  };

  // 儲存 API 設定
  const handleSaveApi = async () => {
    if (selectedProvider === 'osrm') {
      // OSRM 不需要 API Key
      await saveApiKey('', selectedProvider);
      webAlert(t('common.success'), 'API 設定已儲存');
      return;
    }

    if (!apiKey.trim()) {
      webAlert(t('common.error'), '請輸入 API Key');
      return;
    }

    await saveApiKey(apiKey.trim(), selectedProvider);
    setApiKey('');
    webAlert(t('common.success'), 'API 設定已儲存');
  };

  // 儲存 TSP 設定
  const handleSaveTsp = async () => {
    await saveStrategyConfig({
      enableTspOptimization: enableTsp,
      defaultStrategy: strategy,
      defaultStartLocation: startMode,
      defaultEndLocation: endMode,
      depotAddress: depotAddress.trim() || undefined,
      avoidTolls,
      avoidHighways,
      considerTraffic,
    });
    webAlert(t('common.success'), '路線最佳化設定已儲存');
  };

  // 清除設定
  const handleClearConfig = () => {
    const handleConfirm = async () => {
      await clearConfig();
      setApiKey('');
    };

    if (Platform.OS === 'web') {
      if (window.confirm('確定要清除所有路線設定嗎？')) {
        handleConfirm();
      }
    } else {
      Alert.alert(
        '清除所有設定',
        '確定要清除所有路線設定嗎？',
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm'),
            style: 'destructive',
            onPress: handleConfirm,
          },
        ]
      );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="路線規劃與地圖設定"
        showBack
      />

      {/* Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable
          style={[styles.tab, activeTab === 'api' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('api')}
        >
          <Key size={18} color={activeTab === 'api' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'api' ? colors.primary : colors.textSecondary }]}>
            地圖 API
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'tsp' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('tsp')}
        >
          <Zap size={18} color={activeTab === 'tsp' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'tsp' ? colors.primary : colors.textSecondary }]}>
            TSP 最佳化
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'api' ? (
          <>
            {/* API 狀態卡片 */}
            <Card style={styles.card}>
              <View style={styles.statusHeader}>
                <View style={[styles.statusIcon, { backgroundColor: isConfigured ? `${colors.success}20` : `${colors.textTertiary}20` }]}>
                  {isConfigured ? (
                    <CheckCircle size={24} color={colors.success} />
                  ) : (
                    <XCircle size={24} color={colors.textTertiary} />
                  )}
                </View>
                <View style={styles.statusInfo}>
                  <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>
                    地圖 API 狀態
                  </Text>
                  <Text style={[styles.statusDesc, { color: isConfigured ? colors.success : colors.textSecondary }]}>
                    {isConfigured ? '已設定' : '尚未設定'}
                  </Text>
                </View>
              </View>

              {isConfigured && config.apiKeyMasked && (
                <View style={[styles.configuredInfo, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.configuredLabel, { color: colors.textSecondary }]}>
                    目前使用
                  </Text>
                  <Text style={[styles.configuredValue, { color: colors.textPrimary }]}>
                    {ROUTE_PROVIDERS.find(p => p.value === config.provider)?.label || config.provider}
                  </Text>
                  <Text style={[styles.configuredKey, { color: colors.textTertiary }]}>
                    Key: {config.apiKeyMasked}
                  </Text>
                </View>
              )}
            </Card>

            {/* 選擇服務提供商 */}
            <Card style={styles.card}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                <Globe size={14} /> 服務提供商
              </Text>
              
              {ROUTE_PROVIDERS.map((provider) => (
                <Pressable
                  key={provider.value}
                  style={[
                    styles.providerOption,
                    selectedProvider === provider.value && { backgroundColor: colors.primaryGlow },
                  ]}
                  onPress={() => setSelectedProvider(provider.value)}
                >
                  <View style={styles.providerInfo}>
                    <Text style={[styles.providerName, { color: colors.textPrimary }]}>
                      {provider.label}
                    </Text>
                    <Text style={[styles.providerDesc, { color: colors.textTertiary }]}>
                      {provider.value === 'osrm' ? '免費公開 API，無需 API Key' : '需要 Google Cloud Platform API Key'}
                    </Text>
                  </View>
                  <View style={[
                    styles.radioOuter,
                    { borderColor: selectedProvider === provider.value ? colors.primary : colors.border }
                  ]}>
                    {selectedProvider === provider.value && (
                      <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                </Pressable>
              ))}
            </Card>

            {/* API Key 輸入 */}
            {selectedProvider !== 'osrm' && (
              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  <Key size={14} /> API Key
                </Text>
                
                <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary }]}
                    value={apiKey}
                    onChangeText={setApiKey}
                    placeholder="輸入 API Key"
                    placeholderTextColor={colors.textTertiary}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <Text style={[styles.hint, { color: colors.textTertiary }]}>
                  {selectedProvider === 'google' && '取得 Key：console.cloud.google.com/apis/credentials'}
                  {selectedProvider === 'mapbox' && '取得 Key：account.mapbox.com/access-tokens/'}
                </Text>

                <View style={styles.buttonRow}>
                  <Button
                    title={testing ? '測試中...' : '測試連線'}
                    variant="ghost"
                    onPress={handleTestApi}
                    loading={testing}
                    disabled={!apiKey.trim()}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="儲存"
                    onPress={handleSaveApi}
                    loading={isSaving}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            )}

            {selectedProvider === 'osrm' && (
              <Card style={styles.card}>
                <View style={styles.osrmInfo}>
                  <Text style={[styles.osrmTitle, { color: colors.textPrimary }]}>
                    OpenStreetMap (OSRM)
                  </Text>
                  <Text style={[styles.osrmDesc, { color: colors.textSecondary }]}>
                    OSRM 是免費公開的地圖路由服務，無需 API Key 即可使用。
                    {'\n\n'}
                    適合開發測試或小型應用。對於生產環境，建議使用 Google Maps 或 Mapbox 獲得更好的準確性和穩定性。
                  </Text>
                  <Button
                    title="儲存設定"
                    onPress={handleSaveApi}
                    loading={isSaving}
                    style={{ marginTop: spacing.lg }}
                  />
                </View>
              </Card>
            )}

            {/* 清除設定 */}
            {isConfigured && (
              <Pressable
                style={[styles.clearButton, { borderColor: colors.danger }]}
                onPress={handleClearConfig}
              >
                <Text style={[styles.clearButtonText, { color: colors.danger }]}>
                  清除所有 API 設定
                </Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            {/* TSP 開關 */}
            <Card style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>
                    <Zap size={18} color={colors.accentSecondary} /> 啟用自動路線優化
                  </Text>
                  <Text style={[styles.toggleDesc, { color: colors.textSecondary }]}>
                    根據今日配送單自動計算最佳多站點順序 (TSP)
                  </Text>
                </View>
                <Switch
                  value={enableTsp}
                  onValueChange={setEnableTsp}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </Card>

            {/* 預設路線策略 */}
            <Card style={styles.card}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                <Route size={14} /> 預設路線策略
              </Text>
              
              {ROUTE_STRATEGIES.map((s) => (
                <Pressable
                  key={s.value}
                  style={[
                    styles.strategyOption,
                    strategy === s.value && { backgroundColor: colors.primaryGlow },
                  ]}
                  onPress={() => setStrategy(s.value)}
                >
                  <View style={[
                    styles.radioOuter,
                    { borderColor: strategy === s.value ? colors.primary : colors.border }
                  ]}>
                    {strategy === s.value && (
                      <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                  <View style={styles.strategyInfo}>
                    <Text style={[styles.strategyName, { color: colors.textPrimary }]}>
                      {s.labelZh}
                    </Text>
                    <Text style={[styles.strategyDesc, { color: colors.textTertiary }]}>
                      {s.label}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </Card>

            {/* 起點模式 */}
            <Card style={styles.card}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                <Navigation size={14} /> 預設起點模式
              </Text>
              
              {START_LOCATION_MODES.map((mode) => (
                <Pressable
                  key={mode.value}
                  style={[
                    styles.modeOption,
                    startMode === mode.value && { backgroundColor: colors.primaryGlow },
                  ]}
                  onPress={() => setStartMode(mode.value)}
                >
                  <View style={[
                    styles.radioOuter,
                    { borderColor: startMode === mode.value ? colors.primary : colors.border }
                  ]}>
                    {startMode === mode.value && (
                      <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                  <Text style={[styles.modeName, { color: colors.textPrimary }]}>
                    {mode.labelZh}
                  </Text>
                </Pressable>
              ))}
            </Card>

            {/* 終點模式 */}
            <Card style={styles.card}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                <Navigation size={14} style={{ transform: [{ rotate: '180deg' }] }} /> 預設終點模式
              </Text>
              
              {END_LOCATION_MODES.map((mode) => (
                <Pressable
                  key={mode.value}
                  style={[
                    styles.modeOption,
                    endMode === mode.value && { backgroundColor: colors.primaryGlow },
                  ]}
                  onPress={() => setEndMode(mode.value)}
                >
                  <View style={[
                    styles.radioOuter,
                    { borderColor: endMode === mode.value ? colors.primary : colors.border }
                  ]}>
                    {endMode === mode.value && (
                      <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                  <Text style={[styles.modeName, { color: colors.textPrimary }]}>
                    {mode.labelZh}
                  </Text>
                </Pressable>
              ))}
            </Card>

            {/* 車隊總部地址 */}
            {startMode === 'depot' || endMode === 'depot' ? (
              <Card style={styles.card}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  <Truck size={14} /> 車隊總部/倉庫地址
                </Text>
                
                <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary }]}
                    value={depotAddress}
                    onChangeText={setDepotAddress}
                    placeholder="例如：香港九龍觀塘道 388 號"
                    placeholderTextColor={colors.textTertiary}
                    multiline
                  />
                </View>
              </Card>
            ) : null}

            {/* 進階選項 */}
            <Card style={styles.card}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                <Settings size={14} /> 進階選項
              </Text>

              <View style={[styles.toggleRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <View style={styles.toggleInfo}>
                  <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>
                    <DollarSign size={16} color={colors.accentSecondary} /> 避開收費道路
                  </Text>
                </View>
                <Switch
                  value={avoidTolls}
                  onValueChange={setAvoidTolls}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={[styles.toggleRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <View style={styles.toggleInfo}>
                  <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>
                    <Car size={16} color={colors.secondary} /> 避開高速公路
                  </Text>
                </View>
                <Switch
                  value={avoidHighways}
                  onValueChange={setAvoidHighways}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>
                    <Clock size={16} color={colors.primary} /> 考慮交通路況
                  </Text>
                </View>
                <Switch
                  value={considerTraffic}
                  onValueChange={setConsiderTraffic}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </Card>

            {/* 儲存按鈕 */}
            <Button
              title="儲存 TSP 設定"
              onPress={handleSaveTsp}
              loading={isSaving}
              style={{ marginTop: spacing.md }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: 100 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  tabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  card: { marginBottom: spacing.lg, padding: spacing.lg },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  statusInfo: { flex: 1 },
  statusTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '600',
  },
  statusDesc: {
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  configuredInfo: {
    padding: spacing.md,
    borderRadius: spacing.sm,
    marginTop: spacing.sm,
  },
  configuredLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    marginBottom: 4,
  },
  configuredValue: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
  },
  configuredKey: {
    fontSize: typography.fontSize.sm,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  providerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: spacing.sm,
    marginBottom: spacing.sm,
  },
  providerInfo: { flex: 1 },
  providerName: {
    fontSize: typography.fontSize.base,
    fontWeight: '500',
  },
  providerDesc: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  inputWrapper: {
    borderWidth: 1,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  input: {
    fontSize: typography.fontSize.base,
    minHeight: 44,
  },
  hint: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  osrmInfo: { padding: spacing.sm },
  osrmTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  osrmDesc: {
    fontSize: typography.fontSize.sm,
    lineHeight: 22,
  },
  clearButton: {
    borderWidth: 1,
    borderRadius: spacing.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  clearButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  toggleInfo: { flex: 1, marginRight: spacing.md },
  toggleTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '500',
  },
  toggleDesc: {
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  strategyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: spacing.sm,
    marginBottom: spacing.sm,
  },
  strategyInfo: { flex: 1, marginLeft: spacing.md },
  strategyName: {
    fontSize: typography.fontSize.base,
    fontWeight: '500',
  },
  strategyDesc: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  modeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: spacing.sm,
    marginBottom: spacing.sm,
  },
  modeName: {
    fontSize: typography.fontSize.base,
    fontWeight: '500',
    marginLeft: spacing.md,
  },
});
