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
import { X, Maximize2, RefreshCw, WifiOff, Video, ChevronLeft, Play, Search, Download, Settings } from 'lucide-react-native';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { VideoPlaybackSearch } from './VideoPlaybackSearch';
import { VideoControlPanel, type WatchMode, type StreamQuality, type DataUsageStats } from './VideoControlPanel';
import { useGps808Store } from '@/store/gps808Store';
import { gps808Api } from '@/utils/gps808Api';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { defaultColors } from '@/store/themeStore';

const IS_WEB = Platform.OS === 'web';
const REFRESH_INTERVAL = 10_000;

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
}

function CameraSlotComponent({
  slot,
  isSelected,
  onPress,
  onRetry,
  quality = 'sd',
}: CameraSlotComponentProps) {
  const getStatusColor = () => {
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

    if (slot.isError) {
      return (
        <Pressable style={styles.slotPlaceholder} onPress={onRetry}>
          <WifiOff size={28} color="#EF4444" />
          <Text style={[styles.slotPlaceholderText, { color: '#EF4444' }]}>
            {slot.errorMsg || '連線失敗'}
          </Text>
          <Text style={styles.slotRetryText}>點擊重試</Text>
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
        {slot.resolvedUrl && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        )}
      </View>

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
              />
            </View>
            <View style={styles.gridCell}>
              <MemoizedCameraSlot
                slot={slots[1]}
                isSelected={selectedSlotIndex === 1}
                onPress={() => handleSlotPress(1)}
                onRetry={() => handleRetry(1)}
                quality={streamQuality}
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
              />
            </View>
            <View style={styles.gridCell}>
              <MemoizedCameraSlot
                slot={slots[3]}
                isSelected={selectedSlotIndex === 3}
                onPress={() => handleSlotPress(3)}
                onRetry={() => handleRetry(3)}
                quality={streamQuality}
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
