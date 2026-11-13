import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Service-Role-Client: umgeht RLS – nur serverseitig verwenden */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
}

/** Nutzer aus dem Authorization-Header (JWT) ermitteln */
export async function userFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}
