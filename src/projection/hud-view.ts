export function projectHudView(input: any): any {
  const {
    backendMissingLabel,
    enemyHealth,
    interaction,
    lastMovementEvent,
    lastRuntimeEvent,
    lifecycle,
    locked,
    menuMode,
    movement,
    paused,
    playerHealth,
    pose,
    runtimeAvailable,
  } = input;

  const eventLabel = runtimeAvailable === false
    ? backendMissingLabel
    : lifecycle.player.dead
      ? `${lifecycle.outcome.label} - restart available`
      : movement.collided
        ? lastMovementEvent
        : lastRuntimeEvent || interaction.lastEvent;

  return {
    canFire: interaction.canFire,
    enemyHealthPercent: enemyHealth.percent,
    eventLabel,
    locked,
    lockLabel: locked ? 'LOCKED' : 'UNLOCKED',
    menuMode,
    pauseLabel: paused ? 'Resume' : 'Pause',
    pauseMenuStatus: projectPauseMenuStatus(menuMode),
    playerDead: lifecycle.player.dead,
    playerHealthLabel: `${playerHealth.current}/${playerHealth.max}`,
    playerHealthPercent: playerHealth.percent,
    poseLabel: `${pose.position[0].toFixed(1)}, ${pose.position[2].toFixed(1)} | ${Math.round(pose.yawDegrees)}`,
    shotLabel: `${interaction.hits}/${interaction.shotsFired}`,
    targetLabel: `${interaction.remainingTargets}/${interaction.totalTargets}`,
  };
}

function projectPauseMenuStatus(menuMode: string): string {
  if (menuMode === 'exit') {
    return 'Exited to menu. Resume or restart when ready.';
  }
  if (menuMode === 'options') {
    return 'Options are read-only for this demo build.';
  }
  return 'Runtime paused. Resume or restart through typed HUD intents.';
}
