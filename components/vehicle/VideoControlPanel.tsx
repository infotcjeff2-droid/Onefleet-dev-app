import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  ScrollView,
} from 'react-native';
import {
  X,
  Database,
  AlertTriangle,
  Monitor,
} from 'lucide-react-native';
import { useState, useEffect } from 'react';
import { borderRadius, spacing, typography } from '@/constants/theme';
import { useVideoStreamStore, formatBytes } from '@/store/videoStreamStore';
import { useTranslation } from '@/i18n';

const IS_WEB = Platform.OS === 'web';

export type WatchMode = 'live' | 'playback';
export type StreamQuality = 'sd' | 'hd';

export interface DataUsageStats {
  bytesReceived: number;
  duration: number;
  bitrate: number;
}

interface VideoControlPanelProps {
  visible: boolean;
  onClose: () => void;
  /** 設備 ID，用於流量統計 */
  devIdno?: string;
  /** 車牌號 */
  plateNumber?: string;
}

export function VideoControlPanel({
  visible,
  onClose,
  devIdno,
  plateNumber,
}: VideoControlPanelProps) {
  const videoStreamStore = useVideoStreamStore();
  const [refreshKey, setRefreshKey] = useState(0);
  // 使用 refreshKey 強制組件在 interval 觸發時重新渲染
  const vehicleUsage = devIdno ? videoStreamStore.getVehicleUsage(devIdno) : null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = refreshKey; // 引用 refreshKey 以確保組件重新渲染
  const settings = videoStreamStore.settings;
  const { locale, t } = useTranslation();
  const tVideo = (key: string) => t(`videoSettings.${key}`);

  // 當 modal 可見時，每秒刷新一次數據
  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [visible]);

  // 計算流量使用百分比
  const monthlyDataUsagePercent = vehicleUsage
    ? Math.min((vehicleUsage.monthlyBytes / settings.maxDataLimit) * 100, 100)
    : 0;

  // 取得進度條顏色
  const getProgressColor = (percent: number) => {
    if (percent >= 90) return '#EF4444'; // 紅色
    if (percent >= 70) return '#F59E0B'; // 橙色
    return '#22C55E'; // 綠色
  };

  // 處理畫質選擇
  const handleQualityChange = (quality: 'sd' | 'hd') => {
    if (quality === 'hd') {
      const alertMessage = tVideo('highDefinitionAlert');
      const alertTitle = tVideo('highDefinitionConfirm') || tVideo('highDefinition');
      
      if (IS_WEB) {
        // Web: 使用原生 window.alert
        window.alert(`${alertTitle}\n\n${alertMessage}`);
        // 自動切換到 HD
        videoStreamStore.updateSettings({ streamQuality: 'hd' });
      } else {
        // Native: 使用 React Native Alert
        const { Alert } = require('react-native');
        Alert.alert(
          alertTitle,
          alertMessage,
          [
            {
              text: t('common.cancel'),
              style: 'cancel',
            },
            {
              text: t('common.confirm'),
              onPress: () => videoStreamStore.updateSettings({ streamQuality: 'hd' }),
            },
          ]
        );
      }
    } else {
      videoStreamStore.updateSettings({ streamQuality: 'sd' });
    }
  };

  // 處理重置本次使用
  const handleResetSession = () => {
    if (devIdno) {
      videoStreamStore.resetSessionUsage(devIdno);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.panel}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>流量設定</Text>
              {plateNumber && (
                <Text style={styles.headerSubtitle}>{plateNumber}</Text>
              )}
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* 畫質選擇 Section */}
            <View style={styles.section}>
              <View style={styles.qualityHeader}>
                <Monitor size={16} color="#FFFFFF" />
                <Text style={styles.qualityHeaderText}>{tVideo('videoQuality')}</Text>
              </View>

              <View style={styles.qualityOptions}>
                <Pressable
                  style={[
                    styles.qualityOption,
                    settings.streamQuality === 'sd' && styles.qualityOptionSelected,
                  ]}
                  onPress={() => handleQualityChange('sd')}
                >
                  <Text
                    style={[
                      styles.qualityOptionText,
                      settings.streamQuality === 'sd' && styles.qualityOptionTextSelected,
                    ]}
                  >
                    {tVideo('standard')}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.qualityOption,
                    settings.streamQuality === 'hd' && styles.qualityOptionSelected,
                  ]}
                  onPress={() => handleQualityChange('hd')}
                >
                  <Text
                    style={[
                      styles.qualityOptionText,
                      settings.streamQuality === 'hd' && styles.qualityOptionTextSelected,
                    ]}
                  >
                    {tVideo('highDefinition')}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* 流量限額 Section */}
            <View style={styles.section}>
              <View style={styles.limitHeader}>
                <Database size={16} color="#FFFFFF" />
                <Text style={styles.limitHeaderText}>{tVideo('dataLimitPerVehicle')}</Text>
              </View>

              {/* 本次使用 */}
              <View style={styles.limitItem}>
                <View style={styles.limitItemRow}>
                  <Text style={styles.limitLabel}>{tVideo('currentSession')}</Text>
                  <Text style={styles.limitValue}>
                    {formatBytes(vehicleUsage?.sessionBytes || 0)}
                  </Text>
                </View>
                <Pressable style={styles.resetSessionBtn} onPress={handleResetSession}>
                  <Text style={styles.resetSessionBtnText}>{tVideo('resetSessionUsage')}</Text>
                </Pressable>
              </View>

              {/* 本月使用 */}
              <View style={styles.limitItem}>
                <View style={styles.limitItemRow}>
                  <Text style={styles.limitLabel}>{tVideo('monthlyUsage')}</Text>
                  <Text style={styles.limitValue}>
                    {formatBytes(vehicleUsage?.monthlyBytes || 0)} / {formatBytes(settings.maxDataLimit)}
                  </Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${monthlyDataUsagePercent}%`,
                        backgroundColor: getProgressColor(monthlyDataUsagePercent),
                      },
                    ]}
                  />
                </View>
                <View style={styles.limitItemRow}>
                  <Text style={styles.limitPercentText}>
                    {monthlyDataUsagePercent.toFixed(1)}%
                  </Text>
                  <Text style={styles.limitHintText}>
                    {tVideo('monthlyLimit')}: {formatBytes(settings.maxDataLimit)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Warning/Alert Section */}
            {monthlyDataUsagePercent >= 80 && monthlyDataUsagePercent < 100 && (
              <View style={styles.warningSection}>
                <AlertTriangle size={16} color="#F59E0B" />
                <Text style={styles.warningText}>
                  {tVideo('reachingLimit')}
                </Text>
              </View>
            )}

            {monthlyDataUsagePercent >= 100 && (
              <View style={styles.alertSection}>
                <AlertTriangle size={16} color="#FFFFFF" />
                <Text style={styles.alertText}>
                  {tVideo('reachedLimit')}
                </Text>
              </View>
            )}

            <View style={styles.spacer} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: '#1E2530',
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#2A3040',
    borderBottomWidth: 1,
    borderBottomColor: '#3A4050',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: typography.fontSize.xs,
    color: '#8B92A8',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#3A4050',
  },
  qualityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  qualityHeaderText: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  qualityOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  qualityOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A4050',
  },
  qualityOptionSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  qualityOptionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: '#8B92A8',
  },
  qualityOptionTextSelected: {
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: '#8B92A8',
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  limitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  limitHeaderText: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  limitItem: {
    marginBottom: spacing.md,
  },
  limitItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  limitLabel: {
    fontSize: typography.fontSize.sm,
    color: '#8B92A8',
  },
  limitValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  limitPercentText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  limitHintText: {
    fontSize: typography.fontSize.xs,
    color: '#8B92A8',
  },
  resetSessionBtn: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  resetSessionBtnText: {
    fontSize: typography.fontSize.xs,
    color: '#8B92A8',
  },
  warningSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  warningText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: '#F59E0B',
    flex: 1,
  },
  alertSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: '#EF4444',
    borderRadius: borderRadius.md,
  },
  alertText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  resetButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  resetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#3A4050',
  },
  resetBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  spacer: {
    height: spacing.xl,
  },
});
