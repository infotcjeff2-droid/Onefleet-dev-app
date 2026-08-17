import { useEffect, useRef, useState, useCallback, memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  TouchableOpacity,
  Dimensions,
  StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { X, Maximize2, RefreshCw, WifiOff, Video, ChevronLeft, Play, Search, Download, Settings, AlertCircle } from 'lucide-react-native';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { VideoPlaybackSearch } from './VideoPlaybackSearch';
import { VideoControlPanel, type WatchMode, type StreamQuality, type DataUsageStats } from './VideoControlPanel';
import { useGps808Store } from '@/store/gps808Store';
import { gps808Api } from '@/utils/gps808Api';
import { useVideoStreamStore, formatBytes, formatDuration } from '@/store/videoStreamStore';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { defaultColors } from '@/store/themeStore';

const IS_WEB = Platform.OS === 'web';
const REFRESH_INTERVAL = 10_000;

// 3 分鐘計時器常數
const MAX_STREAMING_DURATION = 3 * 60; // 180 秒

export interface CameraSource {
  id: string;
  label: string;
  devIdno?: string;
  channel?: number;
  streamUrl?: string;
}

interface CameraSlot {
  id: string;
  label: string;
  devIdno?: string;
  channel?: number;
  streamUrl?: string;
  isOnline: boolean;
  isLoading: boolean;
  isError: boolean;
  errorMsg?: string;
  resolvedUrl?: string | null;
}

type FeedState = 'loading' | 'streaming' | 'offline' | 'error' | 'no-device';

interface QuadCameraMonitorProps {
  visible: boolean;
  onClose: () => void;
  cameras: CameraSource[];
  title?: string;
  /** 設備號（用於錄像查詢） */
  devIdno?: string;
  /** 車牌號（用於錄像查詢） */
  plateNumber?: string;
}

interface CameraSlotComponentProps {
  slot: CameraSlot;
  isSelected: boolean;
  onPress: () => void;
  onRetry: () => void;
  quality?: StreamQuality;
  /** 剩餘播放時間（秒） */
  remainingTime?: number;
  /** 已使用流量（bytes） */
  dataUsed?: number;
  /** 流量限額（bytes） */
  dataLimit?: number;
  /** 是否超限 */
  isOverLimit?: boolean;
  /** 流量限制警告訊息 */
  limitWarning?: string;
}

function CameraSlotComponent({
  slot,
  isSelected,
  onPress,
  onRetry,
  quality = 'sd',
  remainingTime = 0,
  dataUsed = 0,
  dataLimit = 0,
  isOverLimit = false,
  limitWarning,
}: CameraSlotComponentProps) {
  const getStatusColor = () => {
    if (isOverLimit) return '#EF4444';
    if (slot.resolvedUrl) return '#22C55E';
    if (slot.isLoading) return '#F59E0B';
    if (slot.isError) return '#EF4444';
    return '#6B7280';
  };

  const renderContent = () => {
    if (!slot.devIdno && !slot.streamUrl) {
      return (
        <View style={styles.slotPlaceholder}>
          <Video size={32} color={colors.textTertiary} />
          <Text style={styles.slotPlaceholderText}>無影像來源</Text>
        </View>
      );
    }

    if (slot.isError || isOverLimit) {
      return (
        <Pressable style={styles.slotPlaceholder} onPress={onRetry}>
          <WifiOff size={28} color="#EF4444" />
          <Text style={[styles.slotPlaceholderText, { color: '#EF4444' }]}>
            {isOverLimit ? (limitWarning || '流量/時長已達上限') : (slot.errorMsg || '連線失敗')}
          </Text>
          <Text style={styles.slotRetryText}>
            {isOverLimit ? '已自動斷開' : '點擊重試'}
          </Text>
        </Pressable>
      );
    }

    if (slot.isLoading) {
      return (
        <View style={styles.slotPlaceholder}>
          <LoadingSpinner size={28} color={defaultColors.primary} />
          <Text style={styles.slotPlaceholderText}>連線中...</Text>
        </View>
      );
    }

    if (slot.resolvedUrl) {
      // Web 端使用支援 HLS/FLV 的統一播放器
      if (IS_WEB) {
        const playerUrl = `/live-player.html?url=${encodeURIComponent(slot.resolvedUrl)}&devIdno=${encodeURIComponent(slot.devIdno || '')}&channel=${slot.channel || 0}&quality=${quality}&protocol=hls`;

        return (
          <View style={styles.videoContainer}>
            <iframe
              key={slot.resolvedUrl}
              src={playerUrl}
              style={styles.iframe}
              allow="fullscreen; autoplay"
              title={slot.label}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-storage-access-by-user-activation"
            />
          </View>
        );
      }
      // 原生端使用 WebView
      return (
        <View style={styles.videoContainer}>
          <WebView
            source={{ uri: slot.resolvedUrl }}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            mixedContentMode="always"
            allowsFullscreenVideo
            startInLoadingState
            onError={() => {
              // Error handled by parent
            }}
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <LoadingSpinner size={20} />
              </View>
            )}
          />
        </View>
      );
    }

    return (
      <View style={styles.slotPlaceholder}>
        <Video size={32} color={colors.textTertiary} />
        <Text style={styles.slotPlaceholderText}>即時影像研究中</Text>
        <Text style={styles.slotRetryText}>請使用錄像下載功能</Text>
      </View>
    );
  };

  return (
    <Pressable
      style={[
        styles.slotContainer,
        isSelected && styles.slotContainerSelected,
      ]}
      onPress={onPress}
    >
      {/* Slot Header */}
      <View style={styles.slotHeader}>
        <View style={styles.slotHeaderLeft}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={styles.slotLabel} numberOfLines={1}>
            {slot.label}
          </Text>
        </View>
        <View style={styles.slotHeaderRight}>
          {slot.resolvedUrl && !isOverLimit && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          )}
          {isOverLimit && (
            <View style={[styles.liveBadge, { backgroundColor: '#EF4444' }]}>
              <AlertCircle size={8} color="#FFFFFF" />
              <Text style={styles.liveBadgeText}>超限</Text>
            </View>
          )}
        </View>
      </View>

      {/* Timer and Data Usage Bar */}
      {slot.resolvedUrl && !isOverLimit && (remainingTime > 0 || dataUsed > 0) && (
        <View style={styles.streamInfoBar}>
          {remainingTime > 0 && (
            <View style={styles.timerContainer}>
              <Text style={styles.timerText}>
                {Math.floor(remainingTime / 60)}:{String(remainingTime % 60).padStart(2, '0')}
              </Text>
            </View>
          )}
          {dataUsed > 0 && dataLimit > 0 && (
            <View style={styles.dataUsageContainer}>
              <Text style={styles.dataUsageText}>
                {formatBytes(dataUsed)} / {formatBytes(dataLimit)}
              </Text>
              <View style={styles.dataUsageBar}>
                <View
                  style={[
                    styles.dataUsageProgress,
                    { width: `${Math.min((dataUsed / dataLimit) * 100, 100)}%` }
                  ]}
                />
              </View>
            </View>
          )}
        </View>
      )}

      {/* Video Content */}
      <View style={styles.slotVideoArea}>{renderContent()}</View>

      {/* Expand indicator */}
      <TouchableOpacity style={styles.expandBtn} onPress={onPress}>
        <Maximize2 size={12} color="rgba(255,255,255,0.6)" />
      </TouchableOpacity>
    </Pressable>
  );
}

const MemoizedCameraSlot = memo(CameraSlotComponent);

export function QuadCameraMonitor({
  visible,
  onClose,
  cameras,
  title = '即時錄像監控',
  devIdno: propDevIdno,
  plateNumber,
}: QuadCameraMonitorProps) {
  const { t } = useTranslation();
  const { isConnected } = useGps808Store();
  const [slots, setSlots] = useState<CameraSlot[]>([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [fullscreenSlot, setFullscreenSlot] = useState<CameraSlot | null>(null);
  const [showVideoSearch, setShowVideoSearch] = useState(false);
  const [showControlPanel, setShowControlPanel] = useState(false);
  const [watchMode, setWatchMode] = useState<WatchMode>('live');
  const [streamQuality, setStreamQuality] = useState<StreamQuality>('sd');
  const [dataUsage, setDataUsage] = useState<DataUsageStats>({ bytesReceived: 0, duration: 0, bitrate: 0 });
  const retryTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // 流量限制狀態
  const videoStreamStore = useVideoStreamStore();
  const [streamingStartTime, setStreamingStartTime] = useState<Record<string, number>>({});
  const [remainingTimes, setRemainingTimes] = useState<Record<string, number>>({});
  const [slotOverLimits, setSlotOverLimits] = useState<Record<string, { isOver: boolean; reason?: string }>>({});
  const [slotDataUsage, setSlotDataUsage] = useState<Record<string, number>>({});

  // 使用 ref 保存最新值以避免閉包問題
  const slotsRef = useRef(slots);
  const streamingStartTimeRef = useRef(streamingStartTime);
  slotsRef.current = slots;
  streamingStartTimeRef.current = streamingStartTime;

  // 計時器：每秒更新一次剩餘時間並檢查超限
  useEffect(() => {
    if (!visible) return;

    const timer = setInterval(() => {
      const currentSlots = slotsRef.current;
      const currentStartTimes = streamingStartTimeRef.current;
      const now = Date.now();
      const newRemaining: Record<string, number> = {};
      const newOverLimits: Record<string, { isOver: boolean; reason?: string }> = {};
      let hasChanges = false;

      Object.entries(currentStartTimes).forEach(([slotId, startTime]) => {
        const elapsedSeconds = Math.floor((now - startTime) / 1000);
        const remaining = MAX_STREAMING_DURATION - elapsedSeconds;

        // 從 store 獲取流量限制檢查
        const slot = currentSlots.find(s => s.id === slotId);
        const devIdno = slot?.devIdno;
        const canContinue = devIdno ? videoStreamStore.canContinueStreaming(devIdno) : { canContinue: true };

        if (remaining <= 0 || !canContinue.canContinue) {
          newRemaining[slotId] = 0;
          newOverLimits[slotId] = { isOver: true, reason: canContinue.reason };
          hasChanges = true;

          // 清除該 slot 的 URL 以斷開播放
          setSlots(prev => {
            const updated = [...prev];
            const slotIndex = updated.findIndex(s => s.id === slotId);
            if (slotIndex !== -1 && updated[slotIndex].resolvedUrl) {
              updated[slotIndex] = { ...updated[slotIndex], resolvedUrl: null };
              return updated;
            }
            return prev;
          });
        } else {
          newRemaining[slotId] = remaining;
          newOverLimits[slotId] = { isOver: false };
        }
      });

      if (Object.keys(newRemaining).length > 0) {
        setRemainingTimes(newRemaining);
        setSlotOverLimits(newOverLimits);
      }
    }, 1000); // 每秒檢查一次

    return () => clearInterval(timer);
  }, [visible, videoStreamStore]);

  // 追蹤每個 slot 的流量使用（模擬估算）
  useEffect(() => {
    if (!visible || slots.length === 0) return;

    const dataTimer = setInterval(() => {
      const currentSlots = slotsRef.current;
      const newUsage: Record<string, number> = {};
      let hasNewUsage = false;

      currentSlots.forEach((slot) => {
        if (slot.resolvedUrl && slot.devIdno) {
          // 估算流量：SD 約 500KB/s，HD 約 1.5MB/s
          const bytesPerSecond = streamQuality === 'hd' ? 1.5 * 1024 * 1024 : 500 * 1024;
          const key = `${slot.id}-${slot.devIdno}`;
          const currentUsage = slotDataUsage[key] || videoStreamStore.getVehicleUsage(slot.devIdno).bytesReceived;
          const addedUsage = currentUsage + bytesPerSecond;
          newUsage[key] = addedUsage;
          hasNewUsage = true;

          // 更新 store 中的流量統計
          videoStreamStore.addDataUsage(slot.devIdno, bytesPerSecond);
        }
      });

      if (hasNewUsage) {
        setSlotDataUsage(prev => ({ ...prev, ...newUsage }));
      }
    }, 1000);

    return () => clearInterval(dataTimer);
  }, [visible, streamQuality, videoStreamStore]);

  // 當 slot 開始播放時記錄開始時間
  useEffect(() => {
    if (!visible) return;

    slots.forEach((slot) => {
      if (slot.resolvedUrl) {
        if (!streamingStartTime[slot.id]) {
          // 新的播放開始
          setStreamingStartTime(prev => ({
            ...prev,
            [slot.id]: Date.now()
          }));
          if (slot.devIdno) {
            videoStreamStore.startStreaming(slot.devIdno);
          }
        }
      } else {
        // 播放已停止
        if (streamingStartTime[slot.id]) {
          const startTime = streamingStartTime[slot.id];
          const duration = Math.floor((Date.now() - startTime) / 1000);
          if (slot.devIdno) {
            videoStreamStore.addDuration(slot.devIdno, duration);
            videoStreamStore.stopStreaming();
          }
          setStreamingStartTime(prev => {
            const updated = { ...prev };
            delete updated[slot.id];
            return updated;
          });
        }
      }
    });
  }, [visible, slots, streamingStartTime, videoStreamStore]);

  // Get the first camera's devIdno for video search if not provided
  const devIdno = propDevIdno || cameras[0]?.devIdno || '';

  // Initialize 4 slots from cameras prop
  useEffect(() => {
    const initialSlots: CameraSlot[] = [];
    for (let i = 0; i < 4; i++) {
      const cam = cameras[i];
      if (cam) {
        initialSlots.push({
          id: cam.id || `cam-${i}`,
          label: cam.label || `Cam ${i + 1}`,
          devIdno: cam.devIdno,
          channel: cam.channel ?? 0,
          streamUrl: cam.streamUrl,
          isOnline: false,
          isLoading: true,
          isError: false,
          resolvedUrl: null,
        });
      } else {
        initialSlots.push({
          id: `empty-${i}`,
          label: `Cam ${i + 1}`,
          isOnline: false,
          isLoading: false,
          isError: false,
        });
      }
    }
    setSlots(initialSlots);
  }, [cameras]);

  // Resolve stream URLs for each slot
  const resolveSlotUrl = useCallback(
    async (slotIndex: number, devIdno?: string, channel?: number, quality?: StreamQuality) => {
      // 使用傳入的參數而不是閉包中的 slots
      const slot = slots[slotIndex];
      if (!slot) return;

      const targetDevIdno = devIdno ?? slot.devIdno;
      const targetChannel = channel ?? slot.channel ?? 0;
      const targetQuality = quality ?? streamQuality;

      if (!targetDevIdno && !slot.streamUrl) {
        setSlots(prev => {
          const updated = [...prev];
          updated[slotIndex] = { ...updated[slotIndex], isLoading: false, isError: false };
          return updated;
        });
        return;
      }

      // Set loading
      setSlots(prev => {
        const updated = [...prev];
        updated[slotIndex] = { ...updated[slotIndex], isLoading: true, isError: false, errorMsg: undefined };
        return updated;
      });

      try {
        if (slot.streamUrl) {
          // Direct stream URL
          setSlots(prev => {
            const updated = [...prev];
            updated[slotIndex] = {
              ...updated[slotIndex],
              isLoading: false,
              isError: false,
              resolvedUrl: slot.streamUrl,
            };
            return updated;
          });
          return;
        }

        if (!targetDevIdno || !isConnected) {
          setSlots(prev => {
            const updated = [...prev];
            updated[slotIndex] = {
              ...updated[slotIndex],
              isLoading: false,
              isError: true,
              errorMsg: !isConnected ? '尚未連線' : '無設備 ID',
            };
            return updated;
          });
          return;
        }

        // Web 端使用 HLS 串流（所有瀏覽器原生 / hls.js 支援）
        if (IS_WEB) {
          const result = await gps808Api.getLiveVideoUrl(targetDevIdno, {
            channel: targetChannel,
            quality: targetQuality,
            protocol: 'hls',
          });

          if (result.result === 0) {
            const finalUrl = result.hlsUrl || result.videoUrl;
            if (finalUrl) {
              setSlots(prev => {
                const updated = [...prev];
                updated[slotIndex] = {
                  ...updated[slotIndex],
                  isLoading: false,
                  isError: false,
                  resolvedUrl: finalUrl,
                };
                return updated;
              });
              return;
            }
          }
          setSlots(prev => {
            const updated = [...prev];
            updated[slotIndex] = {
              ...updated[slotIndex],
              isLoading: false,
              isError: true,
              errorMsg: result.error || '無法取得影像',
            };
            return updated;
          });
          return;
        }

        // 原生端使用 FLV 串流
        const result = await gps808Api.getLiveVideoUrl(targetDevIdno, {
          channel: targetChannel,
          quality: targetQuality,
          protocol: 'flv',
        });

        if (result.result === 0 && result.videoUrl) {
          setSlots(prev => {
            const updated = [...prev];
            updated[slotIndex] = {
              ...updated[slotIndex],
              isLoading: false,
              isError: false,
              resolvedUrl: result.videoUrl,
            };
            return updated;
          });
        } else {
          setSlots(prev => {
            const updated = [...prev];
            updated[slotIndex] = {
              ...updated[slotIndex],
              isLoading: false,
              isError: true,
              errorMsg: result.error || '無法取得影像',
            };
            return updated;
          });
        }
      } catch (err) {
        setSlots(prev => {
          const updated = [...prev];
          updated[slotIndex] = {
            ...updated[slotIndex],
            isLoading: false,
            isError: true,
            errorMsg: String(err),
          };
          return updated;
        });
      }
    },
    [isConnected, streamQuality]
  );

  // Resolve all slots on mount / reconnect
  useEffect(() => {
    if (!visible) return;
    slots.forEach((_, index) => {
      resolveSlotUrl(index);
    });
  }, [visible, isConnected]);

  // Auto-retry failed slots every 30 seconds
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      slots.forEach((slot, index) => {
        if (slot.isError && slot.devIdno) {
          resolveSlotUrl(index);
        }
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [visible, slots, resolveSlotUrl]);

  const handleSlotPress = (index: number) => {
    setSelectedSlotIndex(index);
    setFullscreenSlot(slots[index]);
  };

  const handleFullscreenClose = () => {
    setFullscreenSlot(null);
  };

  const handleRetry = (index: number) => {
    resolveSlotUrl(index);
  };

  const handleRefreshAll = () => {
    slots.forEach((_, index) => {
      resolveSlotUrl(index);
    });
  };

  const onlineCount = slots.filter(s => s.resolvedUrl).length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0D0F14" />
      <View style={styles.modalContainer}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <View style={styles.topBarTitleRow}>
              <Play size={14} color={defaultColors.primary} />
              <Text style={styles.topBarTitle}>{title}</Text>
            </View>
            <Text style={styles.topBarSubtitle}>
              {onlineCount > 0 ? `${onlineCount} 路在線` : '等待連線...'}
            </Text>
          </View>
          <View style={styles.topBarRight}>
            <TouchableOpacity style={styles.refreshAllBtn} onPress={handleRefreshAll}>
              <RefreshCw size={16} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => setShowControlPanel(true)}
            >
              <Settings size={16} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Camera Grid - 2x2 */}
        <View style={styles.gridContainer}>
          {/* Row 1: Cam 1, Cam 2 */}
          <View style={styles.gridRow}>
            <View style={styles.gridCell}>
              <MemoizedCameraSlot
                slot={slots[0]}
                isSelected={selectedSlotIndex === 0}
                onPress={() => handleSlotPress(0)}
                onRetry={() => handleRetry(0)}
                quality={streamQuality}
                remainingTime={remainingTimes[slots[0]?.id] ?? 0}
                dataUsed={slotDataUsage[`${slots[0]?.id}-${slots[0]?.devIdno}`] || videoStreamStore.getVehicleUsage(slots[0]?.devIdno || '').bytesReceived}
                dataLimit={videoStreamStore.settings.maxDataLimit}
                isOverLimit={slotOverLimits[slots[0]?.id]?.isOver ?? false}
                limitWarning={slotOverLimits[slots[0]?.id]?.reason}
              />
            </View>
            <View style={styles.gridCell}>
              <MemoizedCameraSlot
                slot={slots[1]}
                isSelected={selectedSlotIndex === 1}
                onPress={() => handleSlotPress(1)}
                onRetry={() => handleRetry(1)}
                quality={streamQuality}
                remainingTime={remainingTimes[slots[1]?.id] ?? 0}
                dataUsed={slotDataUsage[`${slots[1]?.id}-${slots[1]?.devIdno}`] || videoStreamStore.getVehicleUsage(slots[1]?.devIdno || '').bytesReceived}
                dataLimit={videoStreamStore.settings.maxDataLimit}
                isOverLimit={slotOverLimits[slots[1]?.id]?.isOver ?? false}
                limitWarning={slotOverLimits[slots[1]?.id]?.reason}
              />
            </View>
          </View>

          {/* Row 2: Cam 3, Cam 4 */}
          <View style={styles.gridRow}>
            <View style={styles.gridCell}>
              <MemoizedCameraSlot
                slot={slots[2]}
                isSelected={selectedSlotIndex === 2}
                onPress={() => handleSlotPress(2)}
                onRetry={() => handleRetry(2)}
                quality={streamQuality}
                remainingTime={remainingTimes[slots[2]?.id] ?? 0}
                dataUsed={slotDataUsage[`${slots[2]?.id}-${slots[2]?.devIdno}`] || videoStreamStore.getVehicleUsage(slots[2]?.devIdno || '').bytesReceived}
                dataLimit={videoStreamStore.settings.maxDataLimit}
                isOverLimit={slotOverLimits[slots[2]?.id]?.isOver ?? false}
                limitWarning={slotOverLimits[slots[2]?.id]?.reason}
              />
            </View>
            <View style={styles.gridCell}>
              <MemoizedCameraSlot
                slot={slots[3]}
                isSelected={selectedSlotIndex === 3}
                onPress={() => handleSlotPress(3)}
                onRetry={() => handleRetry(3)}
                quality={streamQuality}
                remainingTime={remainingTimes[slots[3]?.id] ?? 0}
                dataUsed={slotDataUsage[`${slots[3]?.id}-${slots[3]?.devIdno}`] || videoStreamStore.getVehicleUsage(slots[3]?.devIdno || '').bytesReceived}
                dataLimit={videoStreamStore.settings.maxDataLimit}
                isOverLimit={slotOverLimits[slots[3]?.id]?.isOver ?? false}
                limitWarning={slotOverLimits[slots[3]?.id]?.reason}
              />
            </View>
          </View>
        </View>

        {/* Bottom Info Bar */}
        <View style={styles.bottomBar}>
          <View style={styles.bottomBarLeft}>
            <Text style={styles.bottomBarText}>
              點擊任一畫面可放大檢視
            </Text>
          </View>
          {devIdno && (
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={() => setShowVideoSearch(true)}
            >
              <Download size={14} color={defaultColors.primary} />
              <Text style={styles.searchBtnText}>錄像下載</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Video Search Modal */}
      {devIdno && (
        <VideoPlaybackSearch
          visible={showVideoSearch}
          onClose={() => setShowVideoSearch(false)}
          devIdno={devIdno}
          plateNumber={plateNumber}
        />
      )}

      {/* Video Control Panel Modal */}
      <VideoControlPanel
        visible={showControlPanel}
        onClose={() => setShowControlPanel(false)}
        mode={watchMode}
        onModeChange={setWatchMode}
        quality={streamQuality}
        onQualityChange={setStreamQuality}
        dataUsage={dataUsage}
        isOnline={isConnected}
        supportsLive={true}
        supportsPlayback={true}
        devIdno={devIdno}
        onPlaybackPress={() => {
          setShowControlPanel(false);
          setShowVideoSearch(true);
        }}
      />

      {/* Fullscreen Modal for Single Camera */}
      <Modal
        visible={fullscreenSlot !== null}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={handleFullscreenClose}
      >
        <View style={fullscreenStyles.modalContainer}>
          {/* Header */}
          <View style={fullscreenStyles.topBar}>
            <TouchableOpacity style={fullscreenStyles.backBtn} onPress={handleFullscreenClose}>
              <ChevronLeft size={20} color="#FFFFFF" />
              <Text style={fullscreenStyles.backText}>返回</Text>
            </TouchableOpacity>
            <View style={fullscreenStyles.topBarCenter}>
              {fullscreenSlot?.resolvedUrl && (
                <View style={fullscreenStyles.liveBadge}>
                  <View style={fullscreenStyles.liveDot} />
                  <Text style={fullscreenStyles.liveBadgeText}>LIVE</Text>
                </View>
              )}
              <Text style={fullscreenStyles.topBarTitle}>{fullscreenSlot?.label}</Text>
            </View>
            <View style={{ width: 60 }} />
          </View>

          {/* Fullscreen Video */}
          <View style={fullscreenStyles.videoContainer}>
            {fullscreenSlot?.resolvedUrl && (
              IS_WEB ? (
                <iframe
                  key={fullscreenSlot.resolvedUrl}
                  src={fullscreenSlot.resolvedUrl}
                  style={fullscreenStyles.iframe}
                  allow="fullscreen"
                  title={fullscreenSlot.label}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              ) : (
                <WebView
                  source={{ uri: fullscreenSlot.resolvedUrl }}
                  javaScriptEnabled
                  domStorageEnabled
                  originWhitelist={['*']}
                  mixedContentMode="always"
                  allowsFullscreenVideo
                  startInLoadingState
                  onError={() => {}}
                  renderLoading={() => (
                    <View style={fullscreenStyles.loadingOverlay}>
                      <LoadingSpinner size={32} />
                    </View>
                  )}
                />
              )
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#0D0F14',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#161A23',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3040',
  },
  topBarLeft: {
    flex: 1,
  },
  topBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  topBarTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  topBarSubtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  refreshAllBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Grid
  gridContainer: {
    flex: 1,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  gridCell: {
    flex: 1,
    minHeight: 120,
  },

  // Slot styles
  slotContainer: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  slotContainerSelected: {
    borderColor: defaultColors.primary,
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  slotHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  slotHeaderLeft: {
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
  slotLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#22C55E',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  liveBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  slotVideoArea: {
    flex: 1,
    minHeight: 80,
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  iframe: {
    flex: 1,
    border: 0,
    display: 'flex',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  slotPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    backgroundColor: '#0f0f1a',
  },
  slotPlaceholderText: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  slotRetryText: {
    fontSize: 10,
    color: defaultColors.primary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  expandBtn: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
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

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: '#161A23',
    borderTopWidth: 1,
    borderTopColor: '#2A3040',
  },
  bottomBarLeft: {
    flex: 1,
  },
  bottomBarText: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: defaultColors.primary,
  },
  searchBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: defaultColors.primary,
    letterSpacing: 0.3,
  },
});

// Fullscreen modal styles
const fullscreenStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#0D0F14',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: '#161A23',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
  },
  backText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  topBarCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#22C55E',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  topBarTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  iframe: {
    flex: 1,
    border: 0,
    display: 'flex',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
});
