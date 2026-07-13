import type { ParticleSpriteRef } from '@asha/contracts';
import type { AshaParticleResource } from '@asha/renderer-host';

export const PRIMARY_FIRE_SPRITE_ASSET = 'sprite/asha-primary-fire-spark';
export const PRIMARY_FIRE_SPRITE_CONTENT_HASH =
  '0541e102a0dc20342819a3fb9024de73f3249269fed374b68c6aa8fc5dd2f5c1';
const PRIMARY_FIRE_SPRITE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#ffcf4a"/></svg>';

export async function resolveDemoParticleResource(
  sprite: ParticleSpriteRef,
): Promise<AshaParticleResource | null> {
  if (
    sprite.asset !== PRIMARY_FIRE_SPRITE_ASSET
    || sprite.contentHash !== PRIMARY_FIRE_SPRITE_CONTENT_HASH
  ) {
    return null;
  }
  return {
    bytes: new TextEncoder().encode(PRIMARY_FIRE_SPRITE_SVG).buffer,
    url: `data:image/svg+xml,${encodeURIComponent(PRIMARY_FIRE_SPRITE_SVG)}`,
  };
}
