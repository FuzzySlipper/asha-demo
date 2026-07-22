import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDemoPresentationResources } from '../dist/ui/content/presentation-resources.js';

test('the animated-mesh manifest follows renderer-neutral admitted descriptors', () => {
  const resources = createDemoPresentationResources(
    [{
      kind: 'presentationCatalog',
      documentId: 'presentation',
      catalog: {
        schemaVersion: 1,
        resources: [{
          resourceId: 'animated.unrelated',
          kind: 'animatedMesh',
          assetId: 'mesh/unrelated',
          sourcePath: 'assets/unrelated.glb',
          contentHash: '1111111111111111',
          licensePath: null,
          animatedMesh: {
            asset: 'mesh/unrelated',
            runtimeFormat: 'glb',
            contentHash: '1111111111111111',
            clips: [{ id: 'idle', name: null, durationSeconds: null }],
            defaultClip: 'idle',
            materialSlots: [],
            bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
          },
        }, {
          resourceId: 'animated.weapon',
          kind: 'animatedMesh',
          assetId: 'mesh/weapon',
          sourcePath: 'assets/weapon.glb',
          contentHash: '2222222222222222',
          licensePath: null,
          animatedMesh: {
            asset: 'mesh/weapon',
            runtimeFormat: 'glb',
            contentHash: '2222222222222222',
            clips: ['idle', 'run', 'jump'].map((id) => ({ id, name: null, durationSeconds: null })),
            defaultClip: 'idle',
            materialSlots: [],
            bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
          },
        }],
        cues: [{
          kind: 'animation',
          cueId: 'fps.primary-fire.animation',
          resourceId: 'animated.weapon',
          clipId: 'jump',
          looped: false,
          atSeconds: 0,
          signal: { domain: 'particle', signalId: 'fps.weapon.flash' },
        }],
      },
    }],
    { read: async () => new Uint8Array() },
  );

  assert.equal(resources.animatedMeshManifest.resources.length, 2);
  assert.deepEqual(resources.animatedMeshManifest.resources[1], {
    asset: 'mesh/weapon',
    resourceUrl: '/assets/weapon.glb',
    contentHash: '2222222222222222',
    clipIds: ['idle', 'run', 'jump'],
    licenseUrl: null,
  });
});
