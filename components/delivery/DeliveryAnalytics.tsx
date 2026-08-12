import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { spacing, typography, colors as themeColors } from '@/constants/theme';
import {
  fetchDeliveryAnalytics,
  getDashboardChartConfig,
  DeliveryAnalyticsData,
  DashboardChartConfig,
} from '@/utils/fleetSync';
import { hasSupabaseEnv } from '@/utils/supabase';

// 圖表依賴（條件導入以支援 Web）
let ComposedChart: React.ComponentType<any> | null = null;
let Bar: React.ComponentType<any> | null = null;
let XAxis: React.ComponentType<any> | null = null;
let YAxis: React.ComponentType<any> | null = null;
let Tooltip: React.ComponentType<any> | null = null;
let ResponsiveContainer: React.ComponentType<any> | null = null;

// 動態導入 Recharts（僅 Web 環境）
if (typeof window !== 'undefined') {
  import('recharts').then(m => {
    ComposedChart = m.ComposedChart;
    Bar = m.Bar;
    XAxis = m.XAxis;
    YAxis = m.YAxis;
    Tooltip = m.Tooltip;
    ResponsiveContainer = m.ResponsiveContainer;
  }).catch(() => {
    console.warn('Failed to load recharts');
  });
}

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: number;
  icon?: React.ReactNode;
  color?: string;
  visible?: boolean;
}

function KpiCard({ title, value, subtitle, change, icon, color = '#2563eb', visible = true }: KpiCardProps) {
  const { colors } = useThemeStore();

  if (!visible) return null;

  return (
    <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.kpiHeader}>
        <Text style={[styles.kpiTitle, { color: colors.textSecondary }]}>{title}</Text>
        {icon && <View style={[styles.kpiIconWrap, { backgroundColor: `${color}15` }]}>{icon}</View>}
      </View>
      <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{value}</Text>
      {subtitle && (
        <View style={styles.kpiFooter}>
          <Text style={[styles.kpiSubtitle, { color: colors.textTertiary }]}>{subtitle}</Text>
          {change !== undefined && change !== 0 && (
            <Text style={[styles.kpiChange, { color: change > 0 ? '#10B981' : '#EF4444' }]}>
              {change > 0 ? '+' : ''}{change}%
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

interface DeliveryAnalyticsProps {
  companyId?: string | null;
  userRole?: string;
}

export default function DeliveryAnalytics({ companyId, userRole }: DeliveryAnalyticsProps) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const [period, setPeriod] = useState<number>(30);
  const [data, setData] = useState<DeliveryAnalyticsData | null>(null);
  const [chartConfig, setChartConfig] = useState<DashboardChartConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 載入圖表配置和分析數據
  const loadData = useCallback(async () => {
    if (!hasSupabaseEnv) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 並行載入配置和數據
      const [config, analyticsData] = await Promise.all([
        getDashboardChartConfig(),
        fetchDeliveryAnalytics(period, companyId, userRole),
      ]);

      setChartConfig(config);
      setData(analyticsData);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [period, companyId, userRole]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 刷新按鈕
  const handleRefresh = () => {
    loadData();
  };

  if (!hasSupabaseEnv) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('dashboard.deliveryAnalytics')}</Text>
        <Text style={[styles.noDataText, { color: colors.textTertiary }]}>
          {t('dashboard.noData')}
        </Text>
      </View>
    );
  }

  if (loading && !data) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('dashboard.deliveryAnalytics')}</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textTertiary }]}>{t('dashboard.loading')}</Text>
        </View>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('dashboard.deliveryAnalytics')}</Text>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.error || '#EF4444' }]}>{error}</Text>
          <Pressable style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={handleRefresh}>
            <Text style={styles.retryButtonText}>重試</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const config = chartConfig || {
    show_total_orders: true,
    show_avg_duration: true,
    show_efficiency_rate: true,
    show_active_drivers: true,
    chart_series_duration: true,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* 標題和刷新按鈕 */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('dashboard.deliveryAnalytics')}</Text>
        <Pressable onPress={handleRefresh} style={styles.refreshButton}>
          <Text style={[styles.refreshText, { color: colors.primary }]}>↻</Text>
        </Pressable>
      </View>

      {/* 期間選擇器 - Slider */}
      <View style={styles.sliderContainer}>
        <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>
          {period === 7 ? t('dashboard.last7Days') : period === 30 ? t('dashboard.last30Days') : `${period} ${t('dashboard.days')}`}
        </Text>
        <View style={styles.sliderRow}>
          <Pressable
            style={[
              styles.sliderBtn,
              period === 7
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={() => setPeriod(7)}
          >
            <Text
              style={[
                styles.sliderBtnText,
                { color: period === 7 ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              7
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.sliderBtn,
              period === 14
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={() => setPeriod(14)}
          >
            <Text
              style={[
                styles.sliderBtnText,
                { color: period === 14 ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              14
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.sliderBtn,
              period === 30
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={() => setPeriod(30)}
          >
            <Text
              style={[
                styles.sliderBtnText,
                { color: period === 30 ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              30
            </Text>
          </Pressable>
        </View>
      </View>

      {/* KPI 卡片網格 */}
      <View style={styles.kpiGrid}>
        <KpiCard
          title={t('dashboard.totalOrders')}
          value={data?.totalOrders ?? 0}
          subtitle={`${period}${t('dashboard.days')}`}
          change={data?.ordersChange}
          color="#2563EB"
          visible={config.show_total_orders}
        />
        <KpiCard
          title={t('dashboard.avgDuration')}
          value={data?.avgDurationFormatted ?? 'N/A'}
          color="#7C3AED"
          visible={config.show_avg_duration}
        />
        <KpiCard
          title={t('dashboard.efficiencyRate')}
          value={data?.efficiencyRate !== null ? `${data.efficiencyRate}%` : 'N/A'}
          color="#059669"
          visible={config.show_efficiency_rate}
        />
        <KpiCard
          title={t('dashboard.activeDrivers')}
          value={data?.activeDriversCount ?? 0}
          color="#EA580C"
          visible={config.show_active_drivers}
        />
      </View>

      {/* 圖表區域 */}
      {data && data.chartData.length > 0 && (
        <View style={styles.chartContainer}>
          <Text style={[styles.chartTitle, { color: colors.textSecondary }]}>
            {t('dashboard.deliveryOverview')}
          </Text>

          {/* Web 端使用 Recharts */}
          {typeof window !== 'undefined' && ComposedChart && ResponsiveContainer ? (
            <View style={styles.webChart}>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={data.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fill: colors.textTertiary, fontSize: 11 }}
                    axisLine={{ stroke: colors.border }}
                    tickLine={{ stroke: colors.border }}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fill: colors.textTertiary, fontSize: 11 }}
                    axisLine={{ stroke: colors.border }}
                    tickLine={{ stroke: colors.border }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fill: colors.textTertiary, fontSize: 11 }}
                    axisLine={{ stroke: colors.border }}
                    tickLine={{ stroke: colors.border }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: colors.card,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 8,
                    }}
                    labelStyle={{ color: colors.textPrimary }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="orderCount"
                    fill="#2563EB"
                    name={t('dashboard.totalOrders')}
                    radius={[4, 4, 0, 0]}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </View>
          ) : (
            /* 顯示長條圖文字版（非 Web） */
            <View style={styles.chartPlaceholder}>
              <Text style={[styles.chartPlaceholderText, { color: colors.textTertiary }]}>
                {data.chartData.map(d => `${d.label}: ${d.orderCount}${t('dashboard.orders')}`).join('\n')}
              </Text>
            </View>
          )}

          {/* 圖例 */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#2563EB' }]} />
              <Text style={[styles.legendText, { color: colors.textTertiary }]}>
                {t('dashboard.totalOrders')}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* 無數據提示 */}
      {data && data.chartData.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>{t('dashboard.noData')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
  },
  refreshButton: {
    padding: spacing.xs,
  },
  refreshText: {
    fontSize: 20,
    fontWeight: '600',
  },
  sliderContainer: {
    marginBottom: spacing.lg,
  },
  sliderLabel: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.sm,
  },
  sliderRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sliderBtn: {
    width: 48,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderBtnText: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  kpiCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.md,
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  kpiTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  kpiFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  kpiSubtitle: {
    fontSize: typography.fontSize.xs,
  },
  kpiChange: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
  },
  chartContainer: {
    marginTop: spacing.sm,
  },
  chartTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  webChart: {
    height: 300,
  },
  chartPlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  chartPlaceholderText: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    lineHeight: 24,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLine: {
    width: 16,
    height: 3,
    borderRadius: 2,
  },
  legendText: {
    fontSize: typography.fontSize.xs,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: typography.fontSize.sm,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: typography.fontSize.sm,
  },
  noDataText: {
    textAlign: 'center',
    paddingVertical: spacing.xl,
    fontSize: typography.fontSize.base,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: typography.fontSize.base,
  },
});
