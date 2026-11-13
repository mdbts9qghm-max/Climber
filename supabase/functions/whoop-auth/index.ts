// Startet den OAuth-Flow: erzeugt einen state, merkt ihn sich serverseitig und liefert die WHOOP-Login-URL.
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient, userFromRequest } from '../_shared/supabase.ts'
import { SCOPES, WHOOP_AUTH_URL, env, redirectUri } from '../_shared/whoop.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const userId = await userFromRequest(req)
    if (!userId) return json({ error: 'Nicht angemeldet' }, 401)
    const db = adminClient()
    const state = crypto.randomUUID().replace(/-/g, '')
    // alte States aufräumen
    await db.from('oauth_states').delete().lt('created_at', new Date(Date.now() - 3600_000).toISOString())
    const { error } = await db.from('oauth_states').insert({ state, user_id: userId })
    if (error) throw error
    const url = new URL(WHOOP_AUTH_URL)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', env('WHOOP_CLIENT_ID'))
    url.searchParams.set('redirect_uri', redirectUri())
    url.searchParams.set('scope', SCOPES)
    url.searchParams.set('state', state)
    return json({ url: url.toString() })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
