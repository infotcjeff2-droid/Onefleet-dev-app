import { supabase, hasSupabaseEnv } from './supabase';

/**
 * GPS808 共用單列配置（管理員設定一次，全網站共用）
 * 取代原本的 gps808_user_configs per-user 表。
 */
export interface Gps808SharedConfig {
  id: number;
  server_url: string;
  account: string;
  password: string;
  is_connected: boolean;
  updated_by: string | null;
  updated_at: string | null;
  last_connected_at: string | null;
}

const TABLE_NAME = 'gps808_shared_config';

/** 讀取共用單列（所有已登入使用者皆可讀） */
export async function fetchGps808SharedConfig(): Promise<Gps808SharedConfig | null> {
  if (!hasSupabaseEnv || !supabase) {
    console.log('[GPS808-Shared] Supabase not configured, skip fetch');
    return null;
  }
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.error('[GPS808-Shared] fetch error:', error);
      return null;
    }
    return data as Gps808SharedConfig | null;
  } catch (e) {
    console.error('[GPS808-Shared] fetch exception:', e);
    return null;
  }
}

/**
 * 寫入共用單列
 * 注意：RLS 政策允許 public 角色讀寫（TO public），
 * 真正的 admin 寫入把關在 store 層 (isAdminUser() 判斷 user.id === 'u-admin')。
 * 這是因為 mock admin 登入不會建立 Supabase session，只能靠應用層把關。
 */
export async function upsertGps808SharedConfig(
  payload: {
    server_url: string;
    account: string;
    password: string;
    is_connected: boolean;
    last_connected_at?: string | null;
  },
  updatedBy: string
): Promise<boolean> {
  if (!hasSupabaseEnv || !supabase) {
    console.log('[GPS808-Shared] Supabase not configured, skip upsert');
    return false;
  }
  try {
    const row = {
      id: 1,
      server_url: payload.server_url,
      account: payload.account,
      password: payload.password,
      is_connected: payload.is_connected,
      updated_by: updatedBy,
      last_connected_at: payload.last_connected_at ?? new Date().toISOString(),
    };

    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.error('[GPS808-Shared] upsert error:', error);
      return false;
    }
    console.log('[GPS808-Shared] upsert success by:', updatedBy);
    return true;
  } catch (e) {
    console.error('[GPS808-Shared] upsert exception:', e);
    return false;
  }
}

/** 重置共用單列為空殼 */
export async function resetGps808SharedConfig(updatedBy: string): Promise<boolean> {
  return upsertGps808SharedConfig(
    {
      server_url: 'https://console.onefleet.hk',
      account: '',
      password: '',
      is_connected: false,
      last_connected_at: null,
    },
    updatedBy
  );
}
