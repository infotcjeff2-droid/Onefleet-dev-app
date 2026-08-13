import { supabase, hasSupabaseEnv } from './supabase';

export interface Gps808SupabaseConfig {
  user_id: string;
  server_url: string;
  account: string;
  password: string;
  is_connected: boolean;
  last_connected_at: string | null;
}

const TABLE_NAME = 'gps808_user_configs';

/**
 * 從 Supabase 取得用戶的 GPS808 config
 * 用途：跨設備同步，用戶只需輸入一次憑證
 */
export async function fetchGps808ConfigFromSupabase(
  userId: string
): Promise<Gps808SupabaseConfig | null> {
  if (!hasSupabaseEnv || !supabase) {
    console.log('[GPS808-Supabase] Supabase not configured, skip fetch');
    return null;
  }
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[GPS808-Supabase] fetch error:', error);
      return null;
    }
    return data as Gps808SupabaseConfig | null;
  } catch (e) {
    console.error('[GPS808-Supabase] fetch exception:', e);
    return null;
  }
}

/**
 * 儲存（建立或更新）用戶的 GPS808 config 到 Supabase
 */
export async function upsertGps808ConfigToSupabase(
  config: Omit<Gps808SupabaseConfig, 'last_connected_at'> & {
    last_connected_at?: string | null;
  }
): Promise<boolean> {
  if (!hasSupabaseEnv || !supabase) {
    console.log('[GPS808-Supabase] Supabase not configured, skip upsert');
    return false;
  }
  try {
    const payload = {
      id: config.user_id,
      user_id: config.user_id,
      server_url: config.server_url,
      account: config.account,
      password: config.password,
      is_connected: config.is_connected,
      last_connected_at: config.last_connected_at ?? new Date().toISOString(),
    };

    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      console.error('[GPS808-Supabase] upsert error:', error);
      return false;
    }
    console.log('[GPS808-Supabase] upsert success for user:', config.user_id);
    return true;
  } catch (e) {
    console.error('[GPS808-Supabase] upsert exception:', e);
    return false;
  }
}

/**
 * 從 Supabase 刪除用戶的 GPS808 config（用戶主動中斷連接時呼叫）
 */
export async function deleteGps808ConfigFromSupabase(
  userId: string
): Promise<boolean> {
  if (!hasSupabaseEnv || !supabase) {
    console.log('[GPS808-Supabase] Supabase not configured, skip delete');
    return false;
  }
  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('[GPS808-Supabase] delete error:', error);
      return false;
    }
    console.log('[GPS808-Supabase] delete success for user:', userId);
    return true;
  } catch (e) {
    console.error('[GPS808-Supabase] delete exception:', e);
    return false;
  }
}