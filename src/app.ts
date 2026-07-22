import { bootGame } from './bootstrap/boot-game.js';
import { reportDemoBootFailure } from './shell/hud-elements.js';

void bootGame().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  reportDemoBootFailure(message);
  console.error(`ASHA demo failed to boot: ${message}`);
  throw error;
});
