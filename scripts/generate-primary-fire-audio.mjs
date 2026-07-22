import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(repoRoot, 'assets/presentation/primary-fire-pulse.wav');
const sampleRate = 44_100;
const durationSeconds = 0.09;
const sampleCount = Math.floor(sampleRate * durationSeconds);
const bytesPerSample = 2;
const dataSize = sampleCount * bytesPerSample;
const bytes = Buffer.alloc(44 + dataSize);

bytes.write('RIFF', 0, 'ascii');
bytes.writeUInt32LE(36 + dataSize, 4);
bytes.write('WAVE', 8, 'ascii');
bytes.write('fmt ', 12, 'ascii');
bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20);
bytes.writeUInt16LE(1, 22);
bytes.writeUInt32LE(sampleRate, 24);
bytes.writeUInt32LE(sampleRate * bytesPerSample, 28);
bytes.writeUInt16LE(bytesPerSample, 32);
bytes.writeUInt16LE(16, 34);
bytes.write('data', 36, 'ascii');
bytes.writeUInt32LE(dataSize, 40);

for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
  const time = sampleIndex / sampleRate;
  const progress = sampleIndex / sampleCount;
  const envelope = (1 - progress) ** 3;
  const carrier = Math.sin(2 * Math.PI * (260 - progress * 110) * time);
  const transient = Math.sin(2 * Math.PI * 1_200 * time) * Math.max(0, 1 - progress * 8);
  const sample = Math.max(-1, Math.min(1, (carrier * 0.75 + transient * 0.25) * envelope));
  bytes.writeInt16LE(Math.round(sample * 32_767), 44 + sampleIndex * bytesPerSample);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, bytes);
console.log(`Wrote ${outputPath} (${bytes.byteLength} bytes)`);
