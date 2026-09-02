// ============================================================
// Sonidos cortos generados con Web Audio API (sin archivos de audio):
// un "tap" al tocar botones/celdas, y una fanfarria al cumplir una
// prueba o hacer línea/bingo.
// ============================================================

let audioCtx = null;

function getAudioCtx() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function tono(frecuencia, duracion, { tipo = 'sine', volumen = 0.15, retraso = 0 } = {}) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = tipo;
  osc.frequency.value = frecuencia;
  const inicio = ctx.currentTime + retraso;
  gain.gain.setValueAtTime(volumen, inicio);
  gain.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
  osc.connect(gain).connect(ctx.destination);
  osc.start(inicio);
  osc.stop(inicio + duracion);
}

function sonidoTap() {
  tono(650, 0.05, { volumen: 0.08 });
}

function sonidoExito() {
  tono(523.25, 0.1, { volumen: 0.15 });
  tono(659.25, 0.12, { volumen: 0.15, retraso: 0.08 });
  tono(783.99, 0.16, { volumen: 0.15, retraso: 0.16 });
}

function sonidoFanfarria() {
  tono(392.0, 0.12, { tipo: 'triangle', volumen: 0.18 });
  tono(523.25, 0.12, { tipo: 'triangle', volumen: 0.18, retraso: 0.1 });
  tono(659.25, 0.12, { tipo: 'triangle', volumen: 0.18, retraso: 0.2 });
  tono(783.99, 0.22, { tipo: 'triangle', volumen: 0.2, retraso: 0.3 });
}

// Un solo listener delegado: toca en cualquier botón, pestaña, celda
// del tablero, foto de la galería o puesto del podio.
document.addEventListener('click', (e) => {
  if (e.target.closest('button, .tab-btn, .bingo-cell, .galeria-item, .login-switch-btn')) {
    sonidoTap();
  }
});
