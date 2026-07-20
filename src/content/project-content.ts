import type {
  CameraCollisionPolicy,
  PerspectiveProjection,
} from '@asha/contracts';
import type { AshaRendererAnimatedMeshResourceManifest } from '@asha/renderer-host';
import type { RuntimeSessionProjectSource } from '@asha/runtime-session';

export const DEMO_PROJECT_MANIFEST_PATH = 'asha.project-bundle.json';
const ANIMATED_MESH_MANIFEST_PATH =
  'assets/mesh-animation/kenney-retro-character-medium.manifest.json';

export type DemoJsonReader = (path: string) => Promise<unknown>;
export type DemoByteReader = (path: string) => Promise<Uint8Array>;

export interface DemoProjectManifestSummary {
  readonly bundleSchemaVersion: number;
  readonly protocolVersion: number;
  readonly project: { readonly id: number; readonly name: string | null };
  readonly entryScene: number;
  readonly artifacts: readonly {
    readonly path: string;
    readonly class: string;
    readonly role: string;
    readonly contentHash: string;
  }[];
}

export interface DemoProjectContent {
  readonly kind: 'asha_demo.canonical_project.v2';
  readonly projectSource: RuntimeSessionProjectSource;
  readonly projectManifest: DemoProjectManifestSummary;
  readonly catalogs: {
    readonly animatedMeshManifest: AshaRendererAnimatedMeshResourceManifest;
  };
  readonly runtime: {
    readonly sessionId: string;
    readonly seed: number;
    readonly initialCameraPose: {
      readonly position: readonly [number, number, number];
      readonly yawDegrees: number;
      readonly pitchDegrees: number;
    };
    readonly collisionShape: {
      readonly halfExtents: readonly [number, number, number];
    };
    readonly collisionPolicy: CameraCollisionPolicy;
    readonly cameraProjection: PerspectiveProjection;
    readonly enemyRenderTarget: {
      readonly label: string;
      readonly position: readonly [number, number, number];
      readonly scale: readonly [number, number, number];
    };
  };
}

export interface DemoProjectContentStatus {
  readonly kind: 'asha_demo.project_content_status.v2';
  readonly valid: boolean;
  readonly diagnostics: readonly string[];
  readonly projectId: number;
  readonly sceneId: number;
  readonly artifactCount: number;
  readonly projectManifest: typeof DEMO_PROJECT_MANIFEST_PATH;
}

export async function loadDemoProjectContent(
  fetchJson: DemoJsonReader = readJson,
  fetchBytes: DemoByteReader = readBytes,
): Promise<DemoProjectContent> {
  const [manifestSource, animatedMeshManifestSource] = await Promise.all([
    fetchJson(`/${DEMO_PROJECT_MANIFEST_PATH}`),
    fetchJson(`/${ANIMATED_MESH_MANIFEST_PATH}`),
  ]);
  const projectManifest = decodeProjectManifestSummary(manifestSource);
  const animatedMeshManifest =
    decodeAnimatedMeshManifest(animatedMeshManifestSource);
  const projectSource: RuntimeSessionProjectSource = {
    kind: 'development-directory',
    identity: 'development-directory:asha-demo',
    read: async (relativePath) => fetchBytes(`/${relativePath}`),
  };

  return {
    kind: 'asha_demo.canonical_project.v2',
    projectSource,
    projectManifest,
    catalogs: { animatedMeshManifest },
    runtime: {
      sessionId: 'asha-demo.playable.canonical',
      seed: 4103,
      initialCameraPose: {
        position: [0, 1.62, 1.5],
        yawDegrees: 0,
        pitchDegrees: 0,
      },
      collisionShape: { halfExtents: [0.25, 0.25, 0.25] },
      collisionPolicy: {
        mode: 'axis_separable_slide',
        maxIterations: 3,
      },
      cameraProjection: { fovYDegrees: 55, near: 0.1, far: 100 },
      enemyRenderTarget: {
        label: 'actor/generated-tunnel-enemy',
        position: [0, 0.5, -2.6],
        scale: [0.5, 1, 0.5],
      },
    },
  };
}

export function readDemoProjectContentStatus(
  content: DemoProjectContent,
): DemoProjectContentStatus {
  const diagnostics: string[] = [];
  if (content.projectManifest.bundleSchemaVersion !== 2) {
    diagnostics.push('canonical ProjectBundle schema version must be 2');
  }
  if (content.projectManifest.protocolVersion !== 1) {
    diagnostics.push('canonical ProjectBundle protocol version must be 1');
  }
  if (!content.projectManifest.artifacts.some(
    (artifact) => artifact.role === 'sceneDocument',
  )) {
    diagnostics.push('canonical ProjectBundle must declare a SceneDocument');
  }
  if (!content.projectManifest.artifacts.some(
    (artifact) => artifact.role === 'voxelVolumeAsset',
  )) {
    diagnostics.push('canonical ProjectBundle must declare a stored voxel asset');
  }
  return {
    kind: 'asha_demo.project_content_status.v2',
    valid: diagnostics.length === 0,
    diagnostics,
    projectId: content.projectManifest.project.id,
    sceneId: content.projectManifest.entryScene,
    artifactCount: content.projectManifest.artifacts.length,
    projectManifest: DEMO_PROJECT_MANIFEST_PATH,
  };
}

async function readJson(path: string): Promise<unknown> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ASHA Demo project file ${path}: ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

async function readBytes(path: string): Promise<Uint8Array> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ASHA Demo project file ${path}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function decodeProjectManifestSummary(value: unknown): DemoProjectManifestSummary {
  const source = object(value, 'ProjectBundle');
  const project = object(source['project'], 'ProjectBundle.project');
  const artifacts = array(source['artifacts'], 'ProjectBundle.artifacts').map(
    (artifact, index) => {
      const row = object(artifact, `ProjectBundle.artifacts[${index}]`);
      return {
        path: text(row['path'], `ProjectBundle.artifacts[${index}].path`),
        class: text(row['class'], `ProjectBundle.artifacts[${index}].class`),
        role: text(row['role'], `ProjectBundle.artifacts[${index}].role`),
        contentHash: text(
          row['contentHash'],
          `ProjectBundle.artifacts[${index}].contentHash`,
        ),
      };
    },
  );
  return {
    bundleSchemaVersion: integer(
      source['bundleSchemaVersion'],
      'ProjectBundle.bundleSchemaVersion',
    ),
    protocolVersion: integer(
      source['protocolVersion'],
      'ProjectBundle.protocolVersion',
    ),
    project: {
      id: integer(project['id'], 'ProjectBundle.project.id'),
      name: project['name'] === null
        ? null
        : text(project['name'], 'ProjectBundle.project.name'),
    },
    entryScene: integer(source['entryScene'], 'ProjectBundle.entryScene'),
    artifacts,
  };
}

function decodeAnimatedMeshManifest(
  value: unknown,
): AshaRendererAnimatedMeshResourceManifest {
  const source = object(value, 'animatedMeshManifest');
  if (source['kind'] !== 'asha_renderer_animated_mesh_resources.v0') {
    throw new Error('animated mesh manifest kind is unsupported');
  }
  const resources = array(source['resources'], 'animatedMeshManifest.resources');
  if (resources.length === 0) {
    throw new Error('animated mesh manifest must contain a resource');
  }
  return value as AshaRendererAnimatedMeshResourceManifest;
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative safe integer`);
  }
  return value;
}
