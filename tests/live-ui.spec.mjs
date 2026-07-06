import { expect, test } from '@playwright/test';

function brokerBaseUrl() {
  return process.env.PLAYWRIGHT_BROKER_BASE_URL ?? process.env.BASE_URL ?? null;
}

test('@live-agent asha-demo mounts the upstream ASHA renderer surface', async ({ page }) => {
  const baseUrl = brokerBaseUrl();
  expect(baseUrl, 'live UI smoke must use broker-provided BASE_URL').not.toBeNull();

  await page.goto('/');

  const canvas = page.locator('[data-demo-readout="asha-renderer-browser-surface"]');
  await expect(canvas).toBeVisible();
  await expect(page.locator('[data-demo-readout="reticle"]')).toBeVisible();
  await expect(page.locator('#fire-button')).toBeVisible();
  await expect(page.locator('#reset-button')).toBeVisible();
  await expect.poll(async () => canvas.evaluate((node) => node.clientWidth)).toBeGreaterThan(100);
  await expect.poll(async () => canvas.evaluate((node) => node.clientHeight)).toBeGreaterThan(100);

  const surface = await page.evaluate(() => globalThis.ashaRendererSurface?.kind ?? null);
  expect(surface).toBe('asha_renderer_surface.v0');

  const pose = await page.evaluate(() => globalThis.ashaRendererSurface?.cameraPose?.() ?? null);
  expect(pose?.position).toEqual([0, 1.62, 1.25]);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.pointerLocked?.() ?? null)).toBe(false);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.movementState?.().authority ?? null)).toBe(
    'external_collision',
  );
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.projectContentStatus?.().valid ?? null)).toBe(true);
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.projectContentStatus?.().sourceFiles ?? null),
  ).toMatchObject({
    projectBundle: '/project/project-bundle.json',
    sceneDocument: 'levels/scenes/generated-tunnel-room.scene.json',
    entityDefinitions: [
      'catalogs/actors/demo-player.entity.json',
      'catalogs/actors/generated-tunnel-enemy.entity.json',
    ],
  });
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.projectContentStatus?.().levelRenderProjectionHash ?? null),
  ).toBe('fnv1a64:21eb8696f6f3b5c4');
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.snapshot?.() ?? ''),
  ).toContain('generated-tunnel-enemy');
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.snapshot?.() ?? ''),
  ).toContain('generated-tunnel-floor');
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.snapshot?.() ?? ''),
  ).toContain('generated-tunnel-wall-rib-west-1');
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.snapshot?.() ?? ''),
  ).toContain('generated-tunnel-low-cover-east');
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.snapshot?.() ?? ''),
  ).toContain('generated-tunnel-ceiling-crossbeam');
  const initialRuntimeBootstrapHash = await page.evaluate(
    () => globalThis.ashaRendererSurface?.projectContentStatus?.().runtimeBootstrapHash ?? null,
  );
  if (initialRuntimeBootstrapHash !== null) {
    expect(initialRuntimeBootstrapHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  }

  const backendStatus = await page.evaluate(() => globalThis.ashaRendererSurface?.runtimeBackendStatus?.() ?? null);
  expect(backendStatus?.profile).toMatchObject({
    mode: 'rust',
    productAuthority: true,
    referenceFallback: false,
  });

  if (backendStatus?.status === 'missing_rust_backend') {
    expect(await page.evaluate(() => globalThis.ashaRendererSurface?.projectContentStatus?.().runtimeLoaded ?? null)).toBe(false);
    expect(backendStatus?.diagnostics?.[0]?.message).toContain('does not fall back to reference authority');
    await expect(page.locator('#fire-button')).toBeDisabled();
    expect(await page.evaluate(() => globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().authority.source ?? null)).toBe(
      'missing_backend',
    );
    expect(await page.evaluate(() => globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entityCount ?? null)).toBe(0);
    expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().remainingTargets ?? null)).toBe(1);
    return;
  }

  expect(backendStatus?.status).toBe('rust_authority');
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.projectContentStatus?.().runtimeLoaded ?? null)).toBe(true);
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.projectContentStatus?.().runtimeBootstrapHash ?? null),
  ).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entityCount ?? null)).toBe(2);
  expect(
    await page.evaluate(() =>
      globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entities.map(
        (entity) => entity.definitionStableId,
      ) ?? [],
    ),
  ).toEqual(['actor/demo-player', 'actor/generated-tunnel-enemy']);

  await page.locator('#pause-button').click();
  await expect(page.locator('#pause-menu')).toBeVisible();
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().paused ?? null)).toBe(true);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().menuMode ?? null)).toBe('paused');
  await expect(page.locator('#fire-button')).toBeDisabled();
  await page.locator('#options-button').click();
  await expect(page.locator('#options-pane')).toBeVisible();
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().menuMode ?? null)).toBe('options');
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().lastMenuIntent?.kind ?? null)).toBe(
    'ui.open_options_intent',
  );
  await page.locator('#exit-button').click();
  await expect(page.locator('#exit-state')).toBeVisible();
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().menuMode ?? null)).toBe('exit');
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().lastMenuIntent?.kind ?? null)).toBe(
    'ui.exit_to_menu_intent',
  );
  await page.locator('#resume-button').click();
  await expect(page.locator('#pause-menu')).toBeHidden();
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().paused ?? null)).toBe(false);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().lastMenuIntent?.kind ?? null)).toBe(
    'ui.resume_intent',
  );
  await page.locator('#pause-button').click();
  await page.locator('#menu-reset-button').click();
  await expect(page.locator('#pause-menu')).toBeHidden();
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().restartCount ?? null)).toBe(1);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().actionTick ?? null)).toBe(0);

  const enemyLoopResult = await page.evaluate(() => {
    const readTransform = () => {
      const enemy = globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entities.find(
        (entity) => entity.definitionStableId === 'actor/generated-tunnel-enemy',
      );
      return enemy?.capabilities.find((capability) => capability.kind === 'transform') ?? null;
    };
    const readPlayerHealth = () => {
      const player = globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entities.find(
        (entity) => entity.definitionStableId === 'actor/demo-player',
      );
      return player?.capabilities.find((capability) => capability.kind === 'health') ?? null;
    };
    const beforeTransform = readTransform();
    const beforePlayerHealth = readPlayerHealth();
    let lastReadout = null;
    for (let index = 0; index < 30; index += 1) {
      lastReadout = globalThis.ashaRendererSurface?.tickEnemyPolicy?.() ?? null;
      if (readPlayerHealth()?.dead) {
        break;
      }
    }
    const blockedFire = globalThis.ashaRendererSurface?.firePrimary?.() ?? null;
    return {
      beforeTransform,
      afterTransform: readTransform(),
      beforePlayerHealth,
      afterPlayerHealth: readPlayerHealth(),
      blockedFire,
      deathStateVisible: !document.querySelector('#death-state')?.hidden,
      lastReadout,
      loopState: globalThis.ashaRendererSurface?.enemyLoopState?.() ?? null,
      interaction: globalThis.ashaRendererSurface?.interactionState?.() ?? null,
    };
  });
  expect(enemyLoopResult.beforeTransform?.kind).toBe('transform');
  expect(enemyLoopResult.afterTransform?.kind).toBe('transform');
  expect(enemyLoopResult.afterTransform?.position).not.toEqual(enemyLoopResult.beforeTransform?.position);
  expect(enemyLoopResult.lastReadout?.movementSummary?.status).toBe('accepted');
  expect(enemyLoopResult.loopState?.kind).toBe('runtime_session.autonomous_policy_tick.v0');
  expect(enemyLoopResult.afterPlayerHealth?.current).toBeLessThan(enemyLoopResult.beforePlayerHealth?.current);
  expect(enemyLoopResult.afterPlayerHealth).toMatchObject({ kind: 'health', current: 0, max: 100, dead: true });
  expect(enemyLoopResult.lastReadout?.combatSummary?.status).toBe('accepted');
  expect(enemyLoopResult.deathStateVisible).toBe(true);
  expect(enemyLoopResult.blockedFire?.runtime).toBeNull();
  expect(enemyLoopResult.blockedFire?.interaction?.playerDead).toBe(true);
  expect(enemyLoopResult.interaction?.shotsFired).toBe(0);

  await page.evaluate(() => globalThis.ashaRendererSurface?.reset?.());
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().shotsFired ?? null)).toBe(0);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().actionTick ?? null)).toBe(0);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().playerDead ?? null)).toBe(false);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().playerHealth ?? null)).toBe(100);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().restartCount ?? null)).toBe(2);
  expect(await page.evaluate(() => document.querySelector('#death-state')?.hidden ?? null)).toBe(true);

  await canvas.evaluate((node) => node.focus());
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.movementState?.().authority ?? null)).toBe(
    'external_collision',
  );
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.movementState?.().collided ?? null)).toBe(true);

  const fireResult = await page.evaluate(() => globalThis.ashaRendererSurface?.firePrimary?.() ?? null);
  expect(fireResult?.interaction?.shotsFired).toBe(1);
  expect(fireResult?.interaction?.remainingTargets).toBe(0);
  expect(fireResult?.runtime?.accepted).toBe(true);
  expect(fireResult?.runtime?.combatReadout?.outcome.kind).toBe('hit');
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().shotsFired ?? null)).toBe(1);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().remainingTargets ?? null)).toBe(0);
  expect(
    await page.evaluate(() => {
      const enemy = globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entities.find(
        (entity) => entity.definitionStableId === 'actor/generated-tunnel-enemy',
      );
      return enemy?.capabilities.find((capability) => capability.kind === 'health') ?? null;
    }),
  ).toMatchObject({ kind: 'health', current: 0, max: 40, dead: true });
  expect(
    await page.evaluate(() =>
      globalThis.ashaRendererSurface?.runtimeTelemetry?.().replayRecords.some(
        (record) => record.kind === 'submitRuntimeActionIntent',
      ) ?? null,
    ),
  ).toBe(true);

  await page.evaluate(() => globalThis.ashaRendererSurface?.reset?.());
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().shotsFired ?? null)).toBe(0);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().actionTick ?? null)).toBe(0);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().remainingTargets ?? null)).toBe(1);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().restartCount ?? null)).toBe(3);
  expect(
    await page.evaluate(() => {
      const enemy = globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entities.find(
        (entity) => entity.definitionStableId === 'actor/generated-tunnel-enemy',
      );
      return enemy?.capabilities.find((capability) => capability.kind === 'health') ?? null;
    }),
  ).toMatchObject({ kind: 'health', current: 40, max: 40, dead: false });
  expect(
    await page.evaluate(() => {
      const player = globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entities.find(
        (entity) => entity.definitionStableId === 'actor/demo-player',
      );
      return player?.capabilities.find((capability) => capability.kind === 'health') ?? null;
    }),
  ).toMatchObject({ kind: 'health', current: 100, max: 100, dead: false });
});

test('@live-agent asha-demo rejects spoofed native RuntimeBridge providers', async ({ page }) => {
  const baseUrl = brokerBaseUrl();
  expect(baseUrl, 'live UI smoke must use broker-provided BASE_URL').not.toBeNull();

  await page.addInitScript(() => {
    const referenceSnapshot = {
      backend: 'reference_bridge',
      authoritySurface: 'runtime_session.fps.reference.v0',
      projectBundle: 'spoofed-demo:scene',
      sessionEpoch: 1,
      lifecycleStatus: { state: 'active' },
      playerEntity: 10,
      enemyEntity: 20,
      health: [
        { entity: 10, current: 100, max: 100 },
        { entity: 20, current: 40, max: 40 },
      ],
      policyBindings: [],
      replayRecords: [{
        replayUnit: 'spoofed-reference',
        entityHash: 'fnv1a64:0000000000000001',
        healthHash: 'fnv1a64:0000000000000002',
        recordHash: 'fnv1a64:0000000000000003',
      }],
      readSets: [{
        viewKind: 'runtime_session.fps.lifecycle_health.v0',
        owner: 'reference-runtime-session',
        readSet: ['fixture'],
      }],
      entityHash: 'fnv1a64:0000000000000001',
      healthHash: 'fnv1a64:0000000000000002',
      replayHash: 'fnv1a64:0000000000000003',
    };
    globalThis.ashaDemoRuntimeBridge = {
      kind: 'asha_demo.native_runtime_bridge_provider.v1',
      backend: 'native_rust',
      productAuthority: true,
      referenceFallback: false,
      createRuntimeBridge() {
        return {
          initializeEngine() {
            return 1;
          },
          loadWorldBundle(request) {
            return {
              loadedWorld: request.sceneId,
              fatalCount: 0,
              totalCount: 0,
              blocksLoad: false,
            };
          },
          getCompositionStatus() {
            return {
              loadedWorld: 42,
              fatalCount: 0,
              totalCount: 0,
              blocksLoad: false,
            };
          },
          loadFpsRuntimeSession() {
            return referenceSnapshot;
          },
          readFpsRuntimeSession() {
            return referenceSnapshot;
          },
          applyFpsPrimaryFire() {
            return {
              ...referenceSnapshot,
              target: null,
              targetHealthBefore: null,
              targetHealthAfter: null,
            };
          },
        };
      },
    };
  });

  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => globalThis.ashaRendererSurface?.kind ?? null))
    .toBe('asha_renderer_surface.v0');
  const backendStatus = await page.evaluate(() => globalThis.ashaRendererSurface?.runtimeBackendStatus?.() ?? null);
  expect(backendStatus?.status).toBe('missing_rust_backend');
  expect(backendStatus?.diagnostics?.[0]?.message).toContain('rejected non-native RuntimeBridge provider');
  await expect(page.locator('#fire-button')).toBeDisabled();
});
