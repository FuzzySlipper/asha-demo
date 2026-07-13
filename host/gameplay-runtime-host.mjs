import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

export function createAshaDemoGameplayRuntime() {
  const addon = require(join(repoRoot, 'dist/native/asha-demo-gameplay-host.node'));
  let lastLoadInput = null;
  let loaded = false;

  const gameplayHost = {
    load(input) {
      const receipt = decode(addon.gameplayHostLoad(JSON.stringify(input)));
      if (receipt.accepted) {
        lastLoadInput = input;
        loaded = true;
      }
      return receipt;
    },
    advance(moment) {
      return decode(addon.gameplayHostAdvance(JSON.stringify(moment)));
    },
    read() {
      return decode(addon.gameplayHostRead());
    },
    save() {
      return decode(addon.gameplayHostSave());
    },
    restore(input, snapshot) {
      const receipt = decode(addon.gameplayHostRestore(
        JSON.stringify(input),
        JSON.stringify(snapshot),
      ));
      if (receipt.accepted) {
        lastLoadInput = input;
        loaded = true;
      }
      return receipt;
    },
  };

  return {
    descriptor: decode(addon.gameplayHostDescriptor()),
    gameplayHost,
    wrapRuntimeBridge(bridge) {
      return wrapRuntimeBridge({
        bridge,
        gameplayHost,
        addon,
        isLoaded: () => loaded,
        readLastLoadInput: () => lastLoadInput,
      });
    },
  };
}

function wrapRuntimeBridge(input) {
  return new Proxy(input.bridge, {
    get(target, property, receiver) {
      if (property === 'applyCollisionConstrainedCameraInput') {
        return (request) => {
          const receipt = target.applyCollisionConstrainedCameraInput(request);
          if (!input.isLoaded()) {
            return receipt;
          }
          const before = receipt.before.pose.position;
          const after = receipt.after.pose.position;
          const gameplayRuntime = input.gameplayHost.advance({
            kind: 'actorMovement',
            tick: request.tick,
            actor: 10,
            delta: [after[0] - before[0], after[1] - before[1], after[2] - before[2]],
          });
          return { ...receipt, gameplayRuntime };
        };
      }
      if (property === 'invokeGameExtensionWeaponEffect') {
        return (request) => {
          const receipt = target.invokeGameExtensionWeaponEffect(request);
          if (!input.isLoaded()) {
            return receipt;
          }
          const gameplayRuntime = decode(input.addon.gameplayHostObserveWeaponEffect(
            JSON.stringify(request),
            JSON.stringify(receipt),
          ));
          return { ...receipt, gameplayRuntime };
        };
      }
      if (property === 'restartFpsRuntimeSession') {
        return (request) => {
          const receipt = target.restartFpsRuntimeSession(request);
          const loadInput = input.readLastLoadInput();
          const gameplayRuntimeReset = loadInput === null
            ? null
            : input.gameplayHost.load(loadInput);
          return { ...receipt, gameplayRuntimeReset };
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function decode(text) {
  return JSON.parse(text);
}
