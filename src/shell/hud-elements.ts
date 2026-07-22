export function readDemoHudElements(): any {
  return {
    canvas: document.querySelector('#asha-render-surface'),
    billboardLayer: document.querySelector('#asha-billboard-layer'),
    challengeState: document.querySelector('#challenge-state'),
    animationState: document.querySelector('#animation-state'),
    animationCueState: document.querySelector('#animation-cue-state'),
    deathState: document.querySelector('#death-state'),
    eventState: document.querySelector('#event-state'),
    exitButton: document.querySelector('#exit-button'),
    invertYInput: document.querySelector('#invert-y-input'),
    fireButton: document.querySelector('#fire-button'),
    healthFill: document.querySelector('#health-fill'),
    lockButton: document.querySelector('#lock-button'),
    lockState: document.querySelector('#lock-state'),
    menuResetButton: document.querySelector('#menu-reset-button'),
    menuTitle: document.querySelector('#pause-menu-title'),
    moveSpeedInput: document.querySelector('#move-speed-input'),
    moveSpeedValue: document.querySelector('#move-speed-value'),
    optionsButton: document.querySelector('#options-button'),
    optionsPane: document.querySelector('#options-pane'),
    pauseButton: document.querySelector('#pause-button'),
    pauseMenu: document.querySelector('#pause-menu'),
    pauseMenuStatus: document.querySelector('#pause-menu-status'),
    playerHealthFill: document.querySelector('#player-health-fill'),
    playerHealthState: document.querySelector('#player-health-state'),
    poseState: document.querySelector('#pose-state'),
    resetButton: document.querySelector('#reset-button'),
    resumeButton: document.querySelector('#resume-button'),
    reticle: document.querySelector('#reticle'),
    lookSensitivityInput: document.querySelector('#look-sensitivity-input'),
    lookSensitivityValue: document.querySelector('#look-sensitivity-value'),
    shotState: document.querySelector('#shot-state'),
    targetState: document.querySelector('#target-state'),
  };
}

export function reportDemoBootFailure(message: string): void {
  const eventState = document.querySelector<HTMLElement>('#event-state');
  if (eventState !== null) {
    eventState.textContent = `Startup failed: ${message}`;
    eventState.dataset.status = 'failed';
  }
  const fireButton = document.querySelector<HTMLButtonElement>('#fire-button');
  if (fireButton !== null) {
    fireButton.disabled = true;
    fireButton.dataset.blocked = 'true';
  }
}
