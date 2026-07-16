import { expect, test } from '@playwright/test';

function brokerBaseUrl() {
  return process.env.PLAYWRIGHT_BROKER_BASE_URL ?? process.env.BASE_URL ?? null;
}

test('@live-agent asha-demo mounts the upstream ASHA renderer surface', async ({ page }) => {
  test.setTimeout(45_000);
  const baseUrl = brokerBaseUrl();
  expect(baseUrl, 'live UI smoke must use broker-provided BASE_URL').not.toBeNull();

  await page.clock.install();
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
  expect(pose?.position).toEqual([0, 1.62, 1.5]);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.pointerLocked?.() ?? null)).toBe(false);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.movementState?.().authority ?? null)).toBe(
    'external_collision',
  );
  await expect(page.locator('#animation-state')).toHaveText(/NONE NOT_STARTED/);
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.animationPlayback?.().selectedClip ?? null,
  )).toBeNull();
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.animationPlayback?.().status ?? null,
  )).toBe('not_started');
  const animationBefore = await page.evaluate(() => globalThis.ashaRendererSurface?.animationPlayback?.() ?? null);
  await page.waitForTimeout(250);
  const animationAfter = await page.evaluate(() => globalThis.ashaRendererSurface?.animationPlayback?.() ?? null);
  expect(animationBefore).toMatchObject({
    asset: 'mesh-animation/kenney-retro-character-medium',
    commandSelected: false,
    projectionOnly: true,
    selectedClip: null,
    status: 'not_started',
    controllerClips: [],
  });
  expect(animationAfter?.commandSelected).toBe(false);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.animationFrameReceipt?.().applied ?? null)).toBe(true);
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
  expect(backendStatus?.generatedTunnelOperation).toMatchObject({
    status: 'applied',
    presetId: 'tiny-enclosed',
    seed: 17,
    grid: 0,
    outputHash: '1471496d88d70647',
    runtimeFrame: {
      worldOffset: [-3.5, -1, -5.5],
      playableMin: [-2.5, 0, -4.5],
      playableMax: [2.5, 4, 4.5],
    },
  });
  expect(backendStatus?.generatedTunnelOperation?.collisionSourceHash).toMatch(/^[0-9a-f]{16}$/);
  expect(backendStatus?.generatedTunnelOperation?.collisionProjectionHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
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
  await page.locator('#move-speed-input').fill('4.5');
  await page.locator('#look-sensitivity-input').fill('0.15');
  await page.locator('#invert-y-input').check();
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().inputSettings ?? null)).toEqual({
    moveSpeedUnitsPerSecond: 4.5,
    lookSensitivityDegreesPerPixel: 0.15,
    invertY: true,
  });
  await page.locator('#exit-button').click();
  await expect(page.locator('#pause-menu-title')).toHaveText('ASHA Demo');
  await expect(page.locator('#menu-reset-button')).toHaveText('Start');
  await expect(page.locator('#resume-button')).toBeDisabled();
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().menuMode ?? null)).toBe('title');
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().lastMenuIntent?.kind ?? null)).toBe(
    'ui.exit_to_menu_intent',
  );
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

  const poseBeforeMove = await page.evaluate(() => globalThis.ashaRendererSurface?.cameraPose?.() ?? null);
  await canvas.click({ position: { x: 300, y: 240 } });
  await expect.poll(async () => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBe('asha-render-surface');
  await page.mouse.move(640, 360);
  await page.mouse.move(700, 320);
  const poseAfterLook = await page.evaluate(() => globalThis.ashaRendererSurface?.cameraPose?.() ?? null);
  expect(poseAfterLook?.yawDegrees).not.toBe(poseBeforeMove?.yawDegrees);
  expect(poseAfterLook?.pitchDegrees).not.toBe(poseBeforeMove?.pitchDegrees);
  await page.keyboard.down('KeyW');
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.movementState?.().collided ?? null,
  ), { timeout: 3000 }).toBe(true);
  const collisionState = await page.evaluate(() => ({
    pose: globalThis.ashaRendererSurface?.cameraPose?.() ?? null,
    movement: globalThis.ashaRendererSurface?.movementState?.() ?? null,
    evidence: globalThis.ashaRendererSurface?.runtimeCollisionEvidence?.() ?? null,
  }));
  await page.keyboard.up('KeyW');
  const poseAfterMove = collisionState.pose;
  expect(poseAfterMove?.position).not.toEqual(poseBeforeMove?.position);
  expect(Math.abs((poseAfterMove?.position?.[1] ?? Number.NaN) - (poseBeforeMove?.position?.[1] ?? Number.NaN))).toBeLessThan(
    0.00001,
  );
  expect(collisionState.movement?.authority).toBe('external_collision');
  expect(collisionState.movement?.collided).toBe(true);
  const collisionEvidence = collisionState.evidence;
  expect(collisionEvidence?.envelope?.movementMode).toBe('grounded');
  expect(collisionEvidence?.envelope?.grid).toBe(0);
  expect(collisionEvidence?.collisionSourceHash).toBe(backendStatus.generatedTunnelOperation.collisionSourceHash);
  expect(collisionEvidence?.collisionProjectionHash).toBe(backendStatus.generatedTunnelOperation.collisionProjectionHash);

  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.evaluate(() => globalThis.ashaRendererSurface?.reset?.());
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.cameraPose?.() ?? null)).toEqual({
    position: [0, 1.62, 1.5],
    pitchDegrees: 0,
    yawDegrees: 0,
  });
  await page.keyboard.down('KeyW');
  await page.clock.runFor(550);
  await page.keyboard.up('KeyW');
  await page.evaluate((movement) => {
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      movementX: movement.movementX,
      movementY: movement.movementY,
    }));
  }, { movementX: 0, movementY: -147 });
  await page.clock.runFor(100);
  const fireResult = await page.evaluate(() => globalThis.ashaRendererSurface?.firePrimary?.() ?? null);
  await page.clock.resume();
  expect(fireResult?.interaction?.shotsFired).toBe(1);
  expect(fireResult?.interaction?.remainingTargets).toBe(0);
  expect(fireResult?.runtime?.accepted).toBe(true);
  expect(fireResult?.runtime?.combatReadout?.outcome.kind).toBe('hit');
  expect(fireResult?.runtime?.gameplayTransform?.moduleId).toBe('demo.primary-fire-effect');
  expect(fireResult?.runtime?.gameplayTransform?.damageApplied).toBe(45);
  expect(fireResult?.runtime?.gameplayTransform?.decisionReceiptHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(fireResult?.runtime?.combatReadout?.replayHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(fireResult?.runtime?.gameplayTransform?.workspaceTrace).toContain(
    'ran Guard -> Transform -> React inside the composed gameplay Fabric',
  );
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.gameplayTransformState?.().moduleId ?? null),
  ).toBe('demo.primary-fire-effect');
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().shotsFired ?? null)).toBe(1);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().remainingTargets ?? null)).toBe(0);
  expect(
    await page.evaluate(() => {
      const enemy = globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entities.find(
        (entity) => entity.definitionStableId === 'actor/generated-tunnel-enemy',
      );
      return enemy?.capabilities.find((capability) => capability.kind === 'health') ?? null;
    }),
  ).toMatchObject({ kind: 'health', current: 0, max: 45, dead: true });
  expect(
    await page.evaluate(() =>
      globalThis.ashaRendererSurface?.runtimeTelemetry?.().replayRecords.some(
        (record) => record.kind === 'submitRuntimeActionIntent',
      ) ?? null,
    ),
  ).toBe(true);
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.audioProjectionEvidence?.() ?? null,
  )).toMatchObject({
    status: 'applied',
    authorityTick: 0,
    applied: 1,
    origin: {
      kind: 'ownerFact',
      authorityTick: 0,
    },
  });
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.audioProjectionEvidence?.().origin?.id ?? null),
  ).toMatch(/^combat\.primary-fire\.accepted:[0-9]+$/);
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.audioProjectionReadout?.().emittedSignals ?? null),
  ).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.animationProjectionEvidence?.() ?? null,
  )).toMatchObject({
    status: 'applied',
    authorityTick: 0,
    applied: 3,
    origin: { kind: 'ownerFact', authorityTick: 0 },
    controller: {
      stateId: 'ready',
      transition: {
        transitionId: 'ready.primary_fire',
        elapsedTicks: 1,
        durationTicks: 4,
        targetMotion: { clipA: 'run', clipB: 'jump', blendWeightMilli: 650 },
      },
      timingFact: {
        authorityTick: 0,
        controllerInputSequence: 3,
        controllerTick: 1,
        toStateId: 'primary_fire',
        moment: 'started',
      },
    },
  });
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.animationPlayback?.().controllerClips.map((clip) => clip.clip) ?? [],
  )).toEqual(expect.arrayContaining(['idle', 'run', 'jump']));
  const animationAuthorityProof = await page.evaluate(() => ({
    animation: globalThis.ashaRendererSurface?.animationProjectionEvidence?.() ?? null,
    audio: globalThis.ashaRendererSurface?.audioProjectionEvidence?.() ?? null,
    playback: globalThis.ashaRendererSurface?.animationPlayback?.() ?? null,
  }));
  expect(animationAuthorityProof.animation?.origin?.id).toBe(animationAuthorityProof.audio?.origin?.id);
  expect(animationAuthorityProof.playback).toMatchObject({
    commandSelected: false,
    projectionOnly: true,
    status: 'playing',
  });
  expect(animationAuthorityProof.playback?.controllerClips).toEqual(expect.arrayContaining([
    expect.objectContaining({ clip: 'idle' }),
    expect.objectContaining({ clip: 'run' }),
    expect.objectContaining({ clip: 'jump' }),
  ]));
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.animationSampledCueEvidence?.() ?? null,
  )).toMatchObject({
    status: 'applied',
    cue: {
      kind: 'asha.animation.sampled_cue.v1',
      cueId: 'demo.primary-fire.jump-impact',
      clip: 'jump',
      markerSeconds: 0.05,
      signal: { domain: 'particle', id: 'demo.primary-fire.jump-impact.local-vfx' },
      replayScope: 'excludedFromReplayTruth',
      authorityMutation: 'forbidden',
      origin: { kind: 'ownerFact', authorityTick: 0 },
    },
    realization: { applied: 1, diagnostics: [] },
  });
  const sampledCue = await page.evaluate(
    () => globalThis.ashaRendererSurface?.animationSampledCueEvidence?.() ?? null,
  );
  expect(sampledCue?.cue?.origin).toEqual(animationAuthorityProof.animation?.origin);
  await expect(page.locator('#animation-cue-state')).toContainText('JUMP @ 0.05S · APPLIED');
  await expect(page.locator('[data-asha-particle-id]').first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/5650/asha-demo-authority-animation-cue.png', fullPage: true });
  await page.screenshot({ path: 'artifacts/5603/asha-demo-primary-fire-particles.png', fullPage: true });
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.particleProjectionEvidence?.() ?? null,
  )).toMatchObject({
    status: 'applied',
    authorityTick: 0,
    applied: 1,
    droppedParticles: 0,
    origins: [{ kind: 'ownerFact', authorityTick: 0 }],
  });
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.telemetryOverlayEvidence?.() ?? null,
  )).toMatchObject({
    status: 'applied',
    authorityTick: 0,
    applied: 1,
    activeOverlays: 1,
  });
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.liveTelemetrySnapshot?.() ?? null,
  )).toMatchObject({
    schemaVersion: 1,
    metrics: expect.arrayContaining([
      expect.objectContaining({ counter: 'frameTimeMs', unit: 'ms' }),
      expect.objectContaining({ counter: 'entityCount', value: 2 }),
      expect.objectContaining({ counter: 'activeParticleCount', unit: 'count' }),
    ]),
    diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'counterUnavailable', counter: 'drawCallCount' }),
    ]),
  });
  expect(Number.isSafeInteger(await page.evaluate(
    () => globalThis.ashaRendererSurface?.liveTelemetrySnapshot?.().authorityTick ?? null,
  ))).toBe(true);
  const localToggle = await page.evaluate(() => {
    const before = globalThis.ashaRendererSurface?.liveTelemetrySnapshot?.() ?? null;
    const hidden = globalThis.ashaRendererSurface?.toggleTelemetryOverlay?.() ?? null;
    const after = globalThis.ashaRendererSurface?.liveTelemetrySnapshot?.() ?? null;
    return { before, hidden, after };
  });
  expect(localToggle.hidden).toBe(false);
  expect(localToggle.after).toEqual(localToggle.before);
  await expect(page.locator('[data-asha-telemetry-overlay-handle="1"]')).toBeHidden();
  expect(await page.evaluate(
    () => globalThis.ashaRendererSurface?.toggleTelemetryOverlay?.() ?? null,
  )).toBe(true);
  await expect(page.locator('[data-asha-telemetry-overlay-handle="1"]')).toBeVisible();
  await page.screenshot({ path: 'artifacts/5606/asha-demo-live-telemetry-overlay.png', fullPage: true });
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.billboardProjectionEvidence?.() ?? null,
  )).toMatchObject({
    status: 'applied',
    authorityTick: 0,
    applied: 2,
    origins: [
      { kind: 'ownerFact', authorityTick: 0 },
      { kind: 'ownerFact', authorityTick: 0 },
    ],
  });
  const particleProjection = await page.evaluate(
    () => globalThis.ashaRendererSurface?.particleProjectionEvidence?.() ?? null,
  );
  expect(particleProjection?.activeParticles).toBeGreaterThanOrEqual(12);
  expect(particleProjection?.emittedBursts).toBeGreaterThanOrEqual(1);
  const billboardReadout = await page.evaluate(
    () => globalThis.ashaRendererSurface?.billboardProjectionReadout?.() ?? null,
  );
  expect(billboardReadout?.activeBillboards).toBeGreaterThanOrEqual(4);
  expect(billboardReadout?.diagnostics).toEqual([]);
  expect(await page.locator('[data-asha-billboard-handle]').count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: /^Player$/ })).toHaveCount(1);
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: 'Enemy health: 0/45' })).toHaveCount(1);
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: 'Authored console' })).toHaveCount(1);
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: 'Player-placed console' })).toHaveCount(1);

  const integratedFeedback = await page.evaluate(() =>
    globalThis.ashaRendererSurface?.integratedFeedbackEvidence?.() ?? null,
  );
  expect(integratedFeedback).toMatchObject({
    status: 'applied',
    authorityTick: 0,
    replayScope: 'excludedFromReplayTruth',
    operationDomains: [
      'audio',
      'particle',
      'billboard',
      'billboard',
      'animation',
      'animation',
      'animation',
      'telemetryOverlay',
    ],
    originConsistent: true,
    domains: {
      audio: { applied: 1, diagnostics: 0 },
      billboard: { applied: 2, diagnostics: 0 },
      particle: { applied: 1, diagnostics: 0 },
      animation: { applied: 3, diagnostics: 0 },
      telemetryOverlay: { applied: 1, diagnostics: 0 },
    },
    diagnostics: [],
  });
  expect(Number.isSafeInteger(integratedFeedback?.hostGeneration)).toBe(true);
  expect(integratedFeedback?.origin).toEqual(animationAuthorityProof.animation?.origin);

  const rebuiltPresentation = await page.evaluate(async () =>
    await globalThis.ashaRendererSurface?.rebuildPresentationHosts?.() ?? null,
  );
  expect(rebuiltPresentation).toMatchObject({
    status: 'applied',
    hostGeneration: integratedFeedback.hostGeneration + 1,
    authorityUnchanged: true,
    controllerUnchanged: true,
    integratedFeedback: {
      status: 'applied',
      hostGeneration: integratedFeedback.hostGeneration + 1,
      originConsistent: true,
    },
  });
  expect(rebuiltPresentation?.sessionHashAfter).toBe(rebuiltPresentation?.sessionHashBefore);
  expect(await page.locator('[data-asha-billboard-handle]').count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('[data-asha-particle-id]').first()).toBeVisible();
  await expect(page.locator('[data-asha-telemetry-overlay-handle="1"]')).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  // The first Chromium capture primes the WebGL drawing buffer; overwrite it
  // immediately so the committed artifact includes both canvas and DOM hosts.
  await page.screenshot({ path: 'artifacts/5654/asha-demo-integrated-feedback.png', fullPage: true });
  await page.screenshot({ path: 'artifacts/5654/asha-demo-integrated-feedback.png', fullPage: true });
  await page.screenshot({ path: 'artifacts/5654/asha-demo-rebuilt-feedback-hosts.png', fullPage: true });

  for (const domain of ['audio', 'particle', 'font', 'overlay']) {
    const degradation = await page.evaluate(async (value) =>
      await globalThis.ashaRendererSurface?.exercisePresentationDegradation?.(value) ?? null,
    domain);
    expect(degradation).toMatchObject({
      status: 'degraded',
      authorityUnchanged: true,
      cases: expect.arrayContaining([expect.objectContaining({
        domain,
        status: 'visibleFailure',
        applied: 0,
      })]),
    });
  }
  const degradation = await page.evaluate(
    () => globalThis.ashaRendererSurface?.presentationDegradationEvidence?.() ?? null,
  );
  expect(degradation).toMatchObject({
    status: 'degraded',
    authorityUnchanged: true,
    cases: [
      { domain: 'audio', code: 'hostFailure', status: 'visibleFailure', applied: 0 },
      { domain: 'particle', code: 'spriteLoadFailed', status: 'visibleFailure', applied: 0 },
      { domain: 'font', code: 'fontLoadFailed', status: 'visibleFailure', applied: 0 },
      { domain: 'overlay', code: 'hostFailure', status: 'visibleFailure', applied: 0 },
    ],
  });
  expect(degradation?.cases.map((value) => value.origin)).toEqual([
    integratedFeedback.origin,
    integratedFeedback.origin,
    integratedFeedback.origin,
    integratedFeedback.origin,
  ]);
  await expect(page.locator('#presentation-degradation-state')).toContainText('AUDIO:HOST_FAILURE');
  await expect(page.locator('#presentation-degradation-state')).toContainText('PARTICLE:SPRITE_LOAD_FAILED');
  await expect(page.locator('#presentation-degradation-state')).toContainText('FONT:FONT_LOAD_FAILED');
  await expect(page.locator('#presentation-degradation-state')).toContainText('OVERLAY:HOST_FAILURE');
  await page.screenshot({ path: 'artifacts/5654/asha-demo-independent-feedback-degradation.png', fullPage: true });
  await page.screenshot({ path: 'artifacts/5654/asha-demo-independent-feedback-degradation.png', fullPage: true });

  await page.evaluate(() => globalThis.ashaRendererSurface?.reset?.());
  await expect(page.locator('[data-asha-telemetry-overlay-handle]')).toHaveCount(0);
  await expect(page.locator('[data-asha-billboard-handle]')).toHaveCount(2);
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: 'Authored console' })).toBeVisible();
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: 'Player-placed console' })).toBeVisible();
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: /^Player$/ })).toHaveCount(0);
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: 'Enemy health' })).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().shotsFired ?? null)).toBe(0);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().actionTick ?? null)).toBe(0);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().remainingTargets ?? null)).toBe(1);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().restartCount ?? null)).toBe(4);
  expect(
    await page.evaluate(() => {
      const enemy = globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entities.find(
        (entity) => entity.definitionStableId === 'actor/generated-tunnel-enemy',
      );
      return enemy?.capabilities.find((capability) => capability.kind === 'health') ?? null;
    }),
  ).toMatchObject({ kind: 'health', current: 45, max: 45, dead: false });
  expect(
    await page.evaluate(() => {
      const player = globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entities.find(
        (entity) => entity.definitionStableId === 'actor/demo-player',
      );
      return player?.capabilities.find((capability) => capability.kind === 'health') ?? null;
    }),
  ).toMatchObject({ kind: 'health', current: 100, max: 100, dead: false });
});

test('@live-agent asha-demo restores a defeated session through every player restart control', async ({ page }) => {
  test.setTimeout(60_000);

  const baseUrl = brokerBaseUrl();
  expect(baseUrl, 'live UI smoke must use broker-provided BASE_URL').not.toBeNull();
  await page.goto('/');
  await page.waitForFunction(() => globalThis.ashaRendererSurface?.runtimeBackendStatus?.()?.status !== undefined);

  const backendStatus = await page.evaluate(() => globalThis.ashaRendererSurface?.runtimeBackendStatus?.() ?? null);
  test.skip(backendStatus?.status === 'missing_rust_backend', 'native browser-host authority is unavailable');
  expect(backendStatus?.status).toBe('rust_authority');

  const defeatPlayer = async () => page.evaluate(() => {
    for (let index = 0; index < 36; index += 1) {
      globalThis.ashaRendererSurface?.tickEnemyPolicy?.();
      if (globalThis.ashaRendererSurface?.interactionState?.().playerDead) {
        break;
      }
    }
    return globalThis.ashaRendererSurface?.interactionState?.() ?? null;
  });
  const expectRestart = async (restart) => {
    const defeated = await defeatPlayer();
    expect(defeated?.playerDead).toBe(true);
    const restartCount = defeated?.restartCount;

    await restart();
    await expect.poll(async () => page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.() ?? null)).toMatchObject({
      playerDead: false,
      playerHealth: 100,
      remainingTargets: 1,
      restartCount: restartCount + 1,
    });
  };

  await expectRestart(() => page.locator('#reset-button').click());
  await expectRestart(async () => {
    await page.locator('#pause-button').click();
    await page.locator('#menu-reset-button').click();
  });
});

test('@live-agent gameplay fabric drives the close-range tunnel challenge', async ({ page }) => {
  test.setTimeout(60_000);
  const baseUrl = brokerBaseUrl();
  expect(baseUrl, 'live UI smoke must use broker-provided BASE_URL').not.toBeNull();
  await page.goto('/');
  await page.waitForFunction(() => globalThis.ashaRendererSurface?.runtimeBackendStatus?.()?.status !== undefined);

  const backend = await page.evaluate(() => globalThis.ashaRendererSurface?.runtimeBackendStatus?.() ?? null);
  test.skip(backend?.status === 'missing_rust_backend', 'native browser-host authority is unavailable');
  expect(backend?.status).toBe('rust_authority');
  const initial = await page.evaluate(() => ({
    challenge: globalThis.ashaRendererSurface?.gameplayChallengeState?.() ?? null,
    readout: globalThis.ashaRendererSurface?.gameplayRuntimeReadout?.() ?? null,
    composed: globalThis.ashaRendererSurface?.composedRuntimeReadout?.() ?? null,
    prefabAuthoring: globalThis.ashaRendererSurface?.prefabAuthoringReadout?.() ?? null,
    prefabInteraction: globalThis.ashaRendererSurface?.prefabInteractionReceipt?.() ?? null,
    prefabProjection: globalThis.ashaRendererSurface?.prefabPlacementProjection?.() ?? null,
  }));
  expect(initial.challenge).toMatchObject({ status: 'armed', score: 0, closeRangeHits: 0, triggerEntries: 0 });
  expect(initial.readout?.bindingRegistryHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(initial.readout?.semanticCompatibilityDigest).toBe('fnv1a64:d5d1f26cc8272072');
  expect(initial.readout?.compatibilityDiagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({
      code: 'artifactProvenanceMismatch',
      severity: 'warning',
    }),
  ]));
  expect(initial.readout?.authorityStateHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(initial.readout).toMatchObject({
    schedulerPendingActionCount: 0,
    schedulerOutstandingDispatchCount: 0,
    schedulerFactCount: 0,
    schedulerTruncated: false,
  });
  expect(initial.composed?.runtimeSessionHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(initial.composed?.gameplay?.gameplayRegistryDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(initial.prefabAuthoring?.definitions).toHaveLength(1);
  expect(initial.prefabAuthoring?.selected?.roles?.map((role) => role.role)).toEqual([
    'console/body',
    'interaction/sensor',
  ]);
  expect(initial.prefabAuthoring?.instances?.map((instance) => instance.origin)).toEqual(['authored', 'player']);
  expect(initial.prefabAuthoring?.bindings?.[0]).toMatchObject({
    role: 'interaction/sensor',
    instanceOverrides: [
      { instance: 700, configurationId: 'demo.primary-fire-effect.console-blue' },
      { instance: 701, configurationId: 'demo.primary-fire-effect.console-red' },
    ],
  });
  expect(initial.prefabInteraction).toMatchObject({
    actor: 30,
    instance: 701,
    role: 'interaction/sensor',
    target: 1585192660180873,
  });
  expect(initial.prefabInteraction?.reactionFrameHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(initial.prefabProjection).toMatchObject({ applied: 2, diagnostics: [] });
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: 'Authored console' })).toBeVisible();
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: 'Player-placed console' })).toBeVisible();

  await page.locator('#lock-button').click();
  await expect.poll(async () => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBe('asha-render-surface');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(550);
  await page.keyboard.up('KeyW');
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.gameplayChallengeState?.().triggerEntries ?? 0,
  )).toBeGreaterThanOrEqual(1);

  const entered = await page.evaluate(() => ({
    challenge: globalThis.ashaRendererSurface?.gameplayChallengeState?.() ?? null,
    readout: globalThis.ashaRendererSurface?.gameplayRuntimeReadout?.() ?? null,
  }));
  expect(entered.challenge).toMatchObject({ status: 'outside' });
  expect(entered.challenge?.revision).toBeGreaterThanOrEqual(2);
  expect(entered.readout?.reactionFrameCount).toBeGreaterThan(initial.readout?.reactionFrameCount);
  expect(entered.readout?.runtimeHostHash).not.toBe(initial.readout?.runtimeHostHash);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(100);
  await page.keyboard.up('KeyW');
  await page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      movementX: 0,
      movementY: 400,
    }));
  });
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.cameraPose?.().pitchDegrees ?? 0,
  )).toBeLessThan(-20);
  const action = await page.evaluate(() => globalThis.ashaRendererSurface?.firePrimary?.() ?? null);
  expect(action?.runtime?.accepted).toBe(true);
  expect(action?.runtime?.combatReadout?.outcome?.kind).toBe('hit');
  expect(action?.runtime?.gameplayTransform?.damageApplied).toBe(45);
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.gameplayChallengeState?.() ?? null,
  )).toMatchObject({ status: 'completed', score: 6, closeRangeHits: 1 });

  const completed = await page.evaluate(() => ({
    challenge: globalThis.ashaRendererSurface?.gameplayChallengeState?.() ?? null,
    label: document.querySelector('#challenge-state')?.textContent ?? null,
    readout: globalThis.ashaRendererSurface?.gameplayRuntimeReadout?.() ?? null,
  }));
  expect(completed.label).toContain('COMPLETED 6/6');
  expect(completed.challenge?.reactionFrameCount).toBeGreaterThanOrEqual(4);
  expect(completed.readout?.decisionReceiptCount).toBeGreaterThanOrEqual(1);
  expect(completed.readout?.lastDecisionReceiptHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  await page.screenshot({ path: 'artifacts/5636/asha-demo-gameplay-fabric.png', fullPage: true });
  await page.screenshot({ path: 'artifacts/5646/asha-demo-prefab-placement.png', fullPage: true });

});

test('@live-agent far primary fire preserves base damage through the composed Transform', async ({ page }) => {
  test.setTimeout(60_000);
  const baseUrl = brokerBaseUrl();
  expect(baseUrl, 'live UI smoke must use broker-provided BASE_URL').not.toBeNull();
  await page.clock.install();
  await page.goto('/');
  await page.waitForFunction(() => globalThis.ashaRendererSurface?.runtimeBackendStatus?.()?.status === 'rust_authority');
  await page.locator('#lock-button').click();
  await expect.poll(async () => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBe('asha-render-surface');
  await page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      movementX: 0,
      movementY: 100,
    }));
  });
  await page.clock.runFor(100);

  const farFire = await page.evaluate(() => globalThis.ashaRendererSurface?.firePrimary?.() ?? null);
  expect(farFire?.runtime?.accepted).toBe(true);
  expect(farFire?.runtime?.combatReadout?.outcome.kind).toBe('hit');
  expect(farFire?.runtime?.gameplayTransform).toMatchObject({
    moduleId: 'demo.primary-fire-effect',
    status: 'accepted',
    damageApplied: 40,
  });
  expect(farFire?.runtime?.combatReadout?.events).toContainEqual({
    kind: 'damage_applied',
    target: 20,
    amount: 40,
    before: 45,
    after: 5,
  });
  expect(farFire?.runtime?.combatReadout?.health).toContainEqual({
    entity: 20,
    current: 5,
    max: 45,
    dead: false,
  });
});

test('@live-agent accepted transformed hit verification-replays from frozen camera authority', async ({ page }) => {
  test.setTimeout(60_000);
  const baseUrl = brokerBaseUrl();
  expect(baseUrl, 'live UI smoke must use broker-provided BASE_URL').not.toBeNull();
  await page.clock.install();
  await page.goto('/');
  await page.waitForFunction(() => globalThis.ashaRendererSurface?.runtimeBackendStatus?.()?.status === 'rust_authority');
  await page.locator('#lock-button').click();
  await expect.poll(async () => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBe('asha-render-surface');

  await page.keyboard.down('KeyW');
  await page.clock.runFor(550);
  await page.keyboard.up('KeyW');
  await page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      movementX: 0,
      movementY: 220,
    }));
  });
  await page.clock.runFor(100);
  await page.mouse.down();
  await page.mouse.up();
  await page.clock.runFor(50);
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.inputAuthorityState?.().recordedGameplayActions.length ?? 0,
  )).toBe(1);

  const replay = await page.evaluate(() => globalThis.ashaRendererSurface?.replayRecordedInput?.() ?? null);
  expect(replay).toMatchObject({
    accepted: true,
    sameOutcomes: true,
    samePauseOutcomes: true,
    sameGameplayOutcomes: true,
    duplicateRejected: true,
    duplicateDiagnostics: ['replayAlreadyDelivered'],
  });
  expect(replay?.recordHashes).toHaveLength(1);
  expect(replay?.sourceGameplayOutcomes[0]).toMatchObject({
    actionId: 'gameplay.primaryFire',
    accepted: true,
    outcome: {
      kind: 'hit',
      targetHealthBefore: { current: 45, max: 45 },
      targetHealthAfter: { current: 0, max: 45 },
    },
    gameplayTransform: {
      status: 'accepted',
      damageApplied: 45,
    },
  });
  expect(replay?.sourceGameplayOutcomes[0]?.outcome).toEqual(replay?.replayGameplayOutcomes[0]?.outcome);
  expect(replay?.sourceGameplayOutcomes[0]?.cameraPose).toEqual(replay?.replayGameplayOutcomes[0]?.cameraPose);
  expect(replay?.sourceGameplayOutcomes[0]?.gameplayTransform?.damageApplied)
    .toBe(replay?.replayGameplayOutcomes[0]?.gameplayTransform?.damageApplied);
  expect(replay?.sourceGameplayOutcomes[0]?.gameplayTransform?.decisionReceiptHash)
    .toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(replay?.replayGameplayOutcomes[0]?.gameplayTransform?.decisionReceiptHash)
    .toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(replay?.sourceGameplayOutcomes[0]?.gameplayTransform?.reactionFrameHash)
    .toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(replay?.replayGameplayOutcomes[0]?.gameplayTransform?.reactionFrameHash)
    .toMatch(/^fnv1a64:[0-9a-f]{16}$/);
});

test('@live-agent asha-demo rejects spoofed native RuntimeBridge providers', async ({ page }) => {
  const baseUrl = brokerBaseUrl();
  expect(baseUrl, 'live UI smoke must use broker-provided BASE_URL').not.toBeNull();

  await page.addInitScript(() => {
    const spoofedProvider = Object.freeze({
      kind: 'asha.runtime_bridge.native_rust_provider.v1',
      backend: 'native_rust',
      productAuthority: true,
      referenceFallback: false,
      browserHostCompatibilityVersion: 'browser-host.v0',
      browserHostSessionId: 'spoofed-session',
      createRuntimeBridge() {
        return {
          initializeEngine() {
            return 1;
          },
        };
      },
    });
    Object.defineProperty(globalThis, 'ashaRuntimeBridge', {
      configurable: true,
      get: () => spoofedProvider,
      set: () => undefined,
    });
  });

  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => globalThis.ashaRendererSurface?.kind ?? null))
    .toBe('asha_renderer_surface.v0');
  const backendStatus = await page.evaluate(() => globalThis.ashaRendererSurface?.runtimeBackendStatus?.() ?? null);
  expect(backendStatus?.status).toBe('missing_rust_backend');
  expect(backendStatus?.diagnostics?.[0]?.message).toMatch(
    /rejected non-native RuntimeBridge provider|missing required operation/,
  );
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.projectContentStatus?.().runtimeLoaded ?? null)).toBe(false);
  await expect(page.locator('#fire-button')).toBeDisabled();
});

test('@live-agent resolved input owns pause, consumption, resume, and semantic replay', async ({ page }) => {
  test.setTimeout(60_000);
  const baseUrl = brokerBaseUrl();
  expect(baseUrl, 'live UI smoke must use broker-provided BASE_URL').not.toBeNull();

  await page.goto('/');
  await page.waitForFunction(() => globalThis.ashaRendererSurface?.runtimeBackendStatus?.()?.status !== undefined);
  const backend = await page.evaluate(() => globalThis.ashaRendererSurface?.runtimeBackendStatus?.() ?? null);
  expect(backend?.status).toBe('rust_authority');

  const canvas = page.locator('#asha-render-surface');
  await page.locator('#lock-button').click();
  await expect.poll(async () => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBe('asha-render-surface');

  const beforePause = await page.evaluate(() => ({
    camera: globalThis.ashaRendererSurface?.cameraPose?.() ?? null,
    input: globalThis.ashaRendererSurface?.inputAuthorityState?.() ?? null,
  }));
  expect(beforePause.input?.context?.activeContexts.map((entry) => entry.contextId)).toEqual(['gameplay']);
  expect(beforePause.input?.time?.mode).toBe('running');

  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-menu')).toBeVisible();
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.inputAuthorityState?.().time.mode ?? null,
  )).toBe('paused');

  const pausedBeforeBlockedInput = await page.evaluate(() => globalThis.ashaRendererSurface?.inputAuthorityState?.() ?? null);
  expect(pausedBeforeBlockedInput?.context?.activeContexts.map((entry) => entry.contextId)).toEqual(['gameplay', 'menu']);
  expect(pausedBeforeBlockedInput?.recordedPauseActions).toHaveLength(1);
  expect(pausedBeforeBlockedInput?.recordedPauseActions[0]).toMatchObject({
    actionId: 'runtime.time.pause',
    contextId: 'gameplay',
  });
  expect(pausedBeforeBlockedInput?.recordedPauseActions[0]?.recordHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);

  await page.keyboard.down('KeyW');
  await page.mouse.move(700, 320);
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyW');
  const pausedAfterBlockedInput = await page.evaluate(() => ({
    camera: globalThis.ashaRendererSurface?.cameraPose?.() ?? null,
    input: globalThis.ashaRendererSurface?.inputAuthorityState?.() ?? null,
    interaction: globalThis.ashaRendererSurface?.firePrimary?.() ?? null,
  }));
  expect(pausedAfterBlockedInput.camera).toEqual(beforePause.camera);
  expect(pausedAfterBlockedInput.input?.time?.authorityTick).toBe(pausedBeforeBlockedInput?.time?.authorityTick);
  expect(pausedAfterBlockedInput.input?.hudFrameCount).toBeGreaterThan(pausedBeforeBlockedInput?.hudFrameCount ?? 0);
  expect(pausedAfterBlockedInput.interaction?.runtime).toBeNull();
  expect(pausedAfterBlockedInput.interaction?.interaction?.fireBlockedReasons).toContain('paused');
  expect(pausedAfterBlockedInput.input?.host?.recentDeliveries.some(
    (delivery) => delivery.sample.control === 'KeyW'
      && delivery.receipt.action === null
      && delivery.receipt.consumed,
  )).toBe(true);

  await page.locator('#options-button').click();
  await expect(page.locator('#options-pane')).toBeVisible();
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().menuMode ?? null)).toBe('options');

  await canvas.evaluate((node) => node.focus());
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-menu')).toBeHidden();
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.inputAuthorityState?.().time.mode ?? null,
  )).toBe('running');

  const resumed = await page.evaluate(() => globalThis.ashaRendererSurface?.inputAuthorityState?.() ?? null);
  expect(resumed?.context?.activeContexts.map((entry) => entry.contextId)).toEqual(['gameplay']);
  expect(resumed?.recordedPauseActions.map((record) => record.actionId)).toEqual([
    'runtime.time.pause',
    'runtime.time.resume',
  ]);
  expect(resumed?.recordedPauseOutcomes.map((outcome) => outcome.timeMode)).toEqual(['paused', 'running']);

  await page.locator('#lock-button').click();
  await expect.poll(async () => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBe('asha-render-surface');
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.inputAuthorityState?.().recordedGameplayActions.length ?? 0,
  )).toBe(1);
  const recordedGameplay = await page.evaluate(
    () => globalThis.ashaRendererSurface?.inputAuthorityState?.().recordedGameplayOutcomes[0] ?? null,
  );
  expect(recordedGameplay).toMatchObject({
    actionId: 'gameplay.primaryFire',
    accepted: true,
    outcome: {
      kind: 'miss',
    },
  });

  const replay = await page.evaluate(() => globalThis.ashaRendererSurface?.replayRecordedInput?.() ?? null);
  expect(replay).toMatchObject({
    accepted: true,
    sameOutcomes: true,
    samePauseOutcomes: true,
    sameGameplayOutcomes: true,
    duplicateRejected: true,
    duplicateDiagnostics: ['replayAlreadyDelivered'],
  });
  expect(replay?.recordHashes).toHaveLength(3);
  expect(replay?.replayHashes).toHaveLength(3);
  expect(replay?.replayHashes.every((hash) => /^fnv1a64:[0-9a-f]{16}$/.test(hash))).toBe(true);
  expect(replay?.sourceOutcomes.map((outcome) => ({
    actionId: outcome.actionId,
    accepted: outcome.accepted,
    contextIds: outcome.contextIds,
    timeMode: outcome.timeMode,
  }))).toEqual(replay?.replayOutcomes.map((outcome) => ({
    actionId: outcome.actionId,
    accepted: outcome.accepted,
    contextIds: outcome.contextIds,
    timeMode: outcome.timeMode,
  })));
  expect(replay?.sourceOutcomes.every(
    (outcome) => /^fnv1a64:[0-9a-f]{16}$/.test(outcome.contextHash)
      && /^fnv1a64:[0-9a-f]{16}$/.test(outcome.timeStateHash),
  )).toBe(true);
  expect(replay?.replayOutcomes.every(
    (outcome) => /^fnv1a64:[0-9a-f]{16}$/.test(outcome.contextHash)
      && /^fnv1a64:[0-9a-f]{16}$/.test(outcome.timeStateHash),
  )).toBe(true);
  expect(replay?.sourceGameplayOutcomes[0]?.outcome).toEqual(replay?.replayGameplayOutcomes[0]?.outcome);
  expect(replay?.sourceGameplayOutcomes[0]?.cameraPose).toEqual(replay?.replayGameplayOutcomes[0]?.cameraPose);
  expect(replay?.sourceGameplayOutcomes[0]?.replayHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(replay?.replayGameplayOutcomes[0]?.replayHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(replay?.replayGameplayOutcomes[0]).toMatchObject({
    actionId: 'gameplay.primaryFire',
    accepted: true,
    outcome: { kind: 'miss' },
  });
  expect(replay?.finalContext?.activeContexts.map((entry) => entry.contextId)).toEqual(['gameplay']);
  expect(replay?.finalTime?.mode).toBe('running');

  await page.evaluate(() => document.exitPointerLock?.());
  await page.locator('#lock-button').click();
  await expect.poll(async () => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBe('asha-render-surface');
  const cameraBeforeRestoredMovement = await page.evaluate(() => globalThis.ashaRendererSurface?.cameraPose?.() ?? null);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(350);
  await page.keyboard.up('KeyW');
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.cameraPose?.().position ?? null,
  )).not.toEqual(cameraBeforeRestoredMovement?.position);
});
