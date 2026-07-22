import type {
  AudioClipRef,
  ParticleSpriteRef,
  ProjectContentDocument,
  ProjectPresentationCue,
  ProjectPresentationResource,
} from '@asha/contracts';
import type {
  AshaAnimationClipCueDefinition,
  AshaAudioResource,
  AshaParticleResource,
  AshaRendererAnimatedMeshResourceManifest,
} from '@asha/renderer-host';
import type { RuntimeSessionProjectSource } from '@asha/runtime-session';

export interface DemoParticleCueBinding {
  readonly asset: string;
  readonly contentHash: string;
  readonly scale: number;
}

export interface DemoPresentationResources {
  readonly animatedMeshManifest: AshaRendererAnimatedMeshResourceManifest;
  readonly animationCues: readonly AshaAnimationClipCueDefinition[];
  resolveAudioResource(clip: AudioClipRef): Promise<AshaAudioResource>;
  resolveParticleResource(sprite: ParticleSpriteRef): Promise<AshaParticleResource | null>;
  particleCue(signalId: string): DemoParticleCueBinding | null;
}

export function createDemoPresentationResources(
  documents: readonly ProjectContentDocument[],
  projectSource: RuntimeSessionProjectSource,
): DemoPresentationResources {
  const catalogs = documents.filter(
    (document) => document.kind === 'presentationCatalog',
  );
  const resources = catalogs.flatMap((document) => document.catalog.resources);
  const cues = catalogs.flatMap((document) => document.catalog.cues);
  const resourceById = uniqueBy(resources, (resource) => resource.resourceId, 'resource');
  const resourceByAsset = uniqueBy(resources, (resource) => resource.assetId, 'resource asset');
  const particleCueBySignal = uniqueBy(
    cues.filter((cue): cue is Extract<ProjectPresentationCue, { readonly kind: 'particle' }> => (
      cue.kind === 'particle'
    )),
    (cue) => cue.signalId,
    'particle signal',
  );
  const objectUrls = new Map<string, string>();

  const animatedResources = resources.filter((resource) => resource.kind === 'animatedMesh');
  if (animatedResources.length === 0) {
    throw new Error('Admitted project content has no animated-mesh presentation resource');
  }
  const animatedMeshManifest: AshaRendererAnimatedMeshResourceManifest = {
    kind: 'asha_renderer_animated_mesh_resources.v0',
    resources: animatedResources.map((resource) => {
      const descriptor = requireAnimatedMeshDescriptor(resource, `resource ${resource.resourceId}`);
      return {
        asset: descriptor.asset,
        resourceUrl: projectUrl(resource.sourcePath),
        contentHash: resource.contentHash,
        clipIds: descriptor.clips.map((clip) => clip.id),
        licenseUrl: resource.licensePath === null ? null : projectUrl(resource.licensePath),
      };
    }),
  };
  const animationCueById = uniqueBy(
    cues.filter((cue): cue is Extract<ProjectPresentationCue, { readonly kind: 'animation' }> => (
      cue.kind === 'animation'
    )),
    (cue) => cue.cueId,
    'animation cue',
  );
  const primaryFireAnimationCue = animationCueById.get('fps.primary-fire.animation');
  if (primaryFireAnimationCue === undefined) {
    throw new Error('Admitted project content has no fps.primary-fire.animation cue');
  }
  const animationResource = requireResource(
    resourceById,
    primaryFireAnimationCue.resourceId,
    'fps.primary-fire.animation cue',
  );
  if (animationResource.kind !== 'animatedMesh') {
    throw new Error(
      `fps.primary-fire.animation resolved a ${animationResource.kind} resource`,
    );
  }
  requireAnimatedMeshDescriptor(animationResource, 'fps.primary-fire.animation cue');

  const animationCues: AshaAnimationClipCueDefinition[] = cues.flatMap((cue) => {
    if (cue.kind !== 'animation') return [];
    const resource = requireResource(resourceById, cue.resourceId, 'animation cue');
    if (resource.kind !== 'animatedMesh') {
      throw new Error(`Animation cue ${cue.cueId} resolved a ${resource.kind} resource`);
    }
    const descriptor = requireAnimatedMeshDescriptor(resource, `animation cue ${cue.cueId}`);
    if (!descriptor.clips.some((clip) => clip.id === cue.clipId)) {
      throw new Error(`Animation cue ${cue.cueId} references missing clip ${cue.clipId}`);
    }
    return [{
      cueId: cue.cueId,
      asset: resource.assetId,
      clip: cue.clipId,
      atSeconds: cue.atSeconds,
      signal: { domain: cue.signal.domain, id: cue.signal.signalId },
    }];
  });

  return {
    animatedMeshManifest,
    animationCues,
    async resolveAudioResource(clip) {
      const resource = requireMatchingResource(resourceByAsset, clip.asset, clip.contentHash, 'audio');
      const bytes = await readVerifiedResource(projectSource, resource);
      return { bytes: ownedArrayBuffer(bytes), contentHash: resource.contentHash };
    },
    async resolveParticleResource(sprite) {
      const resource = resourceByAsset.get(sprite.asset);
      if (
        resource === undefined
        || resource.kind !== 'particle'
        || resource.contentHash !== sprite.contentHash
      ) {
        return null;
      }
      const bytes = await readVerifiedResource(projectSource, resource);
      const key = `${resource.assetId}@${resource.contentHash}`;
      let url = objectUrls.get(key);
      if (url === undefined) {
        url = URL.createObjectURL(new Blob([ownedArrayBuffer(bytes)], { type: 'image/svg+xml' }));
        objectUrls.set(key, url);
      }
      return { bytes: ownedArrayBuffer(bytes), url };
    },
    particleCue(signalId) {
      const cue = particleCueBySignal.get(signalId);
      if (cue === undefined) return null;
      const resource = requireResource(resourceById, cue.resourceId, 'particle cue');
      if (resource.kind !== 'particle') {
        throw new Error(`Particle signal ${signalId} resolved a ${resource.kind} resource`);
      }
      return {
        asset: resource.assetId,
        contentHash: resource.contentHash,
        scale: cue.scale,
      };
    },
  };
}

function requireAnimatedMeshDescriptor(
  resource: ProjectPresentationResource,
  context: string,
) {
  if (resource.kind !== 'animatedMesh' || resource.animatedMesh === null) {
    throw new Error(`${context} requires renderer-neutral animated-mesh metadata`);
  }
  return resource.animatedMesh;
}

function uniqueBy<T>(
  values: readonly T[],
  key: (value: T) => string,
  label: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = key(value);
    if (result.has(id)) throw new Error(`Admitted presentation ${label} ${id} is duplicated`);
    result.set(id, value);
  }
  return result;
}

function requireResource(
  resources: ReadonlyMap<string, ProjectPresentationResource>,
  resourceId: string,
  context: string,
): ProjectPresentationResource {
  const resource = resources.get(resourceId);
  if (resource === undefined) throw new Error(`${context} references missing resource ${resourceId}`);
  return resource;
}

function requireMatchingResource(
  resources: ReadonlyMap<string, ProjectPresentationResource>,
  assetId: string,
  contentHash: string,
  kind: ProjectPresentationResource['kind'],
): ProjectPresentationResource {
  const resource = resources.get(assetId);
  if (resource === undefined || resource.kind !== kind || resource.contentHash !== contentHash) {
    throw new Error(`ASHA Demo has no admitted ${kind} resource for ${assetId}@${contentHash}`);
  }
  return resource;
}

async function readVerifiedResource(
  projectSource: RuntimeSessionProjectSource,
  resource: ProjectPresentationResource,
): Promise<Uint8Array> {
  const bytes = await projectSource.read(resource.sourcePath);
  const actualHash = fnv1a64(bytes);
  if (actualHash !== resource.contentHash) {
    throw new Error(
      `Presentation resource ${resource.resourceId} changed after Rust admission: ${actualHash} != ${resource.contentHash}`,
    );
  }
  return bytes;
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function projectUrl(path: string): string {
  return `/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function fnv1a64(bytes: Uint8Array): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}
