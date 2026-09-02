-- ============================================================
-- BINGO TAILUN - Schema para Supabase (Postgres)
-- Pega esto entero en el SQL Editor de tu proyecto Supabase
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- TABLAS ----------

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  pin text unique not null check (pin ~ '^[0-9]{6}$'),
  avatar text not null default '🎉',
  role text not null default 'player' check (role in ('admin', 'player')),
  created_at timestamptz not null default now()
);

-- Migración: si la tabla ya existía de antes (PIN de 4 dígitos, sin
-- avatar), esto la pone al día sin perder jugadores. "create table if not
-- exists" de arriba NO toca una tabla que ya existe, así que estas líneas
-- van sueltas y se ejecutan siempre (son idempotentes, no fallan si ya
-- estaban aplicadas).
alter table players add column if not exists avatar text not null default '🎉';
alter table players drop constraint if exists players_pin_check;
alter table players add constraint players_pin_check check (pin ~ '^[0-9]{6}$');
alter table players drop constraint if exists players_pin_key;
alter table players add constraint players_pin_key unique (pin);

create table if not exists pruebas (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  submitted_by uuid references players(id) on delete set null,
  responsable_id uuid references players(id) on delete set null, -- ya no se usa (sin encargados fijos), se deja por compatibilidad
  gestionado_por uuid references players(id) on delete set null, -- quién la destapó/marcó cumplida (no bebe, solo el involucrado)
  position int unique,
  libre boolean not null default false,
  revealed boolean not null default false,
  completada boolean not null default false,
  completada_por uuid references players(id) on delete set null,
  created_at timestamptz not null default now(),
  revealed_at timestamptz,
  completada_at timestamptz
);

alter table pruebas add column if not exists responsable_id uuid references players(id) on delete set null;
alter table pruebas add column if not exists gestionado_por uuid references players(id) on delete set null;

create table if not exists game_state (
  id int primary key default 1,
  fase text not null default 'submission' check (fase in ('submission', 'playing', 'finished')),
  board_size int not null default 36,
  inicio_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into game_state (id) values (1) on conflict (id) do nothing;

alter table game_state add column if not exists inicio_at timestamptz;
-- Tablero fijo de 6x6 (36 casillas), siempre: ya no hay tamaño dinámico.
alter table game_state alter column board_size set default 36;
update game_state set board_size = 36 where id = 1;

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('chupito', 'linea', 'bingo')),
  mensaje text not null,
  created_at timestamptz not null default now()
);

-- ---------- SEGURIDAD ----------
-- No hay Supabase Auth real (login propio por nombre+PIN), así que la
-- protección se hace con RLS + vista pública + funciones RPC con
-- security definer. El PIN nunca se expone vía API.

alter table players enable row level security;
alter table pruebas enable row level security;
alter table game_state enable row level security;
alter table eventos enable row level security;

-- Nadie lee/escribe directamente estas tablas desde el cliente,
-- todo pasa por las funciones RPC de abajo (security definer).
revoke all on players from anon, authenticated;
revoke all on pruebas from anon, authenticated;
revoke all on game_state from anon, authenticated;
revoke all on eventos from anon, authenticated;

-- Lecturas públicas seguras vía vistas (sin pin, sin texto oculto):

create or replace view players_publicos as
  select id, name, avatar, role, created_at from players;

create or replace view pruebas_publicas as
  select
    id,
    position,
    libre,
    revealed,
    completada,
    completada_por,
    completada_at,
    revealed_at,
    submitted_by,
    case when revealed or libre then texto else null end as texto,
    case when revealed or libre then responsable_id else null end as responsable_id,
    created_at,
    gestionado_por
  from pruebas;

grant select on players_publicos to anon, authenticated;
grant select on pruebas_publicas to anon, authenticated;
grant select on game_state to anon, authenticated;
grant select on eventos to anon, authenticated;

-- game_state y eventos se consultan directamente (no vía vista), así que
-- con RLS activado también hace falta una política de lectura o el
-- SELECT del cliente ve 0 filas (aunque tenga el GRANT).
drop policy if exists "lectura publica game_state" on game_state;
create policy "lectura publica game_state" on game_state for select to anon, authenticated using (true);

drop policy if exists "lectura publica eventos" on eventos;
create policy "lectura publica eventos" on eventos for select to anon, authenticated using (true);

-- ---------- FUNCIONES RPC ----------

-- Iniciar sesión con una cuenta que ya existe. El PIN es único, así que
-- basta con él para identificarse (no hace falta el nombre).
drop function if exists login_jugador(text, text);

create or replace function login_jugador(p_pin text)
returns table(id uuid, name text, avatar text, role text, ok boolean, error text)
language plpgsql
security definer
as $$
declare
  v_existing players%rowtype;
begin
  select * into v_existing from players p where p.pin = p_pin;

  if v_existing.id is null then
    return query select null::uuid, null::text, null::text, null::text, false, 'No existe ninguna cuenta con ese PIN'::text;
  else
    return query select v_existing.id, v_existing.name, v_existing.avatar, v_existing.role, true, null::text;
  end if;
end;
$$;

grant execute on function login_jugador(text) to anon;

-- Crear una cuenta nueva (nombre + PIN de 6 dígitos, único). El avatar no
-- se elige: se asigna al azar (y fijo desde entonces) de esta lista.
drop function if exists registrar_jugador(text, text, text);

create or replace function registrar_jugador(p_name text, p_pin text)
returns table(id uuid, name text, avatar text, role text, ok boolean, error text)
language plpgsql
security definer
as $$
declare
  v_new players%rowtype;
  v_avatares text[] := array['😈', '🦭', '🦀', '🧨', '🧀', '🍷', '🤮', '💩', '🗿', '🦍', '🇪🇸'];
  v_avatar text;
begin
  if exists (select 1 from players p where lower(p.name) = lower(p_name)) then
    return query select null::uuid, null::text, null::text, null::text, false, 'Ya existe una cuenta con ese nombre'::text;
  end if;
  if exists (select 1 from players p where p.pin = p_pin) then
    return query select null::uuid, null::text, null::text, null::text, false, 'Ya se ha creado un usuario con ese PIN. Si no has sido tú, por favor pon otro.'::text;
    return;
  end if;
  v_avatar := v_avatares[1 + floor(random() * array_length(v_avatares, 1))::int];
  begin
    insert into players(name, pin, avatar) values (trim(p_name), p_pin, v_avatar)
    returning * into v_new;
  exception when unique_violation then
    return query select null::uuid, null::text, null::text, null::text, false, 'Ya se ha creado un usuario con ese PIN. Si no has sido tú, por favor pon otro.'::text;
    return;
  end;
  return query select v_new.id, v_new.name, v_new.avatar, v_new.role, true, null::text;
end;
$$;

grant execute on function registrar_jugador(text, text) to anon;

-- Crear una prueba (fase de envíos). Hasta 2 por jugador. La posición en
-- el tablero (fijo 6x6 = 36 casillas) se asigna al azar en el momento y
-- se queda fija desde entonces (no se vuelve a repartir al empezar).
create or replace function crear_prueba(p_player_id uuid, p_texto text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
  v_fase text;
  v_count int;
  v_pos int;
begin
  select fase into v_fase from game_state where id = 1;
  if v_fase <> 'submission' then
    raise exception 'Ya no se pueden enviar pruebas, el bingo ha empezado';
  end if;
  select count(*) into v_count from pruebas where submitted_by = p_player_id;
  if v_count >= 2 then
    raise exception 'Máximo 2 pruebas por jugador';
  end if;

  select pos into v_pos
    from generate_series(0, 35) pos
    where pos not in (select position from pruebas where position is not null)
    order by random()
    limit 1;

  if v_pos is null then
    raise exception 'No quedan casillas libres en el tablero';
  end if;

  insert into pruebas(texto, submitted_by, position) values (trim(p_texto), p_player_id, v_pos)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function crear_prueba(uuid, text) to anon;

-- Un jugador edita/borra su propia prueba, solo mientras se pueden enviar
create or replace function editar_mi_prueba(p_player_id uuid, p_prueba_id uuid, p_texto text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_fase text;
  v_submitted_by uuid;
begin
  select fase into v_fase from game_state where id = 1;
  if v_fase <> 'submission' then
    raise exception 'Ya no se pueden editar pruebas, el bingo ha empezado';
  end if;
  select p.submitted_by into v_submitted_by from pruebas p where p.id = p_prueba_id;
  if v_submitted_by is distinct from p_player_id then
    raise exception 'No autorizado';
  end if;
  update pruebas set texto = trim(p_texto) where id = p_prueba_id;
  return true;
end;
$$;

grant execute on function editar_mi_prueba(uuid, uuid, text) to anon;

create or replace function borrar_mi_prueba(p_player_id uuid, p_prueba_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_fase text;
  v_submitted_by uuid;
begin
  select fase into v_fase from game_state where id = 1;
  if v_fase <> 'submission' then
    raise exception 'Ya no se pueden borrar pruebas, el bingo ha empezado';
  end if;
  select p.submitted_by into v_submitted_by from pruebas p where p.id = p_prueba_id;
  if v_submitted_by is distinct from p_player_id then
    raise exception 'No autorizado';
  end if;
  delete from pruebas where id = p_prueba_id;
  return true;
end;
$$;

grant execute on function borrar_mi_prueba(uuid, uuid) to anon;

-- La aportación del propio jugador: siempre visible para él/ella aunque
-- todavía esté oculta para el resto (es su prueba, no hay secreto).
create or replace function mi_prueba(p_player_id uuid)
returns setof pruebas
language sql
security definer
as $$
  select * from pruebas where submitted_by = p_player_id;
$$;

grant execute on function mi_prueba(uuid) to anon;

-- Ver el texto de una prueba oculta (solo admin: ya no hay encargados fijos)
create or replace function ver_prueba_oculta(p_prueba_id uuid, p_player_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_role text;
  v_submitted_by uuid;
  v_texto text;
begin
  select p.role into v_role from players p where p.id = p_player_id;
  select p.submitted_by, p.texto into v_submitted_by, v_texto from pruebas p where p.id = p_prueba_id;
  if v_role <> 'admin' and v_submitted_by is distinct from p_player_id then
    return null;
  end if;
  return v_texto;
end;
$$;

grant execute on function ver_prueba_oculta(uuid, uuid) to anon;

-- Ids de las pruebas de las que un jugador es encargado/a (para poder
-- resaltar en el tablero qué cartas puede desvelar, sin filtrar el texto)
create or replace function mis_responsabilidades(p_player_id uuid)
returns uuid[]
language sql
security definer
as $$
  select coalesce(array_agg(id), '{}') from pruebas where responsable_id = p_player_id;
$$;

grant execute on function mis_responsabilidades(uuid) to anon;

-- Listado completo (con texto y encargado) solo para el admin, usado en
-- el panel de asignación de encargados
create or replace function listar_pruebas_admin(p_player_id uuid)
returns setof pruebas
language plpgsql
security definer
as $$
declare
  v_role text;
begin
  select role into v_role from players where id = p_player_id;
  if v_role <> 'admin' then
    raise exception 'No autorizado';
  end if;
  return query select * from pruebas order by created_at;
end;
$$;

grant execute on function listar_pruebas_admin(uuid) to anon;

-- Reparto interno: las pruebas ya tienen su posición fija desde que se
-- crearon (crear_prueba les da una casilla al azar en el momento). Aquí
-- solo hace falta rellenar con comodines las casillas del tablero fijo
-- 6x6 (36) que se hayan quedado vacías, y arrancar la partida.
-- Sin comprobación de permisos: solo la llaman las funciones de abajo.
create or replace function _repartir_y_empezar()
returns void
language plpgsql
security definer
as $$
declare
  v_pos int;
begin
  for v_pos in
    select pos from generate_series(0, 35) pos
    where pos not in (select position from pruebas where position is not null)
  loop
    insert into pruebas (texto, position, libre, revealed, completada)
    values ('Comodín', v_pos, true, true, true);
  end loop;

  update game_state set fase = 'playing', inicio_at = null, updated_at = now() where id = 1;
end;
$$;

-- Iniciar el bingo manualmente (admin). Se deja por si hace falta un
-- botón de emergencia, aunque la app ya no lo usa: el flujo normal es
-- programar_inicio() + comprobar_inicio_programado().
create or replace function iniciar_bingo(p_player_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_role text;
  v_count int;
begin
  select role into v_role from players where id = p_player_id;
  if v_role <> 'admin' then
    raise exception 'Solo el admin puede iniciar el bingo';
  end if;

  select count(*) into v_count from pruebas where not libre;
  if v_count = 0 then
    raise exception 'No hay pruebas enviadas todavía';
  end if;

  perform _repartir_y_empezar();
  return true;
end;
$$;

grant execute on function iniciar_bingo(uuid) to anon;

-- El admin programa fecha/hora de inicio (o la cancela pasando null)
create or replace function programar_inicio(p_player_id uuid, p_inicio timestamptz)
returns boolean
language plpgsql
security definer
as $$
declare
  v_role text;
begin
  select role into v_role from players where id = p_player_id;
  if v_role <> 'admin' then
    raise exception 'Solo el admin puede programar el inicio';
  end if;
  update game_state set inicio_at = p_inicio, updated_at = now() where id = 1;
  return true;
end;
$$;

grant execute on function programar_inicio(uuid, timestamptz) to anon;

-- Cualquier cliente conectado puede llamar a esto (no hace falta ser
-- admin): solo actúa si ya ha llegado la hora programada y hay pruebas
-- que repartir. Así el bingo arranca solo, sin que el admin pulse nada.
create or replace function comprobar_inicio_programado()
returns boolean
language plpgsql
security definer
as $$
declare
  v_fase text;
  v_inicio timestamptz;
  v_count int;
begin
  select fase, inicio_at into v_fase, v_inicio from game_state where id = 1;
  if v_fase <> 'submission' or v_inicio is null or now() < v_inicio then
    return false;
  end if;

  select count(*) into v_count from pruebas where not libre;
  if v_count = 0 then
    return false;
  end if;

  perform _repartir_y_empezar();
  return true;
end;
$$;

grant execute on function comprobar_inicio_programado() to anon;

-- Asignar responsable a una prueba (admin)
create or replace function asignar_responsable(p_player_id uuid, p_prueba_id uuid, p_responsable_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_role text;
begin
  select role into v_role from players where id = p_player_id;
  if v_role <> 'admin' then
    raise exception 'Solo el admin puede asignar responsables';
  end if;
  update pruebas set responsable_id = p_responsable_id where id = p_prueba_id;
  return true;
end;
$$;

grant execute on function asignar_responsable(uuid, uuid, uuid) to anon;

-- Habilitar (revelar) una prueba para todos
create or replace function revelar_prueba(p_player_id uuid, p_prueba_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_role text;
  v_submitted_by uuid;
begin
  select p.role into v_role from players p where p.id = p_player_id;
  select p.submitted_by into v_submitted_by from pruebas p where p.id = p_prueba_id;
  if v_role <> 'admin' and v_submitted_by is distinct from p_player_id then
    raise exception 'No autorizado';
  end if;
  update pruebas set revealed = true, revealed_at = now() where id = p_prueba_id;
  return true;
end;
$$;

grant execute on function revelar_prueba(uuid, uuid) to anon;

-- Marcar una prueba como cumplida -> dispara evento de chupito
-- y comprueba línea / bingo
create or replace function completar_prueba(p_player_id uuid, p_prueba_id uuid, p_cumplidor_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_role text;
  v_pos int;
  v_cumplidor_name text;
  v_size int;
  v_lado int;
  v_fila int;
  v_col int;
  v_linea boolean := false;
  v_bingo boolean := false;
  v_total int;
  v_completadas int;
  v_fila_completa boolean;
  v_col_completa boolean;
  v_submitted_by uuid;
begin
  select p.role into v_role from players p where p.id = p_player_id;
  select p.position, p.submitted_by into v_pos, v_submitted_by from pruebas p where p.id = p_prueba_id;
  if v_role <> 'admin' and v_submitted_by is distinct from p_player_id then
    raise exception 'No autorizado';
  end if;

  update pruebas
    set completada = true, completada_por = p_cumplidor_id, gestionado_por = p_player_id, completada_at = now(), revealed = true
    where id = p_prueba_id;

  select name into v_cumplidor_name from players where id = p_cumplidor_id;

  insert into eventos(tipo, mensaje) values (
    'chupito',
    coalesce(v_cumplidor_name, 'Alguien') || ' bebe un chupito 🥃'
  );

  select board_size into v_size from game_state where id = 1;
  v_lado := round(sqrt(v_size))::int;

  select count(*) into v_total from pruebas where position is not null;
  select count(*) into v_completadas from pruebas where position is not null and completada = true;

  if v_pos is not null then
    v_fila := v_pos / v_lado;
    v_col := v_pos % v_lado;

    select bool_and(completada) into v_fila_completa
      from pruebas where position is not null and position / v_lado = v_fila;

    select bool_and(completada) into v_col_completa
      from pruebas where position is not null and position % v_lado = v_col;

    if v_fila_completa or v_col_completa then
      v_linea := true;
    end if;
  end if;

  if v_total > 0 and v_completadas = v_total then
    v_bingo := true;
  end if;

  if v_bingo then
    insert into eventos(tipo, mensaje) values ('bingo', '¡BINGO! 🎉 Todos bebéis');
  elsif v_linea then
    insert into eventos(tipo, mensaje) values ('linea', '¡LÍNEA! 🍻 Todos bebéis');
  end if;

  return jsonb_build_object('ok', true, 'linea', v_linea, 'bingo', v_bingo);
end;
$$;

grant execute on function completar_prueba(uuid, uuid, uuid) to anon;

-- Deshacer: por si se marcó cumplida por error o al final no ha pasado,
-- el admin o quien la mandó puede volver a ocultarla (no vale para
-- comodines, esos siempre están cumplidos de fábrica).
create or replace function ocultar_prueba(p_player_id uuid, p_prueba_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_role text;
  v_submitted_by uuid;
  v_libre boolean;
begin
  select p.role into v_role from players p where p.id = p_player_id;
  select p.submitted_by, p.libre into v_submitted_by, v_libre from pruebas p where p.id = p_prueba_id;
  if v_libre then
    raise exception 'No se puede ocultar un comodín';
  end if;
  if v_role <> 'admin' and v_submitted_by is distinct from p_player_id then
    raise exception 'No autorizado';
  end if;
  update pruebas
    set revealed = false, completada = false, completada_por = null,
        gestionado_por = null, revealed_at = null, completada_at = null
    where id = p_prueba_id;
  return true;
end;
$$;

grant execute on function ocultar_prueba(uuid, uuid) to anon;

-- Reiniciar el temporizador (admin): cancela la hora de inicio programada.
-- No borra pruebas ni eventos: las posiciones ya están fijas desde que
-- se crearon y no queremos perder el trabajo de todos por error.
create or replace function reiniciar_bingo(p_player_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_role text;
begin
  select role into v_role from players where id = p_player_id;
  if v_role <> 'admin' then
    raise exception 'Solo el admin puede reiniciar';
  end if;
  update game_state set inicio_at = null, updated_at = now() where id = 1;
  return true;
end;
$$;

grant execute on function reiniciar_bingo(uuid) to anon;

-- ---------- GESTIÓN DE USUARIOS (admin) ----------

-- Listado completo de jugadores, con PIN incluido: solo para el admin,
-- para poder ver/editar/borrar cuentas desde el panel.
create or replace function listar_jugadores_admin(p_player_id uuid)
returns table(id uuid, name text, pin text, avatar text, role text, created_at timestamptz)
language plpgsql
security definer
as $$
declare
  v_role text;
begin
  select p.role into v_role from players p where p.id = p_player_id;
  if v_role <> 'admin' then
    raise exception 'No autorizado';
  end if;
  return query select p.id, p.name, p.pin, p.avatar, p.role, p.created_at from players p order by p.created_at;
end;
$$;

grant execute on function listar_jugadores_admin(uuid) to anon;

-- Crear una cuenta directamente desde el panel de admin
create or replace function admin_crear_jugador(p_player_id uuid, p_name text, p_pin text, p_avatar text, p_role text)
returns table(id uuid, ok boolean, error text)
language plpgsql
security definer
as $$
declare
  v_role text;
  v_new_id uuid;
begin
  select p.role into v_role from players p where p.id = p_player_id;
  if v_role <> 'admin' then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from players p where lower(p.name) = lower(p_name)) then
    return query select null::uuid, false, 'Ya existe una cuenta con ese nombre';
    return;
  end if;
  if exists (select 1 from players p where p.pin = p_pin) then
    return query select null::uuid, false, 'Ya se ha creado un usuario con ese PIN. Si no has sido tú, por favor pon otro.';
    return;
  end if;
  begin
    insert into players(name, pin, avatar, role)
    values (trim(p_name), p_pin, coalesce(nullif(p_avatar, ''), '🎉'), coalesce(p_role, 'player'))
    returning players.id into v_new_id;
  exception when unique_violation then
    return query select null::uuid, false, 'Ya se ha creado un usuario con ese PIN. Si no has sido tú, por favor pon otro.';
    return;
  end;
  return query select v_new_id, true, null::text;
end;
$$;

grant execute on function admin_crear_jugador(uuid, text, text, text, text) to anon;

-- Editar una cuenta existente
create or replace function admin_editar_jugador(p_player_id uuid, p_target_id uuid, p_name text, p_pin text, p_avatar text, p_role text)
returns table(ok boolean, error text)
language plpgsql
security definer
as $$
declare
  v_role text;
begin
  select role into v_role from players where id = p_player_id;
  if v_role <> 'admin' then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from players p where lower(p.name) = lower(p_name) and p.id <> p_target_id) then
    return query select false, 'Ya existe otra cuenta con ese nombre';
    return;
  end if;
  if exists (select 1 from players p where p.pin = p_pin and p.id <> p_target_id) then
    return query select false, 'Ya se ha creado un usuario con ese PIN. Si no has sido tú, por favor pon otro.';
    return;
  end if;
  begin
    update players
      set name = trim(p_name), pin = p_pin, avatar = coalesce(nullif(p_avatar, ''), avatar), role = coalesce(p_role, role)
      where id = p_target_id;
  exception when unique_violation then
    return query select false, 'Ya se ha creado un usuario con ese PIN. Si no has sido tú, por favor pon otro.';
    return;
  end;
  return query select true, null::text;
end;
$$;

grant execute on function admin_editar_jugador(uuid, uuid, text, text, text, text) to anon;

-- Borrar una cuenta. Las pruebas que hubiera enviado/gestionado/cumplido
-- no se borran, solo quedan sin dueño (on delete set null).
create or replace function admin_borrar_jugador(p_player_id uuid, p_target_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_role text;
begin
  select role into v_role from players where id = p_player_id;
  if v_role <> 'admin' then
    raise exception 'No autorizado';
  end if;
  if p_target_id = p_player_id then
    raise exception 'No puedes borrar tu propia cuenta de admin';
  end if;
  delete from players where id = p_target_id;
  return true;
end;
$$;

grant execute on function admin_borrar_jugador(uuid, uuid) to anon;

-- Editar el texto de una prueba ya enviada
create or replace function admin_editar_prueba(p_player_id uuid, p_prueba_id uuid, p_texto text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_role text;
begin
  select p.role into v_role from players p where p.id = p_player_id;
  if v_role <> 'admin' then
    raise exception 'No autorizado';
  end if;
  update pruebas set texto = trim(p_texto) where id = p_prueba_id and not libre;
  return true;
end;
$$;

grant execute on function admin_editar_prueba(uuid, uuid, text) to anon;

-- Borrar una prueba enviada
create or replace function admin_borrar_prueba(p_player_id uuid, p_prueba_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_role text;
begin
  select p.role into v_role from players p where p.id = p_player_id;
  if v_role <> 'admin' then
    raise exception 'No autorizado';
  end if;
  delete from pruebas where id = p_prueba_id and not libre;
  return true;
end;
$$;

grant execute on function admin_borrar_prueba(uuid, uuid) to anon;

-- ---------- REALTIME ----------
-- Añade las tablas a la publicación de Realtime, sin fallar si ya
-- estaban (para poder volver a pegar y ejecutar este script entero sin
-- que un "already member of publication" tumbe toda la transacción y
-- deshaga los cambios de arriba).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pruebas'
  ) then
    execute 'alter publication supabase_realtime add table pruebas';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'eventos'
  ) then
    execute 'alter publication supabase_realtime add table eventos';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_state'
  ) then
    execute 'alter publication supabase_realtime add table game_state';
  end if;
end $$;

-- ---------- PRIMER ADMIN ----------
-- Sustituye 'TuNombre' y '1234' por tu nombre y PIN, y ejecútalo una vez
-- para crearte como admin (si ya te logueaste como jugador normal, cambia
-- el UPDATE por tu nombre real):
-- insert into players (name, pin, role) values ('TuNombre', '1234', 'admin')
--   on conflict (name) do update set role = 'admin';
