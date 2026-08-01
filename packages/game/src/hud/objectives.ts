// Scenario objectives panel: collapsible parchment list, top-right, fed live
// by TriggerRuntime host callbacks (add/complete/fail). Completed objectives
// get a gold check, failed a red cross; new/changed entries flash briefly.
// On narrow viewports the expanded list would cover the control-group chips,
// so there the panel stays collapsed and flashes its head instead of
// force-opening (expanding stays a deliberate tap on the head).

import { CHIPS_NARROW_MAX_PX } from './layout';

export type ObjectiveUiState = 'open' | 'complete' | 'failed';

export interface ObjectiveItem {
  id: string;
  text: string;
  state: ObjectiveUiState;
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
    if (item && item.state === 'open') item.state = 'complete';
  }

  fail(id: string): void {
    const item = this.byId.get(id);
    if (item && item.state === 'open') item.state = 'failed';
  }

  items(): readonly ObjectiveItem[] {
    return this.list;
  }

  get openCount(): number {
    return this.list.filter((o) => o.state === 'open').length;
  }
}

/**
 * May the panel auto-expand (new objective) without burying the chip strip?
 * The list is right-anchored at width min(250px, 60vw); the chips are centered
 * (up to 4 × 44px + gaps ≈ 194px wide). Their x-ranges overlap for viewports
 * narrower than ~706px, and below the 720px breakpoint the chips sit at
 * y 84..128 — squarely under the expanded list. So: only auto-open above the
 * chip strip's narrow breakpoint, where the two can never collide.
 */
export function autoOpenObjectives(viewportWidth: number): boolean {
  return viewportWidth > CHIPS_NARROW_MAX_PX;
}

const OBJ_CSS = `
.bf-objectives { position:absolute; right:6px; top:40px; width:min(250px, 60vw); z-index:24;
  font-family:"Pixelify Sans",monospace; pointer-events:auto; }
.bf-obj-head { display:flex; align-items:center; justify-content:space-between; padding:5px 10px;
  background:linear-gradient(#3a2a18,#2C1F12); border:1px solid #64492B; border-radius:4px;
  box-shadow:0 0 0 1px #1A1208; color:#E6C04A; font-size:13px; letter-spacing:1px; cursor:pointer; }
.bf-obj-head .bf-obj-count { color:#B99A6B; font-size:12px; }
.bf-obj-list { margin:2px 0 0; padding:6px 8px; list-style:none; display:none;
  background:linear-gradient(rgba(44,31,18,0.92), rgba(26,18,8,0.92));
  border:1px solid #64492B; border-radius:4px; box-shadow:0 0 0 1px #1A1208; }
.bf-objectives.open .bf-obj-list { display:block; }
.bf-obj-item { display:flex; gap:7px; align-items:baseline; padding:3px 0; font-size:13px;
  line-height:1.3; color:#EFDDB5; }
.bf-obj-item .bf-obj-mark { flex:0 0 auto; width:14px; text-align:center; font-size:12px; }
.bf-obj-item.complete { color:#9a8a68; text-decoration:line-through; }
.bf-obj-item.complete .bf-obj-mark { color:#E6C04A; text-decoration:none; }
.bf-obj-item.failed { color:#8a6a60; }
.bf-obj-item.failed .bf-obj-mark { color:#C05B4E; }
.bf-obj-item.flash { animation:bfObjFlash 0.9s ease-out; }
@keyframes bfObjFlash { 0% { background:rgba(230,192,74,0.35); } 100% { background:transparent; } }
/* collapsed-panel notification: the head glows gold when an objective changes
   while the list is closed (narrow viewports never force-open the list) */
.bf-obj-head.flash { animation:bfObjHeadFlash 0.9s ease-out; }
@keyframes bfObjHeadFlash {
  0% { box-shadow:0 0 0 2px #E6C04A, 0 0 12px rgba(230,192,74,0.85); }
  100% { box-shadow:0 0 0 1px #1A1208; }
}
`;

const MARK: Record<ObjectiveUiState, string> = { open: '◈', complete: '✔', failed: '✖' };

export class ObjectivesPanel {
  readonly model = new ObjectivesModel();
  private el: HTMLDivElement;
  private headEl: HTMLDivElement;
  private listEl: HTMLUListElement;
  private countEl: HTMLSpanElement;
  private open: boolean;
  private lastKey = '';
  private flashIds = new Set<string>();

  constructor(root: HTMLElement) {
    if (!document.getElementById('bf-obj-style')) {
      const style = document.createElement('style');
      style.id = 'bf-obj-style';
      style.textContent = OBJ_CSS;
      document.head.appendChild(style);
    }
    // Start collapsed on narrow viewports: the expanded list sits on top of
    // control-group chips 2-4 there (measured at 390×844), making them
    // untappable until the player collapses the panel by hand.
    this.open = autoOpenObjectives(window.innerWidth);
    this.el = document.createElement('div');
    this.el.className = this.open ? 'bf-objectives open' : 'bf-objectives';
    const head = document.createElement('div');
    head.className = 'bf-obj-head';
    this.headEl = head;
    const title = document.createElement('span');
    title.textContent = 'Objectives';
    this.countEl = document.createElement('span');
    this.countEl.className = 'bf-obj-count';
    head.append(title, this.countEl);
    head.addEventListener('click', () => {
      this.open = !this.open;
      this.el.classList.toggle('open', this.open);
    });
    this.listEl = document.createElement('ul');
    this.listEl.className = 'bf-obj-list';
    this.el.append(head, this.listEl);
    root.appendChild(this.el);
  }

  destroy(): void {
    this.el.remove();
  }

  add(id: string, text: string): void {
    this.model.add(id, text);
    // wide viewports: a new objective reveals the list; narrow viewports flash
    // the collapsed head instead (opening would bury the control-group chips)
    if (autoOpenObjectives(window.innerWidth)) {
      this.open = true;
      this.el.classList.add('open');
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

  /** Flash the changed entry — or the head, when the list is collapsed. */
  private notify(id: string): void {
    this.flashIds.add(id);
    if (this.open) return;
    // retrigger the head glow even if a previous flash is still running
    this.headEl.classList.remove('flash');
    void this.headEl.offsetWidth;
    this.headEl.classList.add('flash');
  }

  /** Call once per frame; re-renders only when something changed. */
  update(): void {
    const items = this.model.items();
    const key = items.map((o) => `${o.id}:${o.state}`).join('|');
    if (key === this.lastKey && this.flashIds.size === 0) return;
    this.lastKey = key;
    this.countEl.textContent = items.length > 0 ? `${items.filter((o) => o.state === 'complete').length}/${items.length}` : '';
    this.listEl.replaceChildren();
    for (const o of items) {
      const li = document.createElement('li');
      li.className = `bf-obj-item ${o.state}${this.flashIds.has(o.id) ? ' flash' : ''}`;
      const mark = document.createElement('span');
      mark.className = 'bf-obj-mark';
      mark.textContent = MARK[o.state];
      const text = document.createElement('span');
      text.textContent = o.text;
      li.append(mark, text);
      this.listEl.appendChild(li);
    }
    this.flashIds.clear();
  }
}
