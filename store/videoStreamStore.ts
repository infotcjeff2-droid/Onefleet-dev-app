import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * 預設最大流量限制：3GB
 * 1GB = 1073741824 bytes
 */
const DEFAULT_MAX_DATA_LIMIT = 3 * 1024 * 1024 * 1024;

/**
 * 預設最大播放時間：3分鐘（180秒）
 */
const DEFAULT_MAX_STREAMING_DURATION = 3 * 60;

interface VehicleDataUsage {
  /** 設備 ID */
  devIdno: string;
  /** 已使用的流量（bytes） */
  bytesReceived: number;
  /** 累計播放時長（秒） */
  duration: number;
  /** 最後更新時間 */
  lastUpdated: number;
}

interface VideoStreamSettings {
  /** 最大流量限制（bytes），預設 3GB */
  maxDataLimit: number;
  /** 最大播放時間（秒），預設 3 分鐘 */
  maxStreamingDuration: number;
  /** 是否啟用流量限制 */
  enableDataLimit: boolean;
  /** 是否啟用時限限制 */
  enableDurationLimit: boolean;
}

interface VideoStreamState {
  /** 全域設定 */
  settings: VideoStreamSettings;
  /** 各車輛的流量使用情況 */
  vehicleUsage: Record<string, VehicleDataUsage>;
  /** 當前播放的車輛 */
  currentStreamingDevIdno: string | null;
  /** 當前播放開始時間 */
  currentStreamStartTime: number | null;

  // Actions
  /** 更新設定 */
  updateSettings: (settings: Partial<VideoStreamSettings>) => void;
  /** 重置流量統計 */
  resetUsage: (devIdno: string) => void;
  /** 重置所有流量統計 */
  resetAllUsage: () => void;
  /** 添加流量使用（返回是否超限） */
  addDataUsage: (devIdno: string, bytes: number) => boolean;
  /** 添加播放時長 */
  addDuration: (devIdno: string, seconds: number) => boolean;
  /** 開始播放 */
  startStreaming: (devIdno: string) => void;
  /** 停止播放 */
  stopStreaming: () => void;
  /** 獲取車輛使用情況 */
  getVehicleUsage: (devIdno: string) => VehicleDataUsage;
  /** 檢查是否可以繼續播放 */
  canContinueStreaming: (devIdno: string) => { canContinue: boolean; reason?: string };
}

export const useVideoStreamStore = create<VideoStreamState>()(
  persist(
    (set, get) => ({
      settings: {
        maxDataLimit: DEFAULT_MAX_DATA_LIMIT,
        maxStreamingDuration: DEFAULT_MAX_STREAMING_DURATION,
        enableDataLimit: true,
        enableDurationLimit: true,
      },
      vehicleUsage: {},
      currentStreamingDevIdno: null,
      currentStreamStartTime: null,

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      resetUsage: (devIdno) => {
        set((state) => {
          const newUsage = { ...state.vehicleUsage };
          delete newUsage[devIdno];
          return { vehicleUsage: newUsage };
        });
      },

      resetAllUsage: () => {
        set({ vehicleUsage: {} });
      },

      addDataUsage: (devIdno, bytes) => {
        const { settings, vehicleUsage } = get();
        const currentUsage = vehicleUsage[devIdno]?.bytesReceived || 0;
        const newTotal = currentUsage + bytes;

        set((state) => ({
          vehicleUsage: {
            ...state.vehicleUsage,
            [devIdno]: {
              devIdno,
              bytesReceived: newTotal,
              duration: state.vehicleUsage[devIdno]?.duration || 0,
              lastUpdated: Date.now(),
            },
          },
        }));

        if (settings.enableDataLimit && newTotal >= settings.maxDataLimit) {
          return false; // 超限
        }
        return true;
      },

      addDuration: (devIdno, seconds) => {
        const { settings, vehicleUsage } = get();
        const currentDuration = vehicleUsage[devIdno]?.duration || 0;
        const newDuration = currentDuration + seconds;

        set((state) => ({
          vehicleUsage: {
            ...state.vehicleUsage,
            [devIdno]: {
              devIdno,
              bytesReceived: state.vehicleUsage[devIdno]?.bytesReceived || 0,
              duration: newDuration,
              lastUpdated: Date.now(),
            },
          },
        }));

        if (settings.enableDurationLimit && newDuration >= settings.maxStreamingDuration) {
          return false; // 超限
        }
        return true;
      },

      startStreaming: (devIdno) => {
        set({
          currentStreamingDevIdno: devIdno,
          currentStreamStartTime: Date.now(),
        });
      },

      stopStreaming: () => {
        set({
          currentStreamingDevIdno: null,
          currentStreamStartTime: null,
        });
      },

      getVehicleUsage: (devIdno) => {
        const { vehicleUsage } = get();
        return vehicleUsage[devIdno] || {
          devIdno,
          bytesReceived: 0,
          duration: 0,
          lastUpdated: Date.now(),
        };
      },

      canContinueStreaming: (devIdno) => {
        const { settings, vehicleUsage } = get();
        const usage = vehicleUsage[devIdno];

        if (settings.enableDataLimit) {
          const currentBytes = usage?.bytesReceived || 0;
          if (currentBytes >= settings.maxDataLimit) {
            return {
              canContinue: false,
              reason: `流量已達上限 (${formatBytes(settings.maxDataLimit)})`
            };
          }
        }

        if (settings.enableDurationLimit) {
          const currentDuration = usage?.duration || 0;
          if (currentDuration >= settings.maxStreamingDuration) {
            return {
              canContinue: false,
              reason: `播放時長已達上限 (${Math.floor(settings.maxStreamingDuration / 60)}分鐘)`
            };
          }
        }

        return { canContinue: true };
      },
    }),
    {
      name: 'video-stream-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
        vehicleUsage: state.vehicleUsage,
      }),
    }
  )
);

/** 格式化流量顯示 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/** 格式化時長顯示 */
export function formatDuration(seconds: number): string {
  if (seconds === 0) return '0秒';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}小時${minutes}分鐘`;
  }
  if (minutes > 0) {
    return `${minutes}分鐘${secs}秒`;
  }
  return `${secs}秒`;
}

/** 預設設定常量 */
export const DEFAULT_STREAM_SETTINGS = {
  maxDataLimit: DEFAULT_MAX_DATA_LIMIT,
  maxStreamingDuration: DEFAULT_MAX_STREAMING_DURATION,
  maxDataLimitGB: 3,
  maxStreamingMinutes: 3,
};
