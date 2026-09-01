// Cliente de Supabase compartido por toda la app.
// Requiere que window.SUPABASE_CONFIG esté definido (js/config.js)
// y que la librería @supabase/supabase-js UMD esté cargada antes de este script.
const supabaseClient = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);
