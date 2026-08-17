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
} from 'lucide-react-native';
import { borderRadius, spacing, typography } from '@/constants/theme';
import { useVideoStreamStore, formatBytes } from '@/store/videoStreamStore';

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
  const vehicleUsage = devIdno ? videoStreamStore.getVehicleUsage(devIdno) : null;
  const settings = videoStreamStore.settings;

  // 計算流量使用百分比
  const dataUsagePercent = vehicleUsage
    ? Math.min((vehicleUsage.bytesReceived / settings.maxDataLimit) * 100, 100)
    : 0;

  // 取得進度條顏色
  const getProgressColor = (percent: number) => {
    if (percent >= 90) return '#EF4444'; // 紅色
    if (percent >= 70) return '#F59E0B'; // 橙色
    return '#22C55E'; // 綠色
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
            {/* 流量限額 Section */}
            <View style={styles.section}>
              <View style={styles.limitHeader}>
                <Database size={16} color="#FFFFFF" />
                <Text style={styles.limitHeaderText}>流量限額（每車）</Text>
              </View>

              {/* Data Limit */}
              <View style={styles.limitItem}>
                <View style={styles.limitItemRow}>
                  <Text style={styles.limitLabel}>已用 / 上限</Text>
                  <Text style={styles.limitValue}>
                    {formatBytes(vehicleUsage?.bytesReceived || 0)} / {formatBytes(settings.maxDataLimit)}
                  </Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${dataUsagePercent}%`,
                        backgroundColor: getProgressColor(dataUsagePercent),
                      },
                    ]}
                  />
                </View>
                <View style={styles.limitItemRow}>
                  <Text style={styles.limitPercentText}>
                    {dataUsagePercent.toFixed(1)}%
                  </Text>
                  <Text style={styles.limitHintText}>
                    最大 {formatBytes(settings.maxDataLimit)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Warning/Alert Section */}
            {dataUsagePercent >= 80 && dataUsagePercent < 100 && (
              <View style={styles.warningSection}>
                <AlertTriangle size={16} color="#F59E0B" />
                <Text style={styles.warningText}>
                  流量即將用盡
                </Text>
              </View>
            )}

            {dataUsagePercent >= 100 && (
              <View style={styles.alertSection}>
                <AlertTriangle size={16} color="#FFFFFF" />
                <Text style={styles.alertText}>
                  已達流量上限，播放將自動中斷
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
