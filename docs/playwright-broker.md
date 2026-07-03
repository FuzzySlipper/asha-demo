# Playwright Broker Readiness

`asha-demo` is not opted into `den-playwright` yet because this repo does not currently expose a served browser UI or dev-server command.

The future broker command should use this shape:

```sh
export DEN_PLAYWRIGHT_BROKER_CONFIG_PATH=/home/dev/den-services/playwright-broker/config/config.example.yaml
den-playwright run asha-demo \
  -repo /home/dev/asha-demo \
  -den-project asha \
  -den-task <task-id> \
  -- --reporter=list
```

## Missing Prerequisite

Before adding `.den-playwright.json`, `.playwright-service.json`, or `den-playwright.json`, `asha-demo` needs an actual dev-server command that serves a human-facing UI.

The current `npm run skeleton:status` command prints a JSON non-claim readout. It is not a browser UI and must not be treated as a Playwright target.

## Future Manifest Requirements

When a served UI exists, add one broker manifest at the repo root with:

- project identity `asha-demo`;
- `serve.command` using broker placeholders such as `{host}` and `{port}`;
- a `healthUrl` for the UI;
- `readyText` or `identityHeader`, preferably both;
- `tests.command` invoking Playwright;
- `tests.artifactPolicy` set to `live-ui`.

Tests must read `BASE_URL` or `PLAYWRIGHT_BROKER_BASE_URL`. Do not hardcode localhost ports.

## Evidence Expectations

Live UI handoffs should report:

- `run-index.json`;
- screenshot, trace, or video paths when produced;
- whether human inspection happened;
- visual uncertainty that remains;
- the objective UI claim being tested.

Passing Playwright is not enough for subjective visual/demo acceptance. Human-facing demo claims still need inspected browser-visible evidence.
