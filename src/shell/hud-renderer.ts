export function renderHudElements(elements: any, view: any): void {
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
    elements.resumeButton.disabled = view.playerDead;
  }
  if (elements.optionsPane instanceof HTMLElement) {
    elements.optionsPane.hidden = view.menuMode !== 'options';
  }
  if (elements.exitState instanceof HTMLElement) {
    elements.exitState.hidden = view.menuMode !== 'exit';
  }
}
