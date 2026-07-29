import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseKey);

export const supabase: SupabaseClient = hasSupabaseEnv
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : (null as unknown as SupabaseClient);

/**
 * 用 Clerk 的 JWT session token 設定 Supabase auth 狀態。
 * 這樣 auth.uid() 就會回傳 Clerk user ID，RLS 政策才能生效。
 * Clerk JWT template 需選用 Supabase template，確保 sub = Clerk user ID。
 */
export async function setSupabaseAuthFromClerk(getToken: () => Promise<string | null>) {
  if (!hasSupabaseEnv) return;
  const token = await getToken();
  if (token) {
    await supabase.auth.setSession({
      access_token: token,
      refresh_token: '',
    });
  }
}
