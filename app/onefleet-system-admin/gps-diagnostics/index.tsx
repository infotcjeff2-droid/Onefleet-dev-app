import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Wifi, Activity, RotateCcw, Copy, Check } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { useThemeStore } from '@/store/themeStore';
import { useGps808Store } from '@/store/gps808Store';
import { useTranslation } from '@/i18n';
import { spacing, typography, borderRadius } from '@/constants/theme';
import { useState, useEffect } from 'react';
import {
  diagnoseGpsConnection,
  clearGpsConnectionCache,
  GpsDiagnosticInfo,
  GpsClearResult,
  testProxyReachability,
  getWebProxyBaseUrlSync,
} from '@/utils/gpsDiagnostics';

const isWeb = Platform.OS === 'web';

export default function GpsDiagnosticsScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const gpsStore = useGps808Store();
  const { isConnected, config } = gpsStore;

  const [expanded, setExpanded] = useState(true);
  const [diag, setDiag] = useState<GpsDiagnosticInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{
    cleared: GpsClearResult;
    proxyTest: { ok: boolean; status: number; error?: string };
    reconnectResult: boolean;
    error?: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const runDiagnose = async () => {
    setLoading(true);
    setResetResult(null);
    try {
      const info = await diagnoseGpsConnection();
      setDiag(info);
    } catch (e) {
      console.warn('[GPS Diagnostics] Diagnose failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setResetResult(null);
    try {
      await gpsStore.disconnect();
      const cleared = await clearGpsConnectionCache();
      const base = getWebProxyBaseUrlSync();
      const proxyTest = await testProxyReachability(base);

      let reconnectResult = false;
      let reconnectError: string | undefined;
      if (config.account && config.password) {
        try {
          const ok = await gpsStore.testConnection(config);
          reconnectResult = ok;
          if (!ok) reconnectError = 'testConnection returned false';
        } catch (e) {
          reconnectError = e instanceof Error ? e.message : String(e);
        }
      } else {
        reconnectError = 'no stored credentials (account/password empty)';
      }

      setResetResult({ cleared, proxyTest, reconnectResult, error: reconnectError });
      await runDiagnose();
    } catch (e) {
      console.warn('[GPS Diagnostics] Reset failed:', e);
    } finally {
      setResetting(false);
    }
  };

  const handleCopy = async (key: string, value: string) => {
    if (!isWeb || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (expanded && !diag && !loading) {
      void runDiagnose();
    }
  }, [expanded]);

  const renderRow = (label: string, value: string | null | undefined, key: string) => {
    if (value === null || value === undefined || value === '') return null;
    return (
      <View key={key} style={styles.diagRow}>
        <Text style={[styles.diagLabel, { color: colors.textTertiary }]}>{label}</Text>
        <Pressable
          style={styles.diagValueWrap}
          onPress={() => handleCopy(key, value)}
          hitSlop={4}
        >
          <Text
            style={[styles.diagValue, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {value}
          </Text>
          {copiedKey === key ? (
            <Check size={12} color={colors.success} />
          ) : (
            <Copy size={12} color={colors.textTertiary} />
          )}
        </Pressable>
      </View>
    );
  };

  const renderBool = (label: string, value: boolean, key: string) => {
    return (
      <View key={key} style={styles.diagRow}>
        <Text style={[styles.diagLabel, { color: colors.textTertiary }]}>{label}</Text>
        <View style={[
          styles.boolBadge,
          { backgroundColor: value ? `${colors.success}20` : `${colors.danger}20` },
        ]}>
          <Text style={[
            styles.boolBadgeText,
            { color: value ? colors.success : colors.danger },
          ]}>
            {value ? '✓ 是' : '✗ 否'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={t('profile.gpsDiagnostics')}
        showBack
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 連線狀態卡片 */}
        <Card style={styles.card}>
          <Pressable
            style={({ pressed }) => [
              styles.settingItem,
              { backgroundColor: pressed ? colors.cardHover : 'transparent' },
            ]}
            onPress={() => setExpanded(!expanded)}
          >
            <View style={styles.settingLeft}>
              <View style={styles.settingIcon}>
                <Wifi size={18} color={isConnected ? colors.success : colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                  {isConnected ? t('profile.gpsConnected') : t('profile.gpsDisconnected')}
                </Text>
                <Text style={[styles.diagSubtitle, { color: colors.textTertiary }]}>
                  GPS {t('profile.gpsDiagnostics').replace('GPS ', '')}
                  {diag?.serviceWorkerCount ? ` · SW: ${diag.serviceWorkerCount}` : ''}
                </Text>
              </View>
            </View>
            <View style={styles.settingRight}>
              <ChevronRight
                size={16}
                color={colors.textTertiary}
                style={{
                  transform: [{ rotate: expanded ? '90deg' : '0deg' }],
                }}
              />
            </View>
          </Pressable>

          {expanded && (
            <View style={[styles.diagPanel, { borderTopColor: colors.border }]}>
              <View style={styles.diagActions}>
                <Button
                  title={loading ? t('common.loading') : t('profile.gpsDiagnose')}
                  variant="secondary"
                  size="sm"
                  onPress={runDiagnose}
                  loading={loading}
                  icon={<Activity size={14} color={colors.primary} />}
                  style={{ flex: 1 }}
                />
                <Button
                  title={resetting ? t('common.loading') : t('profile.gpsReset')}
                  variant="danger"
                  size="sm"
                  onPress={handleReset}
                  loading={resetting}
                  icon={<RotateCcw size={14} color="#fff" />}
                  style={{ flex: 1 }}
                />
              </View>

              <Text style={[styles.diagHint, { color: colors.textTertiary }]}>
                {t('profile.gpsResetHint')}
              </Text>

              {diag && (
                <View style={[styles.diagResult, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.diagResultTitle, { color: colors.textSecondary }]}>
                    {t('profile.gpsCurrentStatus')}
                  </Text>
                  <View style={styles.diagRow}>
                    <Text style={[styles.diagLabel, { color: colors.textTertiary }]}>
                      {t('profile.diagProxyReachable')}
                    </Text>
                    <View style={[
                      styles.boolBadge,
                      {
                        backgroundColor: diag.proxyTest.ok
                          ? `${colors.success}20`
                          : `${colors.danger}20`,
                      },
                    ]}>
                      <Text style={[
                        styles.boolBadgeText,
                        {
                          color: diag.proxyTest.ok ? colors.success : colors.danger,
                        },
                      ]}>
                        {diag.proxyTest.ok
                          ? `✓ 可達 (HTTP ${diag.proxyTest.status})`
                          : `✗ 不可達 ${diag.proxyTest.error ? ': ' + diag.proxyTest.error : ''}`}
                      </Text>
                    </View>
                  </View>
                  {renderRow(t('profile.diagEffectiveUrl'), diag.effectiveProxyUrl, 'effective')}
                  {renderRow(t('profile.diagStoredUrl'), diag.storedServerUrl, 'stored')}
                  {renderBool(t('profile.diagHasJsession'), diag.hasJsession, 'jsession')}
                  {renderRow(t('profile.diagJsessionPreview'), diag.jsessionPreview, 'jsessionPreview')}
                  {renderBool(t('profile.diagOnline'), diag.isOnline, 'online')}
                  {isWeb && (
                    <>
                      {renderRow(t('profile.diagServiceWorker'), String(diag.serviceWorkerCount), 'sw')}
                      {renderRow(t('profile.diagCacheStorage'), diag.cacheStorageNames.join(', ') || '(none)', 'caches')}
                      {renderRow(t('profile.diagLocalStorageKeys'),
                        diag.relatedLocalStorageKeys.length === 0
                          ? '(none)'
                          : diag.relatedLocalStorageKeys.join(', '),
                        'lsKeys')}
                    </>
                  )}
                </View>
              )}

              {resetResult && (
                <View style={[styles.diagResult, {
                  backgroundColor: resetResult.reconnectResult ? `${colors.success}15` : `${colors.warning}15`,
                  borderColor: resetResult.reconnectResult ? colors.success : colors.warning,
                  marginTop: spacing.sm,
                }]}>
                  <Text style={[styles.diagResultTitle, {
                    color: resetResult.reconnectResult ? colors.success : colors.warning,
                  }]}>
                    {resetResult.reconnectResult
                      ? `✅ ${t('profile.gpsResetSuccess')}`
                      : `⚠️ ${t('profile.gpsResetPartial')}`}
                  </Text>
                  <View style={styles.diagRow}>
                    <Text style={[styles.diagLabel, { color: colors.textTertiary }]}>
                      Proxy 可達性
                    </Text>
                    <View style={[styles.boolBadge, {
                      backgroundColor: resetResult.proxyTest.ok
                        ? `${colors.success}20`
                        : `${colors.danger}20`,
                    }]}>
                      <Text style={[styles.boolBadgeText, {
                        color: resetResult.proxyTest.ok ? colors.success : colors.danger,
                      }]}>
                        {resetResult.proxyTest.ok
                          ? `✓ 可達 (HTTP ${resetResult.proxyTest.status})`
                          : `✗ 不可達`}
                      </Text>
                    </View>
                  </View>
                  {resetResult.cleared.clearedItems.map((item, idx) => (
                    <Text key={idx} style={[styles.diagClearedItem, { color: colors.textSecondary }]}>
                      • {item}
                    </Text>
                  ))}
                  {resetResult.error && (
                    <Text style={[styles.diagClearedItem, { color: colors.warning }]}>
                      ⚠️ {resetResult.error}
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: 100 },
  card: { marginBottom: spacing.lg, padding: 0 },
  sectionHeader: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(128,128,128,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingRight: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
  },
  settingDesc: {
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs,
  },
  divider: { height: 1, marginVertical: spacing.xs },
  // 診斷相關樣式
  diagSubtitle: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  diagPanel: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  diagActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  diagHint: {
    fontSize: typography.fontSize.xs,
    lineHeight: 16,
    marginBottom: spacing.md,
  },
  diagResult: {
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  diagResultTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  diagRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  diagLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    flex: 1,
  },
  diagValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1.4,
  },
  diagValue: {
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
  },
  boolBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  boolBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  diagClearedItem: {
    fontSize: typography.fontSize.xs,
    lineHeight: 18,
    marginLeft: spacing.xs,
  },
  syncBadge: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
});
