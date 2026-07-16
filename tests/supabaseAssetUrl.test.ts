import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveSupabaseAssetUrl } from '../lib/supabaseAssetUrl.ts';

test('desktop resolves stored same-origin attachment paths against the live portal', () => {
  const result = resolveSupabaseAssetUrl(
    '/supabase/storage/v1/object/public/uploads/example.png',
    {
      browserOrigin: null,
      supabaseUrl: 'https://echo-ai.tailfdbc33.ts.net:10000',
      portalOrigin: 'https://echo-ai.tailfdbc33.ts.net',
    },
  );

  assert.equal(
    result,
    'https://echo-ai.tailfdbc33.ts.net/supabase/storage/v1/object/public/uploads/example.png',
  );
});
