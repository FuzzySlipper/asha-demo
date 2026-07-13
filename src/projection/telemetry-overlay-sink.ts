import type {
  AshaTelemetryOverlaySink,
} from '@asha/renderer-host';
import type {
  LiveTelemetrySnapshot,
  TelemetryOverlayDescriptor,
  TelemetryOverlayHandle,
} from '@asha/contracts';

export function createDemoTelemetryOverlaySink(
  container: HTMLElement,
): AshaTelemetryOverlaySink {
  const elements = new Map<number, HTMLElement>();
  return {
    render(handle, descriptor, snapshot) {
      const rawHandle = handle as number;
      let element = elements.get(rawHandle);
      if (element === undefined) {
        element = document.createElement('aside');
        element.dataset.ashaTelemetryOverlayHandle = String(rawHandle);
        element.setAttribute('aria-label', 'ASHA live telemetry');
        container.appendChild(element);
        elements.set(rawHandle, element);
      }
      renderOverlay(element, descriptor, snapshot);
    },
    destroy(handle) {
      const rawHandle = handle as number;
      elements.get(rawHandle)?.remove();
      elements.delete(rawHandle);
    },
  };
}

function renderOverlay(
  element: HTMLElement,
  descriptor: TelemetryOverlayDescriptor,
  snapshot: LiveTelemetrySnapshot | null,
): void {
  element.dataset.corner = descriptor.corner;
  element.hidden = !descriptor.visible;
  if (snapshot === null) {
    element.replaceChildren(title(descriptor.title), line('Awaiting telemetry'));
    return;
  }
  const rows = snapshot.metrics.map((metric) =>
    line(`${label(metric.counter)} ${format(metric.value, metric.unit)}`)
  );
  const unavailable = snapshot.diagnostics
    .filter((diagnostic) => diagnostic.code === 'counterUnavailable')
    .map((diagnostic) => diagnostic.counter)
    .filter((counter): counter is NonNullable<typeof counter> => counter !== null);
  element.replaceChildren(
    title(descriptor.title),
    line(`tick ${snapshot.authorityTick} · sample ${snapshot.sampleSequence}`),
    ...rows,
    line(`frame ${sparkline(snapshot.frameTimeHistoryMs, descriptor.maxFrameTimeSamples)}`),
    ...(unavailable.length === 0 ? [] : [line(`unavailable ${unavailable.join(', ')}`)]),
  );
}

function title(value: string): HTMLElement {
  const element = document.createElement('strong');
  element.textContent = value;
  return element;
}

function line(value: string): HTMLElement {
  const element = document.createElement('div');
  element.textContent = value;
  return element;
}

function label(counter: string): string {
  return counter.replace(/[A-Z]/g, (value) => ` ${value.toLowerCase()}`);
}

function format(value: number, unit: string): string {
  return unit === 'ms' ? `${value.toFixed(1)} ms` : String(Math.round(value));
}

function sparkline(values: readonly number[], maxSamples: number): string {
  if (values.length === 0) {
    return '—';
  }
  const blocks = '▁▂▃▄▅▆▇█';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.001, max - min);
  return values.slice(-Math.min(24, maxSamples)).map((value) => {
    const index = Math.min(blocks.length - 1, Math.floor(((value - min) / span) * blocks.length));
    return blocks[index];
  }).join('');
}
