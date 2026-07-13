import type { AudioClipRef } from '@asha/contracts';
import type { AshaAudioResource } from '@asha/renderer-host';

const PRIMARY_FIRE_CLIP_ASSET = 'audio/asha-primary-fire-pulse';
const PRIMARY_FIRE_CLIP_CONTENT_HASH = '9de44d49edeab1dba3c78b42a602d8d1c5dcf92f752638995adda894a5b3ccba';

export async function resolveDemoAudioResource(
  clip: AudioClipRef,
): Promise<AshaAudioResource> {
  if (
    clip.asset !== PRIMARY_FIRE_CLIP_ASSET
    || clip.contentHash !== PRIMARY_FIRE_CLIP_CONTENT_HASH
  ) {
    throw new Error(`ASHA demo has no audio resource for ${clip.asset}@${clip.contentHash}`);
  }
  return {
    bytes: createPrimaryFireWaveFile(),
    contentHash: PRIMARY_FIRE_CLIP_CONTENT_HASH,
  };
}

function createPrimaryFireWaveFile(): ArrayBuffer {
  const sampleRate = 44_100;
  const durationSeconds = 0.09;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const time = sampleIndex / sampleRate;
    const progress = sampleIndex / sampleCount;
    const envelope = Math.pow(1 - progress, 3);
    const carrier = Math.sin(2 * Math.PI * (260 - (progress * 110)) * time);
    const transient = Math.sin(2 * Math.PI * 1_200 * time) * Math.max(0, 1 - (progress * 8));
    const sample = Math.max(-1, Math.min(1, (carrier * 0.75 + transient * 0.25) * envelope));
    view.setInt16(44 + (sampleIndex * bytesPerSample), Math.round(sample * 32_767), true);
  }
  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
