# Bingo de Tailún 😈

Bingo de pruebas para el finde. Cada uno se da de alta con su nombre, un PIN
de 6 dígitos y un avatar emoji, y propone hasta 3 pruebas ("su aportación")
que se puedan cumplir ese finde. Cuando el admin inicia el bingo, las
pruebas se reparten al azar por un tablero (con un comodín en el centro) y
quedan ocultas. Solo el admin o el encargado/a asignado a cada prueba puede
verla y habilitarla cuando pasa: entonces se muestra a todo el mundo y
beben el cumplidor y el encargado/a. Cuando se completa una línea o el
tablero entero, bebéis todos.

Es una PWA instalable: al entrar o crear cuenta se ofrece instalarla
(Android/Chrome); en iPhone/iPad, el botón de instalar de la cabecera
explica cómo hacerlo desde Compartir → Añadir a pantalla de inicio. Se
instala como **Tailún el malvado** con icono 😈.

De noche (21:00–07:00) la app cambia sola a un tema oscuro festivo; el
resto del día usa el tema claro.

## 1. Crear el proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea un proyecto nuevo (gratis).
2. Abre **SQL Editor** y pega el contenido de [`sql/schema.sql`](sql/schema.sql) completo. Ejecútalo.
3. Para convertirte en **admin**, entra primero en la app normal (verás el
   botón "Crear cuenta") y luego ejecuta en el SQL Editor:
   ```sql
   update players set role = 'admin' where name = 'TuNombre';
   ```
4. En **Project Settings > API**, copia la **Project URL** y la **anon public key**.
5. Comprueba que Realtime está activo para `pruebas`, `eventos` y
   `game_state` (el propio `schema.sql` ya lo activa al final con
   `alter publication supabase_realtime add table ...`).

## 2. Configurar el front

Edita [`js/config.js`](js/config.js):

```js
window.SUPABASE_CONFIG = {
  url: 'https://TU-PROYECTO.supabase.co',
  anonKey: 'TU-ANON-KEY',
};
```

La `anon key` es pública por diseño (así funciona Supabase con RLS), no pasa
nada por subirla al repo público. Mientras dejes los valores de ejemplo
(`TU-PROYECTO...`), la app arranca sola en **modo demo** con datos de
mentira (ver [`js/mock.js`](js/mock.js)) para poder ver la estética sin
tener Supabase configurado.

## 3. Publicar en GitHub Pages

1. En el repo, ve a **Settings > Pages**.
2. En **Source**, elige la rama que quieras publicar (por ejemplo `main`) y carpeta `/ (root)`.
3. Guarda. En un minuto tendrás la URL tipo `https://tuusuario.github.io/bingo-tailun/`.
4. Pasa ese enlace a tus amigos.

## Cómo funciona

- **Alta**: "Crear cuenta" pide nombre, PIN de 6 dígitos (único, avisa si
  ya está en uso) y un avatar emoji. "Entrar" solo pide el PIN: como es
  único, es tu identificador (no hace falta el nombre para volver a entrar).
- **Tu aportación**: la pantalla principal es el tablero; debajo tienes tu
  propia tarjeta para enviar hasta 3 pruebas y ver su estado (guardada,
  oculta, activa o cumplida). Solo tú ves el texto de tus propias pruebas
  mientras están ocultas para el resto.
- **Admin**: en su pestaña, asigna un encargado/a a cada prueba y pulsa
  **Iniciar bingo**: calcula el tablero cuadrado más pequeño que cabe con
  todas las pruebas + 1 comodín central, y reparte posiciones al azar.
- **Durante el finde**: solo el admin o el encargado/a de una prueba pueden
  verla oculta. Cuando pasa, la habilitan ("Habilitar para todos") y se
  muestra a todo el mundo con una lluvia de emojis 🧨🔥😈🦀🦭.
- **Cumplir una prueba**: el admin o el encargado/a marcan quién la ha
  cumplido → chupito para el cumplidor y el encargado/a (aviso para todos).
- **Línea / Bingo**: se detecta automáticamente al completar una fila,
  columna o el tablero entero → aviso de "todos bebéis" para todo el mundo.
- Todo se sincroniza en tiempo real entre todos los móviles (Supabase Realtime).

## Estructura

```
index.html            vista única: login/registro, tablero + admin
css/style.css          estilos (mobile-first, tema día/noche)
js/config.js           credenciales de Supabase (rellenar)
js/mock.js              cliente falso para el modo demo (sin BBDD)
js/supabaseClient.js    elige cliente real o demo según config.js
js/confetti.js          animación de emojis
js/app.js               lógica de la app
sql/schema.sql          tablas, vistas, RLS y funciones RPC
icons/, manifest.json   iconos y manifest de la PWA
```

## Seguridad

No usa Supabase Auth: el login es propio (nombre + PIN) vía funciones RPC
en Postgres (`login_jugador`, `registrar_jugador`). El PIN nunca se expone
por la API (las tablas base no tienen `select` para el rol `anon`, solo
vistas sin PIN y funciones RPC con `security definer`). El texto de las
pruebas ocultas solo se sirve a quien el servidor autoriza (admin o
encargado/a asignado), comprobado en cada función SQL. No es un sistema
pensado para datos sensibles, es un juego entre amigos.
