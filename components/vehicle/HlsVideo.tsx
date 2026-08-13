/**
 * HLS Video Player（Web 專用）
 *
 * 為什麼不用 RN Web 的 <video> + RN style？
 *   - React Native Web 會過濾掉 <video> 上的某些 style 屬性（如 width/height/objectFit），
 *     導致 <video> 在視覺上變成 0×0，畫面看不見。
 *   - 解法：透過 ref 抓到底層 DOM element，用原生 HTMLElement.style 強制覆寫。
 *
 * 跨瀏覽器：
 *   - Chrome / Edge / Safari（macOS / iOS）：原生支援 HLS
 *   - Android Chrome / WebView：原生不支援 HLS，要用 hls.js
 *
 * 緩衝優化：
 *   - 增大 maxBufferLength / maxMaxBufferLength 減少重新緩衝次數
 *   - 啟用 liveSyncDurationCount 同步到直播邊緣
 *   - 網路錯誤時自動重連（最多 3 次）
 */
import { useEffect, useRef, memo, useState } from 'react';
import { View } from 'react-native';

export interface HlsVideoProps {
  url: string;
  /** 是否顯示控制列 */
  controls?: boolean;
  /** 是否自動播放 */
  autoPlay?: boolean;
  /** 是否靜音 */
  muted?: boolean;
  /** 是否循環 */
  loop?: boolean;
  /** 緩衝開始回調 */
  onBuffering?: (buffering: boolean) => void;
  /** 錯誤回調 */
  onError?: (error: string) => void;
}

/**
 * 將 css 物件寫入原生 DOM element.style
 */
function applyStyle(el: HTMLElement, css: Record<string, string | number>) {
  if (!el) return;
  const style = (el.style as any);
  for (const [k, v] of Object.entries(css)) {
    style[k] = v;
  }
}

function HlsVideoComponent({
  url,
  controls = false,
  autoPlay = true,
  muted = true,
  loop = false,
  onBuffering,
  onError,
}: HlsVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsInstanceRef = useRef<any>(null);
  /** 自動重連計數 */
  const retryCountRef = useRef(0);
  const MAX_RETRY = 3;
  /** 當前 URL（用於偵測變更） */
  const urlRef = useRef<string>('');
  const [isBuffering, setIsBuffering] = useState(false);

  // 載入影片 / 切換 URL
  useEffect(() => {
    if (typeof document === 'undefined' || !url) return;
    const video = videoRef.current;
    if (!video) return;

    // 強制套用原生 inline style
    applyStyle(video, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      backgroundColor: '#000',
      border: 'none',
      outline: 'none',
      display: 'block',
    });

    // 清理舊 hls 實例
    if (hlsInstanceRef.current) {
      try {
        hlsInstanceRef.current.destroy();
      } catch {
        /* ignore */
      }
      hlsInstanceRef.current = null;
    }

    const nativeCanPlay =
      typeof video.canPlayType === 'function' &&
      video.canPlayType('application/vnd.apple.mpegurl') !== '';

    console.log('[HlsVideo] load', { url: url.substring(0, 80) + '...', nativeCanPlay });

    if (nativeCanPlay) {
      video.src = url;
      video.load();
      if (autoPlay) {
        video.play().catch((e) => console.warn('[HlsVideo] autoplay blocked', e));
      }
    } else {
      // 用 hls.js
      const loadHlsJs = (): Promise<any> => {
        return new Promise((resolve, reject) => {
          if ((window as any).Hls) {
            resolve((window as any).Hls);
            return;
          }
          const tag = document.createElement('script');
          tag.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
          tag.async = true;
          tag.onload = () => resolve((window as any).Hls);
          tag.onerror = () => reject(new Error('hls.js failed to load'));
          document.head.appendChild(tag);
        });
      };

      loadHlsJs()
        .then((Hls) => {
          if (!Hls || !Hls.isSupported()) {
            video.src = url;
            return;
          }
          const hls = new Hls({
            enableWorker: true,
            // 緩衝優化：增大緩衝區減少重新緩衝次數
            maxBufferLength: 30,        // 最多緩衝 30 秒（預設 30，設大一點讓直播更穩定）
            maxMaxBufferLength: 120,    // 最大緩衝 120 秒（預設 60）
            maxBufferSize: 50 * 1000 * 1000, // 最大緩衝 50MB
            maxBufferHole: 0.5,        // 緩衝缺口閾值（預設 0.5）
            // 直播優化：同步到直播邊緣，保持低延遲
            liveSyncDurationCount: 3,   // 保持落後直播 3 個分段的延遲
            liveMaxLatencyDurationCount: 8, // 最大落後 8 個分段
            liveDurationInfinity: true, // 直播串流不應有 duration
            // 降低延遲
            lowLatencyMode: false,      // 關閉低延遲模式（可能增加卡頓）
            // 網路錯誤容忍度
            fragLoadingMaxRetry: 3,    // 每個分段最多重試 3 次
            manifestLoadingMaxRetry: 3, // manifest 載入最多重試 3 次
          });
          hlsInstanceRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('[HlsVideo] manifest parsed, ready to play');
            retryCountRef.current = 0; // 重置重試計數
            if (autoPlay) {
              video.play().catch((e: any) => console.warn('[HlsVideo] autoplay blocked', e));
            }
          });
          hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
            console.warn('[HlsVideo] hls error', data?.type, data?.details, data?.fatal);
            if (data?.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.warn('[HlsVideo] Network error, attempting to recover...');
                  if (retryCountRef.current < MAX_RETRY) {
                    retryCountRef.current++;
                    console.log(`[HlsVideo] Retry ${retryCountRef.current}/${MAX_RETRY}...`);
                    // 重新載入 manifest
                    hls.startLoad();
                    setTimeout(() => {
                      if (hlsInstanceRef.current) {
                        hls.startLoad();
                      }
                    }, 2000);
                  } else {
                    console.error('[HlsVideo] Max retries reached, giving up');
                    hls.destroy();
                    onError?.('網路連線失敗，請檢查網路後重試');
                  }
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.warn('[HlsVideo] Media error, attempting to recover...');
                  hls.recoverMediaError();
                  break;
                default:
                  console.error('[HlsVideo] Fatal error, destroying...');
                  hls.destroy();
                  onError?.(`播放錯誤: ${data?.details || '未知錯誤'}`);
                  break;
              }
            }
          });

          // 緩衝狀態監聽
          video.addEventListener('waiting', () => {
            console.log('[HlsVideo] Waiting / buffering...');
            setIsBuffering(true);
            onBuffering?.(true);
          });
          video.addEventListener('playing', () => {
            console.log('[HlsVideo] Playing');
            setIsBuffering(false);
            onBuffering?.(false);
          });
        })
        .catch((err) => {
          console.error('[HlsVideo] hls.js load failed', err);
        });
    }

    return () => {
      if (hlsInstanceRef.current) {
        try {
          hlsInstanceRef.current.destroy();
        } catch {
          /* ignore */
        }
        hlsInstanceRef.current = null;
      }
    };
  }, [url, autoPlay]);

  // 透過 setNativeProps 強制設定容器 style（RN Web 標準方式）
  const setContainerRef = (el: any) => {
    containerRef.current = el;
    if (el && typeof document !== 'undefined') {
      // 試著抓到真實 DOM 元素
      const domEl = (el?.nodeName ? el : (el?._root || el)) as HTMLElement;
      if (domEl && domEl.style) {
        applyStyle(domEl, {
          position: 'absolute',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          backgroundColor: '#0f0f1a',
        });
      }
    }
  };

  const setVideoRef = (el: any) => {
    // RN Web 對 <video> 的 ref 經常是 wrapper 物件，video tag 在底下
    let videoEl: HTMLVideoElement | null = null;
    if (el?.tagName === 'VIDEO') {
      videoEl = el as HTMLVideoElement;
    } else if (el?._root?.tagName === 'VIDEO') {
      videoEl = el._root as HTMLVideoElement;
    } else if (typeof el?.querySelector === 'function') {
      videoEl = el.querySelector('video') as HTMLVideoElement | null;
    } else if (el?.nodeName === 'VIDEO') {
      videoEl = el as HTMLVideoElement;
    }
    if (videoEl) {
      videoRef.current = videoEl;
      applyStyle(videoEl, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        backgroundColor: '#000',
        border: 'none',
        outline: 'none',
        display: 'block',
      });
    }
  };

  return (
    <View
      ref={setContainerRef as any}
      // 為 RN Web 提供備用 style
      style={{
        position: 'absolute' as any,
        top: 0 as any,
        left: 0 as any,
        right: 0 as any,
        bottom: 0 as any,
        width: '100%' as any,
        height: '100%' as any,
        overflow: 'hidden' as any,
        backgroundColor: '#0f0f1a',
      } as any}
    >
      {/* @ts-ignore RN Web supports video element */}
      <video
        ref={setVideoRef as any}
        controls={controls}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        playsInline
        style={{
          position: 'absolute' as any,
          top: 0 as any,
          left: 0 as any,
          width: '100%' as any,
          height: '100%' as any,
          backgroundColor: '#000',
        } as any}
      />
    </View>
  );
}

export const HlsVideo = memo(HlsVideoComponent);
