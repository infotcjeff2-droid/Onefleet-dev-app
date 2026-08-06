import { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import {
  X,
  Play,
  Radio,
  ChevronRight,
  WifiOff,
  RefreshCw,
  Gauge,
} from 'lucide-react-native';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { defaultColors } from '@/store/themeStore';

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
  mode: WatchMode;
  onModeChange: (mode: WatchMode) => void;
  quality: StreamQuality;
  onQualityChange: (quality: StreamQuality) => void;
  dataUsage?: DataUsageStats;
  isOnline?: boolean;
  supportsLive?: boolean;
  supportsPlayback?: boolean;
  onPlaybackPress?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatBitrate(kbps: number): string {
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  }
  return `${kbps} kbps`;
}

export function VideoControlPanel({
  visible,
  onClose,
  mode,
  onModeChange,
  quality,
  onQualityChange,
  dataUsage,
  isOnline = true,
  supportsLive = true,
  supportsPlayback = true,
  onPlaybackPress,
}: VideoControlPanelProps) {
  const handleModePress = (newMode: WatchMode) => {
    if (newMode === 'playback' && mode !== 'playback') {
      if (onPlaybackPress) {
        onPlaybackPress();
      } else {
        onModeChange(newMode);
      }
    } else {
      onModeChange(newMode);
    }
  };

  const statsDisplay = useMemo(() => {
    if (!dataUsage) return null;

    const byteDisplay = formatBytes(dataUsage.bytesReceived);
    const durationDisplay = formatDuration(dataUsage.duration);
    const bitrateDisplay = formatBitrate(dataUsage.bitrate);

    return { byteDisplay, durationDisplay, bitrateDisplay };
  }, [dataUsage]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.panel} onPress={e => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>影片控制</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* Connection Status */}
          {!isOnline && (
            <View style={styles.offlineBanner}>
              <WifiOff size={16} color="#FFFFFF" />
              <Text style={styles.offlineText}>設備已離線</Text>
            </View>
          )}

          {/* Watch Mode Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>觀看模式</Text>
            <View style={styles.modeGroup}>
              {supportsLive && (
                <Pressable
                  style={[
                    styles.modeBtn,
                    mode === 'live' && styles.modeBtnActive,
                  ]}
                  onPress={() => handleModePress('live')}
                >
                  <Radio size={18} color={mode === 'live' ? '#FFFFFF' : colors.textSecondary} />
                  <Text
                    style={[
                      styles.modeBtnText,
                      mode === 'live' && styles.modeBtnTextActive,
                    ]}
                  >
                    直播
                  </Text>
                </Pressable>
              )}
              {supportsPlayback && (
                <Pressable
                  style={[
                    styles.modeBtn,
                    mode === 'playback' && styles.modeBtnActive,
                  ]}
                  onPress={() => handleModePress('playback')}
                >
                  <Play size={18} color={mode === 'playback' ? '#FFFFFF' : colors.textSecondary} />
                  <Text
                    style={[
                      styles.modeBtnText,
                      mode === 'playback' && styles.modeBtnTextActive,
                    ]}
                  >
                    回放
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Stream Quality Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>畫質</Text>
            <View style={styles.qualityGroup}>
              <Pressable
                style={[
                  styles.qualityBtn,
                  quality === 'sd' && styles.qualityBtnActive,
                ]}
                onPress={() => onQualityChange('sd')}
              >
                <Text
                  style={[
                    styles.qualityBtnText,
                    quality === 'sd' && styles.qualityBtnTextActive,
                  ]}
                >
                  標清
                </Text>
                <Text style={styles.qualityBtnSubtext}>節省流量</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.qualityBtn,
                  quality === 'hd' && styles.qualityBtnActive,
                ]}
                onPress={() => onQualityChange('hd')}
              >
                <Text
                  style={[
                    styles.qualityBtnText,
                    quality === 'hd' && styles.qualityBtnTextActive,
                  ]}
                >
                  高清
                </Text>
                <Text style={styles.qualityBtnSubtext}>畫質優先</Text>
              </Pressable>
            </View>
          </View>

          {/* Data Usage Stats */}
          {dataUsage && statsDisplay && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>流量統計</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{statsDisplay.byteDisplay}</Text>
                  <Text style={styles.statLabel}>已傳輸</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{statsDisplay.durationDisplay}</Text>
                  <Text style={styles.statLabel}>觀看時長</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{statsDisplay.bitrateDisplay}</Text>
                  <Text style={styles.statLabel}>碼率</Text>
                </View>
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  panel: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#161A23',
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#1E2530',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3040',
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: '#EF4444',
  },
  offlineText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  section: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3040',
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modeGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: '#1a1a2e',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#2A3040',
  },
  modeBtnActive: {
    backgroundColor: defaultColors.primary,
    borderColor: defaultColors.primary,
  },
  modeBtnText: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modeBtnTextActive: {
    color: '#FFFFFF',
  },
  qualityGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  qualityBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: '#1a1a2e',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#2A3040',
  },
  qualityBtnActive: {
    backgroundColor: defaultColors.primary,
    borderColor: defaultColors.primary,
  },
  qualityBtnText: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  qualityBtnTextActive: {
    color: '#FFFFFF',
  },
  qualityBtnSubtext: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: '#1a1a2e',
    borderRadius: borderRadius.md,
  },
  statValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: defaultColors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
});
