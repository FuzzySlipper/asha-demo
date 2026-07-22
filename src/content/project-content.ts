import type { RuntimeSessionProjectSource } from '@asha/runtime-session';

export const DEMO_PROJECT_MANIFEST_PATH = 'asha.project-bundle.json';

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
  readonly runtime: {
    readonly sessionId: string;
    readonly seed: number;
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
  const manifestSource = await fetchJson(`/${DEMO_PROJECT_MANIFEST_PATH}`);
  const projectManifest = decodeProjectManifestSummary(manifestSource);
  const projectSource: RuntimeSessionProjectSource = {
    kind: 'development-directory',
    identity: 'development-directory:asha-demo',
    read: async (relativePath) => fetchBytes(`/${relativePath}`),
  };

  return {
    kind: 'asha_demo.canonical_project.v2',
    projectSource,
    projectManifest,
    runtime: {
      sessionId: 'asha-demo.playable.canonical',
      seed: 4103,
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
