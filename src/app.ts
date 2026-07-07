import { bootGame } from './bootstrap/boot-game.js';

void bootGame().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ASHA demo failed to boot: ${message}`);
  throw error;
});
