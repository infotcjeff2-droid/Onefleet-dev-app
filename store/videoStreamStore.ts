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
  devIdno: string;
  /** 本次使用流量（bytes） */
  sessionBytes: number;
  /** 本月使用流量（bytes） */
  monthlyBytes: number;
  /** 累計播放時長（秒） */
  duration: number;
  /** 最後更新時間 */
  lastUpdated: number;
  /** 最後重置月流量的時間（月分） */
  lastMonthlyResetMonth: number;
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
  /** 畫質設定：'sd' = 標準, 'hd' = 高清 */
  streamQuality: 'sd' | 'hd';
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
  /** 重置本次使用流量 */
  resetSessionUsage: (devIdno: string) => void;
}

export const useVideoStreamStore = create<VideoStreamState>()(
  persist(
    (set, get) => ({
      settings: {
        maxDataLimit: DEFAULT_MAX_DATA_LIMIT,
        maxStreamingDuration: DEFAULT_MAX_STREAMING_DURATION,
        enableDataLimit: true,
        enableDurationLimit: true,
        streamQuality: 'sd',
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

      resetSessionUsage: (devIdno) => {
        set((state) => {
          const existingUsage = state.vehicleUsage[devIdno];
          if (!existingUsage) return state;
          
          return {
            vehicleUsage: {
              ...state.vehicleUsage,
              [devIdno]: {
                ...existingUsage,
                sessionBytes: 0,
                lastUpdated: Date.now(),
              },
            },
          };
        });
      },

      resetAllUsage: () => {
        set({ vehicleUsage: {} });
      },

      addDataUsage: (devIdno, bytes) => {
        const { settings, vehicleUsage } = get();
        const currentMonth = new Date().getMonth();
        const existingUsage = vehicleUsage[devIdno];
        
        // 如果已記錄的月份與目前月份不同，自動重置月流量
        const shouldResetMonthly = existingUsage && existingUsage.lastMonthlyResetMonth !== currentMonth;
        
        const currentSessionBytes = existingUsage?.sessionBytes || 0;
        const currentMonthlyBytes = shouldResetMonthly ? 0 : (existingUsage?.monthlyBytes || 0);
        
        const newSessionTotal = currentSessionBytes + bytes;
        let newMonthlyTotal = currentMonthlyBytes;

        // 只有在流量限制開啟時才結算到月流量
        if (settings.enableDataLimit) {
          newMonthlyTotal = currentMonthlyBytes + bytes;
        }

        set((state) => ({
          vehicleUsage: {
            ...state.vehicleUsage,
            [devIdno]: {
              devIdno,
              sessionBytes: newSessionTotal,
              monthlyBytes: newMonthlyTotal,
              duration: state.vehicleUsage[devIdno]?.duration || 0,
              lastUpdated: Date.now(),
              lastMonthlyResetMonth: currentMonth,
            },
          },
        }));

        // 只有在流量限制開啟時才檢查超限
        if (settings.enableDataLimit && newMonthlyTotal >= settings.maxDataLimit) {
          return false; // 超限
        }
        return true;
      },

      addDuration: (devIdno, seconds) => {
        const { settings, vehicleUsage } = get();
        const currentDuration = vehicleUsage[devIdno]?.duration || 0;
        let newDuration = currentDuration;

        // 只有在時長限制開啟時才更新時長
        if (settings.enableDurationLimit) {
          newDuration = currentDuration + seconds;
        }

        set((state) => ({
          vehicleUsage: {
            ...state.vehicleUsage,
            [devIdno]: {
              devIdno,
              sessionBytes: state.vehicleUsage[devIdno]?.sessionBytes || 0,
              monthlyBytes: state.vehicleUsage[devIdno]?.monthlyBytes || 0,
              duration: newDuration,
              lastUpdated: Date.now(),
              lastMonthlyResetMonth: state.vehicleUsage[devIdno]?.lastMonthlyResetMonth ?? new Date().getMonth(),
            },
          },
        }));

        // 只有在時長限制開啟時才檢查超限
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
        const currentMonth = new Date().getMonth();
        const existingUsage = vehicleUsage[devIdno];
        
        // 如果已記錄的月份與目前月份不同，自動重置月流量
        if (existingUsage && existingUsage.lastMonthlyResetMonth !== currentMonth) {
          // 月流量已過期，重置它
          set((state) => ({
            vehicleUsage: {
              ...state.vehicleUsage,
              [devIdno]: {
                ...state.vehicleUsage[devIdno],
                monthlyBytes: 0,
                lastMonthlyResetMonth: currentMonth,
              },
            },
          }));
          return {
            devIdno,
            sessionBytes: existingUsage.sessionBytes,
            monthlyBytes: 0,
            duration: existingUsage.duration,
            lastUpdated: Date.now(),
            lastMonthlyResetMonth: currentMonth,
          };
        }
        
        return existingUsage || {
          devIdno,
          sessionBytes: 0,
          monthlyBytes: 0,
          duration: 0,
          lastUpdated: Date.now(),
          lastMonthlyResetMonth: currentMonth,
        };
      },

      canContinueStreaming: (devIdno) => {
        const { settings, vehicleUsage } = get();
        const currentMonth = new Date().getMonth();
        const existingUsage = vehicleUsage[devIdno];
        
        // 檢查是否需要重置月流量
        const shouldResetMonthly = existingUsage && existingUsage.lastMonthlyResetMonth !== currentMonth;
        const monthlyBytes = shouldResetMonthly ? 0 : (existingUsage?.monthlyBytes || 0);

        if (settings.enableDataLimit) {
          if (monthlyBytes >= settings.maxDataLimit) {
            return {
              canContinue: false,
              reason: `流量已達上限 (${formatBytes(settings.maxDataLimit)})`
            };
          }
        }

        if (settings.enableDurationLimit) {
          const currentDuration = existingUsage?.duration || 0;
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
