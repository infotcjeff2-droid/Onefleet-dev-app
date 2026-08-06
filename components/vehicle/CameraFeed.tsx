import React, { useEffect, useRef, useState, memo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { WifiOff, Video } from 'lucide-react-native';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { gps808Api } from '@/utils/gps808Api';
import { useGps808Store } from '@/store/gps808Store';
import { FlvPlayer } from './FlvPlayer';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { defaultColors } from '@/store/themeStore';

const IS_WEB = typeof window !== 'undefined';

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
}

type FeedState = 'loading' | 'streaming' | 'device-offline' | 'offline' | 'error' | 'no-device';

function CameraFeedComponent({
  item,
  isSelected = false,
  onPress,
  quality = 'sd',
  onQualityChange,
  showQualityControl = false,
}: CameraFeedProps) {
  const { plateNumber, vehicleName, streamUrl, devIdno, channel = 0 } = item;
  const [feedState, setFeedState] = useState<FeedState>(
    devIdno ? 'loading' : streamUrl ? 'loading' : 'offline'
  );
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDeviceOnline, setIsDeviceOnline] = useState<boolean | null>(null);
  const { isConnected } = useGps808Store();

  const displayLabel = plateNumber || vehicleName || item.id;

  // 初始化和監控設備狀態與串流
  useEffect(() => {
    if (!devIdno || !isConnected) {
      setFeedState('device-offline');
      return;
    }

    // 檢查設備狀態
    const checkStatus = async () => {
      try {
        const result = await gps808Api.getDeviceStatus(devIdno, false);
        if (result.result === 0 && result.status) {
          const online = result.status.ol === 1 || result.status.ol === '1';
          setIsDeviceOnline(online);
          return online;
        }
        setIsDeviceOnline(false);
        return false;
      } catch {
        setIsDeviceOnline(false);
        return false;
      }
    };

    // 取得串流 URL
    const resolveUrl = async () => {
      setFeedState('loading');
      setErrorMsg(null);

      try {
        const jsession = await gps808Api.getStoredSession();

        if (jsession && IS_WEB) {
          const streamParam = quality === 'sd' ? 1 : 0;
          const url = `http://localhost:3001/api/gps/flv-stream?devIdno=${devIdno}&channel=${channel}&stream=${streamParam}&jsessionId=${jsession}`;
          setResolvedUrl(url);
          setFeedState('streaming');
        } else {
          const result = await gps808Api.getLiveVideoUrl(devIdno, {
            channel,
            quality,
            protocol: 'flv',
          });

          if (result.result === 0 && result.videoUrl) {
            setResolvedUrl(result.videoUrl);
            setFeedState('streaming');
          } else {
            setErrorMsg(result.error || '無法取得影像 URL');
            setFeedState('error');
          }
        }
      } catch (err) {
        setErrorMsg(String(err));
        setFeedState('error');
      }
    };

    // 同時檢查狀態和取得 URL
    checkStatus().then((online) => {
      if (online !== false) {
        resolveUrl();
      } else {
        setFeedState('device-offline');
      }
    });
  }, [devIdno, channel, isConnected]);

  // 為了穩定性，quality 變更時不立即更新 URL
  // 如需切換畫質，可透過重新選擇設備來刷新

  const getStatusColor = () => {
    if (feedState === 'streaming') return '#22C55E';
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
        return (
          <FlvPlayer
            src={resolvedUrl}
            mode="live"
            autoplay
            muted={true}
            controls={true}
            aspectRatio="full"
            onError={(err) => {
              setFeedState('error');
              setErrorMsg(err);
            }}
          />
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
        return (
          <Pressable style={styles.placeholder} onPress={devIdno ? resolveStreamUrl : undefined}>
            <View style={styles.placeholderIcon}>
              <WifiOff size={28} color="#EF4444" />
            </View>
            <Text style={[styles.placeholderLabel, { color: '#EF4444' }]}>
              {errorMsg?.includes('404') ? '影像服務未開通' 
                : errorMsg?.includes('權限') ? '無影像查看權限'
                : errorMsg?.includes('未連接') ? '影像串流未連接'
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
          {feedState === 'streaming' && (
            <View style={styles.streamBadge}>
              <Text style={styles.streamBadgeText}>LIVE</Text>
            </View>
          )}
          {feedState === 'streaming-pending' && (
            <View style={[styles.streamBadge, { backgroundColor: '#3B82F6' }]}>
              <Text style={styles.streamBadgeText}>就緒</Text>
            </View>
          )}
          {feedState === 'loading' && (
            <View style={[styles.streamBadge, { backgroundColor: '#F59E0B' }]}>
              <Text style={styles.streamBadgeText}>...</Text>
            </View>
          )}
          {showQualityControl && (feedState === 'streaming' || feedState === 'streaming-pending') && (
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
        </View>
      </View>

      {/* Video / Placeholder Area — streaming 時禁用 pointerEvents 讓 FlvPlayer 可點擊 */}
      <View style={styles.videoArea} pointerEvents={feedState === 'streaming' ? 'box-none' : 'auto'}>
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
});
