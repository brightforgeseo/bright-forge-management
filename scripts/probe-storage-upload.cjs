const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Missing Supabase URL/key env vars');
const supabase = createClient(url, key, { auth: { persistSession: false } });
const fileName = `hermes-probe-${Date.now()}.txt`;
(async () => {
  const { error: uploadError } = await supabase.storage.from('uploads').upload(fileName, new Blob(['probe']), { contentType: 'text/plain' });
  if (uploadError) {
    console.error('UPLOAD_ERROR', uploadError.message);
    process.exit(1);
  }
  const { data } = supabase.storage.from('uploads').getPublicUrl(fileName);
  console.log('UPLOAD_OK', data.publicUrl);
  const res = await fetch(data.publicUrl);
  console.log('PUBLIC_FETCH', res.status, await res.text());
  const { error: removeError } = await supabase.storage.from('uploads').remove([fileName]);
  console.log('REMOVE', removeError ? removeError.message : 'OK');
})();
