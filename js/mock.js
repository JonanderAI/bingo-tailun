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

  const gameState = { id: 1, fase: 'playing', board_size: 25, updated_at: new Date().toISOString() };
  const eventos = [];

  // Calcula el lado del tablero más pequeño que cabe con todas las
  // pruebas + 1 comodín central, igual que hace iniciar_bingo() en SQL.
  function repartirTablero() {
    const sinAsignar = pruebas.filter(p => p.position === null && !p.libre);
    const count = sinAsignar.length;
    const side = Math.max(3, Math.ceil(Math.sqrt(count + 1)));
    const size = side * side;
    const centro = Math.floor(size / 2);

    pruebas.push({
      id: uid('comodin'),
      texto: 'Comodín',
      submitted_by: null,
      responsable_id: null,
      position: centro,
      libre: true,
      revealed: true,
      completada: true,
      completada_por: null,
      created_at: new Date().toISOString(),
      revealed_at: new Date().toISOString(),
      completada_at: new Date().toISOString(),
    });

    const shuffled = [...sinAsignar].sort(() => Math.random() - 0.5);
    let pos = 0;
    shuffled.forEach((p) => {
      if (pos === centro) pos++;
      p.position = pos;
      pos++;
    });

    gameState.board_size = size;
  }

  // Estado inicial "de escaparate": tablero ya repartido con algunas
  // pruebas ocultas, otras activas y un par cumplidas, para ver los
  // distintos estilos de casilla de un vistazo.
  repartirTablero();
  pruebas.forEach((p, i) => {
    if (p.libre || p.position === null) return;
    if (i % 5 === 0) {
      p.revealed = true;
      p.completada = true;
      p.completada_por = players[(i + 2) % players.length].id;
      p.completada_at = new Date().toISOString();
    } else if (i % 3 === 0) {
      p.revealed = true;
      p.revealed_at = new Date().toISOString();
    }
  });

  const busHandlers = [];
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
      if (pruebas.filter(p => p.submitted_by === p_player_id).length >= 3) return fail('Máximo 3 pruebas por jugador');
      pruebas.push({
        id: uid('prueba'), texto: (p_texto || '').trim(), submitted_by: p_player_id, responsable_id: null,
        position: null, libre: false, revealed: false, completada: false, completada_por: null,
        created_at: new Date().toISOString(), revealed_at: null, completada_at: null,
      });
      emit('pruebas', {});
      return ok(null);
    },

    mi_prueba: ({ p_player_id }) => {
      return ok(pruebas.filter(p => p.submitted_by === p_player_id).map(p => ({ ...p })));
    },

    ver_prueba_oculta: ({ p_prueba_id, p_player_id }) => {
      const player = players.find(p => p.id === p_player_id);
      const prueba = pruebas.find(p => p.id === p_prueba_id);
      if (!player || !prueba) return ok(null);
      if (player.role === 'admin' || prueba.responsable_id === p_player_id) return ok(prueba.texto);
      return ok(null);
    },

    mis_responsabilidades: ({ p_player_id }) => {
      return ok(pruebas.filter(p => p.responsable_id === p_player_id).map(p => p.id));
    },

    listar_pruebas_admin: ({ p_player_id }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('No autorizado');
      return ok(pruebas.map(p => ({ ...p })));
    },

    asignar_responsable: ({ p_player_id, p_prueba_id, p_responsable_id }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('No autorizado');
      const prueba = pruebas.find(p => p.id === p_prueba_id);
      if (prueba) prueba.responsable_id = p_responsable_id || null;
      emit('pruebas', {});
      return ok(true);
    },

    revelar_prueba: ({ p_player_id, p_prueba_id }) => {
      const player = players.find(p => p.id === p_player_id);
      const prueba = pruebas.find(p => p.id === p_prueba_id);
      if (!player || !prueba) return fail('No autorizado');
      if (player.role !== 'admin' && prueba.responsable_id !== p_player_id) return fail('No autorizado');
      prueba.revealed = true;
      prueba.revealed_at = new Date().toISOString();
      emit('pruebas', {});
      return ok(true);
    },

    completar_prueba: ({ p_player_id, p_prueba_id, p_cumplidor_id }) => {
      const player = players.find(p => p.id === p_player_id);
      const prueba = pruebas.find(p => p.id === p_prueba_id);
      if (!player || !prueba) return fail('No autorizado');
      if (player.role !== 'admin' && prueba.responsable_id !== p_player_id) return fail('No autorizado');

      prueba.completada = true;
      prueba.completada_por = p_cumplidor_id;
      prueba.completada_at = new Date().toISOString();
      prueba.revealed = true;

      const responsable = players.find(p => p.id === prueba.responsable_id);
      const cumplidor = players.find(p => p.id === p_cumplidor_id);
      const evento = {
        id: uid('evento'), tipo: 'chupito',
        mensaje: `${cumplidor ? cumplidor.name : 'Alguien'} y ${responsable ? responsable.name : 'el encargado'} beben un chupito 🥃`,
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

    iniciar_bingo: ({ p_player_id }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('Solo el admin puede iniciar el bingo');
      if (pruebas.filter(p => p.position === null && !p.libre).length === 0 && gameState.fase === 'submission') {
        return fail('No hay pruebas enviadas todavía');
      }
      repartirTablero();
      gameState.fase = 'playing';
      gameState.updated_at = new Date().toISOString();
      emit('pruebas', {});
      emit('game_state', {});
      return ok(true);
    },

    reiniciar_bingo: ({ p_player_id }) => {
      const player = players.find(p => p.id === p_player_id);
      if (!player || player.role !== 'admin') return fail('Solo el admin puede reiniciar');
      pruebas = [];
      eventos.length = 0;
      gameState.fase = 'submission';
      gameState.updated_at = new Date().toISOString();
      emit('pruebas', {});
      emit('game_state', {});
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
  };
}
