import React, { useEffect, useRef, useState, memo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Platform } from 'react-native';
import { WifiOff, Video, AlertCircle, Maximize2 } from 'lucide-react-native';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { gps808Api, getWebProxyBaseUrlSync } from '@/utils/gps808Api';
import { useGps808Store } from '@/store/gps808Store';
import { FlvPlayer } from './FlvPlayer';
import { HlsVideo } from './HlsVideo';
import { useVideoStreamStore, formatBytes } from '@/store/videoStreamStore';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { defaultColors } from '@/store/themeStore';

const IS_WEB = typeof window !== 'undefined';
/** 手機不支援 flv.js，統一使用 HLS；PC 維持 FLV 以取得最低延遲 */
const USE_HLS = IS_WEB && Platform.OS === 'web' && /Mobi|Android|iPhone|iPad/i.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : '',
);

// 畫質類型
export type StreamQuality = 'sd' | 'hd';

export interface CameraFeedItem {
  id: string;
  plateNumber?: string;
  vehicleName?: string;
  /** 直接的影像串流 URL，若無則自動透過 devIdno 取得 */
  streamUrl?: string;
  /** 設備 ID，用於自動取得影像串流 URL */
  devIdno?: string;
  /** 通道號（預設 0） */
  channel?: number;
  /** 是否在線 */
  isOnline?: boolean;
}

interface CameraFeedProps {
  item: CameraFeedItem;
  isSelected?: boolean;
  onPress?: () => void;
  /** 當前畫質設定 */
  quality?: StreamQuality;
  /** 畫質變更回調 */
  onQualityChange?: (quality: StreamQuality) => void;
  /** 顯示畫質控制按鈕 */
  showQualityControl?: boolean;
  /** 剩餘播放時間（秒），0 或負數表示無限制 */
  remainingTime?: number;
  /** 已使用流量（bytes） */
  dataUsed?: number;
  /** 流量限額（bytes），0 表示無限制 */
  dataLimit?: number;
  /** 是否超限 */
  isOverLimit?: boolean;
  /** 流量限制警告訊息 */
  limitWarning?: string;
  /** 超限重置回調 */
  onOverLimitReset?: () => void;
  /** 是否已暫停播放 */
  isPaused?: boolean;
  /** 全螢幕按鈕點擊回調 */
  onFullscreen?: (item: CameraFeedItem) => void;
}

type FeedState = 'loading' | 'streaming' | 'streaming-hls' | 'streaming-pending' | 'device-offline' | 'offline' | 'error' | 'no-device';

function CameraFeedComponent({
  item,
  isSelected = false,
  onPress,
  quality = 'sd',
  onQualityChange,
  showQualityControl = false,
  remainingTime = 0,
  dataUsed = 0,
  dataLimit = 0,
  isOverLimit = false,
  limitWarning,
  onOverLimitReset,
  isPaused = false,
  onFullscreen,
}: CameraFeedProps) {
  const { plateNumber, vehicleName, streamUrl, devIdno, channel = 0 } = item;
  const [feedState, setFeedState] = useState<FeedState>(
    devIdno ? 'loading' : streamUrl ? 'loading' : 'offline'
  );
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDeviceOnline, setIsDeviceOnline] = useState<boolean | null>(null);
  const [isMuted, setIsMuted] = useState(true); // 預設靜音
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { isConnected, loadConfig } = useGps808Store();
  const videoStreamStore = useVideoStreamStore();

  // 從 vehicleName 提取鏡頭類型（如 "DSM鏡頭"、"ADAS鏡頭"）
  const getCameraTypeFromVehicleName = (vn?: string): string => {
    if (!vn) return '';
    // vehicleName 格式是 "設備ID 鏡頭類型"，提取鏡頭類型部分
    const parts = vn.split(' ');
    return parts.slice(1).join(' ') || vn; // 返回除了第一個設備ID外的其餘部分
  };

  // 顯示格式：車牌號 鏡頭類型
  const cameraType = getCameraTypeFromVehicleName(vehicleName);
  const displayLabel = cameraType ? `${plateNumber || devIdno} ${cameraType}` : (plateNumber || vehicleName || item.id);

  // 全螢幕處理函數
  const handleFullscreen = useCallback(() => {
    if (!item) return;

    // 直接回調給父組件處理全螢幕
    // 父組件可以打開一個全螢幕的視頻播放視窗
    onFullscreen?.(item);
  }, [item, onFullscreen]);

  // 重試函式 - 提升到組件作用域以便在 JSX 中引用
  const resolveUrl = useCallback(async () => {
    if (!devIdno) {
      setFeedState('offline');
      return;
    }

    if (!isConnected) {
      setFeedState('device-offline');
      return;
    }

    setFeedState('loading');
    setErrorMsg(null);

    try {
      // 先檢查 session 是否有效（使用影像 API 驗證）
      const isSessionValid = await gps808Api.ping();
      if (!isSessionValid) {
        console.log('[CameraFeed] Session 無效或已過期，嘗試自動重連...');
        
        // 呼叫 loadConfig 觸發自動重連
        await loadConfig();
        
        // 重新檢查 session 是否有效
        const isSessionValidAgain = await gps808Api.ping();
        if (!isSessionValidAgain) {
          // 如果重連後 session 仍然無效，可能是用戶沒有配置
          // 嘗試直接連接，讓代理處理 session（代理有 admin session 快取）
          console.log('[CameraFeed] 自動重連失敗，直接嘗試連接...');
        }
      }

      // 檢查設備狀態
      const result = await gps808Api.getDeviceStatus(devIdno, false);
      if (result.result === 0 && result.status) {
        const online = result.status.ol === 1 || result.status.ol === '1';
        setIsDeviceOnline(online);

        if (!online) {
          setFeedState('device-offline');
          return;
        }
      } else {
        setIsDeviceOnline(false);
        setFeedState('device-offline');
        return;
      }

      // 取得串流 URL
      const jsession = await gps808Api.getStoredSession();

      if (jsession && IS_WEB) {
        const streamParam = quality === 'sd' ? 1 : 0;
        const proxyBase = getWebProxyBaseUrlSync();
        const streamPath = USE_HLS ? 'hls-stream' : 'flv-stream';
        const url = `${proxyBase}/api/gps/${streamPath}?devIdno=${devIdno}&channel=${channel}&stream=${streamParam}&jsessionId=${jsession}`;
        setResolvedUrl(url);
        setFeedState(USE_HLS ? 'streaming-hls' : 'streaming');
      } else {
        const videoResult = await gps808Api.getLiveVideoUrl(devIdno, {
          channel,
          quality,
          protocol: USE_HLS ? 'hls' : 'flv',
        });

        if (videoResult.result === 0 && videoResult.videoUrl) {
          setResolvedUrl(videoResult.videoUrl);
          setFeedState('streaming');
        } else {
          setErrorMsg(videoResult.error || '無法取得影像串流');
          setFeedState('error');
        }
      }
    } catch (err) {
      setErrorMsg(String(err));
      setFeedState('error');
    }
  }, [devIdno, channel, quality, isConnected]);

  // 初始化和監控設備狀態與串流
  useEffect(() => {
    // 等待連線就緒
    if (!devIdno) {
      setFeedState('offline');
      return;
    }

    // 如果尚未連線，等待連線建立
    if (!isConnected) {
      setFeedState('device-offline');
      return;
    }

    resolveUrl();
  }, [devIdno, isConnected, resolveUrl]);

  // 為了穩定性，quality 變更時不立即更新 URL
  // 如需切換畫質，可透過重新選擇設備來刷新

  const getStatusColor = () => {
    if (isOverLimit) return '#EF4444';
    if (feedState === 'streaming' || feedState === 'streaming-hls') return '#22C55E';
    if (feedState === 'loading') return '#F59E0B';
    if (feedState === 'error') return '#EF4444';
    if (feedState === 'device-offline') return '#EF4444';
    return '#6B7280';
  };

  const renderContent = () => {
    switch (feedState) {
      case 'loading':
        return (
          <View style={styles.placeholder}>
            <ActivityIndicator size={24} color={defaultColors.primary} />
            <Text style={styles.placeholderLabel}>連線中...</Text>
          </View>
        );

      case 'streaming':
      case 'streaming-pending':
        if (!resolvedUrl) return null;
        // 如果已暫停，不渲染視頻
        if (isPaused) return null;
        return (
          <View style={styles.videoContainer}>
            <FlvPlayer
              src={resolvedUrl}
              mode="live"
              autoplay
              muted={isMuted}
              controls={false}
              aspectRatio="full"
              onError={(err) => {
                setFeedState('error');
                setErrorMsg(err);
              }}
            />
            {/* 自訂聲音開關按鈕 */}
            <Pressable
              style={styles.muteBtn}
              onPress={() => setIsMuted(!isMuted)}
            >
              <Text style={styles.muteBtnText}>
                {isMuted ? '🔇' : '🔊'}
              </Text>
            </Pressable>
          </View>
        );

      case 'streaming-hls':
        if (!resolvedUrl) return null;
        // 如果已暫停，不渲染視頻
        if (isPaused) return null;
        return (
          <View style={styles.videoContainer}>
            <HlsVideo
              url={resolvedUrl}
              autoPlay
              muted={isMuted}
              controls={false}
            />
            {/* 自訂聲音開關按鈕 */}
            <Pressable
              style={styles.muteBtn}
              onPress={() => setIsMuted(!isMuted)}
            >
              <Text style={styles.muteBtnText}>
                {isMuted ? '🔇' : '🔊'}
              </Text>
            </Pressable>
          </View>
        );

      case 'device-offline':
        return (
          <View style={styles.placeholder}>
            <View style={styles.placeholderIcon}>
              <WifiOff size={28} color={colors.textTertiary} />
            </View>
            <Text style={styles.placeholderLabel}>設備離線</Text>
            <Text style={styles.placeholderSub}>請確認設備已開機並連接網路</Text>
          </View>
        );

      case 'error':
        if (isOverLimit) {
          return (
            <Pressable style={styles.placeholder} onPress={onOverLimitReset}>
              <View style={styles.placeholderIcon}>
                <AlertCircle size={28} color="#F59E0B" />
              </View>
              <Text style={[styles.placeholderLabel, { color: '#F59E0B' }]}>
                {limitWarning || '已超時'}
              </Text>
              <Text style={styles.retryText}>點擊重新開始</Text>
            </Pressable>
          );
        }
        return (
          <Pressable style={styles.placeholder} onPress={devIdno ? resolveUrl : undefined}>
            <View style={styles.placeholderIcon}>
              <WifiOff size={28} color="#EF4444" />
            </View>
            <Text style={[styles.placeholderLabel, { color: '#EF4444' }]}>
              {errorMsg?.includes('404') ? '影像服務未開通'
                : errorMsg?.includes('權限') || errorMsg?.includes('影像') ? '無影像查看權限'
                : errorMsg?.includes('JSESSIONID') ? '連線驗證中...'
                : errorMsg?.includes('過期') ? '正在重新連線...'
                : errorMsg || '連線失敗'}
            </Text>
            <Text style={styles.retryText}>
              {devIdno ? '點擊重試' : '無影像設備'}
            </Text>
          </Pressable>
        );

      case 'no-device':
      case 'offline':
      default:
        return (
          <View style={styles.placeholder}>
            <View style={styles.placeholderIcon}>
              <Video size={28} color={colors.textTertiary} />
            </View>
            <Text style={styles.placeholderLabel}>
              {!devIdno ? '無影像串流' : IS_WEB ? '即時影像研究中' : (isConnected ? '設備離線' : '尚未連線')}
            </Text>
            <Text style={styles.placeholderSub}>
              {devIdno ? IS_WEB ? '請使用錄像下載功能' : '點擊「連線」後重試' : '此車無攝影機'}
            </Text>
          </View>
        );
    }
  };

  return (
    <Pressable
      style={[
        styles.container,
        isSelected && styles.containerSelected,
        feedState === 'offline' && styles.containerOffline,
      ]}
      onPress={onPress}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={styles.headerLabel} numberOfLines={1}>
            {displayLabel}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {isOverLimit && (
            <View style={[styles.streamBadge, { backgroundColor: '#F59E0B' }]}>
              <AlertCircle size={8} color="#FFFFFF" />
              <Text style={styles.streamBadgeText}>超限</Text>
            </View>
          )}
          {(feedState === 'streaming' || feedState === 'streaming-hls') && !isOverLimit && (
            <View style={styles.streamBadge}>
              <Text style={styles.streamBadgeText}>LIVE</Text>
            </View>
          )}
          {feedState === 'streaming-pending' && !isOverLimit && (
            <View style={[styles.streamBadge, { backgroundColor: '#3B82F6' }]}>
              <Text style={styles.streamBadgeText}>就緒</Text>
            </View>
          )}
          {feedState === 'loading' && !isOverLimit && (
            <View style={[styles.streamBadge, { backgroundColor: '#F59E0B' }]}>
              <Text style={styles.streamBadgeText}>...</Text>
            </View>
          )}
          {showQualityControl && (feedState === 'streaming' || feedState === 'streaming-hls' || feedState === 'streaming-pending') && !isOverLimit && (
            <Pressable
              style={styles.qualityBtn}
              onPress={() => {
                const newQuality = quality === 'sd' ? 'hd' : 'sd';
                onQualityChange?.(newQuality);
              }}
              hitSlop={4}
            >
              <Text style={styles.qualityBtnText}>
                {quality === 'sd' ? 'SD' : 'HD'}
              </Text>
            </Pressable>
          )}
          {/* 全螢幕按鈕 */}
          {(feedState === 'streaming' || feedState === 'streaming-hls') && !isOverLimit && onFullscreen && (
            <Pressable
              style={styles.fullscreenBtn}
              onPress={handleFullscreen}
              hitSlop={4}
            >
              <Maximize2 size={12} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Video / Placeholder Area — streaming 時禁用 pointerEvents 讓播放器可點擊 */}
      <View
        style={styles.videoArea}
        pointerEvents={
          feedState === 'streaming' || feedState === 'streaming-hls'
            ? 'box-none'
            : 'auto'
        }
      >
        {renderContent()}
      </View>
    </Pressable>
  );
}

export const CameraFeed = memo(CameraFeedComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  containerSelected: {
    borderColor: defaultColors.primary,
  },
  containerOffline: {
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  headerLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  streamBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  streamBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  qualityBtn: {
    backgroundColor: 'rgba(59, 130, 246, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  qualityBtnText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  fullscreenBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoArea: {
    flex: 1,
    minHeight: 80,
  },
  playButtonOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  playButtonLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  playButtonText: {
    fontSize: typography.fontSize.xs,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    backgroundColor: '#0f0f1a',
  },
  placeholderIcon: {
    marginBottom: spacing.xs,
    opacity: 0.6,
  },
  placeholderLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    fontWeight: '600',
    textAlign: 'center',
  },
  placeholderSub: {
    fontSize: 10,
    color: colors.textTertiary,
    opacity: 0.6,
    marginTop: 2,
    textAlign: 'center',
  },
  retryText: {
    fontSize: 10,
    color: defaultColors.primary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
  },
  muteBtn: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteBtnText: {
    fontSize: 18,
  },
  webView: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 10,
  },
  // Stream info bar (timer and data usage)
  streamInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  timerContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  timerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'monospace',
  },
  dataUsageContainer: {
    flex: 1,
    marginLeft: spacing.sm,
    alignItems: 'flex-end',
  },
  dataUsageText: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 2,
  },
  dataUsageBar: {
    width: 60,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  dataUsageProgress: {
    height: '100%',
    backgroundColor: '#22C55E',
    borderRadius: 2,
  },
});
