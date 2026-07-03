# Enemy Policy Fixture

This directory remains documentation-only for demo-owned policy source packages.

The current demo enemy behavior uses the public `@asha/runtime-bridge` root export:

- `createGeneratedTunnelEnemyPolicyFixture`
- `proposeEnemyPolicyFrame`
- `validateEnemyPolicySource`

The fixture consumes a read-only/proposal-only policy view from `RuntimeSession`,
proposes movement/fire intents, and submits only the typed fire intent back through
`RuntimeSession`. It does not import internal ASHA policy packages, does not own
authority, and does not run a demo-local policy runtime.
