import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDemoPresentationResources } from '../dist/ui/content/presentation-resources.js';

test('the FPS animation target follows the required cue instead of resource ordering', () => {
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
          clipIds: ['idle'],
        }, {
          resourceId: 'animated.weapon',
          kind: 'animatedMesh',
          assetId: 'mesh/weapon',
          sourcePath: 'assets/weapon.glb',
          contentHash: '2222222222222222',
          licensePath: null,
          clipIds: ['idle', 'run', 'jump'],
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
  assert.deepEqual(resources.animatedMeshTarget, {
    asset: 'mesh/weapon',
    contentHash: '2222222222222222',
    clipIds: ['idle', 'run', 'jump'],
  });
});
