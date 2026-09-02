# Bingo de Tailún 😈

Bingo de pruebas para el finde. Cada uno se da de alta con su nombre y un
PIN de 6 dígitos (le asignamos un avatar emoji al azar), y propone hasta
2 pruebas ("su aportación") que se puedan cumplir ese finde. Al crear
cada prueba se le asigna al momento una casilla al azar en el tablero,
fijo de 6x6 (36 casillas), y esa posición ya no cambia. El admin programa
la fecha y hora de inicio (sin pulsar ningún botón "arrancar"): en cuanto
llega esa hora, el bingo empieza solo, rellenando con comodines las
casillas que se hayan quedado sin prueba. El admin o quien mandó cada
prueba puede destaparla cuando pasa (eligiendo antes quién ha sido el
involucrado): entonces se muestra a todo el mundo y beben el involucrado y
quien la destapó. Cuando se completa una línea o el tablero entero, bebéis
todos.

Es una PWA instalable: al entrar o crear cuenta se ofrece instalarla
(Android/Chrome); en iPhone/iPad, el botón de instalar de la cabecera
explica cómo hacerlo desde Compartir → Añadir a pantalla de inicio. Se
instala como **Tailún el malvado** con icono 😈.

Tema oscuro festivo fijo, todo el rato. Paleta rosa/violeta/azul, sin amarillo.

## 1. Crear el proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea un proyecto nuevo (gratis).
2. Abre **SQL Editor** y pega el contenido de [`sql/schema.sql`](sql/schema.sql) completo. Ejecútalo.
3. Para convertirte en **admin**, entra primero en la app normal (verás el
   botón "Crear cuenta") y luego ejecuta en el SQL Editor:
   ```sql
   update players set role = 'admin' where name = 'TuNombre';
   ```
   A partir de ahí ya puedes ascender a otros jugadores a admin desde el
   propio panel (Admin → Usuarios → editar → rol).
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

**Caché en el móvil**: `index.html` carga `css/style.css` y `js/*.js` con
`?v=N`. Si cambias esos archivos, sube ese número o los móviles pueden
seguir viendo la versión vieja un rato aunque hagan pull-to-refresh, por
caché del navegador y de la CDN de GitHub Pages.

## Cómo funciona

- **Alta**: "Crear cuenta" pide nombre y PIN de 6 dígitos (único, avisa si
  ya está en uso); el avatar se asigna al azar entre 😈🦭🦀🧨🧀🍷🤮💩🗿🦍🇪🇸.
  "Entrar" solo pide el PIN: como es único, es tu identificador (no hace
  falta el nombre para volver a entrar).
- **Tu aportación**: la pantalla principal es el tablero; debajo tienes tu
  propia tarjeta para enviar hasta 2 pruebas y ver su estado (guardada,
  oculta, activa o cumplida), y puedes editarlas o borrarlas mientras el
  bingo no haya empezado. Solo tú ves el texto de tus propias pruebas
  mientras están ocultas para el resto.
- **Tablero visible desde el principio**: aunque el bingo no haya
  empezado, ya se ve el tablero de 6x6 bloqueado, con el avatar de quien
  mandó cada prueba en su casilla (sin desvelar el texto), y la cuenta
  atrás encima.
- **Inicio programado**: el admin fija fecha y hora en su panel; al llegar
  la hora (y si hay al menos una prueba enviada), el bingo arranca solo —
  lo dispara cualquier cliente conectado, no hace falta que el admin esté
  mirando la pantalla en ese momento. Las casillas que se queden sin
  prueba se rellenan con comodines (ya cumplidos de fábrica).
- **Admin o propietario, cada prueba**: no hay encargados fijos por
  prueba. Cualquier cuenta con rol admin, o quien la mandó, puede
  destaparla cuando pasa: se pulsa "Ha pasado", se elige en un segundo
  paso quién ha sido el involucrado, y se marca cumplida a la vez → lluvia
  de emojis 🧨🔥😈🦀🦭 para todo el mundo.
- **Cumplir una prueba**: chupito para el involucrado elegido y para quien
  la destapó (aviso para todos).
- **Línea / Bingo**: se detecta automáticamente al completar una fila,
  columna o el tablero entero → aviso de "todos bebéis" para todo el mundo.
- **Usuarios (admin)**: ver, crear, editar (incluido el rol, para hacer
  admin a alguien más) y borrar cuentas.
- **Reiniciar (admin)**: el botón de reiniciar solo cancela la cuenta
  atrás programada; no borra pruebas ni eventos.
- Todo se sincroniza en tiempo real entre todos los móviles (Supabase Realtime).

## Estructura

```
index.html            vista única: login/registro, tablero + admin
css/style.css          estilos (mobile-first, tema oscuro fijo)
js/config.js           credenciales de Supabase (rellenar)
js/mock.js              cliente falso para el modo demo (sin BBDD)
js/supabaseClient.js    elige cliente real o demo según config.js
js/confetti.js          animación de emojis
js/app.js               lógica de la app
sql/schema.sql          tablas, vistas, RLS y funciones RPC
icons/, manifest.json   iconos y manifest de la PWA
```

## Seguridad

No usa Supabase Auth: el login es propio (PIN único) vía funciones RPC en
Postgres (`login_jugador`, `registrar_jugador`). El PIN nunca se expone
por la API a jugadores normales (las tablas base no tienen `select` para
el rol `anon`, solo vistas sin PIN y funciones RPC con `security
definer`); el admin sí puede verlo desde su panel de Usuarios, para poder
gestionarlos. El texto de las pruebas ocultas solo se sirve a cuentas
admin, comprobado en cada función SQL. No es un sistema pensado para
datos sensibles, es un juego entre amigos.
