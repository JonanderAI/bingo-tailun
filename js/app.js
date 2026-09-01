// ============================================================
// Bingo Tailun - lógica principal
// ============================================================

const SESSION_KEY = 'bingo_tailun_session';

const state = {
  player: null, // { id, name, role }
  fase: 'submission',
  boardSize: 25,
  pruebas: [], // pruebas_publicas
  players: [], // players_publicos
  misResponsabilidades: [], // ids de pruebas que puedo desvelar
};

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

// ---------- login ----------

async function login(name, pin) {
  const { data, error } = await supabaseClient.rpc('login_jugador', { p_name: name, p_pin: pin });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.ok) throw new Error(row?.error || 'No se ha podido entrar');
  return { id: row.id, name: row.name, role: row.role };
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
      await arrancarApp(player);
    } catch (err) {
      errorEl.textContent = err.message || 'Error al iniciar sesión';
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

// ---------- render: header / tabs ----------

function renderHeader() {
  const chip = $('#user-chip');
  const tabs = $('#tabs');
  if (!state.player) {
    chip.classList.add('hidden');
    tabs.classList.add('hidden');
    return;
  }
  chip.classList.remove('hidden');
  tabs.classList.remove('hidden');
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

// ---------- render: envío de pruebas ----------

const ICONOS_PRUEBA = ['fa-dice', 'fa-fire', 'fa-champagne-glasses', 'fa-face-grin-tongue-wink', 'fa-martini-glass-citrus'];

function renderPruebasEnviadas() {
  const ul = $('#lista-pruebas-enviadas');
  ul.innerHTML = '';
  if (state.pruebas.length === 0) {
    ul.innerHTML = '<li class="empty"><i class="fa-solid fa-ghost"></i> Nadie ha enviado ninguna prueba todavía.</li>';
    return;
  }
  state.pruebas.forEach((p, idx) => {
    if (p.libre) return;
    const submitter = state.players.find(pl => pl.id === p.submitted_by);
    const li = document.createElement('li');
    const icon = ICONOS_PRUEBA[idx % ICONOS_PRUEBA.length];
    let estado = '<i class="fa-solid fa-lock"></i> oculta';
    if (p.completada) estado = '<i class="fa-solid fa-champagne-glasses"></i> cumplida';
    else if (p.revealed) estado = '<i class="fa-solid fa-eye"></i> activa';
    li.innerHTML = `<i class="fa-solid ${icon}"></i> Prueba de <strong>${submitter ? submitter.name : 'alguien'}</strong> &middot; ${estado}`;
    ul.appendChild(li);
  });
}

function renderFaseAvisoSubmission() {
  $('#pruebas-fase-aviso').classList.toggle('hidden', state.fase === 'submission');
  $('#prueba-form').classList.toggle('hidden', state.fase !== 'submission');
}

function initPruebaForm() {
  const form = $('#prueba-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = $('#prueba-texto').value.trim();
    if (!texto) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const { error } = await supabaseClient.rpc('crear_prueba', { p_player_id: state.player.id, p_texto: texto });
      if (error) throw error;
      $('#prueba-texto').value = '';
      mostrarToast('¡Prueba enviada! 🎉');
    } catch (err) {
      mostrarToast(err.message || 'Error al enviar la prueba');
    } finally {
      btn.disabled = false;
    }
  });
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
      cell.innerHTML = `<i class="fa-solid fa-gift cell-icon"></i><span class="cell-text">Libre</span>`;
    } else if (prueba.completada) {
      cell.classList.add('completed-cell');
      const cumplidor = state.players.find(pl => pl.id === prueba.completada_por);
      cell.innerHTML = `<i class="fa-solid fa-champagne-glasses cell-icon"></i><span class="cell-text">${escapeHtml(prueba.texto || '')}</span><span class="cumplidor-tag">${cumplidor ? cumplidor.name : ''}</span>`;
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
      <h3><i class="fa-solid fa-gift"></i> Casilla libre</h3>
      <p class="modal-texto">¡Regalo del bingo! Esta casilla ya está cumplida de fábrica.</p>
    `);
    return;
  }

  if (prueba.completada) {
    const cumplidor = state.players.find(pl => pl.id === prueba.completada_por);
    const responsable = state.players.find(pl => pl.id === prueba.responsable_id);
    abrirModal(`
      <h3><i class="fa-solid fa-champagne-glasses"></i> Prueba cumplida</h3>
      <p class="modal-texto">${escapeHtml(prueba.texto)}</p>
      <p class="modal-meta"><i class="fa-solid fa-user-check"></i> Cumplida por <strong>${cumplidor ? cumplidor.name : '?'}</strong></p>
      <p class="modal-meta"><i class="fa-solid fa-user-shield"></i> Encargado/a: <strong>${responsable ? responsable.name : '?'}</strong></p>
    `);
    return;
  }

  if (prueba.revealed) {
    const autorizado = state.player.role === 'admin' || prueba.responsable_id === state.player.id;
    const responsable = state.players.find(pl => pl.id === prueba.responsable_id);
    let acciones = '';
    if (autorizado) {
      const opciones = state.players.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
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
      <p class="modal-meta"><i class="fa-solid fa-user-shield"></i> Encargado/a: <strong>${responsable ? responsable.name : '?'}</strong></p>
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
      .concat(state.players.map(pl => `<option value="${pl.id}" ${pl.id === p.responsable_id ? 'selected' : ''}>${escapeHtml(pl.name)}</option>`))
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
    const { error } = await supabaseClient.rpc('iniciar_bingo', { p_player_id: state.player.id, p_board_size: 25 });
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
      await cargarPruebas();
      renderPruebasEnviadas();
      renderTablero();
      if (state.player?.role === 'admin') await renderAsignaciones();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, async () => {
      await cargarGameState();
      renderFaseAvisoSubmission();
      renderTablero();
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

  await Promise.all([cargarGameState(), cargarPruebas(), cargarPlayers(), cargarMisResponsabilidades()]);

  renderFaseAvisoSubmission();
  renderPruebasEnviadas();
  renderTablero();
  renderAdmin();
  if (player.role === 'admin') await renderAsignaciones();

  cambiarVista('view-pruebas');
  initRealtime();
}

document.addEventListener('DOMContentLoaded', async () => {
  initLoginForm();
  initPruebaForm();
  initAdminActions();
  initTabs();
  initModal();
  $('#logout-btn').addEventListener('click', logout);

  const sesion = leerSesion();
  if (sesion) {
    cambiarVista('view-pruebas');
    await arrancarApp(sesion);
  } else {
    cambiarVista('view-login');
  }
});
