# Playwright Broker Readiness

`asha-demo` is opted into the Den Playwright broker for objective live UI evidence.

The broker command uses this shape:

```sh
export DEN_PLAYWRIGHT_BROKER_CONFIG_PATH=/home/dev/den-services/playwright-broker/config/config.example.yaml
den-playwright run asha-demo \
  -repo /home/dev/asha-demo \
  -den-project asha \
  -den-task <task-id> \
  -- --reporter=list
```

If `den-playwright` is not installed on `PATH`, run from `/home/dev/den-services`:

```sh
export DEN_PLAYWRIGHT_BROKER_CONFIG_PATH=/home/dev/den-services/playwright-broker/config/config.example.yaml
go run ./playwright-broker/cmd/den-playwright run asha-demo \
  -repo /home/dev/asha-demo \
  -den-project asha \
  -den-task <task-id> \
  -- --reporter=list
```

## Current Dev Server

Run the integrated public ASHA playable-loop UI with:

```sh
npm run dev -- --port 5173
```

The command uses the public `@asha/browser-host` package to install the native
Rust RuntimeBridge provider before app boot. It defaults to `0.0.0.0`, accepts
`--host` and `--port`, and also respects `HOST` / `PORT` or npm config values.
The broker manifest passes broker-owned `{host}` and `{port}` placeholders
instead of hardcoding a port.

Run `npm run dev:static -- --port 5173` only for the static no-provider
fail-closed diagnostic path.

## Manifest

The repo root has `.den-playwright.json` with:

- project identity `asha-demo`;
- `serve.command` using broker-owned `{host}` and `{port}` placeholders;
- `healthUrl` set to `/health`;
- `readyText` for `asha-demo` and the `X-ASHA-Browser-Host` identity header;
- `tests.command` invoking Playwright;
- `tests.artifactPolicy` set to `live-ui`.

The smoke test in `tests/live-ui.spec.mjs` reads `BASE_URL` or
`PLAYWRIGHT_BROKER_BASE_URL` and fails if neither is set. It checks objective
UI/readout content only: the ASHA renderer canvas, generated-tunnel room labels,
durable ProjectBundle/ECRP content refs, RuntimeSession ECRP load, movement
authority, collision response, primary-fire combat/death readouts, HUD counters,
and typed restart/reset state.

## Evidence Expectations

Live UI handoffs should report:

- `run-index.json`;
- screenshot, trace, or video paths when produced;
- whether human inspection happened;
- visual uncertainty that remains;
- the objective UI claim being tested.

Passing Playwright is not enough for subjective visual/demo acceptance. Human-facing demo claims still need inspected browser-visible evidence.
