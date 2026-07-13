import { expect, test } from '@playwright/test';

function brokerBaseUrl() {
  return process.env.PLAYWRIGHT_BROKER_BASE_URL ?? process.env.BASE_URL ?? null;
}

test('@live-agent asha-demo mounts the upstream ASHA renderer surface', async ({ page }) => {
  test.setTimeout(45_000);
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
    await page.evaluate(() => globalThis.ashaRendererSurface?.projectContentStatus?.().gameRuleModules?.[0]?.moduleId ?? null),
  ).toBe('demo.primary_fire_effect');
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
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  const poseAfterMove = await page.evaluate(() => globalThis.ashaRendererSurface?.cameraPose?.() ?? null);
  expect(poseAfterMove?.position).not.toEqual(poseBeforeMove?.position);
  expect(Math.abs((poseAfterMove?.position?.[1] ?? Number.NaN) - (poseBeforeMove?.position?.[1] ?? Number.NaN))).toBeLessThan(
    0.00001,
  );
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.movementState?.().authority ?? null)).toBe(
    'external_collision',
  );
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.movementState?.().collided ?? null)).toBe(true);
  const collisionEvidence = await page.evaluate(() => globalThis.ashaRendererSurface?.runtimeCollisionEvidence?.() ?? null);
  expect(collisionEvidence?.envelope?.movementMode).toBe('grounded');
  expect(collisionEvidence?.envelope?.grid).toBe(0);
  expect(collisionEvidence?.collisionSourceHash).toBe(backendStatus.generatedTunnelOperation.collisionSourceHash);
  expect(collisionEvidence?.collisionProjectionHash).toBe(backendStatus.generatedTunnelOperation.collisionProjectionHash);

  await page.evaluate(() => globalThis.ashaRendererSurface?.reset?.());
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.cameraPose?.() ?? null)).toEqual({
    position: [0, 1.62, 1.5],
    pitchDegrees: 0,
    yawDegrees: 0,
  });
  await page.evaluate((movement) => {
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      movementX: movement.movementX,
      movementY: movement.movementY,
    }));
  }, { movementX: 0, movementY: -60 });
  await page.waitForTimeout(100);
  const fireResult = await page.evaluate(() => globalThis.ashaRendererSurface?.firePrimary?.() ?? null);
  expect(fireResult?.interaction?.shotsFired).toBe(1);
  expect(fireResult?.interaction?.remainingTargets).toBe(0);
  expect(fireResult?.runtime?.accepted).toBe(true);
  expect(fireResult?.runtime?.combatReadout?.outcome.kind).toBe('hit');
  expect(fireResult?.runtime?.hookReceipt?.moduleRef.moduleId).toBe('demo.primary_fire_effect');
  expect(fireResult?.runtime?.replayEvidence?.replayHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(await page.locator('#event-state').textContent()).toContain('demo.primary_fire_effect');
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.gameRuleEffectState?.().moduleRef.moduleId ?? null),
  ).toBe('demo.primary_fire_effect');
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
        (record) => record.kind === 'submitGameExtensionWeaponEffect',
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
  ).toBe(1);
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
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.particleProjectionEvidence?.() ?? null,
  )).toMatchObject({
    status: 'applied',
    authorityTick: 0,
    applied: 1,
    activeParticles: 12,
    emittedBursts: 1,
    droppedParticles: 0,
    origins: [{ kind: 'ownerFact', authorityTick: 0 }],
  });
  await expect(page.locator('[data-asha-particle-id]').first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/5650/asha-demo-authority-animation-cue.png', fullPage: true });
  await page.screenshot({ path: 'artifacts/5650/asha-demo-authority-animation-cue.png', fullPage: true });
  await page.screenshot({ path: 'artifacts/5603/asha-demo-primary-fire-particles.png', fullPage: true });
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
    authorityTick: 0,
    metrics: expect.arrayContaining([
      expect.objectContaining({ counter: 'frameTimeMs', unit: 'ms' }),
      expect.objectContaining({ counter: 'entityCount', value: 2 }),
      expect.objectContaining({ counter: 'activeParticleCount', unit: 'count' }),
    ]),
    diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'counterUnavailable', counter: 'drawCallCount' }),
    ]),
  });
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
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.billboardProjectionReadout?.() ?? null),
  ).toMatchObject({ activeBillboards: 4, diagnostics: [] });
  await expect(page.locator('[data-asha-billboard-handle]')).toHaveCount(4);
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: /^Player$/ })).toBeVisible();
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: 'Enemy health: 0/40' })).toBeVisible();
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: 'Authored console' })).toBeVisible();
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: 'Player-placed console' })).toBeVisible();

  const integratedFeedback = await page.evaluate(() =>
    globalThis.ashaRendererSurface?.integratedFeedbackEvidence?.() ?? null,
  );
  expect(integratedFeedback).toMatchObject({
    status: 'applied',
    authorityTick: 0,
    replayScope: 'excludedFromReplayTruth',
    hostGeneration: 1,
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
  expect(integratedFeedback?.origin).toEqual(animationAuthorityProof.animation?.origin);

  const rebuiltPresentation = await page.evaluate(async () =>
    await globalThis.ashaRendererSurface?.rebuildPresentationHosts?.() ?? null,
  );
  expect(rebuiltPresentation).toMatchObject({
    status: 'applied',
    hostGeneration: 2,
    authorityUnchanged: true,
    controllerUnchanged: true,
    integratedFeedback: {
      status: 'applied',
      hostGeneration: 2,
      originConsistent: true,
    },
  });
  expect(rebuiltPresentation?.sessionHashAfter).toBe(rebuiltPresentation?.sessionHashBefore);
  await expect(page.locator('[data-asha-billboard-handle]')).toHaveCount(4);
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
    snapshot: globalThis.ashaRendererSurface?.gameplaySnapshot?.() ?? null,
    prefabAuthoring: globalThis.ashaRendererSurface?.prefabAuthoringReadout?.() ?? null,
    prefabRuntime: globalThis.ashaRendererSurface?.prefabRuntimeReadout?.() ?? null,
    prefabProjection: globalThis.ashaRendererSurface?.prefabPlacementProjection?.() ?? null,
  }));
  expect(initial.challenge).toMatchObject({ status: 'armed', score: 0, closeRangeHits: 0, triggerEntries: 0 });
  expect(initial.readout?.bindingRegistryHash).toBe('fnv1a64:57e695629fd31d9d');
  expect(initial.readout?.authorityStateHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(initial.readout?.scheduler).toMatchObject({
    ownerId: 'authority.asha-demo.scheduler',
    pendingActionCount: 0,
    outstandingDispatchCount: 0,
    factCount: 0,
    truncated: false,
  });
  expect(initial.snapshot?.kind).toBe('gameplay_runtime_host.snapshot.v1');
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
  expect(initial.prefabRuntime?.prefabs?.instances).toHaveLength(2);
  expect(initial.prefabRuntime?.prefabs?.acceptedCommands?.map((command) => command.origin)).toEqual(['authored', 'player']);
  expect(initial.prefabRuntime?.moduleStates).toHaveLength(3);
  expect(initial.prefabRuntime?.moduleStates?.some((state) =>
    state.scope.kind === 'entity'
    && state.revision === 1
    && state.initializedFrom.includes('demo.primary-fire-effect.console-red')
  )).toBe(true);
  expect(initial.prefabProjection).toMatchObject({ applied: 2, diagnostics: [] });
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: 'Authored console' })).toBeVisible();
  await expect(page.locator('[data-asha-billboard-handle]').filter({ hasText: 'Player-placed console' })).toBeVisible();

  const canvas = page.locator('#asha-render-surface');
  await canvas.click({ position: { x: 300, y: 240 } });
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
  expect(entered.challenge).toMatchObject({ status: 'outside', lastAction: 'challenge-exited' });
  expect(entered.readout?.recentFrames?.some((frame) => frame.deliveredEvents?.some(
    (event) => event.event?.namespace === 'asha.trigger' && event.event?.name === 'exited',
  ))).toBe(true);
  const triggerFrame = entered.readout?.recentFrames?.find(
    (frame) => frame.routing?.some((routing) => routing.ownerId === 'authority.capability-activation'),
  );
  expect(triggerFrame?.frozenViewHashes?.length).toBeGreaterThan(0);
  expect(triggerFrame?.routing?.[0]).toMatchObject({ accepted: true, ownerId: 'authority.capability-activation' });

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(100);
  await page.keyboard.up('KeyW');
  await page.mouse.move(300, 530);
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.cameraPose?.().pitchDegrees ?? 0,
  )).toBeLessThan(-20);
  const action = await page.evaluate(() => globalThis.ashaRendererSurface?.firePrimary?.() ?? null);
  expect(action?.runtime?.accepted).toBe(true);
  expect(action?.runtime?.combatReadout?.outcome?.kind).toBe('hit');
  await expect.poll(async () => page.evaluate(
    () => globalThis.ashaRendererSurface?.gameplayChallengeState?.() ?? null,
  )).toMatchObject({ status: 'completed', score: 6, closeRangeHits: 1, lastAction: 'lifecycle-observed' });

  const completed = await page.evaluate(() => ({
    challenge: globalThis.ashaRendererSurface?.gameplayChallengeState?.() ?? null,
    label: document.querySelector('#challenge-state')?.textContent ?? null,
    readout: globalThis.ashaRendererSurface?.gameplayRuntimeReadout?.() ?? null,
  }));
  expect(completed.label).toContain('COMPLETED 6/6');
  expect(completed.challenge?.recentFrameHashes?.length).toBeGreaterThanOrEqual(4);
  expect(completed.readout?.recentFrames?.flatMap((frame) => frame.acceptedModuleFactHashes).length).toBeGreaterThanOrEqual(4);
  await page.screenshot({ path: 'artifacts/5636/asha-demo-gameplay-fabric.png', fullPage: true });
  await page.screenshot({ path: 'artifacts/5646/asha-demo-prefab-placement.png', fullPage: true });

  const restored = await page.evaluate((snapshot) => ({
    receipt: globalThis.ashaRendererSurface?.restoreGameplaySnapshot?.(snapshot) ?? null,
    challenge: globalThis.ashaRendererSurface?.gameplayChallengeState?.() ?? null,
  }), initial.snapshot);
  expect(restored.receipt?.accepted).toBe(true);
  expect(restored.challenge).toMatchObject({ status: 'armed', score: 0, closeRangeHits: 0, triggerEntries: 0 });

  const schedulerProof = await page.evaluate(() => {
    const hashPayload = (bytes) => {
      let hash = 0xcbf29ce484222325n;
      let length = BigInt(bytes.length);
      const input = [];
      for (let index = 0; index < 8; index += 1) {
        input.push(Number(length & 0xffn));
        length >>= 8n;
      }
      input.push(...bytes);
      for (const byte of input) {
        hash ^= BigInt(byte);
        hash = BigInt.asUintN(64, hash * 0x100000001b3n);
      }
      return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
    };
    const payload = { entity: 20, capability: 'collision', action: 'deactivate' };
    const canonicalPayload = Array.from(new TextEncoder().encode(JSON.stringify(payload)));
    const actionId = 'asha-demo.scheduler.disable-enemy-collision';
    const scheduler = globalThis.ashaRendererSurface;
    const schedule = scheduler.advanceGameplayRuntime({
      kind: 'schedulerCommand',
      command: {
        kind: 'scheduleTick',
        action: {
          id: actionId,
          executeAt: 5,
          priority: 0,
          proposal: {
            proposalId: `${actionId}.proposal`,
            proposal: {
              namespace: 'asha.entity',
              name: 'set-capability-activation',
              version: 1,
              schemaHash: 'fnv1a64:dd60efc4b5133917',
            },
            tick: 0,
            rootSequence: 5,
            wave: 0,
            proposalSequence: 0,
            emitter: { kind: 'scheduler', schedulerId: 'authority.asha-demo.scheduler' },
            causation: {
              rootId: 'asha-demo.scheduler.live-proof',
              parentEventId: null,
              decisionId: null,
            },
            originatingEventId: null,
            source: null,
            targets: [{ entity: 20 }],
            canonicalPayload,
            payloadHash: hashPayload(canonicalPayload),
          },
          source: { kind: 'scheduler', schedulerId: 'authority.asha-demo.scheduler' },
          causation: {
            rootId: 'asha-demo.scheduler.live-proof',
            parentEventId: null,
            decisionId: null,
          },
        },
      },
    });
    const execute = scheduler.advanceGameplayRuntime({
      kind: 'schedulerCommand',
      command: {
        kind: 'executeTick',
        actionId,
        tick: 5,
        targetsPresent: true,
        causationCurrent: true,
      },
    });
    const outstanding = scheduler.gameplayRuntimeReadout();
    const snapshot = scheduler.gameplaySnapshot();
    const restoredDispatch = scheduler.restoreGameplaySnapshot(snapshot);
    const restoredReadout = scheduler.gameplayRuntimeReadout();
    const route = scheduler.advanceGameplayRuntime({ kind: 'schedulerRoute', actionId });
    const completed = scheduler.gameplayRuntimeReadout();
    const replay = scheduler.advanceGameplayRuntime({ kind: 'schedulerRoute', actionId });
    const afterReplay = scheduler.gameplayRuntimeReadout();
    return {
      schedule,
      execute,
      outstanding,
      restoredDispatch,
      restoredReadout,
      route,
      completed,
      replay,
      afterReplay,
    };
  });
  expect(schedulerProof.schedule?.accepted).toBe(true);
  expect(schedulerProof.execute?.accepted).toBe(true);
  expect(schedulerProof.outstanding?.scheduler?.outstandingDispatchCount).toBe(1);
  expect(schedulerProof.restoredDispatch?.accepted).toBe(true);
  expect(schedulerProof.restoredReadout?.scheduler?.outstandingDispatchCount).toBe(1);
  expect(schedulerProof.route?.accepted).toBe(true);
  expect(schedulerProof.completed?.scheduler).toMatchObject({
    pendingActionCount: 0,
    outstandingDispatchCount: 0,
    factCount: 3,
  });
  expect(schedulerProof.completed?.authorityStateHash).not.toBe(initial.readout?.authorityStateHash);
  expect(schedulerProof.completed?.runtimeHostHash).not.toBe(initial.readout?.runtimeHostHash);
  expect(schedulerProof.replay?.accepted).toBe(false);
  expect(schedulerProof.afterReplay?.runtimeHostHash).toBe(schedulerProof.completed?.runtimeHostHash);
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
          createCamera(request) {
            return {
              handle: 1,
              pose: request.initialPose,
              projection: request.projection,
              viewport: request.viewport,
              basis: {
                forward: [0, 0, -1],
                right: [1, 0, 0],
                up: [0, 1, 0],
              },
              projectionHash: 'fnv1a64:0000000000000004',
            };
          },
          applyCollisionConstrainedCameraInput() {
            return {
              blockedAxes: [],
              collided: false,
              collisionProjectionHash: 'fnv1a64:0000000000000005',
              movementHash: 'fnv1a64:0000000000000006',
              replayRecordKind: 'camera_collision_input',
              snapshot: {
                before: null,
                attempted: null,
                after: {
                  pose: {
                    position: [0, 1.62, 1.25],
                    yawDegrees: 0,
                    pitchDegrees: 0,
                  },
                  basis: {
                    forward: [0, 0, -1],
                    right: [1, 0, 0],
                    up: [0, 1, 0],
                  },
                },
              },
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
          restartFpsRuntimeSession() {
            return referenceSnapshot;
          },
          applyEnemyDirectNavMovement(request) {
            return {
              entity: request.entity,
              authoritySource: 'seeded_from_request',
              authorityTransport: 'reference_bridge',
              from: request.seedPosition,
              target: request.target,
              nextWaypoint: request.seedPosition,
              distanceUnits: 0,
              reached: false,
              pathHash: 'fnv1a64:0000000000000007',
              transformHash: 'fnv1a64:0000000000000008',
              projectionChanged: false,
            };
          },
          unloadWorld() {},
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
  expect(backendStatus?.diagnostics?.[0]?.message).toMatch(
    /rejected non-native RuntimeBridge provider|missing required operation/,
  );
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
