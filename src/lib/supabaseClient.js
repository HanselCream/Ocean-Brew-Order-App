import { createClient } from '@supabase/supabase-js';

//PROD 
// const supabaseUrl = 'https://tawqvyjnohhhquregbqm.supabase.co';
// const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhd3F2eWpub2hoaHF1cmVnYnFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjgzMzIsImV4cCI6MjA4NzgwNDMzMn0.pPtHeE_ZcuTEs86k_LvzetkFl1FpCCwlRdCJipfWItI';

//STAGING
const supabaseUrl = 'https://bubmtntqjofnokfwojri.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Ym10bnRxam9mbm9rZndvanJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODE0NzgsImV4cCI6MjA5MDg1NzQ3OH0.iQwujtT9RnpLpmFsCEZfWw4VVnrAww7JwdflL3YfksU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

// Make supabase available globally FOREVER
if (typeof window !== 'undefined') {
  window.supabase = supabase;
  console.log('✅ Supabase attached to window permanently');
}