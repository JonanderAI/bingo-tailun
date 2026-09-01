// Cliente de Supabase compartido por toda la app.
// Requiere que window.SUPABASE_CONFIG esté definido (js/config.js)
// y que la librería @supabase/supabase-js UMD esté cargada antes de este script.
// Si en config.js todavía hay placeholders, se usa un cliente de demo
// (js/mock.js) con datos de ejemplo para poder ver la app sin BBDD real.
const supabaseClient = activarModoDemo()
  ? crearClienteMock()
  : window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);

document.addEventListener('DOMContentLoaded', () => {
  if (activarModoDemo()) {
    document.getElementById('demo-banner')?.classList.remove('hidden');
    document.getElementById('demo-hint')?.classList.remove('hidden');
  }
});
