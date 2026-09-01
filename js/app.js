// ============================================================
// Bingo Tailun - lógica principal
// ============================================================

const SESSION_KEY = 'bingo_tailun_session';
const MAX_PRUEBAS_POR_JUGADOR = 3;
const AVATARES = ['😈', '🔥', '🥂', '🍹', '🎉', '🦄', '🐸', '🦀', '🦭', '🌵', '🍕', '🐙', '🎲', '🕺', '💃', '👑'];

const state = {
  player: null, // { id, name, role, avatar }
  fase: 'submission',
  boardSize: 25,
  pruebas: [], // pruebas_publicas
  players: [], // players_publicos
  misResponsabilidades: [], // ids de pruebas que puedo desvelar
  misPruebas: [], // mis propias aportaciones (texto siempre visible para mí, hasta 3)
};

// ---------- instalar como app (PWA) ----------

let promptInstalacionDiferido = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptInstalacionDiferido = e;
  actualizarBotonInstalar();
});
window.addEventListener('appinstalled', () => {
  promptInstalacionDiferido = null;
  actualizarBotonInstalar();
});

function esIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function appYaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function actualizarBotonInstalar() {
  const btn = $('#install-btn');
  if (!btn) return;
  const mostrar = !appYaInstalada() && (promptInstalacionDiferido || esIOS());
  btn.classList.toggle('hidden', !mostrar);
}

async function ofrecerInstalacion() {
  if (!promptInstalacionDiferido) return;
  promptInstalacionDiferido.prompt();
  await promptInstalacionDiferido.userChoice.catch(() => {});
  promptInstalacionDiferido = null;
  actualizarBotonInstalar();
}

function initInstalarBoton() {
  actualizarBotonInstalar();
  $('#install-btn').addEventListener('click', async () => {
    if (promptInstalacionDiferido) {
      await ofrecerInstalacion();
      return;
    }
    if (esIOS()) {
      abrirModal(`
        <h3><i class="fa-solid fa-mobile-screen-button"></i> Instalar en iPhone / iPad</h3>
        <p class="modal-texto">
          Toca el botón <i class="fa-solid fa-arrow-up-from-bracket"></i> <strong>Compartir</strong> de Safari
          y elige <strong>"Añadir a pantalla de inicio"</strong>.
        </p>
      `);
    }
  });
}

// ---------- tema día / noche ----------

function actualizarTemaPorHora() {
  const hora = new Date().getHours();
  const esNoche = hora >= 21 || hora < 7;
  document.body.classList.toggle('tema-noche', esNoche);
}

// ---------- utilidades ----------

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function guardarSesion(player) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(player));
}
function leerSesion() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function borrarSesion() { localStorage.removeItem(SESSION_KEY); }

function mostrarToast(mensaje, opts = {}) {
  const layer = $('#toast-layer');
  const toast = document.createElement('div');
  toast.className = 'toast' + (opts.big ? ' toast-big' : '');
  toast.textContent = mensaje;
  layer.appendChild(toast);
  setTimeout(() => toast.remove(), 3300);
}

function cambiarVista(id) {
  $all('.view').forEach(v => v.classList.remove('active'));
  const v = document.getElementById(id);
  if (v) v.classList.add('active');
  $all('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === id));
}

// ---------- login / registro ----------

async function login(name, pin) {
  const { data, error } = await supabaseClient.rpc('login_jugador', { p_name: name, p_pin: pin });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.ok) throw new Error(row?.error || 'No se ha podido entrar');
  return { id: row.id, name: row.name, avatar: row.avatar, role: row.role };
}

async function registrar(name, pin, avatar) {
  const { data, error } = await supabaseClient.rpc('registrar_jugador', { p_name: name, p_pin: pin, p_avatar: avatar });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.ok) throw new Error(row?.error || 'No se ha podido crear la cuenta');
  return { id: row.id, name: row.name, avatar: row.avatar, role: row.role };
}

function initLoginSwitch() {
  $all('.login-switch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $all('.login-switch-btn').forEach(b => b.classList.toggle('active', b === btn));
      const modo = btn.dataset.loginTab;
      $('#login-form').classList.toggle('hidden', modo !== 'entrar');
      $('#registro-form').classList.toggle('hidden', modo !== 'crear');
    });
  });
}

function initAvatarPicker() {
  const cont = $('#avatar-picker');
  cont.innerHTML = AVATARES.map((a, i) =>
    `<button type="button" class="avatar-opt${i === 0 ? ' selected' : ''}" data-avatar="${a}">${a}</button>`
  ).join('');
  cont.addEventListener('click', (e) => {
    const btn = e.target.closest('.avatar-opt');
    if (!btn) return;
    cont.querySelectorAll('.avatar-opt').forEach(b => b.classList.toggle('selected', b === btn));
  });
}

function initLoginForm() {
  const form = $('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#login-name').value.trim();
    const pin = $('#login-pin').value.trim();
    const errorEl = $('#login-error');
    errorEl.classList.add('hidden');

    if (!/^[0-9]{4}$/.test(pin)) {
      errorEl.textContent = 'El PIN debe tener 4 dígitos.';
      errorEl.classList.remove('hidden');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const player = await login(name, pin);
      guardarSesion(player);
      ofrecerInstalacion();
      await arrancarApp(player);
    } catch (err) {
      errorEl.textContent = err.message || 'Error al iniciar sesión';
      errorEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  });
}

function initRegistroForm() {
  const form = $('#registro-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#registro-name').value.trim();
    const pin = $('#registro-pin').value.trim();
    const avatar = $('#avatar-picker .avatar-opt.selected')?.dataset.avatar || AVATARES[0];
    const errorEl = $('#registro-error');
    errorEl.classList.add('hidden');

    if (!/^[0-9]{4}$/.test(pin)) {
      errorEl.textContent = 'El PIN debe tener 4 dígitos.';
      errorEl.classList.remove('hidden');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const player = await registrar(name, pin, avatar);
      guardarSesion(player);
      ofrecerInstalacion();
      await arrancarApp(player);
    } catch (err) {
      errorEl.textContent = err.message || 'Error al crear la cuenta';
      errorEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  });
}

function logout() {
  borrarSesion();
  location.reload();
}

// ---------- carga de datos ----------

async function cargarGameState() {
  const { data, error } = await supabaseClient.from('game_state').select('*').eq('id', 1).single();
  if (error) throw error;
  state.fase = data.fase;
  state.boardSize = data.board_size;
}

async function cargarPruebas() {
  const { data, error } = await supabaseClient
    .from('pruebas_publicas')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  state.pruebas = data || [];
}

async function cargarPlayers() {
  const { data, error } = await supabaseClient.from('players_publicos').select('*').order('name');
  if (error) throw error;
  state.players = data || [];
}

async function cargarMisResponsabilidades() {
  if (!state.player) return;
  const { data, error } = await supabaseClient.rpc('mis_responsabilidades', { p_player_id: state.player.id });
  if (error) { console.error(error); return; }
  state.misResponsabilidades = data || [];
}

async function cargarMisPruebas() {
  if (!state.player) return;
  const { data, error } = await supabaseClient.rpc('mi_prueba', { p_player_id: state.player.id });
  if (error) { console.error(error); return; }
  state.misPruebas = data || [];
}

// ---------- render: header / tabs ----------

function avatarDe(playerId) {
  const p = state.players.find(pl => pl.id === playerId);
  return p ? p.avatar : '❓';
}

function nombreConAvatar(playerId) {
  const p = state.players.find(pl => pl.id === playerId);
  return p ? `${p.avatar} ${p.name}` : '?';
}

function renderHeader() {
  const chip = $('#user-chip');
  const tabs = $('#tabs');
  if (!state.player) {
    chip.classList.add('hidden');
    tabs.classList.add('hidden');
    return;
  }
  chip.classList.remove('hidden');
  // Los jugadores normales solo tienen una pantalla (el tablero), así
  // que no necesitan pestañas. El admin sí, para acceder a su panel.
  tabs.classList.toggle('hidden', state.player.role !== 'admin');
  $('#user-avatar-label').textContent = state.player.avatar || '🎉';
  $('#user-name-label').textContent = state.player.name;
  const badge = $('#user-role-badge');
  if (state.player.role === 'admin') {
    badge.textContent = 'admin';
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
  $all('.admin-only').forEach(el => el.classList.toggle('hidden', state.player.role !== 'admin'));
}

// ---------- render: tu aportación ----------

function estadoAportacion(p) {
  if (p.completada) {
    const cumplidor = state.players.find(pl => pl.id === p.completada_por);
    return `<i class="fa-solid fa-champagne-glasses"></i> Cumplida por <strong>${cumplidor ? cumplidor.name : '?'}</strong>`;
  }
  if (state.fase === 'submission') return `<i class="fa-solid fa-hourglass-half"></i> Guardada, esperando a que empiece el bingo`;
  if (p.revealed) return `<i class="fa-solid fa-fire"></i> ¡Activa en el tablero!`;
  return `<i class="fa-solid fa-lock"></i> Sigue oculta`;
}

function renderMiAportacion() {
  const cont = $('#card-mi-aportacion');
  const mias = state.misPruebas;
  const puedeAnadirMas = state.fase === 'submission' && mias.length < MAX_PRUEBAS_POR_JUGADOR;

  let listaHtml = '';
  if (mias.length > 0) {
    listaHtml = `<ul class="simple-list">${mias.map(p => `
      <li><i class="fa-solid fa-scroll"></i> ${escapeHtml(p.texto)} &middot; ${estadoAportacion(p)}</li>
    `).join('')}</ul>`;
  } else if (state.fase !== 'submission') {
    listaHtml = `<p class="subtitle small">No enviaste ninguna prueba esta vez. ¡A disfrutar del bingo de los demás! 🍻</p>`;
  }

  let formHtml = '';
  if (puedeAnadirMas) {
    formHtml = `
      <form id="prueba-form">
        <label class="field">
          <textarea id="prueba-texto" rows="3" maxlength="200" placeholder="Ej: Bañarse en el río antes de las 12h..." required></textarea>
        </label>
        <button type="submit" class="btn btn-primary btn-block">
          <i class="fa-solid fa-paper-plane"></i> Enviar (${mias.length}/${MAX_PRUEBAS_POR_JUGADOR})
        </button>
      </form>
    `;
  }

  cont.innerHTML = `
    <h3><i class="fa-solid fa-lightbulb"></i> Tu aportación</h3>
    <p class="subtitle small">Hasta ${MAX_PRUEBAS_POR_JUGADOR} pruebas por jugador. ¡Cuanto más random, mejor!</p>
    ${listaHtml}
    ${formHtml}
  `;

  if (puedeAnadirMas) $('#prueba-form').addEventListener('submit', enviarPrueba);
}

async function enviarPrueba(e) {
  e.preventDefault();
  const texto = $('#prueba-texto').value.trim();
  if (!texto) return;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const { error } = await supabaseClient.rpc('crear_prueba', { p_player_id: state.player.id, p_texto: texto });
    if (error) throw error;
    await cargarMisPruebas();
    renderMiAportacion();
    mostrarToast('¡Prueba enviada! 🎉');
  } catch (err) {
    mostrarToast(err.message || 'Error al enviar la prueba');
    btn.disabled = false;
  }
}

// ---------- render: tablero ----------

function iconoParaCelda(prueba) {
  if (!prueba) return 'fa-question';
  if (prueba.libre) return 'fa-gift';
  if (prueba.completada) return 'fa-champagne-glasses';
  if (prueba.revealed) return 'fa-fire';
  return 'fa-lock';
}

function renderTablero() {
  const grid = $('#bingo-grid');
  const emptyMsg = $('#board-empty-msg');
  const badge = $('#fase-badge');

  badge.textContent = state.fase === 'submission' ? 'Esperando pruebas' : (state.fase === 'playing' ? 'En juego' : 'Terminado');
  badge.className = 'fase-badge ' + state.fase;

  if (state.fase === 'submission') {
    emptyMsg.classList.remove('hidden');
    grid.innerHTML = '';
    return;
  }
  emptyMsg.classList.add('hidden');

  const lado = Math.round(Math.sqrt(state.boardSize));
  grid.innerHTML = '';

  for (let i = 0; i < state.boardSize; i++) {
    const prueba = state.pruebas.find(p => p.position === i);
    const cell = document.createElement('div');
    cell.className = 'bingo-cell';
    cell.dataset.position = i;

    if (!prueba) {
      cell.classList.add('hidden-cell');
      cell.innerHTML = `<i class="fa-solid fa-dice cell-icon"></i>`;
    } else if (prueba.libre) {
      cell.classList.add('libre-cell');
      cell.innerHTML = `<i class="fa-solid fa-gift cell-icon"></i><span class="cell-text">${escapeHtml(prueba.texto || 'Comodín')}</span>`;
    } else if (prueba.completada) {
      cell.classList.add('completed-cell');
      cell.innerHTML = `<i class="fa-solid fa-champagne-glasses cell-icon"></i><span class="cell-text">${escapeHtml(prueba.texto || '')}</span><span class="cumplidor-tag">${escapeHtml(nombreConAvatar(prueba.completada_por))}</span>`;
    } else if (prueba.revealed) {
      cell.classList.add('revealed-cell');
      cell.innerHTML = `<i class="fa-solid fa-fire cell-icon"></i><span class="cell-text">${escapeHtml(prueba.texto || '')}</span>`;
    } else {
      cell.classList.add('hidden-cell');
      if (state.player.role === 'admin' || state.misResponsabilidades.includes(prueba.id)) {
        cell.classList.add('puede-ver');
      }
      cell.innerHTML = `<i class="fa-solid fa-lock cell-icon"></i>`;
    }

    if (prueba) {
      cell.addEventListener('click', (ev) => abrirCelda(prueba, ev));
    }
    grid.appendChild(cell);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- modal de celda ----------

function abrirModal(html) {
  $('#modal-content').innerHTML = html;
  $('#modal-overlay').classList.remove('hidden');
}
function cerrarModal() {
  $('#modal-overlay').classList.add('hidden');
  $('#modal-content').innerHTML = '';
}

async function abrirCelda(prueba, ev) {
  if (prueba.libre) {
    abrirModal(`
      <h3><i class="fa-solid fa-gift"></i> ${escapeHtml(prueba.texto || 'Comodín')}</h3>
      <p class="modal-texto">¡Casilla comodín! Ya cuenta como cumplida de fábrica.</p>
    `);
    return;
  }

  if (prueba.completada) {
    abrirModal(`
      <h3><i class="fa-solid fa-champagne-glasses"></i> Prueba cumplida</h3>
      <p class="modal-texto">${escapeHtml(prueba.texto)}</p>
      <p class="modal-meta"><i class="fa-solid fa-user-check"></i> Cumplida por <strong>${escapeHtml(nombreConAvatar(prueba.completada_por))}</strong></p>
      <p class="modal-meta"><i class="fa-solid fa-user-shield"></i> Encargado/a: <strong>${escapeHtml(nombreConAvatar(prueba.responsable_id))}</strong></p>
    `);
    return;
  }

  if (prueba.revealed) {
    const autorizado = state.player.role === 'admin' || prueba.responsable_id === state.player.id;
    let acciones = '';
    if (autorizado) {
      const opciones = state.players.map(p => `<option value="${p.id}">${escapeHtml(p.avatar)} ${escapeHtml(p.name)}</option>`).join('');
      acciones = `
        <div class="modal-actions">
          <label class="field"><span><i class="fa-solid fa-user-check"></i> ¿Quién ha cumplido la prueba?</span>
            <select id="select-cumplidor">${opciones}</select>
          </label>
          <button class="btn btn-primary btn-block" id="btn-marcar-cumplida">
            <i class="fa-solid fa-champagne-glasses"></i> Marcar cumplida
          </button>
        </div>
      `;
    }
    abrirModal(`
      <h3><i class="fa-solid fa-fire"></i> Prueba activa</h3>
      <p class="modal-texto">${escapeHtml(prueba.texto)}</p>
      <p class="modal-meta"><i class="fa-solid fa-user-shield"></i> Encargado/a: <strong>${escapeHtml(nombreConAvatar(prueba.responsable_id))}</strong></p>
      ${acciones}
    `);
    if (autorizado) {
      $('#btn-marcar-cumplida').addEventListener('click', async () => {
        const cumplidorId = $('#select-cumplidor').value;
        await marcarCumplida(prueba.id, cumplidorId);
      });
    }
    return;
  }

  // oculta: pedir al servidor si podemos verla
  abrirModal(`<p class="modal-meta"><i class="fa-solid fa-spinner fa-spin"></i> Comprobando...</p>`);
  const { data: texto, error } = await supabaseClient.rpc('ver_prueba_oculta', {
    p_prueba_id: prueba.id,
    p_player_id: state.player.id,
  });
  if (error) {
    abrirModal(`<p class="modal-meta"><i class="fa-solid fa-triangle-exclamation"></i> Error al consultar la prueba.</p>`);
    return;
  }
  if (!texto) {
    abrirModal(`
      <h3><i class="fa-solid fa-lock"></i> Prueba oculta</h3>
      <p class="modal-texto">Solo el admin o el encargado/a de esta prueba pueden verla.</p>
    `);
    return;
  }
  abrirModal(`
    <h3><i class="fa-solid fa-eye"></i> Vista privada</h3>
    <p class="modal-texto">${escapeHtml(texto)}</p>
    <div class="modal-actions">
      <button class="btn btn-accent btn-block" id="btn-habilitar">
        <i class="fa-solid fa-bullhorn"></i> Habilitar para todos
      </button>
    </div>
  `);
  $('#btn-habilitar').addEventListener('click', async (e) => {
    const rect = ev?.currentTarget?.getBoundingClientRect?.();
    cerrarModal();
    const { error: err2 } = await supabaseClient.rpc('revelar_prueba', {
      p_prueba_id: prueba.id,
      p_player_id: state.player.id,
    });
    if (err2) { mostrarToast('No se ha podido habilitar la prueba'); return; }
    lanzarEmojis(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined);
  });
}

async function marcarCumplida(pruebaId, cumplidorId) {
  cerrarModal();
  const { data, error } = await supabaseClient.rpc('completar_prueba', {
    p_player_id: state.player.id,
    p_prueba_id: pruebaId,
    p_cumplidor_id: cumplidorId,
  });
  if (error) {
    mostrarToast('No se ha podido marcar como cumplida');
    return;
  }
  lanzarEmojis();
}

// ---------- admin ----------

function renderAdmin() {
  if (state.player?.role !== 'admin') return;
  $('#admin-fase-label').textContent = { submission: 'Enviando pruebas', playing: 'En juego', finished: 'Terminado' }[state.fase] || state.fase;
  $('#btn-iniciar-bingo').disabled = state.fase !== 'submission';
}

async function renderAsignaciones() {
  if (state.player?.role !== 'admin') return;
  const { data, error } = await supabaseClient.rpc('listar_pruebas_admin', { p_player_id: state.player.id });
  const cont = $('#admin-asignaciones');
  if (error) {
    cont.innerHTML = `<p class="notice"><i class="fa-solid fa-triangle-exclamation"></i> ${error.message}</p>`;
    return;
  }
  const pruebas = (data || []).filter(p => !p.libre);
  if (pruebas.length === 0) {
    cont.innerHTML = '<p class="subtitle small">Todavía no hay pruebas enviadas.</p>';
    return;
  }
  cont.innerHTML = '';
  pruebas.forEach(p => {
    const opciones = ['<option value="">Sin asignar</option>']
      .concat(state.players.map(pl => `<option value="${pl.id}" ${pl.id === p.responsable_id ? 'selected' : ''}>${escapeHtml(pl.avatar)} ${escapeHtml(pl.name)}</option>`))
      .join('');
    const div = document.createElement('div');
    div.className = 'assign-item';
    div.innerHTML = `
      <span class="assign-texto"><i class="fa-solid fa-scroll"></i> ${escapeHtml(p.texto)}</span>
      <select data-prueba-id="${p.id}">${opciones}</select>
    `;
    cont.appendChild(div);
  });
  cont.querySelectorAll('select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const pruebaId = sel.dataset.pruebaId;
      const responsableId = sel.value || null;
      await supabaseClient.rpc('asignar_responsable', {
        p_player_id: state.player.id,
        p_prueba_id: pruebaId,
        p_responsable_id: responsableId,
      });
      mostrarToast('Encargado/a actualizado');
    });
  });
}

function initAdminActions() {
  $('#btn-iniciar-bingo').addEventListener('click', async () => {
    if (!confirm('¿Iniciar el bingo? Se repartirán las pruebas enviadas por el tablero.')) return;
    const { error } = await supabaseClient.rpc('iniciar_bingo', { p_player_id: state.player.id });
    if (error) { mostrarToast(error.message); return; }
    mostrarToast('¡El bingo ha comenzado! 🔥');
  });

  $('#btn-reiniciar-bingo').addEventListener('click', async () => {
    if (!confirm('Esto borra todas las pruebas y eventos. ¿Seguro?')) return;
    const { error } = await supabaseClient.rpc('reiniciar_bingo', { p_player_id: state.player.id });
    if (error) { mostrarToast(error.message); return; }
    mostrarToast('Partida reiniciada');
  });
}

// ---------- eventos en tiempo real ----------

function initRealtime() {
  supabaseClient
    .channel('bingo-tailun')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pruebas' }, async () => {
      await Promise.all([cargarPruebas(), cargarMisPruebas(), cargarMisResponsabilidades()]);
      renderTablero();
      renderMiAportacion();
      if (state.player?.role === 'admin') await renderAsignaciones();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, async () => {
      await cargarGameState();
      renderTablero();
      renderMiAportacion();
      renderAdmin();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventos' }, (payload) => {
      const ev = payload.new;
      const esGrande = ev.tipo === 'linea' || ev.tipo === 'bingo';
      mostrarToast(ev.mensaje, { big: esGrande });
      if (esGrande) lanzarEmojis();
    })
    .subscribe();
}

// ---------- navegación ----------

function initTabs() {
  $all('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => cambiarVista(btn.dataset.view));
  });
}

function initModal() {
  $('#modal-close').addEventListener('click', cerrarModal);
  $('#modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') cerrarModal();
  });
}

// ---------- arranque ----------

async function arrancarApp(player) {
  state.player = player;
  renderHeader();

  await Promise.all([
    cargarGameState(),
    cargarPruebas(),
    cargarPlayers(),
    cargarMisResponsabilidades(),
    cargarMisPruebas(),
  ]);

  renderTablero();
  renderMiAportacion();
  renderAdmin();
  if (player.role === 'admin') await renderAsignaciones();

  cambiarVista('view-tablero');
  initRealtime();
}

document.addEventListener('DOMContentLoaded', async () => {
  actualizarTemaPorHora();
  setInterval(actualizarTemaPorHora, 60_000);

  initLoginSwitch();
  initAvatarPicker();
  initLoginForm();
  initRegistroForm();
  initAdminActions();
  initTabs();
  initModal();
  initInstalarBoton();
  $('#logout-btn').addEventListener('click', logout);

  const sesion = leerSesion();
  if (sesion) {
    cambiarVista('view-tablero');
    await arrancarApp(sesion);
  } else {
    cambiarVista('view-login');
  }
});
