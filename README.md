# Bingo Tailun 🎉

Bingo de pruebas para el finde. Cada uno propone un reto, el admin reparte
las pruebas por el tablero y las va habilitando a medida que van pasando.
Cuando se cumple una prueba beben el cumplidor y el encargado/a; cuando se
hace línea o bingo, bebéis todos.

Es una PWA instalable: desde el móvil (Chrome/Safari) → "Añadir a pantalla
de inicio" → se instala como app **Tailún el malvado** con icono 😈.

## 1. Crear el proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea un proyecto nuevo (gratis).
2. Abre **SQL Editor** y pega el contenido de [`sql/schema.sql`](sql/schema.sql) completo. Ejecútalo.
3. Al final del archivo verás un `insert into players (...)` comentado.
   Descoméntalo, pon tu nombre y un PIN de 4 dígitos, y ejecútalo para
   crearte como **admin**. Si prefieres, primero entra en la app con tu
   nombre/PIN normal y luego ejecuta:
   ```sql
   update players set role = 'admin' where name = 'TuNombre';
   ```
4. En **Project Settings > Data API**, comprueba que las tablas/vistas
   (`pruebas`, `game_state`, `eventos`, `pruebas_publicas`, `players_publicos`)
   están expuestas (por defecto lo están, el schema `public`).
5. En **Project Settings > API**, copia la **Project URL** y la **anon public key**.

## 2. Configurar el front

Edita [`js/config.js`](js/config.js):

```js
window.SUPABASE_CONFIG = {
  url: 'https://TU-PROYECTO.supabase.co',
  anonKey: 'TU-ANON-KEY',
};
```

La `anon key` es pública por diseño (así funciona Supabase con RLS), no pasa
nada por subirla al repo público.

## 3. Publicar en GitHub Pages

1. En el repo, ve a **Settings > Pages**.
2. En **Source**, elige la rama `main` (o la que uséis) y carpeta `/ (root)`.
3. Guarda. En un minuto tendrás la URL tipo `https://tuusuario.github.io/bingo-tailun/`.
4. Pasa ese enlace a tus amigos.

## Cómo funciona

- **Fase de envíos**: todos entran con nombre + PIN de 4 dígitos (se crea la
  cuenta la primera vez que se usa ese nombre) y proponen pruebas desde la
  pestaña *Pruebas*. Se guardan ocultas en la base de datos.
- **Admin**: desde la pestaña *Admin*, asigna un encargado/a a cada prueba
  y pulsa **Iniciar bingo**: reparte las pruebas al azar por un tablero 5x5
  (las casillas sobrantes quedan como "libres").
- **Durante el finde**: solo el admin o el encargado/a de una prueba pueden
  verla oculta. Cuando pasa, la habilitan ("Habilitar para todos") y se
  muestra a todo el mundo con una lluvia de emojis 🧨🔥😈🦀🦭.
- **Cumplir una prueba**: el admin o el encargado/a marcan quién la ha
  cumplido → chupito para el cumplidor y el encargado/a (aviso para todos).
- **Línea / Bingo**: se detecta automáticamente al completar una fila,
  columna o el tablero entero → aviso de "todos bebéis".
- Todo se sincroniza en tiempo real entre todos los móviles (Supabase Realtime).

## Estructura

```
index.html          vista única con login, pruebas, tablero y admin
css/style.css        estilos (mobile-first, tema fiesta)
js/config.js         credenciales de Supabase (rellenar)
js/supabaseClient.js cliente supabase-js
js/confetti.js        animación de emojis
js/app.js             lógica de la app
sql/schema.sql         tablas, vistas, RLS y funciones RPC
```

## Seguridad

No usa Supabase Auth: el login es propio (nombre + PIN) vía una función RPC
en Postgres. El PIN nunca se expone por la API (las tablas base no tienen
`select` para el rol `anon`, solo vistas sin PIN y funciones RPC con
`security definer`). El texto de las pruebas ocultas solo se sirve a
quien el servidor autoriza (admin o encargado/a asignado), comprobado en
cada función SQL. No es un sistema pensado para datos sensibles, es un
juego entre amigos.
