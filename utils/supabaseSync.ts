/**
 * supabaseSync.ts — Supabase 使用者同步工具
 *
 * 將 managed users 寫入 fleet_sync.users 欄位。
 * 需要 EXPO_PUBLIC_SUPABASE_URL 和 EXPO_PUBLIC_SUPABASE_ANON_KEY 環境變數。
 */

import { ManagedUser } from '@/types';

const TABLE_NAME = 'fleet_sync';

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
  params?: Record<string, string>
): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();

  let queryString = '';
  if (params) {
    const entries = Object.entries(params);
    if (entries.length > 0) {
      queryString = '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    }
  }

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      apikey: anonKey,
    },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${url}${path}${queryString}`, options);
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

/**
 * 將 managed users 陣列寫入 Supabase fleet_sync 表的 users 欄位。
 *
 * 流程：
 * 1. 嘗試 upsert 一筆記錄（user_id = 'managed_users_pool'），內容為所有 users JSON
 * 2. 這筆記錄作為所有管理員共享的使用者資料池
 *
 * 注意：fleet_sync 表的 RLS 預設以 user_id 隔離資料，
 * 如要支援多管理員共享，需要在 Supabase SQL Editor 執行：
 *   CREATE POLICY "admins can read managed_users_pool" ON public.fleet_sync
 *     FOR SELECT USING (user_id = 'managed_users_pool');
 *   CREATE POLICY "admins can update managed_users_pool" ON public.fleet_sync
 *     FOR UPDATE USING (user_id = 'managed_users_pool');
 */
const MANAGED_USERS_POOL_ID = 'managed_users_pool';

export async function syncUsersToSupabase(
  users: ManagedUser[]
): Promise<SupabaseSyncResult> {
  const payload = {
    user_id: MANAGED_USERS_POOL_ID,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      nameZh: u.nameZh,
      nameEn: u.nameEn,
      email: u.email,
      role: u.role,
      phone: u.phone,
      avatar: u.avatar,
      address: u.address,
      companyId: u.companyId,
      // 不回寫密碼到 Supabase（密碼只存在 Clerk）
    })),
    updated_at: new Date().toISOString(),
  };

  try {
    // Upsert to fleet_sync with conflict on user_id
    await supabaseRequest(
      'POST',
      `/rest/v1/${TABLE_NAME}`,
      payload,
      { onConflict: 'user_id' }
    );

    return {
      success: true,
      message: `已成功上傳 ${users.length} 筆使用者資料至 Supabase`,
      syncedCount: users.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      message: `上傳失敗：${msg}`,
      syncedCount: 0,
    };
  }
}

/**
 * 從 Supabase 讀取共享的使用者資料池
 */
export async function fetchUsersFromSupabase(): Promise<ManagedUser[]> {
  try {
    const data = await supabaseRequest<{
      data: Array<{ user_id: string; users: ManagedUser[] }>;
    }>(
      'GET',
      `/rest/v1/${TABLE_NAME}?user_id=eq.${MANAGED_USERS_POOL_ID}&select=user_id,users`,
      undefined
    );

    const row = data?.data?.[0];
    if (row?.users && Array.isArray(row.users)) {
      return row.users;
    }
    return [];
  } catch {
    return [];
  }
}
