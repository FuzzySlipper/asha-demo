# Integrated feedback proof

The live Chromium test writes two inspectable captures from the public
RuntimeSession and renderer-host path:

- `asha-demo-integrated-feedback.png` shows one accepted primary-fire fact
  realized together as controller animation, audio, particles, world-space UI,
  and the telemetry overlay after disposable hosts have been reconstructed.
- `asha-demo-rebuilt-feedback-hosts.png` shows the same accepted authority and
  controller state after all disposable presentation hosts are torn down,
  recreated, and repopulated from the retained public projection frame.
- `asha-demo-independent-feedback-degradation.png` shows the game HUD after
  downstream code independently exercises missing audio, particle sprite,
  billboard font, and overlay realization resources.

The accompanying `integratedFeedbackEvidence` readout asserts exact operation
ordering, one shared `PresentationOriginRef`, per-domain receipts, diagnostics,
and the replay-excluded presentation scope. The
`presentationDegradationEvidence` readout retains all four typed failures and
proves the authority session hash and interaction state remained unchanged.
