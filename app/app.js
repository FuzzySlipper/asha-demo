const fallbackStatus = {
  manifest: { present: false },
  allowedImports: [],
  sourceRoots: [],
  nonClaims: ['This is not yet a playable FPS.'],
};

const response = await fetch('/api/status', { headers: { Accept: 'application/json' } }).catch(() => null);
const status = response?.ok ? await response.json() : fallbackStatus;

renderManifest(status.manifest);
renderPublicAshaReadout(status.publicAshaReadout);
renderList(document.querySelector('#allowed-imports'), status.allowedImports);
renderList(document.querySelector('#source-roots'), status.sourceRoots);
renderList(document.querySelector('#non-claims'), status.nonClaims);

function renderManifest(manifest) {
  const facts = document.querySelector('#manifest-summary');
  facts.replaceChildren();
  const rows = [
    ['Status', manifest.present ? 'Found' : 'Missing'],
    ['Engine source', manifest.engineSource ?? 'not declared'],
    ['Runtime command', manifest.runtimeCommand ?? 'not declared'],
    ['Studio attach', manifest.studioAttachEnabled ? 'enabled' : 'disabled'],
  ];

  for (const [label, value] of rows) {
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value;
    facts.append(term, detail);
  }
}

function renderPublicAshaReadout(readout) {
  const statusLabel = document.querySelector('#runtime-session-status');
  const facts = document.querySelector('#public-asha-summary');
  const snapshot = document.querySelector('#static-room-snapshot');
  facts.replaceChildren();
  snapshot.replaceChildren();

  if (readout === undefined || readout === null) {
    statusLabel.textContent = 'Unavailable';
    appendFact(facts, 'Status', 'Unavailable');
    return;
  }

  statusLabel.textContent = `${readout.runtimeSession.mode} · static`;
  const rows = [
    ['Public imports', readout.publicImports.join(', ')],
    ['RuntimeSession', readout.runtimeSession.sessionId],
    ['Session hash', readout.runtimeSession.sessionHash],
    ['Projection hash', readout.runtimeSession.projectionHash],
    ['Static room fixture', readout.staticRoom.fixtureName],
    ['Render ops', String(readout.staticRoom.renderOpCount)],
    ['Projected handles', String(readout.staticRoom.projectionHandleCount)],
    ['Renderer handles', String(readout.staticRoom.rendererHandleCount)],
    ['Wall instances', String(readout.staticRoom.wallInstanceCount)],
    ['Snapshot hash', readout.staticRoom.structuralSnapshotHash],
  ];

  for (const [label, value] of rows) {
    appendFact(facts, label, value);
  }

  for (const line of readout.staticRoom.structuralSnapshotPreview) {
    const item = document.createElement('li');
    item.textContent = line;
    snapshot.append(item);
  }
}

function appendFact(facts, label, value) {
  const term = document.createElement('dt');
  term.textContent = label;
  const detail = document.createElement('dd');
  detail.textContent = value;
  facts.append(term, detail);
}

function renderList(container, values) {
  container.replaceChildren();
  for (const value of values) {
    const item = document.createElement('li');
    item.textContent = value;
    container.append(item);
  }
}
