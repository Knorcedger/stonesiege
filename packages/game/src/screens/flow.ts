// Menu screen-flow state machine (pure, unit-tested): a stack of screens with
// guarded push transitions and a universal 'back' pop. The DOM shell
// (screens/menu.ts) renders whatever is on top and dispatches events; keeping
// the transitions here means the navigation rules are testable without a DOM.

export type MenuScreen =
  | { id: 'title' }
  | { id: 'play' }
  | { id: 'practiceSetup' }
  | { id: 'campaigns' }
  | { id: 'scenarioList'; campaignId: string }
  // Story pages that open and close a campaign. Both sit above the chapter
  // list so Back from either returns to the chapters rather than the cards.
  | { id: 'prologue'; campaignId: string }
  | { id: 'epilogue'; campaignId: string }
  | { id: 'briefing'; campaignId: string; scenarioId: string }
  | { id: 'settings' };

export type FlowEvent =
  | { kind: 'openPlay' }         // title -> play menu
  | { kind: 'openPractice' }     // play -> practice setup
  | { kind: 'openCampaigns' }    // play -> campaign cards
  | { kind: 'openScenarios'; campaignId: string }   // campaigns -> scenario list
  | { kind: 'openPrologue'; campaignId: string }  // list -> campaign opening
  | { kind: 'openEpilogue'; campaignId: string }  // list -> campaign ending
  | { kind: 'openBriefing'; campaignId: string; scenarioId: string } // list -> briefing
  | { kind: 'openSettings' }     // anywhere (settings pushes; back returns)
  | { kind: 'back' };

export interface FlowState {
  stack: MenuScreen[];
}

export const initialFlow = (): FlowState => ({ stack: [{ id: 'title' }] });

/** Prebuilt deep-link stacks (post-reload navigation hints). */
export function flowAtScenarioList(campaignId: string): FlowState {
  return {
    stack: [
      { id: 'title' }, { id: 'play' }, { id: 'campaigns' },
      { id: 'scenarioList', campaignId },
    ],
  };
}

/** Deep-link stack for the campaign's closing page, with the chapters behind it. */
export function flowAtEpilogue(campaignId: string): FlowState {
  const below = flowAtScenarioList(campaignId);
  return { stack: [...below.stack, { id: 'epilogue', campaignId }] };
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
    case 'openScenarios':
      return top.id === 'campaigns'
        ? push(state, { id: 'scenarioList', campaignId: ev.campaignId })
        : state;
    case 'openPrologue':
      return top.id === 'scenarioList' && top.campaignId === ev.campaignId
        ? push(state, { id: 'prologue', campaignId: ev.campaignId })
        : state;
    case 'openEpilogue':
      return top.id === 'scenarioList' && top.campaignId === ev.campaignId
        ? push(state, { id: 'epilogue', campaignId: ev.campaignId })
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
