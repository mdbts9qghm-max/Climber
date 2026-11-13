import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** null, wenn Supabase (noch) nicht konfiguriert ist – die App läuft dann rein lokal */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null

export const functionsUrl = url ? `${url.replace(/\/$/, '')}/functions/v1` : null
