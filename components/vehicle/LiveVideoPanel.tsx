/**
 * 實時影像面板元件
 * 
 * 在車輛詳情頁顯示即時影像串流
 * 支援：
 * - 多通道切換
 * - FLV/HLS 串流播放
 * - 設備狀態檢測
 * - 畫質切換
 */

import { useEffect, useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Video, Wifi, WifiOff, Maximize2, RefreshCw, Camera, Settings, X, Check } from 'lucide-react-native';
import { FlvPlayer } from './FlvPlayer';
import { HlsVideo } from './HlsVideo';
import { gps808Api, getWebProxyBaseUrlSync } from '@/utils/gps808Api';
import { useGps808Store } from '@/store/gps808Store';
import { colors, spacing, typography, borderRadius } from '@/constants/theme';
import { defaultColors } from '@/store/themeStore';

const IS_WEB = Platform.OS === 'web';
/** 手機不支援 flv.js，統一使用 HLS；PC 維持 FLV 以取得最低延遲 */
const USE_HLS = IS_WEB && /Mobi|Android|iPhone|iPad/i.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : '',
);

export interface LiveVideoPanelProps {
  /** GPS 設備 ID */
  devIdno: string;
  /** 通道數量 */
  numChannels?: number;
  /** 是否自動播放 */
  autoPlay?: boolean;
  /** 是否顯示控制欄 */
  showControls?: boolean;
  /** 容器高度 */
  height?: number | string;
  /** 容器寬度 */
  width?: number | string;
  /** 測試模式 */
  testMode?: boolean;
  /** 播放錯誤回調 */
  onError?: (error: string) => void;
  /** 開始播放回調 */
  onPlay?: () => void;
}

type StreamQuality = 'sd' | 'hd';
type PlaybackState = 'idle' | 'loading' | 'playing' | 'playing-hls' | 'playing-worker' | 'error';

function LiveVideoPanelComponent({
  devIdno,
  numChannels = 4,
  autoPlay = true,
  showControls = true,
  height = 220,
  width = '100%',
  testMode = false,
  onError,
  onPlay,
}: LiveVideoPanelProps) {
  // 狀態
  const [activeChannel, setActiveChannel] = useState(0);
  const [quality, setQuality] = useState<StreamQuality>('sd');
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // 從 store 獲取 session
  const { isConnected } = useGps808Store();

  // 檢查設備狀態
  const checkDeviceStatus = useCallback(async () => {
    if (!devIdno) return;

    setIsLoading(true);
    try {
      const result = await gps808Api.getDeviceStatus(devIdno, false);
      
      if (result.result === 0 && result.status) {
        // online status: ol=1 表示在線
        const onlineStatus = result.status.ol;
        setIsOnline(onlineStatus === 1 || onlineStatus === '1');
        
        // 如果有通道數據，使用設備返回的值
        const chanNum = result.status.ChanNum;
        if (chanNum !== undefined && chanNum !== null && chanNum !== '') {
          const parsed = typeof chanNum === 'string' ? parseInt(chanNum, 10) : chanNum;
          if (!isNaN(parsed) && parsed > 0) {
            // 可以更新 numChannels，但這裡保持 props 傳入的預設值
            console.log('[LiveVideo] Device channels:', parsed);
          }
        }
      } else {
        setIsOnline(false);
      }
    } catch (err) {
      console.error('[LiveVideo] Failed to check device status:', err);
      setIsOnline(false);
    } finally {
      setIsLoading(false);
    }
  }, [devIdno]);

  // 獲取影像 URL
  const fetchVideoUrl = useCallback(async () => {
    if (!devIdno || !isConnected) {
      setVideoUrl(null);
      return;
    }

    setPlaybackState('loading');
    setErrorMsg(null);

    try {
      // 先檢查 session 是否有效
      const isSessionValid = await gps808Api.ping();
      if (!isSessionValid) {
        setPlaybackState('error');
        setErrorMsg('GPS Session 已過期，請重新登入');
        onError?.('GPS Session 已過期');
        return;
      }

      const jsession = await gps808Api.getStoredSession();

      if (jsession && IS_WEB) {
        // Web 端：使用 hls.js 透過 Cloudflare Worker 代理 HLS 串流
        // 808GPS 官方 H5 播放器頁面是 Flash 或需手動互動，難以 iframe 嵌入
        const streamParam = quality === 'sd' ? 1 : 0;
        const workerBase = 'https://fleet-gps-proxy.infotcjeff2.workers.dev';
        const hlsUrl = `${workerBase}/hls-stream?devIdno=${encodeURIComponent(devIdno)}&channel=${activeChannel}&stream=${streamParam}&jsessionId=${encodeURIComponent(jsession)}`;
        setVideoUrl(hlsUrl);
        setPlaybackState('playing-worker');
        onPlay?.();
        return;
      }
        // 原生端直接使用
        const result = await gps808Api.getLiveVideoUrl(devIdno, {
          channel: activeChannel,
          quality,
          protocol: USE_HLS ? 'hls' : 'flv',
        });
        
        if (result.result === 0 && result.flvUrl) {
          setVideoUrl(result.flvUrl);
          setPlaybackState('playing');
          onPlay?.();
        } else {
          setPlaybackState('error');
          setErrorMsg(result.error || '無法獲取影像 URL');
          onError?.(result.error || '無法獲取影像 URL');
        }
      }
    } catch (err) {
      console.error('[LiveVideo] Failed to fetch video URL:', err);
      setPlaybackState('error');
      setErrorMsg(String(err));
      onError?.(String(err));
    }
  }, [devIdno, activeChannel, quality, isConnected, onPlay, onError]);

  // 組件掛載時檢查設備狀態
  useEffect(() => {
    checkDeviceStatus();
  }, [checkDeviceStatus]);

  // 設備 ID 或通道改變時重新獲取 URL
  useEffect(() => {
    if (isOnline && isConnected) {
      fetchVideoUrl();
    } else {
      setVideoUrl(null);
      setPlaybackState('idle');
    }
  }, [isOnline, isConnected, fetchVideoUrl]);

  // 處理播放錯誤
  const handlePlayerError = useCallback((error: string) => {
    setPlaybackState('error');
    setErrorMsg(error);
    onError?.(error);
  }, [onError]);

  // 重試
  const handleRetry = useCallback(() => {
    fetchVideoUrl();
  }, [fetchVideoUrl]);

  // 測試模式
  if (testMode) {
    return (
      <View style={[styles.container, { height, width }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Video size={16} color={colors.primary} />
            <Text style={styles.title}>實時影像</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.statusBadge}>
              <Camera size={12} color={colors.textSecondary} />
              <Text style={styles.statusText}>{numChannels} 通道</Text>
            </View>
          </View>
        </View>
        <View style={styles.playerContainer}>
          <Video size={48} color={colors.textSecondary} />
          <Text style={styles.noSignalText}>測試模式 - 實時影像面板</Text>
        </View>
      </View>
    );
  }

  // 渲染播放器
  const renderPlayer = () => {
    if (!isOnline) {
      return (
        <View style={styles.playerContainer}>
          <WifiOff size={48} color={colors.textSecondary} />
          <Text style={styles.noSignalText}>設備離線</Text>
          <Text style={styles.noSignalSubtext}>無法觀看實時影像</Text>
        </View>
      );
    }

    if (!isConnected) {
      return (
        <View style={styles.playerContainer}>
          <Video size={48} color={colors.textSecondary} />
          <Text style={styles.noSignalText}>未連接 GPS 服務</Text>
          <Text style={styles.noSignalSubtext}>請先連接 808GPS 系統</Text>
        </View>
      );
    }

    if (playbackState === 'loading' || isLoading) {
      return (
        <View style={styles.playerContainer}>
          <ActivityIndicator size={32} color={defaultColors.primary} />
          <Text style={styles.noSignalText}>載入中...</Text>
        </View>
      );
    }

    if (playbackState === 'error') {
      return (
        <View style={styles.playerContainer}>
          <WifiOff size={48} color="#EF4444" />
          <Text style={styles.errorText}>{errorMsg || '播放錯誤'}</Text>
          <Pressable style={styles.retryBtn} onPress={handleRetry}>
            <RefreshCw size={14} color="#FFFFFF" />
            <Text style={styles.retryBtnText}>重試</Text>
          </Pressable>
        </View>
      );
    }

    if (videoUrl) {
      if (playbackState === 'playing-worker' || playbackState === 'playing-hls') {
        // Web 端：使用 hls.js 透過 Cloudflare Worker 代理 HLS 串流
        return (
          <HlsVideo
            url={videoUrl}
            autoPlay={autoPlay}
            muted={false}
            controls={true}
          />
        );
      }
      return (
        <FlvPlayer
          src={videoUrl}
          mode="live"
          autoplay={autoPlay}
          muted={false}
          aspectRatio="16:9"
          onError={handlePlayerError}
          onPlay={onPlay}
        />
      );
    }

    return (
      <View style={styles.playerContainer}>
        <Video size={48} color={colors.textSecondary} />
        <Text style={styles.noSignalText}>點擊播放</Text>
        <Text style={styles.noSignalSubtext}>選擇通道後開始播放</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { height, width }]}>
      {/* 標題欄 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Video size={16} color={colors.primary} />
          <Text style={styles.title}>實時影像</Text>
        </View>
        <View style={styles.headerRight}>
          {/* 狀態指示 */}
          {isOnline === null ? (
            <View style={[styles.statusBadge, styles.loadingBadge]}>
              <ActivityIndicator size={10} color={colors.textSecondary} />
              <Text style={styles.statusText}>檢測中</Text>
            </View>
          ) : isOnline ? (
            <Pressable 
              style={[styles.statusBadge, styles.onlineBadge]} 
              onPress={checkDeviceStatus}
            >
              <Wifi size={12} color="#22C55E" />
              <Text style={[styles.statusText, styles.onlineText]}>線上</Text>
            </Pressable>
          ) : (
            <Pressable 
              style={[styles.statusBadge, styles.offlineBadge]} 
              onPress={checkDeviceStatus}
            >
              <WifiOff size={12} color="#EF4444" />
              <Text style={[styles.statusText, styles.offlineText]}>離線</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* 通道選擇 */}
      <View style={styles.channelSelector}>
        {Array.from({ length: Math.max(1, numChannels) }).map((_, i) => (
          <Pressable
            key={i}
            style={[
              styles.channelBtn,
              activeChannel === i && styles.channelBtnActive
            ]}
            onPress={() => setActiveChannel(i)}
          >
            <Text style={[
              styles.channelText,
              activeChannel === i && styles.channelTextActive
            ]}>
              CH{i}
            </Text>
          </Pressable>
        ))}

        {/* 畫質切換 */}
        <View style={styles.qualityToggle}>
          <Pressable
            style={[
              styles.qualityBtn,
              quality === 'sd' && styles.qualityBtnActive
            ]}
            onPress={() => setQuality('sd')}
          >
            <Text style={[
              styles.qualityText,
              quality === 'sd' && styles.qualityTextActive
            ]}>
              SD
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.qualityBtn,
              quality === 'hd' && styles.qualityBtnActive
            ]}
            onPress={() => setQuality('hd')}
          >
            <Text style={[
              styles.qualityText,
              quality === 'hd' && styles.qualityTextActive
            ]}>
              HD
            </Text>
          </Pressable>
        </View>

        {/* 刷新按鈕 */}
        <Pressable style={styles.refreshBtn} onPress={handleRetry}>
          <RefreshCw size={14} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* 播放器區域 */}
      <View style={styles.playerWrapper}>
        {renderPlayer()}
      </View>

      {/* 設備資訊 */}
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceInfoText}>
          設備: {devIdno} | 通道: {activeChannel} | 畫質: {quality === 'hd' ? '高清' : '標清'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.cardHover,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
  },
  loadingBadge: {
    backgroundColor: colors.background,
  },
  onlineBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  offlineBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  statusText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  onlineText: {
    color: '#22C55E',
  },
  offlineText: {
    color: '#EF4444',
  },
  channelSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    backgroundColor: colors.card,
  },
  channelBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
  },
  channelBtnActive: {
    backgroundColor: defaultColors.primary,
  },
  channelText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  channelTextActive: {
    color: '#FFFFFF',
  },
  qualityToggle: {
    flexDirection: 'row',
    marginLeft: 'auto',
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  qualityBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  qualityBtnActive: {
    backgroundColor: colors.primary,
  },
  qualityText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  qualityTextActive: {
    color: '#FFFFFF',
  },
  refreshBtn: {
    padding: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
  },
  playerWrapper: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  playerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  noSignalText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  noSignalSubtext: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: '#EF4444',
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: defaultColors.primary,
    borderRadius: borderRadius.md,
  },
  retryBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  deviceInfo: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.cardHover,
  },
  deviceInfoText: {
    fontSize: 10,
    color: colors.textTertiary,
    fontFamily: 'monospace',
  },
});

export const LiveVideoPanel = memo(LiveVideoPanelComponent);
