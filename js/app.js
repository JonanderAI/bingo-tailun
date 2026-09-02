// ============================================================
// Bingo Tailun - lógica principal
// ============================================================

const SESSION_KEY = 'bingo_tailun_session';
const MAX_PRUEBAS_POR_JUGADOR = 2;

const state = {
  player: null, // { id, name, role, avatar }
  fase: 'submission',
  boardSize: 36,
  inicioAt: null, // fecha/hora programada de inicio (ISO) o null
  pruebas: [], // pruebas_publicas
  players: [], // players_publicos
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
  $('#app-header').classList.toggle('hidden', id === 'view-login');
}

// ---------- login / registro ----------

async function login(pin) {
  const { data, error } = await supabaseClient.rpc('login_jugador', { p_pin: pin });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.ok) throw new Error(row?.error || 'No se ha podido entrar');
  return { id: row.id, name: row.name, avatar: row.avatar, role: row.role };
}

async function registrar(name, pin) {
  const { data, error } = await supabaseClient.rpc('registrar_jugador', { p_name: name, p_pin: pin });
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

function initLoginForm() {
  const form = $('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = $('#login-pin').value.trim();
    const errorEl = $('#login-error');
    errorEl.classList.add('hidden');

    if (!/^[0-9]{6}$/.test(pin)) {
      errorEl.textContent = 'El PIN debe tener 6 dígitos.';
      errorEl.classList.remove('hidden');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const player = await login(pin);
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
    const errorEl = $('#registro-error');
    errorEl.classList.add('hidden');

    if (!/^[0-9]{6}$/.test(pin)) {
      errorEl.textContent = 'El PIN debe tener 6 dígitos.';
      errorEl.classList.remove('hidden');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const player = await registrar(name, pin);
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

function initUserMenu() {
  $('#user-chip-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#user-menu').classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!$('#user-chip').contains(e.target)) $('#user-menu').classList.add('hidden');
  });
}

// ---------- carga de datos ----------

async function cargarGameState() {
  const { data, error } = await supabaseClient.from('game_state').select('*').eq('id', 1).single();
  if (error) throw error;
  state.fase = data.fase;
  state.boardSize = data.board_size;
  state.inicioAt = data.inicio_at;
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

function nombreDe(playerId) {
  const p = state.players.find(pl => pl.id === playerId);
  return p ? p.name : '?';
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
  document.body.classList.toggle('has-tabs', state.player.role === 'admin');
  $('#user-avatar-label').textContent = state.player.avatar || '🎉';
  $('#user-name-label').textContent = state.player.name;
  const badge = $('#user-role-badge');
  if (state.player.role === 'admin') {
    badge.innerHTML = '<i class="fa-solid fa-crown"></i>';
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
  $('#card-reglas-juego').classList.toggle('hidden', state.fase === 'submission');
  // Una vez ha empezado el bingo, esta tarjeta sobra: ya se ve todo en el tablero.
  if (state.fase !== 'submission') {
    cont.classList.add('hidden');
    cont.innerHTML = '';
    return;
  }
  cont.classList.remove('hidden');

  const mias = state.misPruebas;
  const puedeAnadirMas = mias.length < MAX_PRUEBAS_POR_JUGADOR;

  let listaHtml = '';
  if (mias.length > 0) {
    listaHtml = `<div class="assign-list">${mias.map(p => `
      <div class="assign-item">
        <span class="assign-texto">
          <span class="li-titulo">${escapeHtml(p.texto)}</span>
          <span class="li-subtitulo">${estadoAportacion(p)}</span>
        </span>
        <span class="row-actions">
          <button class="btn btn-ghost btn-small" data-editar-mi-prueba="${p.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-ghost btn-small" data-borrar-mi-prueba="${p.id}" title="Borrar"><i class="fa-solid fa-trash"></i></button>
        </span>
      </div>
    `).join('')}</div>`;
  }

  let formHtml = '';
  if (puedeAnadirMas) {
    formHtml = `
      <form id="prueba-form">
        <label class="field">
          <textarea id="prueba-texto" rows="3" maxlength="200" placeholder="Ej: Beraza le pega un sopapo a alguien / Mikel pone una trampita..." required></textarea>
        </label>
        <button type="submit" class="btn btn-primary btn-block">
          <i class="fa-solid fa-paper-plane"></i> Enviar (${mias.length}/${MAX_PRUEBAS_POR_JUGADOR})
        </button>
      </form>
    `;
  }

  cont.innerHTML = `
    <h3><i class="fa-solid fa-lightbulb"></i> Tus pruebas</h3>
    <p class="subtitle small">Hasta ${MAX_PRUEBAS_POR_JUGADOR} pruebas por jugador.</p>
    ${listaHtml}
    ${formHtml}
  `;

  if (puedeAnadirMas) $('#prueba-form').addEventListener('submit', enviarPrueba);

  cont.querySelectorAll('[data-editar-mi-prueba]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = mias.find(x => x.id === btn.dataset.editarMiPrueba);
      if (p) abrirModalEditarMiPrueba(p);
    });
  });
  cont.querySelectorAll('[data-borrar-mi-prueba]').forEach(btn => {
    btn.addEventListener('click', () => borrarMiPrueba(btn.dataset.borrarMiPrueba));
  });
}

function abrirModalEditarMiPrueba(p) {
  abrirModal(`
    <h3><i class="fa-solid fa-pen"></i> Editar tu prueba</h3>
    <form id="form-mi-prueba">
      <label class="field">
        <textarea id="mp-texto" rows="3" maxlength="200" required>${escapeHtml(p.texto)}</textarea>
      </label>
      <button type="submit" class="btn btn-primary btn-block"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      <p id="mp-error" class="error-msg hidden"></p>
    </form>
  `);
  $('#form-mi-prueba').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = $('#mp-texto').value.trim();
    if (!texto) return;
    const { error } = await supabaseClient.rpc('editar_mi_prueba', {
      p_player_id: state.player.id, p_prueba_id: p.id, p_texto: texto,
    });
    if (error) {
      const errEl = $('#mp-error');
      errEl.textContent = error.message;
      errEl.classList.remove('hidden');
      return;
    }
    cerrarModal();
    mostrarToast('Prueba actualizada');
    await cargarMisPruebas();
    renderMiAportacion();
  });
}

async function borrarMiPrueba(id) {
  if (!confirm('¿Borrar esta prueba? No se puede deshacer.')) return;
  const { error } = await supabaseClient.rpc('borrar_mi_prueba', { p_player_id: state.player.id, p_prueba_id: id });
  if (error) { mostrarToast(error.message); return; }
  mostrarToast('Prueba borrada');
  await cargarMisPruebas();
  renderMiAportacion();
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

function formatearCuentaAtras(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSeg = Math.floor(ms / 1000);
  const dias = Math.floor(totalSeg / 86400);
  const horas = Math.floor((totalSeg % 86400) / 3600);
  const min = Math.floor((totalSeg % 3600) / 60);
  const seg = totalSeg % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return (dias > 0 ? `${dias}d ` : '') + `${pad(horas)}:${pad(min)}:${pad(seg)}`;
}

function actualizarCuentaAtras() {
  const box = $('#countdown-box');
  if (!box || state.fase !== 'submission' || !state.inicioAt) {
    if (box) box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  const restante = new Date(state.inicioAt).getTime() - Date.now();
  $('#countdown-timer').textContent = formatearCuentaAtras(restante);
}

function renderTablero() {
  const grid = $('#bingo-grid');
  const emptyMsg = $('#board-empty-msg');
  const enSubmission = state.fase === 'submission';

  actualizarCuentaAtras();
  emptyMsg.classList.toggle('hidden', !enSubmission || !!state.inicioAt);

  const lado = Math.round(Math.sqrt(state.boardSize));
  grid.style.gridTemplateColumns = `repeat(${lado}, 1fr)`;
  grid.classList.toggle('grid-bloqueado', enSubmission);
  grid.innerHTML = '';

  // Filas/columnas ya completadas (línea), para marcarlas visualmente.
  // Solo aplica una vez empezado el juego.
  const filasCompletas = new Set();
  const colsCompletas = new Set();
  if (!enSubmission) {
    const conPosicion = state.pruebas.filter(p => p.position !== null);
    for (let f = 0; f < lado; f++) {
      const celdas = conPosicion.filter(p => Math.floor(p.position / lado) === f);
      if (celdas.length === lado && celdas.every(p => p.completada)) filasCompletas.add(f);
    }
    for (let c = 0; c < lado; c++) {
      const celdas = conPosicion.filter(p => p.position % lado === c);
      if (celdas.length === lado && celdas.every(p => p.completada)) colsCompletas.add(c);
    }
  }

  const celdaEls = new Array(state.boardSize);

  for (let i = 0; i < state.boardSize; i++) {
    const prueba = state.pruebas.find(p => p.position === i);
    const cell = document.createElement('div');
    cell.className = 'bingo-cell';
    cell.dataset.position = i;
    if (filasCompletas.has(Math.floor(i / lado)) || colsCompletas.has(i % lado)) {
      cell.classList.add('en-linea');
    }

    // Fase de envíos: el tablero ya se ve, pero bloqueado (nada que
    // destapar todavía). Cada casilla ocupada muestra solo el avatar de
    // quien mandó esa prueba, sin texto.
    if (enSubmission) {
      cell.classList.add('hidden-cell');
      if (!prueba) {
        cell.innerHTML = `<i class="fa-solid fa-bomb cell-icon-bg cell-icon-vacia"></i>`;
      } else {
        cell.innerHTML = `
          <span class="lock-wrap">
            <i class="fa-solid fa-lock cell-lock-icon"></i>
            <span class="cell-emoji-inside">${escapeHtml(avatarDe(prueba.submitted_by))}</span>
          </span>
        `;
      }
      grid.appendChild(cell);
      continue;
    }

    if (!prueba) {
      cell.classList.add('hidden-cell');
      cell.innerHTML = `<i class="fa-solid fa-bomb cell-icon-bg cell-icon-vacia"></i>`;
    } else if (prueba.libre) {
      cell.classList.add('libre-cell');
      cell.innerHTML = `<i class="fa-solid fa-gift cell-icon-bg cell-icon-vacia"></i>`;
    } else if (prueba.completada) {
      cell.classList.add('completed-cell');
      cell.innerHTML = `<i class="fa-solid fa-burst cell-icon-bg cell-icon-vacia"></i><span class="cell-text">${escapeHtml(prueba.texto || '')}</span><span class="cumplidor-tag">${escapeHtml(nombreConAvatar(prueba.completada_por))}</span>`;
    } else if (prueba.revealed) {
      cell.classList.add('revealed-cell');
      cell.innerHTML = `<i class="fa-solid fa-fire cell-icon-bg"></i><span class="cell-text">${escapeHtml(prueba.texto || '')}</span>`;
    } else {
      cell.classList.add('hidden-cell');
      if (state.player.role === 'admin' || prueba.submitted_by === state.player.id) {
        cell.classList.add('puede-ver');
      }
      cell.innerHTML = `
        <span class="lock-wrap">
          <i class="fa-solid fa-lock cell-lock-icon"></i>
          <span class="cell-emoji-inside">${escapeHtml(avatarDe(prueba.submitted_by))}</span>
        </span>
      `;
    }

    if (prueba) {
      cell.addEventListener('click', (ev) => abrirCelda(prueba, ev));
    }
    grid.appendChild(cell);
    celdaEls[i] = cell;
  }

  // Barra que une visualmente las casillas de cada línea completada,
  // pero solo en los huecos entre ellas (nunca por encima de una
  // casilla): se calcula con la posición real ya montada en el DOM.
  if (filasCompletas.size || colsCompletas.size) {
    const gridRect = grid.getBoundingClientRect();
    const grosor = 8;

    // Barra continua de punta a punta de la fila/columna (por detrás de
    // las celdas gracias al z-index de .bingo-cell), no solo los huecos:
    // así se ve como una línea real y no como puntitos sueltos.
    filasCompletas.forEach((f) => {
      const primera = celdaEls[f * lado].getBoundingClientRect();
      const ultima = celdaEls[f * lado + lado - 1].getBoundingClientRect();
      const bar = document.createElement('div');
      bar.className = 'linea-bar';
      bar.style.left = `${primera.left - gridRect.left}px`;
      bar.style.width = `${ultima.right - primera.left}px`;
      bar.style.top = `${(primera.top + primera.bottom) / 2 - gridRect.top - grosor / 2}px`;
      bar.style.height = `${grosor}px`;
      grid.appendChild(bar);
    });
    colsCompletas.forEach((c) => {
      const primera = celdaEls[c].getBoundingClientRect();
      const ultima = celdaEls[(lado - 1) * lado + c].getBoundingClientRect();
      const bar = document.createElement('div');
      bar.className = 'linea-bar';
      bar.style.top = `${primera.top - gridRect.top}px`;
      bar.style.height = `${ultima.bottom - primera.top}px`;
      bar.style.left = `${(primera.left + primera.right) / 2 - gridRect.left - grosor / 2}px`;
      bar.style.width = `${grosor}px`;
      grid.appendChild(bar);
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- modal de celda ----------

function abrirModal(html) {
  const overlay = $('#modal-overlay');
  overlay.classList.remove('closing');
  $('#modal-content').innerHTML = html;
  overlay.classList.remove('hidden');
}
function cerrarModal() {
  const overlay = $('#modal-overlay');
  if (overlay.classList.contains('hidden')) return;
  overlay.classList.add('closing');
  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.classList.remove('closing');
    $('#modal-content').innerHTML = '';
  }, 150);
}

async function abrirCelda(prueba, ev) {
  if (prueba.libre) {
    abrirModal(`
      <h3><i class="fa-solid fa-gift"></i> ${escapeHtml(prueba.texto || 'Comodín')}</h3>
      <p class="modal-texto">¡Casilla comodín! Ya cuenta como cumplida de fábrica.</p>
    `);
    return;
  }

  // Quién puede destapar/completar/ocultar esta prueba: el admin o quien la mandó.
  const autorizado = state.player.role === 'admin' || prueba.submitted_by === state.player.id;

  if (prueba.completada) {
    abrirModal(`
      <h3><i class="fa-solid fa-champagne-glasses"></i> Prueba cumplida</h3>
      <p class="modal-texto">${escapeHtml(prueba.texto)}</p>
      <p class="modal-meta"><i class="fa-solid fa-champagne-glasses"></i> Chupito para <strong>${escapeHtml(nombreConAvatar(prueba.completada_por))}</strong></p>
      ${autorizado ? `
        <div class="modal-actions">
          <button class="btn btn-ghost btn-block" id="btn-ocultar-prueba">
            <i class="fa-solid fa-rotate-left"></i> No ha pasado: volver a ocultar
          </button>
        </div>
      ` : ''}
    `);
    if (autorizado) {
      $('#btn-ocultar-prueba').addEventListener('click', () => ocultarPrueba(prueba.id));
    }
    return;
  }

  if (prueba.revealed) {
    // Caso raro (no debería pasar con el flujo normal, revelar y completar
    // van juntos), pero se deja por si una prueba se queda a medias.
    let acciones = '';
    if (autorizado) {
      acciones = `
        <div class="modal-actions">
          <button class="btn btn-primary btn-block" id="btn-ha-pasado">
            <i class="fa-solid fa-champagne-glasses"></i> Marcar cumplida
          </button>
        </div>
      `;
    }
    abrirModal(`
      <h3><i class="fa-solid fa-fire"></i> Prueba activa</h3>
      <p class="modal-texto">${escapeHtml(prueba.texto)}</p>
      ${acciones}
    `);
    if (autorizado) {
      $('#btn-ha-pasado').addEventListener('click', () => abrirModalElegirResponsable(prueba.id));
    }
    return;
  }

  // oculta: solo se puede destapar cuando ya ha pasado, y hay que elegir
  // a la vez quién ha sido el culpable (admin o quien mandó la prueba).
  if (!autorizado) {
    abrirModal(`
      <div class="modal-emoji-header">${escapeHtml(avatarDe(prueba.submitted_by))}</div>
      <h3>Prueba de ${escapeHtml(nombreDe(prueba.submitted_by))}</h3>
      <p class="modal-texto">Aún sin descubrir 🤫</p>
    `);
    return;
  }

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
      <div class="modal-emoji-header">${escapeHtml(avatarDe(prueba.submitted_by))}</div>
      <h3>Prueba de ${escapeHtml(nombreDe(prueba.submitted_by))}</h3>
      <p class="modal-texto">Aún sin descubrir 🤫</p>
    `);
    return;
  }

  abrirModal(`
    <h3><i class="fa-solid fa-eye"></i> Vista privada</h3>
    <p class="modal-texto">${escapeHtml(texto)}</p>
    <p class="modal-meta"><i class="fa-solid fa-circle-info"></i> Solo se destapa cuando ya ha pasado.</p>
    <div class="modal-actions">
      <button class="btn btn-accent btn-block" id="btn-ha-pasado">
        <i class="fa-solid fa-champagne-glasses"></i> Ha pasado: destapar
      </button>
    </div>
  `);
  $('#btn-ha-pasado').addEventListener('click', () => abrirModalElegirResponsable(prueba.id));
}

function abrirModalElegirResponsable(pruebaId) {
  const opciones = state.players.map(p => `<option value="${p.id}">${escapeHtml(p.avatar)} ${escapeHtml(p.name)}</option>`).join('');
  abrirModal(`
    <h3><i class="fa-solid fa-user-check"></i> ¿Quién ha sido el culpable?</h3>
    <div class="modal-actions">
      <label class="field">
        <select id="select-cumplidor">${opciones}</select>
      </label>
      <button class="btn btn-primary btn-block" id="btn-marcar-cumplida">
        <i class="fa-solid fa-champagne-glasses"></i> Destapar y marcar cumplida
      </button>
    </div>
  `);
  $('#btn-marcar-cumplida').addEventListener('click', async () => {
    const cumplidorId = $('#select-cumplidor').value;
    await marcarCumplida(pruebaId, cumplidorId);
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

async function ocultarPrueba(pruebaId) {
  cerrarModal();
  const { error } = await supabaseClient.rpc('ocultar_prueba', {
    p_player_id: state.player.id,
    p_prueba_id: pruebaId,
  });
  if (error) { mostrarToast(error.message); return; }
  mostrarToast('Prueba oculta de nuevo');
}

// ---------- admin ----------

function toLocalDatetimeInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderAdmin() {
  if (state.player?.role !== 'admin') return;
  $('#admin-fase-label').textContent = { submission: 'Enviando pruebas', playing: 'En juego', finished: 'Terminado' }[state.fase] || state.fase;

  const info = $('#programado-info');
  const cancelBtn = $('#btn-cancelar-programacion');
  const input = $('#programar-fecha');
  const reiniciarBtn = $('#btn-reiniciar-bingo');

  if (state.fase !== 'submission') {
    // Ya no se puede programar ni cancelar/reiniciar el temporizador
    // una vez empezado el bingo (no hace nada, el inicio ya pasó).
    info.classList.add('hidden');
    cancelBtn.classList.add('hidden');
    reiniciarBtn.classList.add('hidden');
    $('#programar-form').classList.add('hidden');
    return;
  }
  $('#programar-form').classList.remove('hidden');
  reiniciarBtn.classList.remove('hidden');

  if (state.inicioAt) {
    const d = new Date(state.inicioAt);
    info.innerHTML = `<i class="fa-solid fa-calendar-check"></i> Programado para ${d.toLocaleString('es-ES')}`;
    info.classList.remove('hidden');
    cancelBtn.classList.remove('hidden');
    input.value = toLocalDatetimeInput(state.inicioAt);
  } else {
    info.classList.add('hidden');
    cancelBtn.classList.add('hidden');
    input.value = '';
  }
}

function initAdminActions() {
  $('#programar-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const valor = $('#programar-fecha').value;
    if (!valor) { mostrarToast('Elige una fecha y hora'); return; }
    const iso = new Date(valor).toISOString();
    const { error } = await supabaseClient.rpc('programar_inicio', { p_player_id: state.player.id, p_inicio: iso });
    if (error) { mostrarToast(error.message); return; }
    // Actualizamos el estado ya mismo, sin esperar al viaje de ida y
    // vuelta de Realtime: quien lo programa lo ve reflejado al instante.
    state.inicioAt = iso;
    renderAdmin();
    renderTablero();
    mostrarToast('¡Inicio programado! ⏳');
  });

  $('#btn-cancelar-programacion').addEventListener('click', async () => {
    const { error } = await supabaseClient.rpc('programar_inicio', { p_player_id: state.player.id, p_inicio: null });
    if (error) { mostrarToast(error.message); return; }
    state.inicioAt = null;
    renderAdmin();
    renderTablero();
    mostrarToast('Programación cancelada');
  });

  $('#btn-reiniciar-bingo').addEventListener('click', async () => {
    // Ya no borra nada (solo cancela el temporizador), así que no hace
    // falta confirmación: total, es lo mismo que "Cancelar programación".
    const { error } = await supabaseClient.rpc('reiniciar_bingo', { p_player_id: state.player.id });
    if (error) { mostrarToast(error.message); return; }
    state.inicioAt = null;
    renderAdmin();
    renderTablero();
    mostrarToast('Cuenta atrás reiniciada, elige una nueva fecha');
  });

  $('#btn-crear-usuario').addEventListener('click', abrirModalCrearUsuario);
}

// ---------- admin: pruebas reportadas ----------

async function cargarPruebasAdmin() {
  if (state.player?.role !== 'admin') return;
  const { data, error } = await supabaseClient.rpc('listar_pruebas_admin', { p_player_id: state.player.id });
  if (error) {
    $('#admin-pruebas').innerHTML = `<p class="notice"><i class="fa-solid fa-triangle-exclamation"></i> ${error.message}</p>`;
    return;
  }
  renderPruebasAdmin((data || []).filter(p => !p.libre));
}

function estadoPruebaAdmin(p) {
  if (p.completada) return `<i class="fa-solid fa-champagne-glasses"></i> Cumplida`;
  if (p.revealed) return `<i class="fa-solid fa-fire"></i> Activa`;
  return `<i class="fa-solid fa-lock"></i> Oculta`;
}

function renderPruebasAdmin(lista) {
  const cont = $('#admin-pruebas');
  if (lista.length === 0) {
    cont.innerHTML = '<p class="subtitle small">Todavía no hay pruebas enviadas.</p>';
    return;
  }
  cont.innerHTML = lista.map(p => `
    <div class="assign-item">
      <span class="assign-texto">
        <span class="li-titulo">${escapeHtml(p.texto)}</span>
        <span class="li-subtitulo">${estadoPruebaAdmin(p)} &middot; de ${escapeHtml(nombreConAvatar(p.submitted_by))}</span>
      </span>
      <span class="row-actions">
        <button class="btn btn-ghost btn-small" data-editar-prueba="${p.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-ghost btn-small" data-borrar-prueba="${p.id}" title="Borrar"><i class="fa-solid fa-trash"></i></button>
      </span>
    </div>
  `).join('');

  cont.querySelectorAll('[data-editar-prueba]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = lista.find(x => x.id === btn.dataset.editarPrueba);
      if (p) abrirModalEditarPrueba(p);
    });
  });
  cont.querySelectorAll('[data-borrar-prueba]').forEach(btn => {
    btn.addEventListener('click', () => borrarPruebaAdmin(btn.dataset.borrarPrueba));
  });
}

function abrirModalEditarPrueba(p) {
  abrirModal(`
    <h3><i class="fa-solid fa-pen"></i> Editar prueba</h3>
    <form id="form-prueba-admin">
      <label class="field">
        <textarea id="pa-texto" rows="3" maxlength="200" required>${escapeHtml(p.texto)}</textarea>
      </label>
      <button type="submit" class="btn btn-primary btn-block"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      <p id="pa-error" class="error-msg hidden"></p>
    </form>
  `);
  $('#form-prueba-admin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = $('#pa-texto').value.trim();
    if (!texto) return;
    const { error } = await supabaseClient.rpc('admin_editar_prueba', {
      p_player_id: state.player.id, p_prueba_id: p.id, p_texto: texto,
    });
    if (error) {
      const errEl = $('#pa-error');
      errEl.textContent = error.message;
      errEl.classList.remove('hidden');
      return;
    }
    cerrarModal();
    mostrarToast('Prueba actualizada');
    await refrescarTrasCambioPruebas();
  });
}

async function borrarPruebaAdmin(id) {
  if (!confirm('¿Borrar esta prueba? No se puede deshacer.')) return;
  const { error } = await supabaseClient.rpc('admin_borrar_prueba', { p_player_id: state.player.id, p_prueba_id: id });
  if (error) { mostrarToast(error.message); return; }
  mostrarToast('Prueba borrada');
  await refrescarTrasCambioPruebas();
}

async function refrescarTrasCambioPruebas() {
  await Promise.all([cargarPruebas(), cargarMisPruebas(), cargarPruebasAdmin()]);
  renderTablero();
  renderMiAportacion();
}

// ---------- admin: usuarios ----------

async function cargarUsuariosAdmin() {
  if (state.player?.role !== 'admin') return;
  const { data, error } = await supabaseClient.rpc('listar_jugadores_admin', { p_player_id: state.player.id });
  if (error) {
    $('#admin-usuarios').innerHTML = `<p class="notice"><i class="fa-solid fa-triangle-exclamation"></i> ${error.message}</p>`;
    return;
  }
  renderUsuarios(data || []);
}

function renderUsuarios(lista) {
  const cont = $('#admin-usuarios');
  if (lista.length === 0) {
    cont.innerHTML = '<p class="subtitle small">No hay usuarios todavía.</p>';
    return;
  }
  cont.innerHTML = lista.map(u => `
    <div class="assign-item">
      <span class="assign-texto">
        <span class="li-titulo">${escapeHtml(u.avatar)} ${escapeHtml(u.name)} ${u.role === 'admin' ? '<span class="role-tag">admin</span>' : ''}</span>
        <span class="li-subtitulo">PIN ${escapeHtml(u.pin)}</span>
      </span>
      <span class="row-actions">
        <button class="btn btn-ghost btn-small" data-editar="${u.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-ghost btn-small" data-borrar="${u.id}" title="Borrar"><i class="fa-solid fa-trash"></i></button>
      </span>
    </div>
  `).join('');

  cont.querySelectorAll('[data-editar]').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = lista.find(x => x.id === btn.dataset.editar);
      if (u) abrirModalEditarUsuario(u);
    });
  });
  cont.querySelectorAll('[data-borrar]').forEach(btn => {
    btn.addEventListener('click', () => borrarUsuario(btn.dataset.borrar, lista.find(x => x.id === btn.dataset.borrar)?.name));
  });
}

async function refrescarTrasCambioUsuarios() {
  await Promise.all([cargarPlayers(), cargarUsuariosAdmin()]);
  renderTablero();
}

function abrirModalCrearUsuario() {
  abrirModal(`
    <h3><i class="fa-solid fa-user-plus"></i> Crear usuario</h3>
    <form id="form-usuario">
      <label class="field"><span><i class="fa-solid fa-signature"></i> Nombre</span>
        <input type="text" id="us-name" maxlength="30" required autocomplete="off" />
      </label>
      <label class="field"><span><i class="fa-solid fa-key"></i> PIN (6 dígitos)</span>
        <input type="text" id="us-pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="off" />
      </label>
      <label class="field"><span><i class="fa-solid fa-face-grin-stars"></i> Avatar (emoji)</span>
        <input type="text" id="us-avatar" maxlength="4" placeholder="😈" />
      </label>
      <label class="field"><span><i class="fa-solid fa-user-shield"></i> Rol</span>
        <select id="us-role">
          <option value="player">Jugador</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <button type="submit" class="btn btn-primary btn-block"><i class="fa-solid fa-user-plus"></i> Crear</button>
      <p id="us-error" class="error-msg hidden"></p>
    </form>
  `);

  $('#form-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#us-name').value.trim();
    const pin = $('#us-pin').value.trim();
    const avatar = $('#us-avatar').value.trim();
    const role = $('#us-role').value;
    const errEl = $('#us-error');
    errEl.classList.add('hidden');
    if (!/^[0-9]{6}$/.test(pin)) { errEl.textContent = 'El PIN debe tener 6 dígitos.'; errEl.classList.remove('hidden'); return; }

    const { data, error } = await supabaseClient.rpc('admin_crear_jugador', {
      p_player_id: state.player.id, p_name: name, p_pin: pin, p_avatar: avatar || null, p_role: role,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.ok) {
      errEl.textContent = error?.message || row?.error || 'No se ha podido crear';
      errEl.classList.remove('hidden');
      return;
    }
    cerrarModal();
    mostrarToast('Usuario creado');
    await refrescarTrasCambioUsuarios();
  });
}

function abrirModalEditarUsuario(u) {
  abrirModal(`
    <h3><i class="fa-solid fa-pen"></i> Editar usuario</h3>
    <form id="form-usuario">
      <label class="field"><span><i class="fa-solid fa-signature"></i> Nombre</span>
        <input type="text" id="us-name" maxlength="30" required autocomplete="off" value="${escapeHtml(u.name)}" />
      </label>
      <label class="field"><span><i class="fa-solid fa-key"></i> PIN (6 dígitos)</span>
        <input type="text" id="us-pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="off" value="${escapeHtml(u.pin)}" />
      </label>
      <label class="field"><span><i class="fa-solid fa-face-grin-stars"></i> Avatar (emoji)</span>
        <input type="text" id="us-avatar" maxlength="4" value="${escapeHtml(u.avatar)}" />
      </label>
      <label class="field"><span><i class="fa-solid fa-user-shield"></i> Rol</span>
        <select id="us-role">
          <option value="player" ${u.role === 'player' ? 'selected' : ''}>Jugador</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </label>
      <button type="submit" class="btn btn-primary btn-block"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      <p id="us-error" class="error-msg hidden"></p>
    </form>
  `);

  $('#form-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#us-name').value.trim();
    const pin = $('#us-pin').value.trim();
    const avatar = $('#us-avatar').value.trim();
    const role = $('#us-role').value;
    const errEl = $('#us-error');
    errEl.classList.add('hidden');
    if (!/^[0-9]{6}$/.test(pin)) { errEl.textContent = 'El PIN debe tener 6 dígitos.'; errEl.classList.remove('hidden'); return; }

    const { data, error } = await supabaseClient.rpc('admin_editar_jugador', {
      p_player_id: state.player.id, p_target_id: u.id, p_name: name, p_pin: pin, p_avatar: avatar || null, p_role: role,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.ok) {
      errEl.textContent = error?.message || row?.error || 'No se ha podido guardar';
      errEl.classList.remove('hidden');
      return;
    }
    cerrarModal();
    mostrarToast('Usuario actualizado');
    // Si el admin se edita a sí mismo (p.ej. cambia su emoji), que se
    // refleje al momento en su propia ficha de la cabecera.
    if (u.id === state.player.id) {
      state.player = { ...state.player, name, avatar: avatar || state.player.avatar, role };
      guardarSesion(state.player);
      renderHeader();
    }
    await refrescarTrasCambioUsuarios();
  });
}

async function borrarUsuario(id, nombre) {
  if (!confirm(`¿Borrar a ${nombre || 'este usuario'}? No se puede deshacer.`)) return;
  const { error } = await supabaseClient.rpc('admin_borrar_jugador', { p_player_id: state.player.id, p_target_id: id });
  if (error) { mostrarToast(error.message); return; }
  mostrarToast('Usuario borrado');
  await refrescarTrasCambioUsuarios();
}

// ---------- eventos en tiempo real ----------

function initRealtime() {
  supabaseClient
    .channel('bingo-tailun')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pruebas' }, async () => {
      await Promise.all([cargarPruebas(), cargarMisPruebas()]);
      renderTablero();
      renderMiAportacion();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, async () => {
      const faseAnterior = state.fase;
      await cargarGameState();
      if (faseAnterior === 'submission' && state.fase === 'playing') {
        mostrarToast('¡EMPIEZA EL BINGO! 🎉🔥', { big: true });
        lanzarEmojis();
        setTimeout(lanzarEmojis, 350);
        setTimeout(lanzarEmojis, 700);
      }
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
  // Navegamos ya: si algo de la carga de datos falla no queremos dejar
  // a quien se acaba de loguear/registrar colgado en la pantalla de login.
  cambiarVista('view-tablero');

  const resultados = await Promise.allSettled([
    cargarGameState(),
    cargarPruebas(),
    cargarPlayers(),
    cargarMisPruebas(),
  ]);
  const fallo = resultados.find(r => r.status === 'rejected');
  if (fallo) {
    console.error(fallo.reason);
    mostrarToast(fallo.reason?.message || 'Error cargando el tablero, prueba a recargar la página');
  }

  renderTablero();
  renderMiAportacion();
  renderAdmin();
  if (player.role === 'admin') {
    await Promise.all([cargarUsuariosAdmin(), cargarPruebasAdmin()]);
  }

  initRealtime();
  iniciarComprobacionInicio();
}

// Cuenta atrás visual + comprobación real de si ya toca empezar, ambas
// cada segundo (cualquier cliente conectado puede disparar el inicio),
// así el bingo arranca casi al instante en cuanto el contador llega a 0.
function iniciarComprobacionInicio() {
  setInterval(async () => {
    actualizarCuentaAtras();
    if (state.fase !== 'submission' || !state.inicioAt) return;
    if (new Date(state.inicioAt).getTime() > Date.now()) return;
    await supabaseClient.rpc('comprobar_inicio_programado');
  }, 1000);
}

document.addEventListener('DOMContentLoaded', async () => {
  initLoginSwitch();
  initLoginForm();
  initRegistroForm();
  initAdminActions();
  initTabs();
  initModal();
  initInstalarBoton();
  initUserMenu();
  $('#logout-btn').addEventListener('click', () => { $('#user-menu').classList.add('hidden'); logout(); });

  const sesion = leerSesion();
  if (sesion) {
    cambiarVista('view-tablero');
    await arrancarApp(sesion);
  } else {
    cambiarVista('view-login');
  }
});
