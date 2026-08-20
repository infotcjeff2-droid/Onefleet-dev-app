import { supabase, hasSupabaseEnv } from './supabase';

/**
 * Google Maps 共用單列配置（管理員設定一次，全網站共用）
 */
export interface GoogleMapsSharedConfig {
  id: number;
  api_key_hash: string;
  api_key_masked: string;
  has_api_key: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

const TABLE_NAME = 'google_maps_shared_config';

/** 讀取共用單列（所有已登入使用者皆可讀） */
export async function fetchGoogleMapsSharedConfig(): Promise<GoogleMapsSharedConfig | null> {
  if (!hasSupabaseEnv || !supabase) {
    console.log('[Maps-Shared] Supabase not configured, skip fetch');
    return null;
  }
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.error('[Maps-Shared] fetch error:', error);
      return null;
    }
    return data as GoogleMapsSharedConfig | null;
  } catch (e) {
    console.error('[Maps-Shared] fetch exception:', e);
    return null;
  }
}

/** 寫入共用單列 */
export async function upsertGoogleMapsSharedConfig(
  payload: {
    api_key_hash: string;
    api_key_masked: string;
    has_api_key: boolean;
  },
  updatedBy: string
): Promise<boolean> {
  if (!hasSupabaseEnv || !supabase) {
    console.log('[Maps-Shared] Supabase not configured, skip upsert');
    return false;
  }
  try {
    const row = {
      id: 1,
      api_key_hash: payload.api_key_hash,
      api_key_masked: payload.api_key_masked,
      has_api_key: payload.has_api_key,
      updated_by: updatedBy,
    };

    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.error('[Maps-Shared] upsert error:', error);
      return false;
    }
    console.log('[Maps-Shared] upsert success by:', updatedBy);
    return true;
  } catch (e) {
    console.error('[Maps-Shared] upsert exception:', e);
    return false;
  }
}

/** 清除共用單列 API Key（重置為空殼） */
export async function clearGoogleMapsSharedConfig(updatedBy: string): Promise<boolean> {
  return upsertGoogleMapsSharedConfig(
    {
      api_key_hash: '',
      api_key_masked: '',
      has_api_key: false,
    },
    updatedBy
  );
}
