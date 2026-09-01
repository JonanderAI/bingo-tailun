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

-- Si ya tenías la tabla creada de antes (con PIN de 4 dígitos, sin
-- avatar), ejecuta esto una vez para actualizarla sin perder jugadores:
-- alter table players add column if not exists avatar text not null default '🎉';
-- alter table players drop constraint if exists players_pin_check;
-- alter table players add constraint players_pin_check check (pin ~ '^[0-9]{6}$');
-- alter table players add constraint players_pin_key unique (pin);

create table if not exists pruebas (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  submitted_by uuid references players(id) on delete set null,
  responsable_id uuid references players(id) on delete set null,
  position int unique,
  libre boolean not null default false,
  revealed boolean not null default false,
  completada boolean not null default false,
  completada_por uuid references players(id) on delete set null,
  created_at timestamptz not null default now(),
  revealed_at timestamptz,
  completada_at timestamptz
);

create table if not exists game_state (
  id int primary key default 1,
  fase text not null default 'submission' check (fase in ('submission', 'playing', 'finished')),
  board_size int not null default 25,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into game_state (id) values (1) on conflict (id) do nothing;

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
    created_at
  from pruebas;

grant select on players_publicos to anon, authenticated;
grant select on pruebas_publicas to anon, authenticated;
grant select on game_state to anon, authenticated;
grant select on eventos to anon, authenticated;

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
    return query select null::uuid, null::text, null::text, null::text, false, 'Ese PIN ya está en uso, elige otro'::text;
  end if;
  v_avatar := v_avatares[1 + floor(random() * array_length(v_avatares, 1))::int];
  insert into players(name, pin, avatar) values (trim(p_name), p_pin, v_avatar)
  returning * into v_new;
  return query select v_new.id, v_new.name, v_new.avatar, v_new.role, true, null::text;
end;
$$;

grant execute on function registrar_jugador(text, text) to anon;

-- Crear una prueba (fase de envíos). Hasta 3 por jugador.
create or replace function crear_prueba(p_player_id uuid, p_texto text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
  v_fase text;
  v_count int;
begin
  select fase into v_fase from game_state where id = 1;
  if v_fase <> 'submission' then
    raise exception 'Ya no se pueden enviar pruebas, el bingo ha empezado';
  end if;
  select count(*) into v_count from pruebas where submitted_by = p_player_id;
  if v_count >= 3 then
    raise exception 'Máximo 3 pruebas por jugador';
  end if;
  insert into pruebas(texto, submitted_by) values (trim(p_texto), p_player_id)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function crear_prueba(uuid, text) to anon;

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

-- Ver el texto de una prueba oculta (solo admin o responsable asignado)
create or replace function ver_prueba_oculta(p_prueba_id uuid, p_player_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_role text;
  v_resp uuid;
  v_texto text;
begin
  select role into v_role from players where id = p_player_id;
  select responsable_id, texto into v_resp, v_texto from pruebas where id = p_prueba_id;
  if v_role = 'admin' or v_resp = p_player_id then
    return v_texto;
  end if;
  return null;
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

-- Iniciar el bingo: calcula automáticamente el lado del tablero (el
-- cuadrado más pequeño que cabe con todas las pruebas + 1 comodín
-- central) y reparte las posiciones al azar. Las casillas que sobren
-- quedan vacías (decorativas, sin prueba).
create or replace function iniciar_bingo(p_player_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_role text;
  v_ids uuid[];
  v_count int;
  v_side int;
  v_size int;
  v_centro int;
  v_pos int;
  i int;
begin
  select role into v_role from players where id = p_player_id;
  if v_role <> 'admin' then
    raise exception 'Solo el admin puede iniciar el bingo';
  end if;

  select array_agg(id order by random()) into v_ids
  from pruebas where position is null and not libre;

  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count = 0 then
    raise exception 'No hay pruebas enviadas todavía';
  end if;

  v_side := greatest(3, ceil(sqrt(v_count + 1))::int);
  v_size := v_side * v_side;
  v_centro := v_size / 2;

  insert into pruebas (texto, position, libre, revealed, completada)
  values ('Comodín', v_centro, true, true, true);

  v_pos := 0;
  for i in 1 .. v_count loop
    if v_pos = v_centro then
      v_pos := v_pos + 1;
    end if;
    update pruebas set position = v_pos where id = v_ids[i];
    v_pos := v_pos + 1;
  end loop;

  update game_state set fase = 'playing', board_size = v_size, updated_at = now() where id = 1;
  return true;
end;
$$;

grant execute on function iniciar_bingo(uuid) to anon;

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
  v_resp uuid;
begin
  select role into v_role from players where id = p_player_id;
  select responsable_id into v_resp from pruebas where id = p_prueba_id;
  if v_role <> 'admin' and (v_resp is null or v_resp <> p_player_id) then
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
  v_resp uuid;
  v_resp_name text;
  v_cumplidor_name text;
  v_size int;
  v_lado int;
  v_pos int;
  v_fila int;
  v_col int;
  v_linea boolean := false;
  v_bingo boolean := false;
  v_total int;
  v_completadas int;
  v_fila_completa boolean;
  v_col_completa boolean;
begin
  select role into v_role from players where id = p_player_id;
  select responsable_id, position into v_resp, v_pos from pruebas where id = p_prueba_id;
  if v_role <> 'admin' and (v_resp is null or v_resp <> p_player_id) then
    raise exception 'No autorizado';
  end if;

  update pruebas
    set completada = true, completada_por = p_cumplidor_id, completada_at = now(), revealed = true
    where id = p_prueba_id;

  select name into v_resp_name from players where id = v_resp;
  select name into v_cumplidor_name from players where id = p_cumplidor_id;

  insert into eventos(tipo, mensaje) values (
    'chupito',
    coalesce(v_cumplidor_name, 'Alguien') || ' y ' || coalesce(v_resp_name, 'el encargado') || ' beben un chupito 🥃'
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

-- Reiniciar partida (admin) - por si queréis repetir el juego
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
  delete from pruebas;
  delete from eventos;
  update game_state set fase = 'submission', updated_at = now() where id = 1;
  return true;
end;
$$;

grant execute on function reiniciar_bingo(uuid) to anon;

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
