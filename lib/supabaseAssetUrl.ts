export interface SupabaseAssetUrlContext {
  browserOrigin: string | null;
  supabaseUrl: string;
  portalOrigin: string;
}

const SUPABASE_ASSET_BASES = [
  'http://127.0.0.1:54321',
  'https://echo-ai.tailfdbc33.ts.net:10000',
  'https://bright-forge-management.vercel.app/supabase',
];

export const resolveSupabaseAssetUrl = (
  url: string | null | undefined,
  context: SupabaseAssetUrlContext,
): string | undefined => {
  if (!url) return undefined;
  const value = String(url);

  if (value.startsWith('/supabase/storage/v1/')) {
    return `${context.browserOrigin || context.portalOrigin}${value}`;
  }

  const base = SUPABASE_ASSET_BASES.find(prefix => value.startsWith(`${prefix}/storage/v1/`));
  if (!base) return value;
  return `${context.supabaseUrl}${value.slice(base.length)}`;
};
