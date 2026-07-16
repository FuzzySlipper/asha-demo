# Playwright Broker Readiness

`asha-demo` is opted into the Den Playwright broker for visible product acceptance.

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
- `readyText` for `asha-demo`, plus `X-ASHA-Browser-Host: browser-host.v0` via `identityHeaderValue`;
- `tests.command` invoking Playwright;
- `tests.artifactPolicy` set to `live-ui`.

The browser test in `tests/live-ui.spec.mjs` reads `BASE_URL` or
`PLAYWRIGHT_BROKER_BASE_URL` and fails if neither is set. It checks objective
player-visible behavior: native startup, the renderer canvas, firing and combat
HUD change, pause/resume, and reset. A second regression demonstrates that a
no-op fire control fails acceptance even if startup diagnostics remain healthy.

## Acceptance Notes

Live UI handoffs should report the exact Demo and ASHA revisions, the command,
and whether a human inspected the visible result. Screenshots, traces, and videos
are useful debugging artifacts when a failure needs them; they are not committed
delivery tokens.
