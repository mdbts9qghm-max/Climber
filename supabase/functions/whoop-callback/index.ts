// OAuth-Callback von WHOOP: Code gegen Tokens tauschen, speichern, ersten Abruf starten, zurück zur App.
import { adminClient } from '../_shared/supabase.ts'
import { env, exchangeCode, getConnection, saveTokens, syncUser, whoopGet } from '../_shared/whoop.ts'

function back(status: string, detail?: string): Response {
  const url = new URL('/einstellungen', env('APP_URL'))
  url.searchParams.set('whoop', status)
  if (detail) url.searchParams.set('detail', detail.slice(0, 200))
  return Response.redirect(url.toString(), 302)
}

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams
  if (params.get('error')) return back('abgebrochen', params.get('error_description') ?? params.get('error') ?? '')
  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) return back('fehler', 'code/state fehlt')
  const db = adminClient()
  try {
    const { data: st } = await db.from('oauth_states').select('*').eq('state', state).maybeSingle()
    if (!st || Date.now() - Date.parse(st.created_at) > 3600_000) return back('fehler', 'Ungültiger oder abgelaufener state')
    await db.from('oauth_states').delete().eq('state', state)
    const tokens = await exchangeCode(code)
    const profile = await whoopGet<{ user_id: number }>(tokens.access_token, '/v2/user/profile/basic')
    await saveTokens(db, st.user_id, tokens, profile?.user_id ?? null)
    const conn = await getConnection(db, st.user_id)
    if (conn) await syncUser(db, conn, { full: true })
    return back('ok')
  } catch (e) {
    console.error(e)
    return back('fehler', String(e))
  }
})
