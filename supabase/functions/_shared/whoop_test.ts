// deno test --allow-env supabase/functions/_shared/whoop_test.ts
import { fetchAll, verifySignature, whoopGet } from './whoop.ts'

Deno.env.set('WHOOP_CLIENT_SECRET', 'test-secret')

function assert(c: unknown, msg: string) {
  if (!c) throw new Error(msg)
}

async function sign(ts: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('test-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts + body))
  return btoa(String.fromCharCode(...new Uint8Array(mac)))
}

Deno.test('Webhook-Signatur: gültig, manipuliert, zu alt', async () => {
  const body = JSON.stringify({ user_id: 1, id: 'abc', type: 'recovery.updated' })
  const ts = String(Date.now())
  const sig = await sign(ts, body)
  assert(await verifySignature(body, ts, sig), 'gültige Signatur abgelehnt')
  assert(!(await verifySignature(body + ' ', ts, sig)), 'manipulierter Body akzeptiert')
  const old = String(Date.now() - 10 * 60_000)
  assert(!(await verifySignature(body, old, await sign(old, body))), 'alte Signatur akzeptiert')
  assert(!(await verifySignature(body, null, sig)), 'fehlender Timestamp akzeptiert')
})

Deno.test('Pagination über next_token und Rate-Limit-Retry', async () => {
  const calls: string[] = []
  let first429 = true
  globalThis.fetch = ((input: string | URL) => {
    const url = new URL(String(input))
    calls.push(url.search)
    if (first429) {
      first429 = false
      return Promise.resolve(new Response('slow down', { status: 429, headers: { 'Retry-After': '0' } }))
    }
    const next = url.searchParams.get('nextToken')
    const body = next ? { records: [{ id: 3 }], next_token: null } : { records: [{ id: 1 }, { id: 2 }], next_token: 'p2' }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  }) as typeof fetch
  const all = await fetchAll<{ id: number }>('tok', '/v2/cycle', '2026-11-01T00:00:00Z')
  assert(all.map((x) => x.id).join() === '1,2,3', `falsche Records ${JSON.stringify(all)}`)
  assert(calls.length === 3, `erwartet 3 Aufrufe, war ${calls.length}`)
  assert(calls[2].includes('nextToken=p2'), 'nextToken nicht weitergegeben')
  globalThis.fetch = (() => Promise.resolve(new Response('', { status: 404 }))) as typeof fetch
  assert((await whoopGet('tok', '/v2/user/measurement/body')) === null, '404 sollte null liefern')
})
