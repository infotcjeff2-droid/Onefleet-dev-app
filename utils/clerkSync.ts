/**
 * clerkSync.ts — Clerk 使用者同步工具（前端呼叫端）
 *
 * 使用方式：呼叫 Supabase Edge Function「clerk-user-sync」作為代理，
 * CLERK_SECRET_KEY 保留在 Supabase 端，絕不會暴露到前端 JavaScript。
 *
 * 部署 Edge Function：
 *   cd supabase && supabase functions deploy clerk-user-sync
 *
 * 需要環境變數：
 *   EXPO_PUBLIC_SUPABASE_URL      — Supabase 專案 URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY — Supabase anon key（前端用）
 */

import { ManagedUser } from '@/types';

export const clerkRoleMap: Record<string, string> = {
  admin: 'admin',
  driver: 'driver',
  company: 'company',
  user: 'user',
};

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

async function callEdgeFunction<T>(body: object): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url}/functions/v1/clerk-user-sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json() as { error?: string; results?: unknown[]; summary?: unknown };
  if (!response.ok) {
    throw new Error(data?.error ?? `Edge function error (${response.status})`);
  }
  return data as T;
}

// ──────────────────────────────────────────────────────────────────────────────
//  公開 API
// ──────────────────────────────────────────────────────────────────────────────

export interface SyncResult {
  id: string;
  email: string;
  clerkId: string;
  action: 'created' | 'updated';
}

export interface SyncSummary {
  results: Array<SyncResult | { email: string; error: string }>;
  summary: {
    created: number;
    updated: number;
    failed: number;
    total: number;
  };
}

/**
 * 同步一個 ManagedUser 到 Clerk（透過 Supabase Edge Function）
 */
export async function syncUserToClerk(
  user: ManagedUser,
  password: string
): Promise<SyncResult> {
  const data = await callEdgeFunction<{ result: SyncResult }>({
    action: 'create',
    user: { ...user, password },
    clerkRoleMap,
  });
  return data.result;
}

/**
 * 批次同步多個 ManagedUser 到 Clerk
 * Edge Function 內部逐一呼叫，全部執行完後一次性回傳所有結果
 */
export async function syncUsersToClerk(
  users: Array<{ user: ManagedUser; password: string }>
): Promise<SyncSummary> {
  // Edge Function 的 syncAll 會在伺服器端逐一同步後一次回傳
  const data = await callEdgeFunction<SyncSummary>({
    action: 'syncAll',
    users: users.map(({ user, password }) => ({ ...user, password })),
    clerkRoleMap,
  });
  return data;
}

/**
 * 列出 Clerk 中所有使用者（直接呼叫 Clerk REST API，需確保環境有 key）
 */
export async function listClerkUsers(): Promise<
  Array<{ id: string; email: string; role: string }>
> {
  const secretKey = process.env.EXPO_PUBLIC_CLERK_SECRET_KEY ?? '';
  if (!secretKey) {
    throw new Error(
      'EXPO_PUBLIC_CLERK_SECRET_KEY is not set. ' +
      'For listing Clerk users, set this environment variable or use the Edge Function.'
    );
  }

  const response = await fetch(`${'https://api.clerk.com/v1'}/users?limit=100`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json() as Array<{
    id: string;
    email_addresses: Array<{ email_address: string }>;
    public_metadata: Record<string, unknown>;
  }>;

  return data.map((u) => ({
    id: u.id,
    email: u.email_addresses?.[0]?.email_address ?? 'no-email',
    role: (u.public_metadata?.role as string) ?? 'unknown',
  }));
}
