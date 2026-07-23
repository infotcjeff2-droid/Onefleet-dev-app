import React, { useEffect, useRef, useState, memo, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import { WifiOff, Video } from 'lucide-react-native';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { gps808Api } from '@/utils/gps808Api';
import { useGps808Store } from '@/store/gps808Store';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { defaultColors } from '@/store/themeStore';

const IS_WEB = Platform.OS === 'web';

/** 隔離 WebView TS/eslint 問題的包裝元件（react-native-webview types 落後 React 19） */
const NativeVideoPlayer = ({ uri, onError }: { uri: string; onError: () => void }) => {
  const webViewRef = useRef<WebView>(null);
  // @ts-expect-error WebView overloads don't cover React 19 JSX factory
  return <WebView
    ref={webViewRef as unknown as React.RefObject<WebView>}
    source={{ uri }}
    javaScriptEnabled
    domStorageEnabled
    originWhitelist={['*']}
    mixedContentMode="always"
    allowsFullscreenVideo
    startInLoadingState
    onError={onError}
    renderLoading={() => (
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10,
        }}
      >
        <LoadingSpinner size={20} />
      </View>
    )}
  />;
};

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
}

type FeedState = 'loading' | 'streaming' | 'offline' | 'error' | 'no-device';

function CameraFeedComponent({ item, isSelected = false, onPress }: CameraFeedProps) {
  const { plateNumber, vehicleName, streamUrl, devIdno, channel = 0 } = item;
  const [feedState, setFeedState] = useState<FeedState>(
    devIdno ? 'loading' : streamUrl ? 'loading' : 'offline'
  );
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { isConnected } = useGps808Store();

  const displayLabel = plateNumber || vehicleName || item.id;

  // 自動透過 devIdno 取得影像 URL
  const resolveStreamUrl = useCallback(async () => {
    if (!devIdno || !isConnected) {
      setFeedState('offline');
      return;
    }
    setFeedState('loading');
    setErrorMsg(null);
    try {
      const result = await gps808Api.getLiveVideoUrl(devIdno, { channel });
      if (result.result === 0 && result.videoUrl) {
        setResolvedUrl(result.videoUrl);
        setFeedState('streaming');
      } else {
        setErrorMsg(result.error || '無法取得影像');
        setFeedState('error');
      }
    } catch (err) {
      setErrorMsg(String(err));
      setFeedState('error');
    }
  }, [devIdno, channel, isConnected]);

  useEffect(() => {
    // Native 端用 WebView，Web 端用 iframe。兩者共享同一套 resolveStreamUrl 流程。
    if (devIdno && isConnected) {
      // eslint-disable-next-line -- resolveStreamUrl is async; setState fires in promise callback, not synchronously
      resolveStreamUrl();
    } else if (streamUrl) {
      setResolvedUrl(streamUrl);
      setFeedState('streaming');
    } else {
      setFeedState('offline');
    }
  }, [devIdno, streamUrl, isConnected, resolveStreamUrl]);

  const getStatusColor = () => {
    if (feedState === 'streaming') return '#22C55E';
    if (feedState === 'loading') return '#F59E0B';
    if (feedState === 'error') return '#EF4444';
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
        if (!resolvedUrl) return null;
        // Web 端用 iframe（React Native WebView 不支援 Web）
        if (IS_WEB) {
          return (
            <View style={iframeStyles.container}>
              <iframe
                key={resolvedUrl}
                src={resolvedUrl}
                style={iframeStyles.iframe}
                allow="fullscreen"
                title={displayLabel}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </View>
          );
        }
        return (
          <NativeVideoPlayer
            uri={resolvedUrl}
            onError={() => {
              setFeedState('error');
              setErrorMsg('載入失敗');
            }}
          />
        );

      case 'error':
        return (
          <Pressable style={styles.placeholder} onPress={devIdno ? resolveStreamUrl : undefined}>
            <View style={styles.placeholderIcon}>
              <WifiOff size={28} color="#EF4444" />
            </View>
            <Text style={[styles.placeholderLabel, { color: '#EF4444' }]}>
              {errorMsg || '連線失敗'}
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
              {!devIdno ? '無影像串流' : isConnected ? '設備離線' : '尚未連線'}
            </Text>
            <Text style={styles.placeholderSub}>
              {devIdno ? '點擊「連線」後重試' : '此車無攝影機'}
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
        {feedState === 'streaming' && (
          <View style={styles.streamBadge}>
            <Text style={styles.streamBadgeText}>LIVE</Text>
          </View>
        )}
        {feedState === 'loading' && (
          <View style={[styles.streamBadge, { backgroundColor: '#F59E0B' }]}>
            <Text style={styles.streamBadgeText}>...</Text>
          </View>
        )}
      </View>

      {/* Video / Placeholder Area */}
      <View style={styles.videoArea}>{renderContent()}</View>
    </Pressable>
  );
}

export const CameraFeed = memo(CameraFeedComponent);

// iframe 樣式使用純 JS 物件（不受 React Native StyleSheet 型別限制）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const iframeStyles: Record<string, any> = {
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#0f0f1a' },
  iframe: { flex: 1, border: 0, display: 'flex' as const },
};

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
  videoArea: {
    flex: 1,
    minHeight: 80,
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
