/**
 * FLV Video Player（Web 專用）
 *
 * 使用 flv.js 播放 HTTP-FLV 串流
 * flv.js 支援：Chrome、Edge、Firefox、Safari（都需要 polyfill）
 */
import { useEffect, useRef, memo } from 'react';
import { View } from 'react-native';

export interface FlvVideoProps {
  url: string;
  /** 是否顯示控制列 */
  controls?: boolean;
  /** 是否自動播放 */
  autoPlay?: boolean;
  /** 是否靜音 */
  muted?: boolean;
  /** 是否循環 */
  loop?: boolean;
  /** 錯誤回調 */
  onError?: (error: string) => void;
  /** 開始播放回調 */
  onPlaying?: () => void;
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

function FlvVideoComponent({
  url,
  controls = false,
  autoPlay = true,
  muted = true,
  loop = false,
  onError,
  onPlaying,
}: FlvVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const flvInstanceRef = useRef<any>(null);

  // 載入 FLV 串流
  useEffect(() => {
    if (typeof document === 'undefined' || !url) return;
    const video = videoRef.current;
    if (!video) return;

    // 清理舊 flv 實例
    if (flvInstanceRef.current) {
      try {
        flvInstanceRef.current.unload();
        flvInstanceRef.current.detachMediaElement();
        flvInstanceRef.current.destroy();
      } catch {
        /* ignore */
      }
      flvInstanceRef.current = null;
    }

    // 確保 video 元素已初始化
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

    console.log('[FlvVideo] load', url.substring(0, 100));

    // 動態載入 flv.js
    const loadFlvJs = (): Promise<any> => {
      return new Promise((resolve, reject) => {
        // 檢查是否已經載入
        if ((window as any).flvjs && (window as any).flvjs.isSupported()) {
          resolve((window as any).flvjs);
          return;
        }

        // 嘗試從 node_modules 載入（Vite/Webpack bundler）
        const scriptSrc = '/node_modules/flv.js/dist/flv.js';
        const linkHref = '/node_modules/flv.js/dist/flv.js';

        // 先嘗試用 import（如果 bundler 支援）
        import('flv.js').then((mod) => {
          resolve(mod.default || mod);
        }).catch(() => {
          // fallback: 動態創建 script 標籤
          const existingScript = document.querySelector(`script[src*="flv.js"]`);
          if (existingScript) {
            existingScript.addEventListener('load', () => resolve((window as any).flvjs));
            existingScript.addEventListener('error', () => reject(new Error('flv.js script load failed')));
            return;
          }

          const script = document.createElement('script');
          // 嘗試多個 CDN 源
          const cdnUrls = [
            'https://cdn.jsdelivr.net/npm/flv.js@1.6.2/dist/flv.js',
            'https://cdnjs.cloudflare.com/ajax/libs/flv.js/1.6.2/flv.js',
          ];
          let cdnIndex = 0;

          const tryNextCdn = () => {
            if (cdnIndex >= cdnUrls.length) {
              reject(new Error('All flv.js CDN sources failed'));
              return;
            }
            script.src = cdnUrls[cdnIndex++];
            script.async = true;
            script.onload = () => {
              console.log('[FlvVideo] flv.js loaded from CDN');
              resolve((window as any).flvjs);
            };
            script.onerror = () => {
              console.warn(`[FlvVideo] flv.js CDN ${cdnIndex - 1} failed, trying next...`);
              tryNextCdn();
            };
            document.head.appendChild(script);
          };

          tryNextCdn();
        });
      });
    };

    loadFlvJs()
      .then((flvjs) => {
        if (!flvjs.isSupported()) {
          console.error('[FlvVideo] flv.js not supported in this browser');
          onError?.('您的瀏覽器不支援 FLV 播放');
          // fallback: 直接播放 URL（可能不行）
          video.src = url;
          video.load();
          return;
        }

        const flv = flvjs.createPlayer({
          type: 'flv',
          url: url,
          hasAudio: true,
          hasVideo: true,
          isLive: true,
          // 緩衝配置
          enableStashBuffer: false, // 直播模式下關閉緩衝以降低延遲
        });

        flvInstanceRef.current = flv;
        flv.attachMediaElement(video);

        flv.on(flvjs.Events.ERROR, (e: any, data: any) => {
          console.error('[FlvVideo] flv error', data);
          onError?.(`FLV 錯誤: ${data?.response || data?.details || '未知錯誤'}`);
        });

        flv.on('loadcomplete', () => {
          console.log('[FlvVideo] FLV loaded completely');
        });

        flv.on('scriptdata', (e: any, data: any) => {
          console.log('[FlvVideo] Script data:', data);
        });

        flv.load();

        if (autoPlay) {
          video.play().catch((e) => {
            console.warn('[FlvVideo] autoplay blocked', e);
            // 嘗試靜音播放（瀏覽器要求）
            video.muted = true;
            video.play().catch((e2) => {
              console.error('[FlvVideo] autoplay still blocked', e2);
              onError?.('自動播放被瀏覽器阻止，請點擊影片手動播放');
            });
          });
        }

        onPlaying?.();
      })
      .catch((err) => {
        console.error('[FlvVideo] flv.js load failed', err);
        onError?.(`FLV 播放器載入失敗: ${err.message}`);
      });

    return () => {
      if (flvInstanceRef.current) {
        try {
          flvInstanceRef.current.unload();
          flvInstanceRef.current.detachMediaElement();
          flvInstanceRef.current.destroy();
        } catch {
          /* ignore */
        }
        flvInstanceRef.current = null;
      }
    };
  }, [url, autoPlay, muted, loop, onError, onPlaying]);

  // 設置容器 ref
  const setContainerRef = (el: any) => {
    containerRef.current = el;
    if (el && typeof document !== 'undefined') {
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

  // 設置 video ref
  const setVideoRef = (el: any) => {
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

export const FlvVideo = memo(FlvVideoComponent);
