// Menu screen-flow state machine (pure, unit-tested): a stack of screens with
// guarded push transitions and a universal 'back' pop. The DOM shell
// (screens/menu.ts) renders whatever is on top and dispatches events; keeping
// the transitions here means the navigation rules are testable without a DOM.

export type MenuScreen =
  | { id: 'title' }
  | { id: 'play' }
  | { id: 'practiceSetup' }
  | { id: 'campaigns' }
  | { id: 'grandConquests' }
  | { id: 'scenarioList'; campaignId: string }
  | { id: 'briefing'; campaignId: string; scenarioId: string }
  | { id: 'settings' };

export type FlowEvent =
  | { kind: 'openPlay' }         // title -> play menu
  | { kind: 'openPractice' }     // play -> practice setup
  | { kind: 'openCampaigns' }    // play -> campaign cards
  | { kind: 'openGrandConquests' } // play -> custom Grand Conquests
  | { kind: 'openScenarios'; campaignId: string }   // collection -> scenario list
  | { kind: 'openBriefing'; campaignId: string; scenarioId: string } // list -> briefing
  | { kind: 'openSettings' }     // anywhere (settings pushes; back returns)
  | { kind: 'back' };

export interface FlowState {
  stack: MenuScreen[];
}

export const initialFlow = (): FlowState => ({ stack: [{ id: 'title' }] });

/** Prebuilt deep-link stacks (post-reload navigation hints). */
export function flowAtScenarioList(
  campaignId: string,
  collection: 'campaigns' | 'grandConquests' = 'campaigns',
): FlowState {
  return {
    stack: [
      { id: 'title' }, { id: 'play' }, { id: collection },
      { id: 'scenarioList', campaignId },
    ],
  };
}

export function currentScreen(state: FlowState): MenuScreen {
  return state.stack[state.stack.length - 1];
}

const push = (state: FlowState, screen: MenuScreen): FlowState =>
  ({ stack: [...state.stack, screen] });

/**
 * Pure transition. Illegal events (e.g. openPractice while on the title) are
 * no-ops returning the same state, so a stray double-tap can never corrupt
 * navigation. 'back' pops; on the title root it is a no-op.
 */
export function flowReducer(state: FlowState, ev: FlowEvent): FlowState {
  const top = currentScreen(state);
  switch (ev.kind) {
    case 'openPlay':
      return top.id === 'title' ? push(state, { id: 'play' }) : state;
    case 'openPractice':
      return top.id === 'play' ? push(state, { id: 'practiceSetup' }) : state;
    case 'openCampaigns':
      return top.id === 'play' ? push(state, { id: 'campaigns' }) : state;
    case 'openGrandConquests':
      return top.id === 'play' ? push(state, { id: 'grandConquests' }) : state;
    case 'openScenarios':
      return top.id === 'campaigns' || top.id === 'grandConquests'
        ? push(state, { id: 'scenarioList', campaignId: ev.campaignId })
        : state;
    case 'openBriefing':
      return top.id === 'scenarioList' && top.campaignId === ev.campaignId
        ? push(state, { id: 'briefing', campaignId: ev.campaignId, scenarioId: ev.scenarioId })
        : state;
    case 'openSettings':
      return top.id === 'settings' ? state : push(state, { id: 'settings' });
    case 'back':
      return state.stack.length > 1 ? { stack: state.stack.slice(0, -1) } : state;
    default:
      return state;
  }
}
