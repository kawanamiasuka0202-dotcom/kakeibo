import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Supabase の環境変数が設定されているか。未設定でもデモモードは動く。 */
export const hasSupabaseConfig = Boolean(url && anonKey && url.startsWith('http'));

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!hasSupabaseConfig) {
    throw new Error(
      'Supabase の環境変数が設定されていません。.env.example を .env.local にコピーして設定してください。',
    );
  }
  if (!client) {
    client = createBrowserClient(url!, anonKey!);
  }
  return client;
}
