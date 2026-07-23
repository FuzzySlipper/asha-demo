import type { InputBindingCatalog } from '@asha/contracts';
import { createDefaultBrowserInputCatalog } from '@asha/runtime-bridge';

export function createDemoInputCatalog(): InputBindingCatalog {
  const base = createDefaultBrowserInputCatalog();
  return {
    ...base,
    actions: [
      ...base.actions,
      {
        actionId: 'demo.interact',
        valueKind: 'button',
        acceptedPhases: ['pressed'],
      },
    ],
    bindings: [
      ...base.bindings,
      {
        bindingId: 'demo.interact.primary',
        actionId: 'demo.interact',
        contextId: 'gameplay',
        platformKind: 'keyboardKey',
        control: 'KeyE',
        scale: 1,
        extension: null,
      },
    ],
  };
}

