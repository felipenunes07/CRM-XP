import { useEffect } from "react";

/**
 * Integra a liquidGL (efeito de vidro líquido WebGL) numa página React.
 *
 * A lib (vendorada em /scripts/liquidGL.js + html2canvas) cria um canvas fixo
 * fullscreen no body e um loop de render global em window.__liquidGLRenderer__.
 * Como ela não expõe um teardown, fazemos a limpeza manual ao desmontar para o
 * canvas/RAF não vazarem ao trocar de tela. Se o WebGL ou os scripts falharem,
 * a página continua bonita pelo fallback CSS (frosted glass) das classes.
 */
declare global {
  interface Window {
    liquidGL?: (opts: Record<string, unknown>) => unknown;
    html2canvas?: unknown;
    __liquidGLRenderer__?: {
      _rafId?: number;
      canvas?: HTMLCanvasElement;
      _shadowEl?: HTMLElement;
    };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-lib="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`failed ${src}`)));
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.dataset.lib = src;
    el.addEventListener("load", () => {
      el.dataset.loaded = "true";
      resolve();
    });
    el.addEventListener("error", () => reject(new Error(`failed ${src}`)));
    document.body.appendChild(el);
  });
}

function teardownRenderer() {
  const renderer = window.__liquidGLRenderer__;
  if (!renderer) return;
  try {
    if (renderer._rafId) cancelAnimationFrame(renderer._rafId);
  } catch {
    /* noop */
  }
  try {
    renderer.canvas?.remove();
  } catch {
    /* noop */
  }
  try {
    renderer._shadowEl?.remove();
  } catch {
    /* noop */
  }
  window.__liquidGLRenderer__ = undefined;
}

export function useLiquidGL(options: { target: string; snapshot: string; enabled?: boolean }) {
  const { target, snapshot, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        await loadScript("/scripts/html2canvas.min.js");
        await loadScript("/scripts/liquidGL.js");
        if (cancelled) return;

        teardownRenderer(); // garante render limpo desta página

        // Espera o layout/fontes assentarem antes de fotografar o fundo.
        window.setTimeout(() => {
          if (cancelled || typeof window.liquidGL !== "function") return;
          try {
            window.liquidGL({
              target,
              snapshot,
              resolution: 2.0,
              refraction: 0.012,
              bevelDepth: 0.08,
              bevelWidth: 0.15,
              frost: 0.04,
              shadow: true,
              specular: true,
              magnify: 1,
            });
          } catch (error) {
            console.warn("liquidGL init falhou (mantendo fallback CSS)", error);
          }
        }, 250);
      } catch (error) {
        console.warn("liquidGL: scripts não carregaram (mantendo fallback CSS)", error);
      }
    })();

    return () => {
      cancelled = true;
      teardownRenderer();
    };
  }, [enabled, target, snapshot]);
}
