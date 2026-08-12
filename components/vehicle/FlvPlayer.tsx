/**
 * HTTP-FLV 播放器元件
 * 使用 flv.js 在 Web 端播放 FLV 串流
 * 支援即時影像和歷史回放
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { WifiOff, RefreshCw, Maximize2, Wifi, Play, Volume2, VolumeX, Minimize2 } from 'lucide-react-native';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { colors, spacing, typography } from '@/constants/theme';
import { defaultColors } from '@/store/themeStore';

// 動態導入 flv.js（僅 Web 端）
let flvjs: typeof import('flv.js') | null = null;

if (typeof window !== 'undefined') {
  // @ts-expect-error flv.js 動態載入
  import('flv.js').then(module => {
    flvjs = module;
  }).catch(() => {
    console.warn('[FlvPlayer] flv.js 載入失敗');
  });
}

export type StreamQuality = 'sd' | 'hd';
export type WatchMode = 'live' | 'playback';

export interface FlvPlayerProps {
  /** 串流 URL（HTTP-FLV 或直接 FLV URL） */
  src: string;
  /** 是否自動播放 */
  autoplay?: boolean;
  /** 觀看模式：live=即時, playback=回放 */
  mode?: WatchMode;
  /** 畫質：sd=標清, hd=高清 */
  quality?: StreamQuality;
  /** 是否靜音 */
  muted?: boolean;
  /** 是否顯示控制欄 */
  controls?: boolean;
  /** 播放錯誤回調 */
  onError?: (error: string) => void;
  /** 開始播放回調 */
  onPlay?: () => void;
  /** 停止播放回調 */
  onStop?: () => void;
  /** 緩衝開始回調 */
  onBuffering?: (buffering: boolean) => void;
  /** 寬高比 */
  aspectRatio?: '16:9' | '4:3' | 'full';
  /** 測試模式：使用模擬資料 */
  testMode?: boolean;
}

type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'buffering' | 'waiting_for_interaction';

interface DataUsageStats {
  bytesReceived: number;
  duration: number; // 秒
  bitrate: number; // bps
}

function formatDataSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function FlvPlayerComponent({
  src,
  autoplay = true,
  mode = 'live',
  quality = 'sd',
  muted = false,
  controls = true,
  onError,
  onPlay,
  onStop,
  onBuffering,
  aspectRatio = '16:9',
  testMode = false,
}: FlvPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<import('flv.js').Player | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const bytesRef = useRef<number>(0);
  const hasUserInteracted = useRef(false);
  const isPlayingRef = useRef(false);
  const bufferingStartRef = useRef<number | null>(null);
  const initPlayerRef = useRef<(() => void) | null>(null);
  const BUFFERING_TIMEOUT = 15000; // 15秒緩衝超時

  const [playerState, setPlayerState] = useState<PlayerState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [dataUsage, setDataUsage] = useState<DataUsageStats>({
    bytesReceived: 0,
    duration: 0,
    bitrate: 0,
  });
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // 處理使用者點擊（解除靜音和開始播放）
  const handleUserInteraction = useCallback(() => {
    if (needsInteraction && videoRef.current) {
      // 嘗試播放並解除靜音
      videoRef.current.muted = false;
      setIsMuted(false);
      setNeedsInteraction(false);
      hasUserInteracted.current = true;
      
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name === 'NotAllowedError') {
            console.warn('[FlvPlayer] Autoplay still blocked');
          }
        });
      }
    }
  }, [needsInteraction]);

  // 切換靜音
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  }, []);

  // 初始化 FLV.js 播放器
  const initPlayer = useCallback(() => {
    if (!flvjs || !videoRef.current || !src || testMode) return;

    // 清理舊的 player
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    setPlayerState('loading');
    setErrorMsg(null);

    try {
      const player = flvjs.createPlayer({
        type: 'flv',
        url: src,
        isLive: mode === 'live',
        hasAudio: true,
        hasVideo: true,
        cors: true,
      });

      player.attachMediaElement(videoRef.current);
      player.load();

      if (autoplay) {
        // 先嘗試靜音播放（Chrome 允許靜音自動播放）
        videoRef.current.muted = true;
        setIsMuted(true);
        
        const playPromise = player.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            isPlayingRef.current = true;
            setPlayerState('playing');
            startTimeRef.current = Date.now();
            // 靜音 autoplay 成功，標記為已互動（隱藏 overlay）
            hasUserInteracted.current = true;
            setNeedsInteraction(false);
            onPlay?.();
          }).catch((err) => {
            console.warn('[FlvPlayer] Autoplay blocked:', err.name);
            // 自動播放被阻止，需要使用者互動
            setNeedsInteraction(true);
            setPlayerState('waiting_for_interaction');
          });
        }
      }

      player.on(flvjs.Events.ERROR, (errType: string, errDetail: string, errObject: any) => {
        console.error('[FlvPlayer] Error:', errType, errDetail, errObject);
        let errorMessage = `播放錯誤: ${errDetail}`;
        
        // 根據錯誤類型提供更具體的錯誤訊息
        if (errType === 'NetworkError') {
          errorMessage = '網路連線失敗，可能是：CORS 限制、串流伺服器無回應、或 session 已過期';
        } else if (errType === 'MediaError') {
          errorMessage = '影片格式解析失敗';
        } else if (errDetail === 'HttpFLV: Load failed') {
          errorMessage = '無法載入 FLV 串流，請確認：1) 設備在線 2) session 有效 3) 串流伺服器正常';
        }
        
        setPlayerState('error');
        setErrorMsg(errorMessage);
        onError?.(errorMessage);
      });

      // 直播串流不會有 LOADING_COMPLETE，忽略此事件
      // 否則會導致播放被錯誤停止

      playerRef.current = player;
    } catch (err) {
      console.error('[FlvPlayer] Init error:', err);
      setPlayerState('error');
      setErrorMsg(String(err));
      onError?.(String(err));
    }
  }, [src, autoplay, mode, onError, onPlay, onStop, testMode]);

  // 監控數據用量和緩衝超時
  useEffect(() => {
    if (playerState === 'playing' || playerState === 'buffering') {
      statsIntervalRef.current = setInterval(() => {
        // 檢查緩衝超時 - 只在緩衝狀態下檢查
        if (bufferingStartRef.current && playerState === 'buffering') {
          const elapsed = Date.now() - bufferingStartRef.current;
          if (elapsed > BUFFERING_TIMEOUT) {
            console.warn('[FlvPlayer] Buffering timeout...');
            bufferingStartRef.current = null;
            // 清理播放器並設置錯誤狀態
            if (playerRef.current) {
              playerRef.current.destroy();
              playerRef.current = null;
            }
            setPlayerState('error');
            setErrorMsg('連線逾時，請點擊重試');
          }
        }
        
        // 統計數據（只在播放狀態更新）
        if (videoRef.current && playerState === 'playing') {
          const duration = (Date.now() - startTimeRef.current) / 1000;
          const estimatedBitrate = quality === 'hd' ? 4_000_000 : 1_500_000;
          const estimatedBytes = (estimatedBitrate * duration) / 8;
          setDataUsage({
            bytesReceived: estimatedBytes,
            duration,
            bitrate: estimatedBitrate,
          });
        }
      }, 1000);
    }

    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, [playerState, quality]);

  // 監聽影片事件
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPaused(false);
      setPlayerState('playing');
      onPlay?.();
    };

    const handlePause = () => {
      setIsPaused(true);
      setPlayerState('paused');
    };

    const handleWaiting = () => {
      setIsBuffering(true);
      setPlayerState('buffering');
      bufferingStartRef.current = Date.now();
      onBuffering?.(true);
    };

    const handlePlaying = () => {
      setIsBuffering(false);
      setPlayerState('playing');
      bufferingStartRef.current = null;
      onBuffering?.(false);
    };

    const handleError = () => {
      setPlayerState('error');
      setErrorMsg('影片載入失敗');
      onError?.('影片載入失敗');
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError);
    };
  }, [onError, onPlay, onStop, onBuffering]);

  // 初始化播放器
  useEffect(() => {
    if (src && !testMode) {
      // 如果播放器已存在，只更新 URL（使用相同的 media element）
      if (playerRef.current && videoRef.current) {
        // 只在 URL 真正改變時才處理
        if (playerRef.current._currentUrl !== src) {
          console.log('[FlvPlayer] URL changed, reloading...');
          playerRef.current._currentUrl = src;
          // 使用 load() 方法重新載入，不摧毀播放器
          playerRef.current.load();
          
          // 嘗試播放
          videoRef.current.muted = true;
          videoRef.current.play().catch(() => {});
        }
        return;
      }
      
      // 否則創建新播放器
      const timeout = setTimeout(() => {
        initPlayer();
      }, 100);

      return () => {
        clearTimeout(timeout);
        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }
      };
    }
  }, [src, testMode]);

  // 切換播放/暫停
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;

    // 確保已解除靜音
    videoRef.current.muted = false;
    setIsMuted(false);

    if (videoRef.current.paused) {
      // 直播模式下，如果播放器被摧毀或需要重新初始化，重新創建播放器
      if (!playerRef.current && !testMode) {
        console.log('[FlvPlayer] Player not initialized, reinitializing...');
        initPlayer();
        return;
      }
      videoRef.current.play().catch((err) => {
        if (err.name === 'NotAllowedError') {
          setNeedsInteraction(true);
          setPlayerState('waiting_for_interaction');
        } else {
          // 播放失敗時重新初始化播放器
          console.warn('[FlvPlayer] Play failed, reinitializing:', err);
          initPlayer();
        }
      });
    } else {
      videoRef.current.pause();
    }
  }, [initPlayer]);

  // 重試
  const handleRetry = useCallback(() => {
    setPlayerState('idle');
    setErrorMsg(null);
    setNeedsInteraction(false);
    initPlayer();
  }, [initPlayer]);

  // 取得寬高比樣式
  const getAspectRatioStyle = () => {
    switch (aspectRatio) {
      case '16:9':
        return { aspectRatio: 16 / 9 };
      case '4:3':
        return { aspectRatio: 4 / 3 };
      case 'full':
        return { flex: 1 };
      default:
        return { aspectRatio: 16 / 9 };
    }
  };

  // 測試模式渲染
  if (testMode) {
    return (
      <View style={[styles.container, getAspectRatioStyle()]}>
        <View style={styles.testModeContainer}>
          <Play size={48} color={defaultColors.primary} />
          <Text style={styles.testModeText}>HTTP-FLV 播放器</Text>
          <Text style={styles.testModeSubtext}>
            模式: {mode === 'live' ? '即時監控' : '回放'} | 畫質: {quality === 'hd' ? '高清' : '標清'}
          </Text>
          <Text style={styles.testModeSubtext}>
            點擊開始接收串流
          </Text>
        </View>

        {controls && (
          <View style={styles.controlsOverlay}>
            <View style={styles.dataUsageBar}>
              <View style={styles.dataUsageItem}>
                <Wifi size={12} color={colors.textSecondary} />
                <Text style={styles.dataUsageText}>
                  {formatDataSize(dataUsage.bytesReceived)}
                </Text>
              </View>
              <View style={styles.dataUsageItem}>
                <Text style={styles.dataUsageText}>
                  {formatDuration(dataUsage.duration)}
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View
      ref={containerRef}
      style={[styles.container, getAspectRatioStyle()]}
      onClick={handleUserInteraction}
    >
      {/* 影片元素 */}
      <video
        ref={videoRef}
        style={styles.video}
        muted={isMuted}
        playsInline
        autoPlay={autoplay}
        controls={false}
      />

      {/* 等待使用者互動（Chrome 自動播放政策） */}
      {needsInteraction && (
        <Pressable style={styles.interactionOverlay} onPress={handleUserInteraction}>
          <View style={styles.interactionContent}>
            <View style={styles.playButtonLarge}>
              <Play size={48} color="#FFFFFF" />
            </View>
            <Text style={styles.interactionText}>點擊播放影像</Text>
            <Text style={styles.interactionSubtext}>
              由於瀏覽器政策，請點擊畫面以開始播放
            </Text>
          </View>
        </Pressable>
      )}

      {/* 載入中 */}
      {playerState === 'loading' && !needsInteraction && (
        <View style={styles.overlay}>
          <LoadingSpinner size={32} />
          <Text style={styles.overlayText}>連線中...</Text>
        </View>
      )}

      {/* 緩衝中 */}
      {playerState === 'buffering' && (
        <View style={styles.overlay}>
          <ActivityIndicator size={32} color={defaultColors.primary} />
          <Text style={styles.overlayText}>緩衝中...</Text>
        </View>
      )}

      {/* 錯誤 */}
      {playerState === 'error' && (
        <View style={styles.errorOverlay}>
          <WifiOff size={32} color="#EF4444" />
          <Text style={styles.errorText}>{errorMsg || '播放錯誤'}</Text>
          <View style={styles.errorHints}>
            <Text style={styles.errorHintText}>請確認：</Text>
            <Text style={styles.errorHintText}>1. 808GPS 網站可正常觀看影像</Text>
            <Text style={styles.errorHintText}>2. 設備在線且已連接鏡頭</Text>
            <Text style={styles.errorHintText}>3. 嘗試更換通道或畫質</Text>
          </View>
          <Pressable style={styles.retryBtn} onPress={handleRetry}>
            <RefreshCw size={16} color="#FFFFFF" />
            <Text style={styles.retryBtnText}>重試</Text>
          </Pressable>
        </View>
      )}

      {/* 控制欄 */}
      {controls && (playerState === 'playing' || playerState === 'paused') && (
        <View
          style={styles.controlsOverlay}
          onTouchEnd={() => setShowControls(!showControls)}
        >
          {showControls && (
            <>
              {/* 數據用量 */}
              <View style={styles.dataUsageBar}>
                <View style={styles.dataUsageItem}>
                  <Wifi size={12} color={colors.textSecondary} />
                  <Text style={styles.dataUsageText}>
                    {formatDataSize(dataUsage.bytesReceived)}
                  </Text>
                </View>
                <View style={styles.dataUsageItem}>
                  <Text style={styles.dataUsageText}>
                    {formatDuration(dataUsage.duration)}
                  </Text>
                </View>
              </View>

              {/* 播放控制 */}
              <View style={styles.playbackControls}>
                <Pressable style={styles.controlBtn} onPress={togglePlay}>
                  {isPaused ? (
                    <Play size={24} color="#FFFFFF" />
                  ) : (
                    <View style={styles.pauseIcon}>
                      <View style={styles.pauseBar} />
                      <View style={styles.pauseBar} />
                    </View>
                  )}
                </Pressable>
                <Pressable style={styles.controlBtn} onPress={toggleMute}>
                  {isMuted ? (
                    <VolumeX size={24} color="#FFFFFF" />
                  ) : (
                    <Volume2 size={24} color="#FFFFFF" />
                  )}
                </Pressable>
              </View>

              {/* 全屏按鈕 */}
              <Pressable
                style={styles.settingsBtn}
                onPress={() => {
                  if (containerRef.current) {
                    if (!isFullScreen) {
                      if (containerRef.current.requestFullscreen) {
                        containerRef.current.requestFullscreen();
                      } else if ((containerRef.current as any).webkitRequestFullscreen) {
                        (containerRef.current as any).webkitRequestFullscreen();
                      }
                      setIsFullScreen(true);
                    } else {
                      if (document.exitFullscreen) {
                        document.exitFullscreen();
                      } else if ((document as any).webkitExitFullscreen) {
                        (document as any).webkitExitFullscreen();
                      }
                      setIsFullScreen(false);
                    }
                  }
                }}
              >
                {isFullScreen ? (
                  <Minimize2 size={18} color="#FFFFFF" />
                ) : (
                  <Maximize2 size={18} color="#FFFFFF" />
                )}
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#0f0f1a',
    overflow: 'hidden',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    backgroundColor: '#0f0f1a',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  overlayText: {
    fontSize: typography.fontSize.sm,
    color: '#FFFFFF',
    marginTop: spacing.xs,
  },
  interactionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  interactionContent: {
    alignItems: 'center',
    gap: spacing.md,
  },
  playButtonLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: defaultColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interactionText: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  interactionSubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: '#EF4444',
    textAlign: 'center',
  },
  errorHints: {
    marginTop: spacing.sm,
    alignItems: 'flex-start',
  },
  errorHintText: {
    fontSize: 11,
    color: colors.textTertiary,
    marginVertical: 2,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: defaultColors.primary,
    borderRadius: 8,
  },
  retryBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    pointerEvents: 'box-none',
  },
  dataUsageBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  dataUsageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dataUsageText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  playbackControls: {
    position: 'absolute',
    bottom: 40,
    left: '50%',
    transform: [{ translateX: -44 }],
    flexDirection: 'row',
    gap: spacing.md,
  },
  controlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseIcon: {
    flexDirection: 'row',
    gap: 4,
  },
  pauseBar: {
    width: 4,
    height: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  settingsBtn: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  testModeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  testModeText: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  testModeSubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
});

export const FlvPlayer = memo(FlvPlayerComponent);
