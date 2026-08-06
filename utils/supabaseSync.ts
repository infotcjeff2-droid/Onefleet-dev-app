/**
 * supabaseSync.ts — Supabase 使用者同步工具
 *
 * 將 managed users 寫入 user_profile 表（取代舊的 fleet_sync.users）。
 * 需要 EXPO_PUBLIC_SUPABASE_URL 和 EXPO_PUBLIC_SUPABASE_ANON_KEY 環境變數。
 */

import { User } from '@/types';

const USER_PROFILE_TABLE = 'user_profile';

function getSupabaseConfig() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase environment variables are not set. ' +
      'Ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are configured.'
    );
  }

  return { url, anonKey };
}

async function supabaseRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  params?: Record<string, string>,
  preferHeader?: string
): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();

  let queryString = '';
  if (params) {
    const entries = Object.entries(params);
    if (entries.length > 0) {
      queryString = '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    apikey: anonKey,
  };

  if (preferHeader) {
    headers['Prefer'] = preferHeader;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${url}${path}${queryString}`, options);

  // 處理無內容的回應（如 204 No Content）
  const contentLength = response.headers.get('content-length');
  const contentType = response.headers.get('content-type');
  if (response.status === 204 || contentLength === '0' || !contentType?.includes('application/json')) {
    return {} as T;
  }

  const data = await response.json() as T;

  if (!response.ok) {
    throw new Error(`Supabase error (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

export interface SupabaseSyncResult {
  success: boolean;
  message: string;
  syncedCount: number;
}

interface DbUserProfile {
  id: string;
  email: string;
  name: string;
  name_zh: string | null;
  name_en: string | null;
  phone: string | null;
  avatar: string | null;
  address: string | null;
  role: string;
  company_id: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/**
 * 將 managed users 陣列寫入 user_profile 表。
 * 使用 upsert 語法，以 id 為唯一鍵。
 */
export async function syncUsersToSupabase(
  users: User[]
): Promise<SupabaseSyncResult> {
  if (users.length === 0) {
    return {
      success: true,
      message: '沒有使用者需要同步',
      syncedCount: 0,
    };
  }

  try {
    const dbProfiles: DbUserProfile[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      name_zh: u.nameZh ?? null,
      name_en: u.nameEn ?? null,
      phone: u.phone ?? null,
      avatar: u.avatar ?? null,
      address: u.address ?? null,
      role: u.role,
      company_id: u.companyId ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
    }));

    // 使用 upsert 語法（POST + Prefer: return=minimal + onConflict）
    // 先個別處理每個用戶，使用 upsert
    let syncedCount = 0;
    for (const profile of dbProfiles) {
      // 嘗試 upsert 每個用戶
      // 使用 PATCH 配合 filter 來更新現有記錄，或使用 POST 配合 prefer header
      try {
        // 先嘗試更新現有的
        await supabaseRequest(
          'PATCH',
          `/rest/v1/${USER_PROFILE_TABLE}?id=eq.${encodeURIComponent(profile.id)}`,
          profile,
          undefined,
          'return=minimal'
        );
        syncedCount++;
      } catch (err) {
        // 如果更新失敗（記錄不存在），則插入
        try {
          await supabaseRequest(
            'POST',
            `/rest/v1/${USER_PROFILE_TABLE}`,
            profile,
            undefined,
            'return=minimal'
          );
          syncedCount++;
        } catch (insertErr) {
          console.error(`[supabaseSync] Failed to sync user ${profile.email}:`, insertErr);
        }
      }
    }

    console.log(`[supabaseSync] Synced ${syncedCount}/${dbProfiles.length} users`);

    return {
      success: true,
      message: `已成功上傳 ${syncedCount} 筆使用者資料至 user_profile 表`,
      syncedCount,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[supabaseSync] syncUsersToSupabase error:', msg);
    return {
      success: false,
      message: `上傳失敗：${msg}`,
      syncedCount: 0,
    };
  }
}

/**
 * 從 user_profile 表讀取所有未刪除的使用者
 */
export async function fetchUsersFromSupabase(): Promise<User[]> {
  try {
    const data = await supabaseRequest<{ data: DbUserProfile[] }>(
      'GET',
      `/rest/v1/${USER_PROFILE_TABLE}?is_deleted=eq.false&order=created_at.asc`,
      undefined
    );

    const rows = data?.data || [];
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      nameZh: row.name_zh ?? undefined,
      nameEn: row.name_en ?? undefined,
      phone: row.phone ?? undefined,
      avatar: row.avatar ?? undefined,
      address: row.address ?? undefined,
      role: row.role as User['role'],
      companyId: row.company_id ?? undefined,
    }));
  } catch (err) {
    console.error('[supabaseSync] fetchUsersFromSupabase error:', err);
    return [];
  }
}
