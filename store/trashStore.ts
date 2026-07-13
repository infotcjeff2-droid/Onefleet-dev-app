/**
 * 垃圾桶 (Trash Bin) 狀態管理
 *
 * 設計重點：
 * - 任何資料刪除時不直接消失，先丟到垃圾桶保留 30 天
 * - Admin 可在垃圾桶頁面查看、還原或永久刪除
 * - 30 天後自動清除（呼叫 cleanupExpired() 觸發；或在每次載入時被動觸發）
 * - 同步到 Supabase：垃圾桶資料與主資料一起隨 fleet_sync 上行（透過 custom 命名空間）
 */

import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { fetchFleetSnapshot, hasSupabaseEnv, pushFleetSnapshot } from '@/utils/fleetSync';

const STORAGE_KEY = 'trash_bin';
export const TRASH_RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type TrashEntityKind = 'user' | 'driver' | 'vehicle' | 'delivery';

export interface TrashItem {
  /** 垃圾桶內部唯一 ID（UUID 風格） */
  trashId: string;
  /** 資料類型 */
  kind: TrashEntityKind;
  /** 原資料的 id */
  originalId: string;
  /** 刪除時間戳（ms） */
  deletedAt: number;
  /** 過期時間戳（ms） */
  expiresAt: number;
  /** 被刪除的資料快照（還原時會用到） */
  payload: Record<string, unknown>;
  /** 誰刪的（email / role） */
  deletedBy?: string;
}

interface TrashState {
  items: TrashItem[];
  isLoading: boolean;
  loadTrash: () => Promise<void>;
  addToTrash: (kind: TrashEntityKind, payload: Record<string, unknown>, deletedBy?: string) => Promise<TrashItem>;
  removeFromTrash: (trashId: string) => Promise<void>;
  cleanupExpired: () => Promise<void>;
  clearAll: () => Promise<void>;
  /** 依類型取得尚未過期的項目 */
  getByKind: (kind: TrashEntityKind) => TrashItem[];
}

const generateTrashId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

async function persist(items: TrashItem[]) {
  await storage.setItem(STORAGE_KEY, JSON.stringify(items));
}

async function syncToSupabase(items: TrashItem[]) {
  if (!hasSupabaseEnv) return;
  try {
    await pushFleetSnapshot({ trash: items } as unknown as Parameters<typeof pushFleetSnapshot>[0]);
  } catch {
    // 垃圾桶同步失敗不影響主流程
  }
}

export const useTrashStore = create<TrashState>((set, get) => ({
  items: [],
  isLoading: false,

  loadTrash: async () => {
    set({ isLoading: true });
    try {
      const stored = await storage.getItem(STORAGE_KEY);
      let items: TrashItem[] = stored ? JSON.parse(stored) : [];

      // 被動觸發過期清理
      const now = Date.now();
      const before = items.length;
      items = items.filter((it) => it.expiresAt > now);
      if (items.length !== before) {
        await persist(items);
      }

      set({ items });
    } catch {
      set({ items: [] });
    } finally {
      set({ isLoading: false });
    }
  },

  addToTrash: async (kind, payload, deletedBy) => {
    const now = Date.now();
    const item: TrashItem = {
      trashId: generateTrashId(),
      kind,
      originalId: String(payload.id ?? ''),
      deletedAt: now,
      expiresAt: now + TRASH_RETENTION_DAYS * MS_PER_DAY,
      payload,
      deletedBy,
    };

    const items = [item, ...get().items];
    set({ items });
    await persist(items);
    void syncToSupabase(items);
    return item;
  },

  removeFromTrash: async (trashId) => {
    const items = get().items.filter((it) => it.trashId !== trashId);
    set({ items });
    await persist(items);
    void syncToSupabase(items);
  },

  cleanupExpired: async () => {
    const now = Date.now();
    const items = get().items.filter((it) => it.expiresAt > now);
    if (items.length !== get().items.length) {
      set({ items });
      await persist(items);
      void syncToSupabase(items);
    }
  },

  clearAll: async () => {
    set({ items: [] });
    await persist([]);
    void syncToSupabase([]);
  },

  getByKind: (kind) => {
    const now = Date.now();
    return get().items.filter((it) => it.kind === kind && it.expiresAt > now);
  },
}));

/**
 * 便利函式：從垃圾桶還原 user 資料
 */
export function restoreUserFromTrash(item: TrashItem): {
  id: string;
  name: string;
  email: string;
  role: 'driver' | 'company' | 'admin';
  phone?: string;
  avatar?: string;
  password?: string;
} {
  const p = item.payload as Record<string, unknown>;
  return {
    id: String(p.id ?? item.originalId),
    name: String(p.name ?? ''),
    email: String(p.email ?? ''),
    role: (p.role as 'driver' | 'company' | 'admin') ?? 'driver',
    phone: p.phone as string | undefined,
    avatar: p.avatar as string | undefined,
    password: p.password as string | undefined,
  };
}

/**
 * 便利函式：從垃圾桶還原 driver 資料
 */
export function restoreDriverFromTrash(item: TrashItem): {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehiclePlate?: string;
  status: 'available' | 'busy' | 'offline';
  avatar?: string;
  assignedVehicleId?: string;
} {
  const p = item.payload as Record<string, unknown>;
  return {
    id: String(p.id ?? item.originalId),
    name: String(p.name ?? ''),
    phone: String(p.phone ?? ''),
    email: String(p.email ?? ''),
    vehiclePlate: p.vehiclePlate as string | undefined,
    status: (p.status as 'available' | 'busy' | 'offline') ?? 'available',
    avatar: p.avatar as string | undefined,
    assignedVehicleId: p.assignedVehicleId as string | undefined,
  };
}

/**
 * 格式化「距離過期還剩多久」
 */
export function formatTimeLeft(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return '已過期';
  const days = Math.floor(ms / MS_PER_DAY);
  if (days >= 1) return `${days} 天後清除`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `${hours} 小時後清除`;
  const minutes = Math.floor(ms / (60 * 1000));
  return `${minutes} 分鐘後清除`;
}