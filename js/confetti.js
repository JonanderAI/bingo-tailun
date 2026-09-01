// Lanza un pequeño estallido de emojis por toda la pantalla.
// Se usa cada vez que se abre/revela una carta del bingo.
const EMOJIS_CARTA = ['🧨', '🔥', '😈', '🦀', '🦭'];

function lanzarEmojis(origin) {
  const container = document.getElementById('emoji-layer');
  if (!container) return;

  const originX = origin?.x ?? window.innerWidth / 2;
  const originY = origin?.y ?? window.innerHeight / 2;

  const cantidad = 18;
  for (let i = 0; i < cantidad; i++) {
    const span = document.createElement('span');
    span.className = 'emoji-particle';
    span.textContent = EMOJIS_CARTA[Math.floor(Math.random() * EMOJIS_CARTA.length)];

    const angle = Math.random() * Math.PI * 2;
    const distance = 80 + Math.random() * 220;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 60;
    const rot = (Math.random() - 0.5) * 720;
    const size = 20 + Math.random() * 24;
    const duration = 700 + Math.random() * 600;

    span.style.left = `${originX}px`;
    span.style.top = `${originY}px`;
    span.style.fontSize = `${size}px`;
    span.style.setProperty('--dx', `${dx}px`);
    span.style.setProperty('--dy', `${dy}px`);
    span.style.setProperty('--rot', `${rot}deg`);
    span.style.animationDuration = `${duration}ms`;

    container.appendChild(span);
    setTimeout(() => span.remove(), duration + 50);
  }
}
