export function pulseReticleElement(reticle: Element | null, kind: string, previousTimer: number | null): number | null {
  if (!(reticle instanceof HTMLElement)) {
    return previousTimer;
  }
  window.clearTimeout(previousTimer ?? undefined);
  reticle.dataset.state = kind;
  return window.setTimeout(() => {
    reticle.dataset.state = 'idle';
  }, 140);
}
