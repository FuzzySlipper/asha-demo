export function renderHudElements(elements: any, view: any): void {
  if (elements.challengeState instanceof HTMLElement) {
    elements.challengeState.textContent = view.challengeLabel;
    elements.challengeState.dataset.status = view.challengeStatus;
  }
  if (elements.interactionPrompt instanceof HTMLElement) {
    elements.interactionPrompt.textContent = view.interactionPrompt ?? '';
    elements.interactionPrompt.hidden = view.interactionPrompt === null;
  }
  if (elements.lockState instanceof HTMLElement) {
    elements.lockState.textContent = view.lockLabel;
    elements.lockState.dataset.locked = String(view.locked);
  }
  if (elements.targetState instanceof HTMLElement) {
    elements.targetState.textContent = view.targetLabel;
  }
  if (elements.shotState instanceof HTMLElement) {
    elements.shotState.textContent = view.shotLabel;
  }
  if (elements.playerHealthState instanceof HTMLElement) {
    elements.playerHealthState.textContent = view.playerHealthLabel;
    elements.playerHealthState.dataset.dead = String(view.playerDead);
  }
  if (elements.poseState instanceof HTMLElement) {
    elements.poseState.textContent = view.poseLabel;
  }
  if (elements.animationState instanceof HTMLElement) {
    elements.animationState.textContent = view.animationLabel;
  }
  if (elements.animationCueState instanceof HTMLElement) {
    elements.animationCueState.textContent = view.animationCueLabel;
    elements.animationCueState.dataset.status = view.animationCueStatus;
  }
  if (elements.eventState instanceof HTMLElement) {
    elements.eventState.textContent = view.eventLabel;
  }
  if (elements.healthFill instanceof HTMLElement) {
    elements.healthFill.style.width = `${view.enemyHealthPercent}%`;
  }
  if (elements.playerHealthFill instanceof HTMLElement) {
    elements.playerHealthFill.style.width = `${view.playerHealthPercent}%`;
  }
  if (elements.deathState instanceof HTMLElement) {
    elements.deathState.hidden = !view.playerDead;
  }
  if (elements.fireButton instanceof HTMLButtonElement) {
    elements.fireButton.disabled = !view.canFire;
    elements.fireButton.dataset.blocked = String(!view.canFire);
  }
  if (elements.pauseButton instanceof HTMLButtonElement) {
    elements.pauseButton.textContent = view.pauseLabel;
  }
  if (elements.pauseMenu instanceof HTMLElement) {
    elements.pauseMenu.hidden = view.menuMode === 'closed';
    elements.pauseMenu.dataset.mode = view.menuMode;
  }
  if (elements.pauseMenuStatus instanceof HTMLElement) {
    elements.pauseMenuStatus.textContent = view.pauseMenuStatus;
  }
  if (elements.resumeButton instanceof HTMLButtonElement) {
    const resumeControl = view.pauseMenuControls.find((control) => control.id === 'hud-resume');
    elements.resumeButton.hidden = view.menuMode === 'title';
    elements.resumeButton.disabled = Boolean(resumeControl?.disabled) || view.menuMode === 'title';
    elements.resumeButton.textContent = view.resumeLabel;
  }
  if (elements.menuResetButton instanceof HTMLButtonElement) {
    elements.menuResetButton.textContent = view.restartLabel;
  }
  if (elements.menuTitle instanceof HTMLElement) {
    elements.menuTitle.textContent = view.menuTitle;
  }
  if (elements.exitButton instanceof HTMLButtonElement) {
    elements.exitButton.hidden = view.menuMode === 'title';
  }
  if (elements.optionsPane instanceof HTMLElement) {
    elements.optionsPane.hidden = view.menuMode !== 'options';
  }
  if (elements.moveSpeedInput instanceof HTMLInputElement) {
    elements.moveSpeedInput.value = String(view.inputSettings.moveSpeedUnitsPerSecond);
  }
  if (elements.moveSpeedValue instanceof HTMLOutputElement) {
    elements.moveSpeedValue.value = view.inputSettings.moveSpeedUnitsPerSecond.toFixed(1);
  }
  if (elements.lookSensitivityInput instanceof HTMLInputElement) {
    elements.lookSensitivityInput.value = String(view.inputSettings.lookSensitivityDegreesPerPixel);
  }
  if (elements.lookSensitivityValue instanceof HTMLOutputElement) {
    elements.lookSensitivityValue.value = view.inputSettings.lookSensitivityDegreesPerPixel.toFixed(2);
  }
  if (elements.invertYInput instanceof HTMLInputElement) {
    elements.invertYInput.checked = view.inputSettings.invertY;
  }
}
