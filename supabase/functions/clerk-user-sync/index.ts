/**
 * Supabase Edge Function: clerk-user-sync
 *
 * 用途：透過 Supabase Edge Function 代理 Clerk Backend API 呼叫，
 *       避免將 CLERK_SECRET_KEY 暴露在前端 JavaScript。
 *
 * 部署：supabase functions deploy clerk-user-sync
 * 呼叫：POST /functions/v1/clerk-user-sync
 *       Header: Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}
 *
 * 環境變數（需在 Supabase 設定）：
 *   CLERK_SECRET_KEY  — Clerk Backend API secret key (sk_...)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3'

const CLERK_BASE_URL = 'https://api.clerk.com/v1'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ManagedUser {
  id: string
  name: string
  nameZh?: string
  nameEn?: string
  email: string
  role: string
  phone?: string
  avatar?: string
  address?: string
  companyId?: string
  password?: string
}

interface SyncPayload {
  action: 'create' | 'update' | 'syncAll'
  user?: ManagedUser
  users?: Array<ManagedUser>
  clerkRoleMap?: Record<string, string>
}

async function clerkRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const secretKey = Deno.env.get('CLERK_SECRET_KEY')
  if (!secretKey) throw new Error('CLERK_SECRET_KEY not configured in Supabase secrets')

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
  }
  if (body) options.body = JSON.stringify(body)

  const response = await fetch(`${CLERK_BASE_URL}${path}`, options)
  const data = await response.json()
  if (!response.ok) {
    const msg = (data as { errors?: Array<{ message: string }>; message?: string })?.errors?.[0]?.message
      ?? (data as { message?: string })?.message
      ?? `HTTP ${response.status}`
    throw new Error(`Clerk API error: ${msg}`)
  }
  return data
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

async function syncUser(user: ManagedUser, clerkRoleMap: Record<string, string>): Promise<{
  id: string; email: string; clerkId: string; action: 'created' | 'updated'
}> {
  // 查找 Clerk 中是否已有此 email
  const listResp = await clerkRequest('GET', `/users?limit=20&query=${encodeURIComponent(user.email)}`) as {
    data: Array<{ id: string; email_addresses: Array<{ email_address: string }> }>
    total_count: number
  }

  const existing = listResp.data.find(
    (u) => u.email_addresses?.[0]?.email_address?.toLowerCase() === user.email.toLowerCase()
  )

  const role = clerkRoleMap[user.role] ?? user.role
  const basePayload = {
    first_name: user.nameZh || user.name || user.email.split('@')[0],
    last_name: '',
    public_metadata: { role, app_user_id: user.id },
  }

  if (existing) {
    await clerkRequest('PATCH', `/users/${existing.id}`, basePayload)
    return { id: user.id, email: user.email, clerkId: existing.id, action: 'updated' }
  } else {
    if (!user.password) throw new Error(`Password required to create user: ${user.email}`)
    const digest = await hashPassword(user.password)
    const createResp = await clerkRequest('POST', '/users', {
      ...basePayload,
      email_addresses: [{ email_address: user.email }],
      password_digest: digest,
    }) as { id: string }
    return { id: user.id, email: user.email, clerkId: createResp.id, action: 'created' }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body: SyncPayload = await req.json()
    const { action, user, users, clerkRoleMap: roleMap = { admin: 'admin', driver: 'driver', company: 'company', user: 'user' } } = body

    let results: unknown[] = []

    if (action === 'syncAll' && Array.isArray(users)) {
      results = []
      for (const u of users) {
        try {
          results.push(await syncUser(u, roleMap))
        } catch (err) {
          results.push({ email: u.email, error: err instanceof Error ? err.message : 'Unknown error' })
        }
      }
      const created = results.filter((r: unknown) => (r as { action?: string }).action === 'created').length
      const updated = results.filter((r: unknown) => (r as { action?: string }).action === 'updated').length
      const failed = results.filter((r: unknown) => Boolean((r as { error?: string }).error)).length
      return new Response(JSON.stringify({ results, summary: { created, updated, failed, total: users.length } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else if (action === 'create' && user) {
      const result = await syncUser(user, roleMap)
      return new Response(JSON.stringify({ result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else {
      return new Response(JSON.stringify({ error: 'Invalid action or missing payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : 'Unknown error'
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
