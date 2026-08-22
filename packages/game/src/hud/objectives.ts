// Scenario objective HUD: a compact always-readable current objective, an
// expandable sequenced list with throttled live progress, and screen-space
// guidance for spatial goals.

import type { ObjectiveGuideReadout, ObjectiveTargetTile } from '@bf/scenarios';
import {
  HUD_LAYER, HUD_NARROW_MAX_PX, HUD_TOP_BAR_BOTTOM_VAR, TOP_BAR_CLEAR_PX,
} from './layout';

export type ObjectiveUiState = 'open' | 'complete' | 'failed';
export type ObjectiveDisplayState = 'current' | 'upcoming' | 'complete' | 'failed';

export interface ObjectiveItem {
  id: string;
  text: string;
  state: ObjectiveUiState;
  readout?: ObjectiveGuideReadout;
}

function completedReadout(readout: ObjectiveGuideReadout): ObjectiveGuideReadout {
  return {
    ...readout,
    goals: readout.goals.map((goal) => ({
      ...goal,
      have: goal.done ? goal.have : goal.need,
      done: true,
    })),
  };
}

/** Pure list model (insertion-ordered, latched like the trigger engine). */
export class ObjectivesModel {
  private list: ObjectiveItem[] = [];
  private byId = new Map<string, ObjectiveItem>();

  add(id: string, text: string): void {
    if (this.byId.has(id)) return;
    const item: ObjectiveItem = { id, text, state: 'open' };
    this.list.push(item);
    this.byId.set(id, item);
  }

  complete(id: string): void {
    const item = this.byId.get(id);
    if (item && item.state === 'open') {
      item.state = 'complete';
      if (item.readout) item.readout = completedReadout(item.readout);
    }
  }

  fail(id: string): void {
    const item = this.byId.get(id);
    if (item && item.state === 'open') item.state = 'failed';
  }

  setReadout(readout: ObjectiveGuideReadout): void {
    const item = this.byId.get(readout.id);
    if (!item || (item.state !== 'open' && item.readout)) return;
    item.readout = item.state === 'complete' ? completedReadout(readout) : readout;
  }

  items(): readonly ObjectiveItem[] {
    return this.list;
  }

  get current(): ObjectiveItem | undefined {
    return this.list.find((objective) => objective.state === 'open');
  }

  get currentPosition(): number {
    const current = this.current;
    return current ? this.list.indexOf(current) + 1 : this.list.length;
  }

  get openCount(): number {
    return this.list.filter((objective) => objective.state === 'open').length;
  }
}

/**
 * On phone widths, keep the expanded list collapsed so it does not cover the
 * battlefield. The collapsed head itself now carries the complete current goal.
 */
export function autoOpenObjectives(viewportWidth: number): boolean {
  return viewportWidth > HUD_NARROW_MAX_PX;
}

/** Four progress reads per simulation second at the normal 20 Hz tick rate. */
export const OBJECTIVE_PROGRESS_INTERVAL_TICKS = 5;

export function objectiveProgressDue(currentTick: number, lastReadTick: number): boolean {
  return lastReadTick < 0 || currentTick - lastReadTick >= OBJECTIVE_PROGRESS_INTERVAL_TICKS;
}

export function objectiveProgressSummary(objective?: ObjectiveItem): string {
  return objective?.readout?.goals
    .map((goal) => `${goal.label} ${goal.have}/${goal.need}`)
    .join(' · ') ?? '';
}

export function objectiveDisplayState(objective: ObjectiveItem, currentId?: string): ObjectiveDisplayState {
  return objective.state === 'open'
    ? objective.id === currentId ? 'current' : 'upcoming'
    : objective.state;
}

export function objectiveSequencePosition(
  currentId: string,
  visibleItems: readonly ObjectiveItem[],
  authoredIds: readonly string[],
): { position: number; total: number } {
  const authoredPosition = authoredIds.indexOf(currentId);
  const visiblePosition = visibleItems.findIndex((objective) => objective.id === currentId);
  return {
    position: (authoredPosition >= 0 ? authoredPosition : visiblePosition) + 1,
    total: Math.max(authoredIds.length, visibleItems.length),
  };
}

export type ObjectiveMarkerPlacement =
  | { kind: 'beacon'; x: number; y: number; angle: number }
  | { kind: 'edge'; x: number; y: number; angle: number };

/** A visible battlefield target must not steal commands from the canvas below it. */
export function objectiveMarkerPointerEvents(
  kind: ObjectiveMarkerPlacement['kind'],
): 'none' | 'auto' {
  return kind === 'beacon' ? 'none' : 'auto';
}

/** Pure geometry for the battlefield beacon / screen-edge arrow. */
export function objectiveMarkerPlacement(
  targetX: number,
  targetY: number,
  viewportWidth: number,
  viewportHeight: number,
): ObjectiveMarkerPlacement {
  const minX = 28;
  const maxX = Math.max(minX, viewportWidth - 28);
  const minY = Math.min(104, viewportHeight / 2);
  const maxY = Math.max(minY, viewportHeight - 52);
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;
  const dx = targetX - centerX;
  const dy = targetY - centerY;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  if (targetX >= minX && targetX <= maxX && targetY >= minY && targetY <= maxY) {
    // The bottom-left minimap occludes the world. Treat a target behind it as
    // off-screen so guidance remains visible and tappable beside the map.
    if (!(targetX < 140 && targetY > viewportHeight - 190)) {
      return { kind: 'beacon', x: targetX, y: targetY, angle };
    }
  }

  const scales: number[] = [];
  if (dx > 0) scales.push((maxX - centerX) / dx);
  else if (dx < 0) scales.push((minX - centerX) / dx);
  if (dy > 0) scales.push((maxY - centerY) / dy);
  else if (dy < 0) scales.push((minY - centerY) / dy);
  const scale = Math.max(0, Math.min(...scales.filter((candidate) => candidate >= 0), 1));
  let x = centerX + dx * scale;
  const y = centerY + dy * scale;
  if (x < 140 && y > viewportHeight - 190) x = 148;
  return { kind: 'edge', x, y, angle };
}

const OBJ_CSS = `
/* Anchored to the top bar's MEASURED bottom edge, not a constant: the bar wraps
   to a second row on narrow viewports (and re-wraps mid-match as stockpiles
   reach four digits) and grows with the HUD scale setting. A fixed 40px assumed
   a single unscaled row and put this panel on top of the bar's second row,
   where it swallowed taps meant for the controls there. */
.bf-objectives { position:absolute; right:6px; top:var(${HUD_TOP_BAR_BOTTOM_VAR}, ${TOP_BAR_CLEAR_PX}px);
  width:min(300px, 60vw); z-index:${HUD_LAYER.objectives};
  font-family:"Alegreya Sans","Trebuchet MS",sans-serif; pointer-events:auto; }
.bf-obj-head { display:grid; grid-template-columns:minmax(0,1fr) 44px; align-items:stretch;
  background:linear-gradient(#3a2a18,#2C1F12); border:1px solid #64492B; border-radius:4px;
  box-shadow:0 0 0 1px #1A1208; }
.bf-obj-summary,.bf-obj-focus { border:0; color:inherit; font:inherit; cursor:pointer; }
.bf-obj-summary { min-width:0; min-height:44px; padding:4px 7px 5px; text-align:left; background:transparent; }
.bf-obj-position { display:block; color:#E6C04A; font-size:10px; line-height:1; letter-spacing:1px; }
.bf-obj-current-text { display:block; margin-top:3px; color:#EFDDB5; font-size:12px;
  line-height:1.15; letter-spacing:0; overflow-wrap:anywhere; }
.bf-obj-current-progress { display:block; margin-top:3px; color:#9BCB70; font-size:10px;
  line-height:1.1; overflow-wrap:anywhere; }
.bf-obj-current-progress:empty { display:none; }
.bf-obj-focus { display:none; box-sizing:border-box; width:44px; min-height:44px; padding:0;
  background:#241809; border-left:1px solid #8A6414; border-radius:0 3px 3px 0;
  color:#E6C04A; font-size:18px; }
.bf-obj-focus.show { display:block; }
.bf-obj-list { margin:2px 0 0; padding:5px 7px; list-style:none; display:none; max-height:44vh; overflow:auto;
  background:linear-gradient(rgba(44,31,18,0.94), rgba(26,18,8,0.94));
  border:1px solid #64492B; border-radius:4px; box-shadow:0 0 0 1px #1A1208; }
.bf-objectives.open .bf-obj-list { display:block; }
.bf-obj-item { display:grid; grid-template-columns:15px minmax(0,1fr) auto; gap:5px; align-items:start;
  padding:5px 3px; font-size:12px; line-height:1.25; color:#EFDDB5; border-left:2px solid transparent; }
.bf-obj-item + .bf-obj-item { border-top:1px solid rgba(100,73,43,0.45); }
.bf-obj-item .bf-obj-mark { width:14px; text-align:center; font-size:12px; }
.bf-obj-item.current { border-left-color:#E6C04A; background:rgba(230,192,74,0.1); }
.bf-obj-item.current .bf-obj-mark { color:#E6C04A; }
.bf-obj-item.upcoming { color:#B99A6B; }
.bf-obj-item.upcoming .bf-obj-mark { color:#806A48; }
.bf-obj-item.complete { color:#8f8268; text-decoration:line-through; }
.bf-obj-item.complete .bf-obj-mark { color:#E6C04A; text-decoration:none; }
.bf-obj-item.failed { color:#8a6a60; }
.bf-obj-item.failed .bf-obj-mark { color:#C05B4E; }
.bf-obj-progress { display:flex; flex-wrap:wrap; gap:3px; margin-top:4px; text-decoration:none; }
.bf-obj-chip { padding:1px 5px; border:1px solid #64492B; border-radius:8px; color:#EFDDB5;
  background:#1A1208; font-size:10px; white-space:nowrap; text-decoration:none; }
.bf-obj-chip.done { color:#9BCB70; border-color:#527033; }
.bf-obj-item.complete .bf-obj-chip { color:#8f8268; border-color:#46331F; }
.bf-obj-row-focus { box-sizing:border-box; width:44px; height:44px; padding:0; border:1px solid #8A6414; border-radius:3px;
  background:#241809; color:#E6C04A; font:16px "Alegreya Sans","Trebuchet MS",sans-serif; cursor:pointer; }
.bf-obj-item.flash { animation:bfObjFlash 0.9s ease-out; }
@keyframes bfObjFlash { 0% { background:rgba(230,192,74,0.35); } 100% { background:transparent; } }
.bf-obj-head.flash { animation:bfObjHeadFlash 0.9s ease-out; }
@keyframes bfObjHeadFlash {
  0% { box-shadow:0 0 0 2px #E6C04A, 0 0 12px rgba(230,192,74,0.85); }
  100% { box-shadow:0 0 0 1px #1A1208; }
}
.bf-obj-marker { position:absolute; display:none; width:44px; height:44px; margin:-22px 0 0 -22px;
  padding:0; z-index:${HUD_LAYER.objectiveMarker}; pointer-events:auto; cursor:pointer; border:0; background:transparent; }
.bf-obj-marker.show { display:block; }
.bf-obj-marker.beacon::before { content:""; position:absolute; left:5px; top:21px; width:32px; height:16px;
  border:2px solid #E6C04A; border-radius:50%; box-shadow:0 0 0 1px #1A1208,0 0 9px rgba(230,192,74,.8);
  animation:bfObjBeaconRing 1.2s ease-in-out infinite; }
.bf-obj-marker.beacon::after { content:"◆"; position:absolute; left:13px; top:0; width:18px;
  color:#E6C04A; font:18px "Alegreya Sans","Trebuchet MS",sans-serif; text-shadow:0 1px #1A1208,0 0 7px #E6C04A;
  animation:bfObjBeaconPin 1.2s ease-in-out infinite; }
@keyframes bfObjBeaconRing { 0%,100% { transform:scale(.82); opacity:.75; } 50% { transform:scale(1.12); opacity:1; } }
@keyframes bfObjBeaconPin { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }
.bf-obj-marker.edge { border:1px solid #8A6414; border-radius:50%; background:#241809;
  box-shadow:0 0 0 1px #1A1208,0 0 8px rgba(230,192,74,.7); animation:bfObjEdgePulse 1s ease-in-out infinite; }
.bf-obj-marker.edge::after { content:"➤"; position:absolute; inset:9px; color:#E6C04A;
  font:20px/24px "Alegreya Sans","Trebuchet MS",sans-serif; transform:rotate(var(--bf-obj-angle)); }
@keyframes bfObjEdgePulse { 0%,100% { opacity:.72; } 50% { opacity:1; } }
`;

const MARK: Record<ObjectiveDisplayState, string> = {
  current: '◆', upcoming: '◇', complete: '✔', failed: '✖',
};

export class ObjectivesPanel {
  readonly model = new ObjectivesModel();
  private el: HTMLDivElement;
  private headEl: HTMLDivElement;
  private summaryEl: HTMLButtonElement;
  private positionEl: HTMLSpanElement;
  private currentTextEl: HTMLSpanElement;
  private currentProgressEl: HTMLSpanElement;
  private headFocusEl: HTMLButtonElement;
  private listEl: HTMLUListElement;
  private markerEl: HTMLButtonElement;
  private open: boolean;
  private wideViewport: boolean;
  private viewportKey: string;
  private lastKey = '';
  /** Last top-bar clearance this panel rendered against (see update()). */
  private lastBarClear = '';
  private flashIds = new Set<string>();

  constructor(
    private root: HTMLElement,
    private onFocusTarget: (target: ObjectiveTargetTile) => void,
    private authoredObjectiveIds: readonly string[] = [],
  ) {
    if (!document.getElementById('bf-obj-style')) {
      const style = document.createElement('style');
      style.id = 'bf-obj-style';
      style.textContent = OBJ_CSS;
      document.head.appendChild(style);
    }
    this.wideViewport = autoOpenObjectives(window.innerWidth);
    this.viewportKey = `${window.innerWidth}x${window.innerHeight}`;
    this.open = this.wideViewport;
    this.el = document.createElement('div');
    this.el.className = this.open ? 'bf-objectives open' : 'bf-objectives';
    this.headEl = document.createElement('div');
    this.headEl.className = 'bf-obj-head';
    this.summaryEl = document.createElement('button');
    this.summaryEl.type = 'button';
    this.summaryEl.className = 'bf-obj-summary';
    this.summaryEl.setAttribute('aria-expanded', String(this.open));
    this.positionEl = document.createElement('span');
    this.positionEl.className = 'bf-obj-position';
    this.currentTextEl = document.createElement('span');
    this.currentTextEl.className = 'bf-obj-current-text';
    this.currentProgressEl = document.createElement('span');
    this.currentProgressEl.className = 'bf-obj-current-progress';
    this.summaryEl.append(this.positionEl, this.currentTextEl, this.currentProgressEl);
    this.summaryEl.addEventListener('click', () => {
      this.open = !this.open;
      this.el.classList.toggle('open', this.open);
      this.summaryEl.setAttribute('aria-expanded', String(this.open));
    });
    this.headFocusEl = document.createElement('button');
    this.headFocusEl.type = 'button';
    this.headFocusEl.className = 'bf-obj-focus';
    this.headFocusEl.textContent = '◎';
    this.headFocusEl.setAttribute('aria-label', 'Show current objective on map');
    this.headFocusEl.addEventListener('click', () => this.focusCurrentTarget());
    this.headEl.append(this.summaryEl, this.headFocusEl);
    this.listEl = document.createElement('ul');
    this.listEl.className = 'bf-obj-list';
    this.el.append(this.headEl, this.listEl);
    this.root.appendChild(this.el);

    this.markerEl = document.createElement('button');
    this.markerEl.type = 'button';
    this.markerEl.className = 'bf-obj-marker';
    this.markerEl.setAttribute('aria-label', 'Go to current objective');
    this.markerEl.addEventListener('click', () => this.focusCurrentTarget());
    this.root.appendChild(this.markerEl);
  }

  destroy(): void {
    this.root.style.removeProperty('--bf-objectives-message-top');
    this.el.remove();
    this.markerEl.remove();
  }

  add(id: string, text: string): void {
    this.model.add(id, text);
    if (autoOpenObjectives(window.innerWidth)) {
      this.open = true;
      this.el.classList.add('open');
      this.summaryEl.setAttribute('aria-expanded', 'true');
    }
    this.notify(id);
  }

  complete(id: string): void {
    this.model.complete(id);
    this.notify(id);
  }

  fail(id: string): void {
    this.model.fail(id);
    this.notify(id);
  }

  setReadouts(readouts: readonly ObjectiveGuideReadout[]): void {
    for (const readout of readouts) this.model.setReadout(readout);
  }

  get currentTarget(): ObjectiveTargetTile | undefined {
    return this.model.current?.readout?.target;
  }

  private focusCurrentTarget(): void {
    const target = this.currentTarget;
    if (target) this.onFocusTarget(target);
  }

  private notify(id: string): void {
    this.flashIds.add(id);
    if (this.open) return;
    this.headEl.classList.remove('flash');
    void this.headEl.offsetWidth;
    this.headEl.classList.add('flash');
  }

  /** Reposition the animated marker every frame without re-evaluating progress. */
  updateMarker(targetScreen: { x: number; y: number } | null, viewportWidth: number, viewportHeight: number): void {
    if (!targetScreen || !this.currentTarget) {
      this.markerEl.className = 'bf-obj-marker';
      return;
    }
    const placement = objectiveMarkerPlacement(targetScreen.x, targetScreen.y, viewportWidth, viewportHeight);
    this.markerEl.className = `bf-obj-marker show ${placement.kind}`;
    this.markerEl.style.left = `${placement.x}px`;
    this.markerEl.style.top = `${placement.y}px`;
    this.markerEl.style.pointerEvents = objectiveMarkerPointerEvents(placement.kind);
    this.markerEl.style.setProperty('--bf-obj-angle', `${placement.angle}deg`);
  }

  /** Call once per frame; DOM content re-renders only when state/progress changes. */
  update(): void {
    const nextViewportKey = `${window.innerWidth}x${window.innerHeight}`;
    const viewportChanged = nextViewportKey !== this.viewportKey;
    if (viewportChanged) {
      this.viewportKey = nextViewportKey;
      const nextWideViewport = autoOpenObjectives(window.innerWidth);
      if (nextWideViewport !== this.wideViewport) {
        this.wideViewport = nextWideViewport;
        this.open = nextWideViewport;
        this.el.classList.toggle('open', this.open);
        this.summaryEl.setAttribute('aria-expanded', String(this.open));
      }
    }
    const items = this.model.items();
    const key = items.map((objective) => {
      const progress = objective.readout?.goals
        .map((goal) => `${goal.label}:${goal.have}:${goal.need}:${goal.done}`).join(',') ?? '';
      const target = objective.readout?.target;
      return `${objective.id}:${objective.state}:${progress}:${target?.x ?? ''}:${target?.y ?? ''}`;
    }).join('|');
    // The panel's own top tracks the measured top bar, so it can move without
    // any of its content changing — a mid-match re-wrap (four-digit stockpiles)
    // or a HUD SIZE change. Re-render on that too, or the message clearance
    // published at the end of this method goes stale and the scenario banner
    // lands back on top of the objective head.
    const barClear = this.root.style.getPropertyValue(HUD_TOP_BAR_BOTTOM_VAR);
    const barMoved = barClear !== this.lastBarClear;
    if (key === this.lastKey && this.flashIds.size === 0 && !viewportChanged && !barMoved) return;
    this.lastKey = key;
    this.lastBarClear = barClear;

    const current = this.model.current;
    if (current) {
      const sequence = objectiveSequencePosition(current.id, items, this.authoredObjectiveIds);
      this.positionEl.textContent = `OBJECTIVE ${sequence.position}/${sequence.total}`;
      this.currentTextEl.textContent = current.text;
      this.currentProgressEl.textContent = objectiveProgressSummary(current);
    } else {
      const total = Math.max(this.authoredObjectiveIds.length, items.length);
      this.positionEl.textContent = items.length > 0 ? `OBJECTIVES ${items.length}/${total}` : 'OBJECTIVES';
      this.currentTextEl.textContent = items.length > 0 ? 'All current goals resolved' : 'Awaiting orders';
      this.currentProgressEl.textContent = '';
    }
    this.headFocusEl.classList.toggle('show', this.currentTarget !== undefined);

    this.listEl.replaceChildren();
    for (const objective of items) {
      const displayState = objectiveDisplayState(objective, current?.id);
      const li = document.createElement('li');
      li.className = `bf-obj-item ${displayState}${this.flashIds.has(objective.id) ? ' flash' : ''}`;
      const mark = document.createElement('span');
      mark.className = 'bf-obj-mark';
      mark.textContent = MARK[displayState];
      const body = document.createElement('div');
      const text = document.createElement('span');
      text.textContent = objective.text;
      body.appendChild(text);
      if ((objective.readout?.goals.length ?? 0) > 0) {
        const progress = document.createElement('div');
        progress.className = 'bf-obj-progress';
        for (const goal of objective.readout!.goals) {
          const chip = document.createElement('span');
          chip.className = `bf-obj-chip${goal.done ? ' done' : ''}`;
          chip.textContent = `${goal.label} ${goal.have}/${goal.need}`;
          progress.appendChild(chip);
        }
        body.appendChild(progress);
      }
      li.append(mark, body);
      if (objective.readout?.target && objective.state === 'open') {
        const focus = document.createElement('button');
        focus.type = 'button';
        focus.className = 'bf-obj-row-focus';
        focus.textContent = '◎';
        focus.setAttribute('aria-label', `Show objective on map: ${objective.text}`);
        focus.addEventListener('click', () => this.onFocusTarget(objective.readout!.target!));
        li.appendChild(focus);
      }
      this.listEl.appendChild(li);
    }
    this.flashIds.clear();
    if (this.wideViewport) {
      this.root.style.removeProperty('--bf-objectives-message-top');
    } else {
      const rootRect = this.root.getBoundingClientRect();
      const headRect = this.headEl.getBoundingClientRect();
      const messageTop = Math.ceil(headRect.bottom - rootRect.top + 14);
      this.root.style.setProperty('--bf-objectives-message-top', `${messageTop}px`);
    }
  }
}
