import { View, Text, StyleSheet, ScrollView, Alert, Pressable, TextInput, Image } from 'react-native';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useThemeStore } from '@/store/themeStore';
import { useGps808Store } from '@/store/gps808Store';
import { useGoogleMapsStore } from '@/store/googleMapsStore';
import { useTranslation } from '@/i18n';
import { spacing, typography } from '@/constants/theme';
import { Cpu, Database, Wifi, Bell, Shield, FileText, Link2, ChevronRight, CheckCircle, XCircle, Globe, Activity, Map } from 'lucide-react-native';
import { useState, useEffect } from 'react';

function ConfigItem({
  icon,
  label,
  description,
  value,
  onPress,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  value?: string;
  onPress?: () => void;
  badge?: React.ReactNode;
}) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.configItem,
        { borderBottomColor: colors.border, backgroundColor: pressed && onPress ? colors.cardHover : 'transparent' },
      ]}
    >
      <View style={[styles.configIcon, { backgroundColor: `${colors.primary}15` }]}>{icon}</View>
      <View style={styles.configContent}>
        <Text style={[styles.configLabel, { color: colors.textPrimary }]}>{label}</Text>
        {description && (
          <Text style={[styles.configDesc, { color: colors.textTertiary }]}>{description}</Text>
        )}
      </View>
      {value && (
        <Text style={[styles.configValue, { color: colors.textSecondary }]}>{value}</Text>
      )}
      {badge}
      {onPress && <ChevronRight size={16} color={colors.textTertiary} style={{ marginLeft: spacing.xs }} />}
    </Pressable>
  );
}

function Gps808Panel() {
  const { t } = useTranslation();
  const colors = useThemeStore((s) => s.colors);
  const { config, isConnected, isSaving, isLoading, error, loadConfig, testConnection, disconnect, clearError } = useGps808Store();
  const [localConfig, setLocalConfig] = useState(config);
  const [testing, setTesting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleSave = async () => {
    if (!localConfig.account || !localConfig.password) {
      Alert.alert(t('common.error'), t('config.gps808FillAll'));
      return;
    }
    setTesting(true);
    const ok = await testConnection(localConfig);
    setTesting(false);
    if (ok) {
      setIsEditing(false);
      Alert.alert(t('common.success'), t('config.gps808Connected'));
    } else {
      Alert.alert(t('common.error'), error || t('config.gps808TestFailed'));
    }
  };

  const handleTest = async () => {
    if (!localConfig.account || !localConfig.password) {
      Alert.alert(t('common.error'), t('config.gps808FillAll'));
      return;
    }
    clearError();
    setTesting(true);
    const ok = await testConnection(localConfig);
    setTesting(false);
    if (ok) {
      Alert.alert(t('common.success'), t('config.gps808Connected'));
    } else {
      Alert.alert(t('common.error'), error || t('config.gps808TestFailed'));
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      t('config.gps808Disconnect'),
      t('config.gps808DisconnectConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            await disconnect();
            setLocalConfig({
              serverUrl: 'https://console.onefleet.hk',
              account: '',
              password: '',
            });
            setIsEditing(false);
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.expandPanel, { borderTopColor: colors.border }]}>
      <Text style={[styles.expandTitle, { color: colors.textPrimary }]}>
        {t('config.gps808Settings')}
      </Text>

      {isConnected && !isEditing ? (
        <>
          <View style={[styles.connectedInfo, { backgroundColor: colors.surface }]}>
            <View style={styles.connectedRow}>
              <Text style={[styles.connectedLabel, { color: colors.textSecondary }]}>
                {t('config.gps808ServerUrl')}
              </Text>
              <Text style={[styles.connectedValue, { color: colors.textPrimary }]}>
                {config.serverUrl}
              </Text>
            </View>
            <View style={styles.connectedRow}>
              <Text style={[styles.connectedLabel, { color: colors.textSecondary }]}>
                {t('config.gps808Account')}
              </Text>
              <Text style={[styles.connectedValue, { color: colors.textPrimary }]}>
                {config.account}
              </Text>
            </View>
          </View>
          <View style={styles.expandActions}>
            <Button
              title={t('config.gps808Change')}
              onPress={() => setIsEditing(true)}
              style={{ flex: 1 }}
            />
            <Button
              title={t('config.gps808Disconnect')}
              variant="ghost"
              onPress={handleDisconnect}
              style={{ flex: 1 }}
            />
          </View>
        </>
      ) : (
        <>
          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {t('config.gps808ServerUrl')}
            </Text>
            <View style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Globe size={14} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
              <TextInput
                style={[styles.fieldInputText, { color: colors.textPrimary }]}
                value={localConfig.serverUrl}
                onChangeText={(text) => setLocalConfig({ ...localConfig, serverUrl: text })}
                placeholder="https://console.onefleet.hk"
                placeholderTextColor={colors.textTertiary}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {t('config.gps808Account')}
            </Text>
            <View style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <TextInput
                style={[styles.fieldInputText, { color: colors.textPrimary }]}
                value={localConfig.account}
                onChangeText={(text) => setLocalConfig({ ...localConfig, account: text })}
                placeholder={t('config.gps808AccountPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {t('config.gps808Password')}
            </Text>
            <View style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <TextInput
                style={[styles.fieldInputText, { color: colors.textPrimary }]}
                value={localConfig.password}
                onChangeText={(text) => setLocalConfig({ ...localConfig, password: text })}
                placeholder={t('config.gps808PasswordPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.expandActions}>
            {isConnected && isEditing && (
              <Button
                title={t('common.cancel')}
                variant="ghost"
                onPress={() => {
                  setIsEditing(false);
                  setLocalConfig(config);
                }}
                style={{ flex: 1 }}
              />
            )}
            {!isConnected && (
              <Button
                title={testing ? t('common.loading') : t('config.gps808Test')}
                variant="ghost"
                onPress={handleTest}
                loading={testing}
                style={{ flex: 1 }}
              />
            )}
            <Button
              title={t('common.save')}
              onPress={handleSave}
              loading={isSaving}
              style={{ flex: 1 }}
            />
          </View>

          {!isConnected && (
            <Button
              title={t('config.gps808Disconnect')}
              variant="ghost"
              onPress={handleDisconnect}
              style={{ marginTop: spacing.md }}
            />
          )}
        </>
      )}

      <View style={[styles.apiInfoCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.apiInfoTitle, { color: colors.textSecondary }]}>
          {t('config.gps808ApiEndpoints')}
        </Text>
        <View style={styles.apiEndpointRow}>
          <Activity size={12} color={colors.primary} />
          <Text style={[styles.apiEndpoint, { color: colors.textTertiary }]}>
            POST /StandardApiAction_userAccountLogin.action
          </Text>
        </View>
        <View style={styles.apiEndpointRow}>
          <Activity size={12} color={colors.secondary} />
          <Text style={[styles.apiEndpoint, { color: colors.textTertiary }]}>
            GET /StandardApiAction_findVehicleInfoByDeviceId.action
          </Text>
        </View>
        <View style={styles.apiEndpointRow}>
          <Activity size={12} color={colors.accentSecondary} />
          <Text style={[styles.apiEndpoint, { color: colors.textTertiary }]}>
            GET /StandardApiAction_queryVehicleList.action
          </Text>
        </View>
        <View style={styles.apiEndpointRow}>
          <Activity size={12} color={colors.textSecondary} />
          <Text style={[styles.apiEndpoint, { color: colors.textTertiary }]}>
            GET /StandardApiAction_queryAccessAreaInfo.action
          </Text>
        </View>
      </View>
    </View>
  );
}

function GoogleMapsPanel() {
  const { t } = useTranslation();
  const colors = useThemeStore((s) => s.colors);
  const { config, isSaving, isConfigured, saveConfig, clearConfig } = useGoogleMapsStore();
  const [localApiKey, setLocalApiKey] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = async () => {
    if (!localApiKey.trim()) {
      Alert.alert(t('common.error'), t('config.googleMapsApiKeyRequired'));
      return;
    }
    await saveConfig(localApiKey.trim());
    setLocalApiKey('');
    setIsEditing(false);
    Alert.alert(t('common.success'), t('config.googleMapsSaved'));
  };

  const handleClear = () => {
    Alert.alert(
      t('config.googleMapsClear'),
      t('config.googleMapsClearConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            await clearConfig();
            setLocalApiKey('');
            setIsEditing(false);
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.expandPanel, { borderTopColor: colors.border }]}>
      <Text style={[styles.expandTitle, { color: colors.textPrimary }]}>
        {t('config.googleMapsSettings')}
      </Text>

      {isConfigured && !isEditing ? (
        <View style={[styles.configuredCard, { backgroundColor: colors.surface }]}>
          <View style={styles.configuredRow}>
            <Text style={[styles.configuredLabel, { color: colors.textSecondary }]}>
              {t('config.googleMapsCurrentKey')}
            </Text>
            <Text style={[styles.configuredValue, { color: colors.textPrimary }]}>
              {config.apiKeyMasked}
            </Text>
          </View>
          <Text style={[styles.configuredHint, { color: colors.textTertiary }]}>
            {t('config.googleMapsHashedHint')}
          </Text>
          <View style={styles.expandActions}>
            <Button
              title={t('config.googleMapsUpdate')}
              onPress={() => setIsEditing(true)}
              style={{ flex: 1 }}
            />
            <Button
              title={t('common.clear')}
              variant="ghost"
              onPress={handleClear}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {t('config.googleMapsApiKey')}
            </Text>
            <View style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Map size={14} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
              <TextInput
                style={[styles.fieldInputText, { color: colors.textPrimary }]}
                value={localApiKey}
                onChangeText={setLocalApiKey}
                placeholder={t('config.googleMapsApiKeyPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
            </View>
          </View>

          <View style={styles.expandActions}>
            {isConfigured && (
              <Button
                title={t('common.cancel')}
                variant="ghost"
                onPress={() => {
                  setIsEditing(false);
                  setLocalApiKey('');
                }}
                style={{ flex: 1 }}
              />
            )}
            <Button
              title={t('common.save')}
              onPress={handleSave}
              loading={isSaving}
              style={{ flex: isConfigured ? 1 : 2 }}
            />
          </View>
        </>
      )}

      <View style={[styles.apiInfoCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.apiInfoTitle, { color: colors.textSecondary }]}>
          {t('config.googleMapsInfo')}
        </Text>
        <Text style={[styles.apiEndpoint, { color: colors.textTertiary, marginBottom: spacing.xs }]}>
          {t('config.googleMapsInfoDesc')}
        </Text>
        <Text style={[styles.apiEndpoint, { color: colors.textTertiary }]}>
          {t('config.googleMapsLink')}
        </Text>
      </View>
    </View>
  );
}

export default function ConfigScreen() {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const { isConnected, isLoading } = useGps808Store();
  const { isConfigured: isMapsConfigured, isLoading: isMapsLoading } = useGoogleMapsStore();
  const [showGps808, setShowGps808] = useState(false);
  const [showGoogleMaps, setShowGoogleMaps] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={t('nav.config')}
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
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* API Integrations */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('config.apiIntegrations')}
          </Text>
          <Card style={styles.card}>
            <ConfigItem
              icon={<Link2 size={18} color={colors.primary} />}
              label="808GPS Provider"
              description="console.onefleet.hk"
              badge={
                <View style={[styles.statusBadge, { backgroundColor: isConnected ? `${colors.success}20` : `${colors.textTertiary}20` }]}>
                  {isConnected
                    ? <CheckCircle size={12} color={colors.success} />
                    : <XCircle size={12} color={colors.textTertiary} />}
                  <Text style={[styles.statusBadgeText, { color: isConnected ? colors.success : colors.textTertiary }]}>
                    {isLoading ? '...' : isConnected ? 'Connected' : 'Disconnected'}
                  </Text>
                </View>
              }
              onPress={() => setShowGps808(!showGps808)}
            />
            {showGps808 && <Gps808Panel />}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <ConfigItem
              icon={<Map size={18} color={colors.secondary} />}
              label="Google Maps API"
              description="maps.googleapis.com"
              badge={
                <View style={[styles.statusBadge, { backgroundColor: isMapsConfigured ? `${colors.success}20` : `${colors.textTertiary}20` }]}>
                  {isMapsConfigured
                    ? <CheckCircle size={12} color={colors.success} />
                    : <XCircle size={12} color={colors.textTertiary} />}
                  <Text style={[styles.statusBadgeText, { color: isMapsConfigured ? colors.success : colors.textTertiary }]}>
                    {isMapsLoading ? '...' : isMapsConfigured ? 'Configured' : 'Not Set'}
                  </Text>
                </View>
              }
              onPress={() => setShowGoogleMaps(!showGoogleMaps)}
            />
            {showGoogleMaps && <GoogleMapsPanel />}
          </Card>
        </View>

        {/* System */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('nav.system')}
          </Text>
          <Card style={styles.card}>
            <ConfigItem
              icon={<Cpu size={18} color={colors.primary} />}
              label={t('config.systemInfo')}
              description={t('config.systemInfoDesc')}
              value="v1.0.0"
            />
            <ConfigItem
              icon={<Database size={18} color={colors.secondary} />}
              label={t('config.dataManagement')}
              description={t('config.dataManagementDesc')}
            />
            <ConfigItem
              icon={<Wifi size={18} color={colors.accentSecondary} />}
              label={t('config.network')}
              description={t('config.networkDesc')}
              value="Online"
            />
          </Card>
        </View>

        {/* Security */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('config.security')}
          </Text>
          <Card style={styles.card}>
            <ConfigItem
              icon={<Shield size={18} color={colors.danger} />}
              label={t('config.securitySettings')}
              description={t('config.securitySettingsDesc')}
            />
            <ConfigItem
              icon={<Bell size={18} color={colors.primary} />}
              label={t('config.notifications')}
              description={t('config.notificationsDesc')}
              value="On"
            />
          </Card>
        </View>

        {/* Others */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('config.others')}
          </Text>
          <Card style={styles.card}>
            <ConfigItem
              icon={<FileText size={18} color={colors.textSecondary} />}
              label={t('config.logs')}
              description={t('config.logsDesc')}
            />
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    marginHorizontal: spacing.lg,
  },
  configItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  configIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  configContent: {
    flex: 1,
  },
  configLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: '500',
  },
  configDesc: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  configValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 4,
    marginLeft: spacing.sm,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  expandPanel: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
  },
  expandTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    marginBottom: spacing.lg,
  },
  fieldWrap: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  fieldInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  fieldInputText: {
    fontSize: typography.fontSize.base,
    flex: 1,
  },
  expandActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  apiInfoCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 10,
  },
  apiInfoTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  apiEndpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  apiEndpoint: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
  configuredCard: {
    padding: spacing.md,
    borderRadius: 10,
  },
  configuredRow: {
    marginBottom: spacing.sm,
  },
  configuredLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  configuredValue: {
    fontSize: typography.fontSize.base,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  configuredHint: {
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.md,
  },
  connectedInfo: {
    padding: spacing.md,
    borderRadius: 10,
    marginBottom: spacing.md,
  },
  connectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  connectedLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
  },
  connectedValue: {
    fontSize: typography.fontSize.sm,
    fontFamily: 'monospace',
  },
});
