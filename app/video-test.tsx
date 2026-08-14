/**
 * 實時影像測試頁面
 * 
 * 直接使用設備 ID 測試實時影像功能
 * URL: /video-test?devIdno=018270193745
 */

import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Video, Wifi, WifiOff, RefreshCw, Settings, X, Camera } from 'lucide-react-native';
import { FlvPlayer } from '@/components/vehicle/FlvPlayer';
import { HlsVideo } from '@/components/vehicle/HlsVideo';
import { gps808Api, getWebProxyBaseUrlSync } from '@/utils/gps808Api';
import { useGps808Store } from '@/store/gps808Store';
import { colors, spacing, typography, borderRadius } from '@/constants/theme';
import { defaultColors } from '@/store/themeStore';

const IS_WEB = Platform.OS === 'web';
/** 手機不支援 flv.js，統一使用 HLS；PC 維持 FLV 以取得最低延遲 */
const USE_HLS = IS_WEB && /Mobi|Android|iPhone|iPad/i.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : '',
);

export default function VideoTestScreen() {
  const { devIdno: queryDevIdno } = useLocalSearchParams<{ devIdno?: string }>();
  const router = useRouter();

  // 預設測試設備
  const DEFAULT_TEST_DEVICE = '018270196339';

  // 狀態
  const [devIdno, setDevIdno] = useState(queryDevIdno || DEFAULT_TEST_DEVICE);
  const [inputDevIdno, setInputDevIdno] = useState(devIdno);
  const [numChannels, setNumChannels] = useState(4);
  const [activeChannel, setActiveChannel] = useState(0);
  const [quality, setQuality] = useState<'sd' | 'hd'>('sd');
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<any>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // 從 store 獲取連線狀態
  const { isConnected } = useGps808Store();

  // 獲取設備狀態
  const fetchDeviceStatus = useCallback(async () => {
    if (!devIdno) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      // 並行請求設備狀態和通道數量
      const [statusResult, channels] = await Promise.all([
        gps808Api.getDeviceStatus(devIdno, true),
        gps808Api.getDeviceChannelCount(devIdno),
      ]);

      if (statusResult.result === 0 && statusResult.status) {
        setDeviceStatus(statusResult.status);
        const onlineStatus = statusResult.status.ol;
        setIsOnline(onlineStatus === 1 || onlineStatus === '1');
        setNumChannels(channels);

        // 如果設備在線，獲取影像 URL
        if (onlineStatus === 1 || onlineStatus === '1') {
          await fetchVideoUrl(channels);
        }
      } else {
        setIsOnline(false);
        setErrorMsg(statusResult.error || '無法獲取設備狀態');
      }
    } catch (err) {
      console.error('[VideoTest] Failed to fetch device status:', err);
      setIsOnline(false);
      setErrorMsg(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [devIdno]);

  // 獲取影像 URL
  const fetchVideoUrl = useCallback(async (channels?: number) => {
    if (!devIdno || !isConnected) {
      setVideoUrl(null);
      return;
    }

    try {
      const jsession = await gps808Api.getStoredSession();

      if (jsession && IS_WEB) {
        const proxyBase = getWebProxyBaseUrlSync();
        const streamPath = USE_HLS ? 'hls-stream' : 'flv-stream';
        const url = `${proxyBase}/api/gps/${streamPath}?devIdno=${devIdno}&channel=${activeChannel}&stream=${quality === 'sd' ? 1 : 0}&jsessionId=${jsession}`;
        setVideoUrl(url);
      } else {
        // 原生端直接使用
        const result = await gps808Api.getLiveVideoUrl(devIdno, {
          channel: activeChannel,
          quality,
          protocol: USE_HLS ? 'hls' : 'flv',
        });
        
        if (result.result === 0 && result.flvUrl) {
          setVideoUrl(result.flvUrl);
        } else {
          setVideoUrl(null);
        }
      }
    } catch (err) {
      console.error('[VideoTest] Failed to fetch video URL:', err);
      setVideoUrl(null);
    }
  }, [devIdno, activeChannel, quality, isConnected]);

  // 提交設備 ID
  const handleSubmit = () => {
    if (inputDevIdno.trim()) {
      setDevIdno(inputDevIdno.trim());
    }
  };

  // 組件掛載時獲取設備狀態
  useEffect(() => {
    if (devIdno) {
      fetchDeviceStatus();
    }
  }, [devIdno]);

  // 設備 ID 改變時重新獲取影像 URL
  useEffect(() => {
    if (isOnline) {
      fetchVideoUrl();
    }
  }, [devIdno, activeChannel, quality]);

  // 格式化座標
  const formatCoordinate = (value: number | string | undefined, isLat: boolean) => {
    if (!value) return 'N/A';
    const num = typeof value === 'string' ? parseFloat(value) : value / 1000000;
    return isLat 
      ? `${num.toFixed(6)}°N` 
      : `${num.toFixed(6)}°E`;
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      {/* 標題欄 */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>實時影像測試</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* 設備 ID 輸入 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>設備 ID</Text>
          <View style={styles.inputRow}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>devIdno</Text>
              <View style={styles.textInput}>
                <Text style={styles.inputText}>{inputDevIdno}</Text>
              </View>
            </View>
            <Pressable style={styles.submitBtn} onPress={handleSubmit}>
              <Text style={styles.submitBtnText}>確認</Text>
            </Pressable>
          </View>
        </View>

        {/* 連線狀態 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>連線狀態</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>808GPS 服務</Text>
              <View style={[styles.statusBadge, isConnected ? styles.onlineBadge : styles.offlineBadge]}>
                {isConnected 
                  ? <Wifi size={14} color="#22C55E" /> 
                  : <WifiOff size={14} color="#EF4444" />
                }
                <Text style={[styles.statusText, isConnected ? styles.onlineText : styles.offlineText]}>
                  {isConnected ? '已連線' : '未連線'}
                </Text>
              </View>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>設備狀態</Text>
              <View style={[styles.statusBadge, isOnline ? styles.onlineBadge : styles.offlineBadge]}>
                {isOnline 
                  ? <Wifi size={14} color="#22C55E" /> 
                  : <WifiOff size={14} color="#EF4444" />
                }
                <Text style={[styles.statusText, isOnline ? styles.onlineText : styles.offlineText]}>
                  {isOnline === null ? '檢測中...' : isOnline ? '線上' : '離線'}
                </Text>
              </View>
            </View>
          </View>
          <Pressable style={styles.refreshBtn} onPress={fetchDeviceStatus}>
            <RefreshCw size={16} color={colors.primary} />
            <Text style={styles.refreshBtnText}>刷新狀態</Text>
          </Pressable>
        </View>

        {/* 設備資訊 */}
        {deviceStatus && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>設備資訊</Text>
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>設備 ID</Text>
                <Text style={styles.infoValue}>{deviceStatus.id || devIdno}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>訊號</Text>
                <Text style={styles.infoValue}>{deviceStatus.net || 'N/A'}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>速度</Text>
                <Text style={styles.infoValue}>{Number(deviceStatus.sp || 0) / 10} km/h</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>方向</Text>
                <Text style={styles.infoValue}>{deviceStatus.hx || 0}°</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>緯度</Text>
                <Text style={styles.infoValue}>{formatCoordinate(deviceStatus.mlat || deviceStatus.lat, true)}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>經度</Text>
                <Text style={styles.infoValue}>{formatCoordinate(deviceStatus.mlng || deviceStatus.lng, false)}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>通道數</Text>
                <Text style={styles.infoValue}>{numChannels}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>地址</Text>
                <Text style={styles.infoValue} numberOfLines={2}>{deviceStatus.ps || 'N/A'}</Text>
              </View>
            </View>
          </View>
        )}

        {/* 播放器控制 */}
        {isOnline && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>播放控制</Text>
            
            {/* 通道選擇 */}
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>通道</Text>
              <View style={styles.channelButtons}>
                {Array.from({ length: numChannels }).map((_, i) => (
                  <Pressable
                    key={i}
                    style={[styles.channelBtn, activeChannel === i && styles.channelBtnActive]}
                    onPress={() => setActiveChannel(i)}
                  >
                    <Text style={[styles.channelBtnText, activeChannel === i && styles.channelBtnTextActive]}>
                      CH{i}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* 畫質選擇 */}
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>畫質</Text>
              <View style={styles.qualityButtons}>
                <Pressable
                  style={[styles.qualityBtn, quality === 'sd' && styles.qualityBtnActive]}
                  onPress={() => setQuality('sd')}
                >
                  <Text style={[styles.qualityBtnText, quality === 'sd' && styles.qualityBtnTextActive]}>
                    SD (標清)
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.qualityBtn, quality === 'hd' && styles.qualityBtnActive]}
                  onPress={() => setQuality('hd')}
                >
                  <Text style={[styles.qualityBtnText, quality === 'hd' && styles.qualityBtnTextActive]}>
                    HD (高清)
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* 錯誤訊息 */}
            {errorMsg && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}
          </View>
        )}

        {/* 播放器 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>播放器</Text>
          <View style={styles.playerContainer}>
            {isOnline && videoUrl ? (
              USE_HLS ? (
                <HlsVideo
                  url={videoUrl}
                  autoPlay
                  muted={false}
                  controls={true}
                />
              ) : (
                <FlvPlayer
                  src={videoUrl}
                  mode="live"
                  autoplay
                  muted={false}
                  aspectRatio="16:9"
                  onError={(err) => setPlaybackError(err)}
                />
              )
            ) : isOnline ? (
              <View style={styles.noVideo}>
                <Video size={48} color={colors.textSecondary} />
                <Text style={styles.noVideoText}>
                  {isConnected ? '點擊上方刷新按鈕獲取影像' : '請先連接 808GPS 服務'}
                </Text>
              </View>
            ) : (
              <View style={styles.noVideo}>
                <WifiOff size={48} color="#EF4444" />
                <Text style={styles.noVideoText}>設備離線</Text>
                <Text style={styles.noVideoSubtext}>無法觀看實時影像</Text>
              </View>
            )}
          </View>
          {playbackError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>播放錯誤: {playbackError}</Text>
            </View>
          )}
        </View>

        {/* 串流 URL */}
        {videoUrl && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{USE_HLS ? 'HLS URL' : 'FLV URL'}</Text>
            <View style={styles.urlBox}>
              <Text style={styles.urlText} selectable>{videoUrl}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inputContainer: {
    flex: 1,
  },
  inputLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  inputText: {
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    fontFamily: 'monospace',
  },
  submitBtn: {
    backgroundColor: defaultColors.primary,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderRadius: borderRadius.md,
  },
  submitBtnText: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  hint: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statusItem: {
    flex: 1,
  },
  statusLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
  },
  onlineBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  offlineBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  statusText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  onlineText: {
    color: '#22C55E',
  },
  offlineText: {
    color: '#EF4444',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  refreshBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  infoItem: {
    width: '48%',
    backgroundColor: colors.background,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  infoLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: 'monospace',
  },
  controlRow: {
    marginBottom: spacing.md,
  },
  controlLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  channelButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  channelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  channelBtnActive: {
    backgroundColor: defaultColors.primary,
  },
  channelBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  channelBtnTextActive: {
    color: '#FFFFFF',
  },
  qualityButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  qualityBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  qualityBtnActive: {
    backgroundColor: defaultColors.primary,
  },
  qualityBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  qualityBtnTextActive: {
    color: '#FFFFFF',
  },
  playerContainer: {
    aspectRatio: 16 / 9,
    backgroundColor: '#0f0f1a',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  noVideo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  noVideoText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  noVideoSubtext: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  errorBox: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: borderRadius.md,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: '#EF4444',
  },
  urlBox: {
    backgroundColor: colors.background,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  urlText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
});
