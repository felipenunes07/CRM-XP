// O layout foi desenhado para ~1920px de largura útil. Em notebooks
// (1366/1536px, ou 1920 com escala do Windows em 125%) tudo ficava enorme
// com o zoom do navegador em 100%, então reduzimos a escala do app
// automaticamente. Quem já usava o navegador em 80% continua igual, porque a
// largura útil dele já é ~1920px.
const DESIGN_WIDTH = 1920;
const MIN_ZOOM = 0.75;
// Abaixo disso entram os layouts de celular/tablet, que já se adaptam sozinhos.
const MIN_DESKTOP_WIDTH = 1000;

// Rotas exibidas em TV ficam fora da escala automática.
const UNSCALED_PATHS = ["/relatorio-executivo"];

let currentZoom = 1;

export function getAppZoom() {
  return currentZoom;
}

/** Converte coordenadas da tela (clientX, getBoundingClientRect) para px do layout. */
export function toLayoutPx(value: number) {
  return value / currentZoom;
}

function computeZoom(pathname: string) {
  if (UNSCALED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return 1;
  }
  const width = window.innerWidth;
  if (width < MIN_DESKTOP_WIDTH) return 1;
  const zoom = Math.min(1, Math.max(MIN_ZOOM, width / DESIGN_WIDTH));
  return Math.round(zoom * 100) / 100;
}

export function applyAppZoom(pathname = window.location.pathname) {
  const root = document.documentElement;
  if (!CSS.supports("zoom", "0.5")) {
    currentZoom = 1;
    return;
  }
  // innerWidth não muda com o zoom do CSS, então o cálculo é estável.
  currentZoom = computeZoom(pathname);
  if (currentZoom === 1) {
    root.style.removeProperty("zoom");
    root.style.removeProperty("--vz");
  } else {
    root.style.zoom = String(currentZoom);
    // Unidades vh/vw também encolhem com o zoom; o CSS divide por --vz.
    root.style.setProperty("--vz", String(currentZoom));
  }
}
