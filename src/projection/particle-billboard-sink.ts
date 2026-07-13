import type {
  AshaBillboardScreenProjection,
  AshaParticleBillboard,
  AshaParticleBillboardSink,
} from '@asha/renderer-host';

type ProjectWorldPoint = (
  position: readonly [number, number, number],
) => AshaBillboardScreenProjection;

export function createDemoParticleBillboardSink(
  container: HTMLElement,
  projectWorld: ProjectWorldPoint,
): AshaParticleBillboardSink {
  const elements = new Map<number, HTMLElement>();
  return {
    create(particle) {
      const element = document.createElement('span');
      element.dataset.ashaParticleId = String(particle.id);
      element.setAttribute('aria-hidden', 'true');
      element.style.pointerEvents = 'none';
      element.style.position = 'absolute';
      element.style.borderRadius = '50%';
      element.style.backgroundRepeat = 'no-repeat';
      element.style.backgroundSize = `${particle.frameCount * 100}% 100%`;
      element.style.mixBlendMode = 'screen';
      element.style.zIndex = '30';
      container.appendChild(element);
      elements.set(particle.id, element);
      updateElement(element, particle, projectWorld);
    },
    update(particle) {
      const element = elements.get(particle.id);
      if (element !== undefined) {
        updateElement(element, particle, projectWorld);
      }
    },
    destroy(id) {
      elements.get(id)?.remove();
      elements.delete(id);
    },
  };
}

function updateElement(
  element: HTMLElement,
  particle: AshaParticleBillboard,
  projectWorld: ProjectWorldPoint,
): void {
  const projection = projectWorld(particle.position);
  element.style.display = projection.insideViewport ? 'block' : 'none';
  const diameter = Math.max(2, particle.size * 70);
  element.style.width = `${diameter}px`;
  element.style.height = `${diameter}px`;
  element.style.left = `${projection.xPixels}px`;
  element.style.top = `${projection.yPixels}px`;
  element.style.opacity = String(particle.color[3]);
  element.style.backgroundColor = rgba(particle.color);
  element.style.backgroundImage = `url("${particle.spriteUrl}")`;
  element.style.backgroundPosition = particle.frameCount === 1
    ? 'center'
    : `${(particle.frameIndex / (particle.frameCount - 1)) * 100}% center`;
  element.style.transform = 'translate(-50%, -50%)';
}

function rgba(color: readonly [number, number, number, number]): string {
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${color[3]})`;
}
