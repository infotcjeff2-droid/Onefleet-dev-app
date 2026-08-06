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
 */
import { useEffect, useRef, memo } from 'react';
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
}: HlsVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsInstanceRef = useRef<any>(null);

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
            lowLatencyMode: false,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
          });
          hlsInstanceRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('[HlsVideo] manifest parsed, ready to play');
            if (autoPlay) {
              video.play().catch((e: any) => console.warn('[HlsVideo] autoplay blocked', e));
            }
          });
          hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
            console.warn('[HlsVideo] hls error', data?.type, data?.details, data?.fatal);
            if (data?.fatal && Hls) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
              }
            }
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
