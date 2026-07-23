import {
  authoredBehavior,
  createAshaAuthoredBehaviorDocument,
} from '@asha/game-workspace';

const door = authoredBehavior.sceneEntity('asha-demo.security-door');

const securityDoorMachine = authoredBehavior.stateMachine(
  'security-door',
  'asha-demo.security-door',
  'closed',
  [authoredBehavior.state('closed'), authoredBehavior.state('open')],
  [
    authoredBehavior.transition('open', 'closed', 'open'),
    authoredBehavior.transition('close', 'open', 'closed'),
  ],
);

const operateSecurityDoor = authoredBehavior.behavior(
  'security-switch-opens-door',
  authoredBehavior.prefabPartInteracted(
    authoredBehavior.prefabPart('asha-demo.security-switch', 'interaction/switch'),
  ),
  [authoredBehavior.whenState('security-door', 'closed')],
  [
    authoredBehavior.step('open-now', [
      authoredBehavior.transitionState('security-door', 'open'),
      authoredBehavior.setRelativeTranslation(door, [0, 3, 0]),
      authoredBehavior.setCapabilityActive(door, 'collision', false),
    ]),
    authoredBehavior.afterTicks('close-when-clear', 'open-now', 10, [
      authoredBehavior.transitionState('security-door', 'close'),
      authoredBehavior.setRelativeTranslation(door, [0, 0, 0]),
      authoredBehavior.setCapabilityActive(door, 'collision', true),
    ]),
  ],
);

export const securityDoorBehaviorDocument = createAshaAuthoredBehaviorDocument(
  'asha-demo.behavior.security-door',
  {
    packageId: 'asha-demo.security-door',
    stateMachines: [securityDoorMachine],
    behaviors: [operateSecurityDoor],
  },
  {
    sourceModule: '@asha-demo/gameplay',
    sourcePath: 'src/content/security-door.ts',
  },
);
