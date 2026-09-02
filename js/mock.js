// ============================================================
// Modo demo: cliente falso que imita la API de Supabase para poder
// ver la app funcionando sin tener una base de datos real conectada.
// Se activa solo, mirando js/config.js. En cuanto pongas tu URL/anonKey
// reales de Supabase, este archivo deja de usarse.
// ============================================================

function activarModoDemo() {
  const cfg = window.SUPABASE_CONFIG || {};
  return !cfg.url || cfg.url.includes('TU-PROYECTO') || !cfg.anonKey || cfg.anonKey.includes('TU-ANON-KEY');
}

const AVATARES_ALEATORIOS = ['😈', '🦭', '🦀', '🧨', '🧀', '🍷', '🤮', '💩', '🗿', '🦍', '🇪🇸'];

// Pone en mayúscula solo la primera letra (a diferencia de capitalizar
// cada palabra), igual que capitaliza_texto() en SQL.
function capitalizaTexto(texto) {
  const t = (texto || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function crearClienteMock() {
  const uid = (() => { let n = 0; return (p) => `${p}-${++n}`; })();

  const players = [
    { id: 'p-admin', name: 'Jon (admin)', role: 'admin', pin: '123456', avatar: '😈' },
    { id: 'p-ana', name: 'Ana', role: 'player', pin: '111111', avatar: '🔥' },
    { id: 'p-marc', name: 'Marc', role: 'player', pin: '222222', avatar: '🦀' },
    { id: 'p-lucia', name: 'Lucía', role: 'player', pin: '333333', avatar: '🥂' },
    { id: 'p-pol', name: 'Pol', role: 'player', pin: '444444', avatar: '🦭' },
    { id: 'p-noa', name: 'Noa', role: 'player', pin: '555555', avatar: '🌵' },
  ];

  const textos = [
    'Bañarse en el río antes de las 12h',
    'Cantar el Despacito entero a capela',
    'Hacer 10 flexiones antes de comer',
    'Contar un secreto vergonzoso',
    'Bailar con una escoba 1 minuto',
    'Hablar con acento andaluz toda la comida',
    'Hacerse una foto con un animal de la zona',
    'Comer algo picante sin beber agua',
    'Imitar a otro jugador durante 5 minutos',
    'Dar un discurso improvisado de boda',
    'Hacer el pino (o intentarlo) 10 segundos',
    'Regalar un cumplido a cada jugador',
  ];

  let pruebas = textos.map((texto, i) => ({
    id: uid('prueba'),
    texto,
    submitted_by: players[(i + 1) % players.length].id,
    responsable_id: players[i % players.length].id,
    position: null,
    libre: false,
    revealed: false,
    completada: false,
    completada_por: null,
    created_at: new Date(Date.now() - (textos.length - i) * 3600_000).toISOString(),
    revealed_at: null,
    completada_at: null,
  }));

  const gameState = { id: 1, fase: 'playing', board_size: 36, inicio_at: null, updated_at: new Date().toISOString() };
  const eventos = [];

  // Tablero fijo de 6x6 (36 casillas). Rellena con comodines las
  // casillas que no tengan ya una prueba asignada (las pruebas reciben
  // su posición al crearse, no aquí), igual que _repartir_y_empezar() en SQL.
  function rellenarComodines() {
    const ocupadas = new Set(pruebas.filter(p => p.position !== null).map(p => p.position));
    for (let i = 0; i < 36; i++) {
      if (ocupadas.has(i)) continue;
      pruebas.push({
        id: uid('comodin'),
        texto: 'Comodín',
        submitted_by: null,
        responsable_id: null,
        position: i,
        libre: true,
        revealed: true,
        completada: true,
        completada_por: null,
        created_at: new Date().toISOString(),
        revealed_at: new Date().toISOString(),
        completada_at: new Date().toISOString(),
      });
    }
    gameState.board_size = 36;
  }

  // Estado inicial "de escaparate": tablero ya repartido con algunas
  // pruebas ocultas, otras activas y un par cumplidas, para ver los
  // distintos estilos de casilla de un vistazo.
  const posicionesAlAzar = Array.from({ length: 36 }, (_, i) => i).sort(() => Math.random() - 0.5);
  pruebas.forEach((p, i) => { p.position = posicionesAlAzar[i]; });
  rellenarComodines();
  pruebas.forEach((p, i) => {
    if (p.libre || p.position === null) return;
    if (i % 5 === 0) {
      p.revealed = true;
      p.completada = true;
      p.completada_por = players[(i + 2) % players.length].id;
      p.gestionado_por = players[0].id;
      p.completada_at = new Date().toISOString();
    } else if (i % 3 === 0) {
      p.revealed = true;
      p.revealed_at = new Date().toISOString();
    }
  });

  const busHandlers = [];
  const mockStorageUrls = new Map();
  function emit(table, payload) {
    busHandlers.filter(h => h.table === table).forEach(h => h.cb(payload || {}));
  }

  function ok(data) { return Promise.resolve({ data, error: null }); }
  function fail(message) { return Promise.resolve({ data: null, error: { message } }); }

  function pruebasPublicas() {
    return pruebas.map(p => ({
      id: p.id,
      position: p.position,
      libre: p.libre,
      revealed: p.revealed,
      completada: p.completada,
      completada_por: p.completada_por,
      completada_at: p.completada_at,
      revealed_at: p.revealed_at,
      submitted_by: p.submitted_by,
      texto: (p.revealed || p.libre) ? p.texto : null,
      responsable_id: (p.revealed || p.libre) ? p.responsable_id : null,
      gestionado_por: p.gestionado_por || null,
      foto_url: (p.revealed || p.libre) ? (p.foto_url || null) : null,
    }));
  }

  function checkLineaOBingo(prueba) {
    const size = gameState.board_size;
    const lado = Math.round(Math.sqrt(size));
    const fila = Math.floor(prueba.position / lado);
    const col = prueba.position % lado;
    const filaCompleta = pruebas.filter(p => p.position !== null && Math.floor(p.position / lado) === fila).every(p => p.completada);
    const colCompleta = pruebas.filter(p => p.position !== null && p.position % lado === col).every(p => p.completada);
    const total = pruebas.filter(p => p.position !== null).length;
    const completadas = pruebas.filter(p => p.position !== null && p.completada).length;
    const bingo = total > 0 && completadas === total;
    const linea = filaCompleta || colCompleta;
    return { linea, bingo };
  }

  const rpcHandlers = {
    login_jugador: ({ p_pin }) => {
      const existente = players.find(pl => pl.pin === p_pin);
      if (!existente) {
        return ok([{ id: null, name: null, avatar: null, role: null, ok: false, error: 'No existe ninguna cuenta con ese PIN' }]);
      }
      return ok([{ id: existente.id, name: existente.name, avatar: existente.avatar, role: existente.role, ok: true, error: null }]);
    },

    registrar_jugador: ({ p_name, p_pin }) => {
      const nombre = (p_name || '').trim();
      if (players.some(pl => pl.name.toLowerCase() === nombre.toLowerCase())) {
        return ok([{ id: null, name: null, avatar: null, role: null, ok: false, error: 'Ya existe una cuenta con ese nombre' }]);
      }
      if (['123456', '654321'].includes(p_pin)) {
        return ok([{ id: null, name: null, avatar: null, role: null, ok: false, error: 'Pon un PIN más seguro, subnormal' }]);
      }
      if (players.some(pl => pl.pin === p_pin)) {
        return ok([{ id: null, name: null, avatar: null, role: null, ok: false, error: 'Ese PIN ya está en uso, elige otro' }]);
      }
      const avatar = AVATARES_ALEATORIOS[Math.floor(Math.random() * AVATARES_ALEATORIOS.length)];
      const nuevo = { id: uid('player'), name: nombre, role: 'player', pin: p_pin, avatar };
      players.push(nuevo);
      return ok([{ id: nuevo.id, name: nuevo.name, avatar: nuevo.avatar, role: nuevo.role, ok: true, error: null }]);
    },

    crear_prueba: ({ p_player_id, p_texto }) => {
      if (gameState.fase !== 'submission') return fail('Ya no se pueden enviar pruebas, el bingo ha empezado');
      if (pruebas.filter(p => p.submitted_by === p_player_id).length >= 2) return fail('Máximo 2 pruebas por jugador');
      const ocupadas = new Set(pruebas.filter(p => p.position !== null).map(p => p.position));
      const libres = [];
      for (let i = 0; i < 36; i++) if (!ocupadas.has(i)) libres.push(i);
      if (libres.length === 0) return fail('No quedan casillas libres en el tablero');
      const pos = libres[Math.floor(Math.random() * libres.length)];
      pruebas.push({
        id: uid('prueba'), texto: capitalizaTexto(p_texto), submitted_by: p_player_id, responsable_id: null,
        position: pos, libre: false, revealed: false, completada: false, completada_por: null,
        created_at: new Date().toISOString(), revealed_at: null, completada_at: null,
      });
      emit('pruebas', {});
      return ok(null);
    },

    mi_prueba: ({ p_player_id }) => {
      return ok(pruebas.filter(p => p.submitted_by === p_player_id).map(p => ({ ...p })));
    },

    editar_mi_prueba: ({ p_player_id, p_prueba_id, p_texto }) => {
      if (gameState.fase !== 'submission') return fail('Ya no se pueden editar pruebas, el bingo ha empezado');
      const prueba = pruebas.find(p => p.id === p_prueba_id);
      if (!prueba || prueba.submitted_by !== p_player_id) return fail('No autorizado');
      prueba.texto = capitalizaTexto(p_texto);
      emit('pruebas', {});
      return ok(true);
    },

    borrar_mi_prueba: ({ p_player_id, p_prueba_id }) => {
      if (gameState.fase !== 'submission') return fail('Ya no se pueden borrar pruebas, el bingo ha empezado');
      const prueba = pruebas.find(p => p.id === p_prueba_id);
      if (!prueba || prueba.submitted_by !== p_player_id) return fail('No autorizado');
      const idx = pruebas.findIndex(p => p.id === p_prueba_id);
      pruebas.splice(idx, 1);
      emit('pruebas', {});
      return ok(true);
    },

    cambiar_mi_pin: ({ p_player_id, p_pin_nuevo }) => {
      if (!/^[0-9]{6}$/.test(p_pin_nuevo)) return ok([{ ok: false, error: 'El PIN debe tener 6 dígitos' }]);
      if (['123456', '654321'].includes(p_pin_nuevo)) return ok([{ ok: false, error: 'Pon un PIN más seguro, subnormal' }]);
      if (players.some(pl => pl.id !== p_player_id && pl.pin === p_pin_nuevo)) {
        return ok([{ ok: false, error: 'Ya se ha creado un usuario con ese PIN. Si no has sido tú, por favor pon otro.' }]);
      }
      const player = players.find(p => p.id === p_player_id);
      if (!player) return ok([{ ok: false, error: 'No encontrado' }]);
      player.pin = p_pin_nuevo;
      return ok([{ ok: true, error: null }]);
    },

    ver_prueba_oculta: ({ p_prueba_id, p_player_id }) => {
      const player = players.find(p => p.id === p_player_id);
      const prueba = pruebas.find(p => p.id === p_prueba_id);
      if (!player || !prueba) return ok(null);
      if (player.role === 'admin' || prueba.submitted_by === p_player_id) return ok(prueba.texto);
      return ok(null);
    },

    listar_pruebas_admin: ({ p_player_id }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('No autorizado');
      return ok(pruebas.map(p => ({ ...p })));
    },

    admin_editar_prueba: ({ p_player_id, p_prueba_id, p_texto, p_foto_url }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('No autorizado');
      const prueba = pruebas.find(p => p.id === p_prueba_id && !p.libre);
      if (!prueba) return fail('No encontrada');
      prueba.texto = capitalizaTexto(p_texto);
      if (p_foto_url) prueba.foto_url = p_foto_url;
      emit('pruebas', {});
      return ok(true);
    },

    admin_borrar_prueba: ({ p_player_id, p_prueba_id }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('No autorizado');
      const prueba = pruebas.find(p => p.id === p_prueba_id && !p.libre);
      if (!prueba) return fail('No encontrada');
      if (gameState.fase === 'submission') {
        const idx = pruebas.indexOf(prueba);
        pruebas.splice(idx, 1);
      } else {
        // El bingo ya ha empezado: no se borra (dejaría la casilla
        // vacía), se convierte en comodín en su misma posición.
        prueba.texto = 'Comodín';
        prueba.submitted_by = null;
        prueba.responsable_id = null;
        prueba.gestionado_por = null;
        prueba.libre = true;
        prueba.revealed = true;
        prueba.completada = true;
        prueba.completada_por = null;
        prueba.revealed_at = new Date().toISOString();
        prueba.completada_at = new Date().toISOString();
      }
      emit('pruebas', {});
      return ok(true);
    },

    revelar_prueba: ({ p_player_id, p_prueba_id }) => {
      const player = players.find(p => p.id === p_player_id);
      const prueba = pruebas.find(p => p.id === p_prueba_id);
      if (!player || !prueba) return fail('No autorizado');
      if (player.role !== 'admin' && prueba.submitted_by !== p_player_id) return fail('No autorizado');
      prueba.revealed = true;
      prueba.revealed_at = new Date().toISOString();
      emit('pruebas', {});
      return ok(true);
    },

    completar_prueba: ({ p_player_id, p_prueba_id, p_cumplidor_id, p_foto_url }) => {
      const player = players.find(p => p.id === p_player_id);
      const prueba = pruebas.find(p => p.id === p_prueba_id);
      if (!player || !prueba) return fail('No autorizado');
      if (player.role !== 'admin' && prueba.submitted_by !== p_player_id) return fail('No autorizado');

      prueba.completada = true;
      prueba.completada_por = p_cumplidor_id;
      prueba.gestionado_por = p_player_id;
      prueba.completada_at = new Date().toISOString();
      prueba.revealed = true;
      if (p_foto_url) prueba.foto_url = p_foto_url;

      const cumplidor = players.find(p => p.id === p_cumplidor_id);
      const evento = {
        id: uid('evento'), tipo: 'chupito',
        mensaje: `${cumplidor ? cumplidor.name : 'Alguien'} bebe un chupito 🥃`,
        created_at: new Date().toISOString(),
      };
      eventos.push(evento);
      emit('pruebas', {});
      emit('eventos', { new: evento });

      const { linea, bingo } = checkLineaOBingo(prueba);
      if (bingo) {
        const ev = { id: uid('evento'), tipo: 'bingo', mensaje: '¡BINGO! 🎉 Todos bebéis', created_at: new Date().toISOString() };
        eventos.push(ev);
        emit('eventos', { new: ev });
      } else if (linea) {
        const ev = { id: uid('evento'), tipo: 'linea', mensaje: '¡LÍNEA! 🍻 Todos bebéis', created_at: new Date().toISOString() };
        eventos.push(ev);
        emit('eventos', { new: ev });
      }

      return ok({ ok: true, linea, bingo });
    },

    ocultar_prueba: ({ p_player_id, p_prueba_id }) => {
      const player = players.find(p => p.id === p_player_id);
      const prueba = pruebas.find(p => p.id === p_prueba_id);
      if (!player || !prueba) return fail('No autorizado');
      if (prueba.libre) return fail('No se puede ocultar un comodín');
      if (player.role !== 'admin' && prueba.submitted_by !== p_player_id) return fail('No autorizado');
      prueba.revealed = false;
      prueba.completada = false;
      prueba.completada_por = null;
      prueba.gestionado_por = null;
      prueba.revealed_at = null;
      prueba.completada_at = null;
      prueba.foto_url = null;
      emit('pruebas', {});
      return ok(true);
    },

    iniciar_bingo: ({ p_player_id }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('Solo el admin puede iniciar el bingo');
      if (pruebas.filter(p => !p.libre).length === 0 && gameState.fase === 'submission') {
        return fail('No hay pruebas enviadas todavía');
      }
      rellenarComodines();
      gameState.fase = 'playing';
      gameState.inicio_at = null;
      gameState.updated_at = new Date().toISOString();
      emit('pruebas', {});
      emit('game_state', {});
      return ok(true);
    },

    programar_inicio: ({ p_player_id, p_inicio }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('Solo el admin puede programar el inicio');
      gameState.inicio_at = p_inicio;
      gameState.updated_at = new Date().toISOString();
      emit('game_state', {});
      return ok(true);
    },

    comprobar_inicio_programado: () => {
      if (gameState.fase !== 'submission' || !gameState.inicio_at) return ok(false);
      if (new Date() < new Date(gameState.inicio_at)) return ok(false);
      if (pruebas.filter(p => !p.libre).length === 0) return ok(false);
      rellenarComodines();
      gameState.fase = 'playing';
      gameState.inicio_at = null;
      gameState.updated_at = new Date().toISOString();
      emit('pruebas', {});
      emit('game_state', {});
      return ok(true);
    },

    reiniciar_bingo: ({ p_player_id }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('Solo el admin puede reiniciar');
      gameState.inicio_at = null;
      gameState.updated_at = new Date().toISOString();
      emit('game_state', {});
      return ok(true);
    },

    volver_a_envios: ({ p_player_id }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('Solo el admin puede volver a la fase de envíos');
      pruebas = pruebas.filter(p => !p.libre);
      gameState.fase = 'submission';
      gameState.inicio_at = null;
      gameState.updated_at = new Date().toISOString();
      emit('pruebas', {});
      emit('game_state', {});
      return ok(true);
    },

    listar_jugadores_admin: ({ p_player_id }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('No autorizado');
      return ok(players.map(p => ({ ...p })));
    },

    admin_crear_jugador: ({ p_player_id, p_name, p_pin, p_avatar, p_role }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('No autorizado');
      const nombre = (p_name || '').trim();
      if (players.some(pl => pl.name.toLowerCase() === nombre.toLowerCase())) {
        return ok([{ id: null, ok: false, error: 'Ya existe una cuenta con ese nombre' }]);
      }
      if (players.some(pl => pl.pin === p_pin)) {
        return ok([{ id: null, ok: false, error: 'Ese PIN ya está en uso' }]);
      }
      const nuevo = { id: uid('player'), name: nombre, pin: p_pin, avatar: p_avatar || '🎉', role: p_role || 'player' };
      players.push(nuevo);
      return ok([{ id: nuevo.id, ok: true, error: null }]);
    },

    admin_editar_jugador: ({ p_player_id, p_target_id, p_name, p_pin, p_avatar, p_role }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('No autorizado');
      const nombre = (p_name || '').trim();
      if (players.some(pl => pl.id !== p_target_id && pl.name.toLowerCase() === nombre.toLowerCase())) {
        return ok([{ ok: false, error: 'Ya existe otra cuenta con ese nombre' }]);
      }
      if (players.some(pl => pl.id !== p_target_id && pl.pin === p_pin)) {
        return ok([{ ok: false, error: 'Ese PIN ya está en uso por otra cuenta' }]);
      }
      const target = players.find(pl => pl.id === p_target_id);
      if (!target) return ok([{ ok: false, error: 'No encontrado' }]);
      target.name = nombre;
      target.pin = p_pin;
      if (p_avatar) target.avatar = p_avatar;
      if (p_role) target.role = p_role;
      emit('players', {});
      return ok([{ ok: true, error: null }]);
    },

    admin_borrar_jugador: ({ p_player_id, p_target_id }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('No autorizado');
      if (p_target_id === p_player_id) return fail('No puedes borrar tu propia cuenta de admin');
      const idx = players.findIndex(pl => pl.id === p_target_id);
      if (idx !== -1) players.splice(idx, 1);
      pruebas.forEach(p => {
        if (p.submitted_by === p_target_id) p.submitted_by = null;
        if (p.responsable_id === p_target_id) p.responsable_id = null;
        if (p.completada_por === p_target_id) p.completada_por = null;
      });
      emit('pruebas', {});
      return ok(true);
    },
  };

  return {
    rpc(name, args) {
      const handler = rpcHandlers[name];
      if (!handler) return fail(`RPC demo no implementada: ${name}`);
      return handler(args || {});
    },

    from(table) {
      const builder = {
        _table: table,
        _filters: [],
        select() { return this; },
        eq(col, val) { this._filters.push([col, val]); return this; },
        order() { return this; },
        async single() {
          const row = this._rows().find(r => this._filters.every(([c, v]) => r[c] === v));
          return row ? { data: row, error: null } : { data: null, error: { message: 'No encontrado' } };
        },
        then(resolve) {
          resolve({ data: this._rows().filter(r => this._filters.every(([c, v]) => r[c] === v)), error: null });
        },
        _rows() {
          if (table === 'game_state') return [gameState];
          if (table === 'pruebas_publicas') return pruebasPublicas();
          if (table === 'players_publicos') return players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, role: p.role }));
          if (table === 'eventos') return eventos;
          return [];
        },
      };
      return builder;
    },

    channel() {
      const chan = {
        on(_event, filter, cb) {
          busHandlers.push({ table: filter.table, cb });
          return chan;
        },
        subscribe() { return chan; },
      };
      return chan;
    },

    // No hay Storage real en modo demo: la "subida" solo guarda un blob:
    // URL local (vive mientras la pestaña esté abierta), para poder ver
    // la foto de recuerdo sin tener Supabase configurado.
    storage: {
      from(bucket) {
        return {
          async upload(path, file) {
            mockStorageUrls.set(`${bucket}/${path}`, URL.createObjectURL(file));
            return { data: { path }, error: null };
          },
          getPublicUrl(path) {
            return { data: { publicUrl: mockStorageUrls.get(`${bucket}/${path}`) || '' } };
          },
        };
      },
    },
  };
}
