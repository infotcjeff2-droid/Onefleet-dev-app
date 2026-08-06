/**
 * useVideoPlayer
 *
 * 808GPS 實時影像播放器的自訂 Hook。
 * 封裝設備狀態查詢、影片 URL 獲取、通道/畫質切換等邏輯。
 *
 * 使用範例：
 * ```tsx
 * const {
 *   devIdno, setDevIdno,
 *   activeChannel, setActiveChannel,
 *   quality, setQuality,
 *   isOnline, isLoading,
 *   deviceStatus, videoUrl,
 *   errorMsg, playbackError,
 *   numChannels,
 *   refresh,
 * } = useVideoPlayer();
 * ```
 */
import { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { gps808Api } from '@/utils/gps808Api';
import { useGps808Store } from '@/store/gps808Store';

const IS_WEB = Platform.OS === 'web';

export interface DeviceStatus {
  id?: string;
  ol?: number | string;
  net?: number;
  sp?: number;
  hx?: number;
  mlat?: number;
  mlng?: number;
  lat?: number;
  lng?: number;
  ps?: string;
  [key: string]: unknown;
}

export interface VideoPlayerOptions {
  /** 初始設備 ID */
  initialDevIdno?: string;
  /** 初始通道 (預設 0) */
  initialChannel?: number;
  /** 初始畫質 (預設 'sd') */
  initialQuality?: 'sd' | 'hd';
  /** 自動開始取得設備狀態 (預設 true) */
  autoFetch?: boolean;
}

export interface UseVideoPlayerReturn {
  // --- 狀態 ---
  /** 當前設備 ID */
  devIdno: string;
  /** 設定設備 ID */
  setDevIdno: (id: string) => void;
  /** 當前通道 (0-based) */
  activeChannel: number;
  /** 設定通道 */
  setActiveChannel: (channel: number) => void;
  /** 當前畫質 */
  quality: 'sd' | 'hd';
  /** 設定畫質 */
  setQuality: (q: 'sd' | 'hd') => void;
  /** 設備是否線上 */
  isOnline: boolean | null;
  /** 是否正在載入 */
  isLoading: boolean;
  /** 設備詳細狀態 */
  deviceStatus: DeviceStatus | null;
  /** 影片 URL (FLV) */
  videoUrl: string | null;
  /** 通道數量 */
  numChannels: number;
  /** 808GPS 服務是否已連線 */
  isConnected: boolean;
  /** 一般錯誤訊息 */
  errorMsg: string | null;
  /** 播放錯誤訊息 */
  playbackError: string | null;
  /** 播放錯誤回調 */
  setPlaybackError: (err: string | null) => void;

  // --- 方法 ---
  /** 刷新設備狀態與影片 URL */
  refresh: () => Promise<void>;
  /** 僅刷新影片 URL (不改變設備) */
  refreshVideoUrl: () => Promise<void>;
}

export function useVideoPlayer(options: VideoPlayerOptions = {}): UseVideoPlayerReturn {
  const {
    initialDevIdno,
    initialChannel = 0,
    initialQuality = 'sd',
    autoFetch = true,
  } = options;

  // --- 狀態 ---
  const [devIdno, setDevIdno] = useState<string>(initialDevIdno || '');
  const [activeChannel, setActiveChannel] = useState(initialChannel);
  const [quality, setQuality] = useState<'sd' | 'hd'>(initialQuality);
  const [numChannels, setNumChannels] = useState(4);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // --- Store ---
  const { isConnected } = useGps808Store();

  // --- 取得影片 URL ---
  const fetchVideoUrl = useCallback(async () => {
    if (!devIdno || !isConnected) {
      setVideoUrl(null);
      return;
    }

    try {
      const jsession = await gps808Api.getStoredSession();

      if (jsession && IS_WEB) {
        const url = `http://localhost:3001/api/gps/flv-stream?devIdno=${devIdno}&channel=${activeChannel}&stream=${quality === 'sd' ? 1 : 0}&jsessionId=${jsession}`;
        setVideoUrl(url);
      } else {
        const result = await gps808Api.getLiveVideoUrl(devIdno, {
          channel: activeChannel,
          quality,
          protocol: 'flv',
        });

        if (result.result === 0 && result.flvUrl) {
          setVideoUrl(result.flvUrl);
        } else {
          setVideoUrl(null);
        }
      }
    } catch (err) {
      console.error('[useVideoPlayer] Failed to fetch video URL:', err);
      setVideoUrl(null);
    }
  }, [devIdno, activeChannel, quality, isConnected]);

  // --- 取得設備狀態 ---
  const fetchDeviceStatus = useCallback(async () => {
    if (!devIdno) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const [statusResult, channels] = await Promise.all([
        gps808Api.getDeviceStatus(devIdno, true),
        gps808Api.getDeviceChannelCount(devIdno),
      ]);

      if (statusResult.result === 0 && statusResult.status) {
        setDeviceStatus(statusResult.status);
        const onlineStatus = statusResult.status.ol;
        const online = onlineStatus === 1 || onlineStatus === '1';
        setIsOnline(online);
        setNumChannels(channels);

        if (online) {
          await fetchVideoUrl();
        } else {
          setVideoUrl(null);
        }
      } else {
        setIsOnline(false);
        setDeviceStatus(null);
        setVideoUrl(null);
        setErrorMsg(statusResult.error || '無法取得設備狀態');
      }
    } catch (err) {
      console.error('[useVideoPlayer] Failed to fetch device status:', err);
      setIsOnline(false);
      setDeviceStatus(null);
      setVideoUrl(null);
      setErrorMsg(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [devIdno, fetchVideoUrl]);

  // --- 公開方法 ---
  const refresh = useCallback(async () => {
    await fetchDeviceStatus();
  }, [fetchDeviceStatus]);

  const refreshVideoUrl = useCallback(async () => {
    await fetchVideoUrl();
  }, [fetchVideoUrl]);

  // --- 自動取得設備狀態 ---
  useEffect(() => {
    if (autoFetch && devIdno) {
      fetchDeviceStatus();
    }
  }, [devIdno, autoFetch]);

  // --- 設備 ID 改變時重新獲取影片 URL ---
  useEffect(() => {
    if (isOnline && devIdno) {
      fetchVideoUrl();
    }
  }, [devIdno, activeChannel, quality, isOnline, fetchVideoUrl]);

  return {
    // 狀態
    devIdno,
    setDevIdno,
    activeChannel,
    setActiveChannel,
    quality,
    setQuality,
    isOnline,
    isLoading,
    deviceStatus,
    videoUrl,
    numChannels,
    isConnected,
    errorMsg,
    playbackError,
    setPlaybackError,
    // 方法
    refresh,
    refreshVideoUrl,
  };
}
