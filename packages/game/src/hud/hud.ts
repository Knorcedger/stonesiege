// DOM HUD (ARCHITECTURE: HUD is DOM for crisp text + native touch targets).
// Top resource/pop/age bar, selection info panel, context-sensitive command
// card (train / build / military verbs) with cost tooltips + queue progress,
// undo toast (~2 s), pause overlay, placement confirm/cancel.
// Styling follows ART_BIBLE §8 (dark wood + parchment + gold).

import { AGES, type Entity, type EntityId, type GameState, type PlayerId, type ResourceType } from '@bf/sim/types';
import { gameData } from '@bf/data';
import type { GameAssets } from '../assets';

export interface HudHost {
  assets: GameAssets;
  humanPlayer: PlayerId;
  getState(): GameState;
  getSelection(): Entity[];
  deselect(): void;
  trainUnit(buildingId: EntityId, defId: string): void;
  cancelTrain(buildingId: EntityId, index: number): void;
  startPlacement(defId: string): void;
  confirmPlacement(): void;
  cancelPlacement(): void;
  getPlacement(): { defId: string; valid: boolean; affordable: boolean } | null;
  stopSelection(): void;
  toggleAttackMove(): void;
  isAttackMoveArmed(): boolean;
  togglePause(): void;
  isPaused(): boolean;
  resumeGame(): void;
}

const RESOURCES: ResourceType[] = ['food', 'wood', 'gold', 'stone'];
const AGE_LABEL: Record<string, string> = {
  dark: 'Dark Age', feudal: 'Feudal Age', castle: 'Castle Age', imperial: 'Imperial Age',
};

const HUD_CSS = `
.bf-hud { position:absolute; inset:0; pointer-events:none; font-family:"Pixelify Sans","VT323",monospace; color:#EFDDB5; user-select:none; -webkit-user-select:none; }
.bf-panel { background:linear-gradient(#3a2a18,#2C1F12); border:1px solid #1A1208; box-shadow:0 0 0 1px #8A6414 inset, 0 0 0 2px #64492B inset; border-radius:4px; }
.bf-top { position:absolute; top:6px; left:6px; right:6px; height:34px; display:flex; align-items:center; gap:14px; padding:0 10px; pointer-events:auto; }
.bf-res { display:flex; align-items:center; gap:5px; font-size:16px; }
.bf-res canvas { width:22px; height:22px; image-rendering:pixelated; }
.bf-age { margin-left:auto; font-size:16px; color:#E6C04A; letter-spacing:1px; }
.bf-btn { pointer-events:auto; background:#46331F; color:#EFDDB5; border:1px solid #8A6414; border-radius:3px; font-family:inherit; font-size:14px; padding:3px 10px; cursor:pointer; }
.bf-btn:active { transform:translate(1px,1px); }
.bf-btn:disabled { color:#8a8a8a; border-color:#5a5a5a; cursor:default; }
.bf-selpanel { position:absolute; left:6px; bottom:172px; width:172px; padding:8px; pointer-events:auto; display:none; }
.bf-selpanel.show { display:block; }
.bf-selrow { display:flex; gap:8px; align-items:center; }
.bf-selrow canvas { width:40px; height:40px; image-rendering:pixelated; border:1px solid #8A6414; }
.bf-selname { font-size:15px; flex:1; }
.bf-selhp { font-size:13px; color:#DABE8D; }
.bf-x { position:absolute; top:2px; right:2px; width:22px; height:22px; padding:0; line-height:18px; font-size:14px; }
.bf-card { position:absolute; right:6px; bottom:6px; width:246px; padding:8px; pointer-events:auto; display:none; }
.bf-card.show { display:block; }
.bf-cardtitle { font-size:13px; color:#C29422; margin:0 0 6px 2px; letter-spacing:1px; }
.bf-grid { display:grid; grid-template-columns:repeat(5,44px); gap:4px; }
.bf-cmdbtn { position:relative; width:44px; height:44px; padding:1px; background:#2C1F12; border:1px solid #8A6414; border-radius:3px; cursor:pointer; pointer-events:auto; }
.bf-cmdbtn canvas { width:40px; height:40px; image-rendering:pixelated; display:block; }
.bf-cmdbtn:disabled { border-color:#5a5a5a; opacity:0.9; }
.bf-cmdbtn:disabled canvas { filter:grayscale(1) brightness(0.55); }
.bf-cmdbtn.active { border-color:#E6C04A; box-shadow:0 0 0 1px #E6C04A; }
.bf-queue { display:flex; gap:4px; margin-top:6px; min-height:36px; } /* fixed height: chips appearing must not reflow the card (misclick = cancel) */
.bf-qitem { position:relative; width:34px; height:34px; border:1px solid #64492B; background:#2C1F12; }
.bf-qitem canvas { width:32px; height:32px; image-rendering:pixelated; }
.bf-qprog { position:absolute; left:0; bottom:0; height:3px; background:#C29422; }
.bf-tip { position:absolute; right:6px; bottom:190px; max-width:250px; padding:6px 9px; font-size:13px; color:#1A1208; background:#DABE8D; border:1px solid #B99A6B; border-radius:3px; display:none; pointer-events:none; }
.bf-toast { position:absolute; left:50%; bottom:120px; transform:translateX(-50%); padding:6px 10px; display:none; align-items:center; gap:10px; font-size:14px; pointer-events:auto; }
.bf-toast.show { display:flex; }
.bf-pause { position:absolute; inset:0; background:rgba(10,8,5,0.72); display:none; align-items:center; justify-content:center; flex-direction:column; gap:14px; pointer-events:auto; z-index:40; }
.bf-pause.show { display:flex; }
.bf-pause h2 { font-family:"Jacquard 12","Pixelify Sans",monospace; font-size:42px; color:#E6C04A; margin:0; }
.bf-place { position:absolute; left:50%; bottom:14px; transform:translateX(-50%); padding:8px 10px; display:none; gap:10px; pointer-events:auto; }
.bf-place.show { display:flex; }
`;

function costText(cost: Partial<Record<ResourceType, number>>): string {
  const parts: string[] = [];
  for (const r of RESOURCES) {
    const v = cost[r];
    if (v) parts.push(`${v} ${r}`);
  }
  return parts.join(', ') || 'free';
}

function canAfford(state: GameState, player: PlayerId, cost: Partial<Record<ResourceType, number>>): boolean {
  const p = state.players[player];
  if (!p) return false;
  return RESOURCES.every((r) => (p.stockpile[r] ?? 0) >= (cost[r] ?? 0));
}

export class Hud {
  private root: HTMLElement;
  private host: HudHost;
  private el: HTMLDivElement;
  private resSpans = new Map<ResourceType, HTMLSpanElement>();
  private popSpan!: HTMLSpanElement;
  private ageSpan!: HTMLSpanElement;
  private pauseBtn!: HTMLButtonElement;
  private selPanel!: HTMLDivElement;
  private selIcon!: HTMLDivElement;
  private selName!: HTMLDivElement;
  private selHp!: HTMLDivElement;
  private card!: HTMLDivElement;
  private cardTitle!: HTMLDivElement;
  private cardGrid!: HTMLDivElement;
  private queueRow!: HTMLDivElement;
  private tip!: HTMLDivElement;
  private toast!: HTMLDivElement;
  private toastLabel!: HTMLSpanElement;
  private toastUndoBtn!: HTMLButtonElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private toastUndoFn: (() => void) | null = null;
  private pauseOverlay!: HTMLDivElement;
  private placeBar!: HTMLDivElement;
  private placeConfirm!: HTMLButtonElement;
  private placeLabel!: HTMLSpanElement;
  private lastCardKey = '';
  private queueProgressEls: Array<{ el: HTMLDivElement; buildingId: EntityId; index: number }> = [];

  /** The minimap panel mounts here (bottom-left). */
  readonly minimapSlot: HTMLDivElement;

  constructor(root: HTMLElement, host: HudHost) {
    this.root = root;
    this.host = host;
    if (!document.getElementById('bf-hud-style')) {
      const style = document.createElement('style');
      style.id = 'bf-hud-style';
      style.textContent = HUD_CSS;
      document.head.appendChild(style);
    }
    this.el = document.createElement('div');
    this.el.className = 'bf-hud';
    root.appendChild(this.el);

    this.buildTopBar();
    this.buildSelectionPanel();
    this.buildCard();
    this.buildToast();
    this.buildPauseOverlay();
    this.buildPlacementBar();

    this.minimapSlot = document.createElement('div');
    this.minimapSlot.style.cssText = 'position:absolute;left:6px;bottom:6px;pointer-events:auto;';
    this.el.appendChild(this.minimapSlot);
  }

  destroy(): void {
    this.el.remove();
  }

  // ------------------------------------------------------------------ update

  update(): void {
    const state = this.host.getState();
    const p = state.players[this.host.humanPlayer];
    if (p) {
      for (const r of RESOURCES) {
        const span = this.resSpans.get(r);
        if (span) span.textContent = String(Math.floor(p.stockpile[r] ?? 0));
      }
      this.popSpan.textContent = `${p.pop}/${p.popCap}`;
      this.ageSpan.textContent = AGE_LABEL[p.age] ?? p.age;
    }
    this.pauseBtn.textContent = this.host.isPaused() ? '▶' : 'II';
    this.pauseOverlay.classList.toggle('show', this.host.isPaused());
    this.updateSelectionPanel();
    this.updateCard(state);
    this.updatePlacementBar();
  }

  showUndoToast(label: string, onUndo: (() => void) | null): void {
    this.toastLabel.textContent = label;
    this.toastUndoFn = onUndo;
    this.toastUndoBtn.style.display = onUndo ? '' : 'none';
    this.toast.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('show'), 2000);
  }

  // ------------------------------------------------------------------ builders

  private buildTopBar(): void {
    const bar = document.createElement('div');
    bar.className = 'bf-panel bf-top';
    for (const r of RESOURCES) {
      const box = document.createElement('div');
      box.className = 'bf-res';
      box.appendChild(this.host.assets.getIconCanvas(`icon/res/${r}`));
      const span = document.createElement('span');
      span.textContent = '0';
      box.appendChild(span);
      this.resSpans.set(r, span);
      bar.appendChild(box);
    }
    const pop = document.createElement('div');
    pop.className = 'bf-res';
    pop.textContent = 'Pop ';
    this.popSpan = document.createElement('span');
    pop.appendChild(this.popSpan);
    bar.appendChild(pop);

    this.ageSpan = document.createElement('span');
    this.ageSpan.className = 'bf-age';
    bar.appendChild(this.ageSpan);

    this.pauseBtn = document.createElement('button');
    this.pauseBtn.className = 'bf-btn';
    this.pauseBtn.textContent = 'II';
    this.pauseBtn.addEventListener('click', () => this.host.togglePause());
    bar.appendChild(this.pauseBtn);
    this.el.appendChild(bar);
  }

  private buildSelectionPanel(): void {
    this.selPanel = document.createElement('div');
    this.selPanel.className = 'bf-panel bf-selpanel';
    const row = document.createElement('div');
    row.className = 'bf-selrow';
    this.selIcon = document.createElement('div');
    row.appendChild(this.selIcon);
    const col = document.createElement('div');
    col.style.flex = '1';
    this.selName = document.createElement('div');
    this.selName.className = 'bf-selname';
    this.selHp = document.createElement('div');
    this.selHp.className = 'bf-selhp';
    col.appendChild(this.selName);
    col.appendChild(this.selHp);
    row.appendChild(col);
    this.selPanel.appendChild(row);
    const x = document.createElement('button');
    x.className = 'bf-btn bf-x';
    x.textContent = '✕';
    x.title = 'Deselect';
    x.addEventListener('click', () => this.host.deselect());
    this.selPanel.appendChild(x);
    this.el.appendChild(this.selPanel);
  }

  private buildCard(): void {
    this.card = document.createElement('div');
    this.card.className = 'bf-panel bf-card';
    this.cardTitle = document.createElement('div');
    this.cardTitle.className = 'bf-cardtitle';
    this.cardGrid = document.createElement('div');
    this.cardGrid.className = 'bf-grid';
    this.queueRow = document.createElement('div');
    this.queueRow.className = 'bf-queue';
    this.card.appendChild(this.cardTitle);
    this.card.appendChild(this.cardGrid);
    this.card.appendChild(this.queueRow);
    this.el.appendChild(this.card);

    this.tip = document.createElement('div');
    this.tip.className = 'bf-tip';
    this.el.appendChild(this.tip);
  }

  private buildToast(): void {
    this.toast = document.createElement('div');
    this.toast.className = 'bf-panel bf-toast';
    this.toastLabel = document.createElement('span');
    this.toast.appendChild(this.toastLabel);
    this.toastUndoBtn = document.createElement('button');
    this.toastUndoBtn.className = 'bf-btn';
    this.toastUndoBtn.textContent = 'Undo';
    this.toastUndoBtn.addEventListener('click', () => {
      this.toastUndoFn?.();
      this.toastUndoFn = null;
      this.toast.classList.remove('show');
    });
    this.toast.appendChild(this.toastUndoBtn);
    this.el.appendChild(this.toast);
  }

  private buildPauseOverlay(): void {
    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.className = 'bf-pause';
    const h = document.createElement('h2');
    h.textContent = 'Paused';
    const btn = document.createElement('button');
    btn.className = 'bf-btn';
    btn.style.fontSize = '18px';
    btn.textContent = 'Resume';
    btn.addEventListener('click', () => this.host.resumeGame());
    this.pauseOverlay.appendChild(h);
    this.pauseOverlay.appendChild(btn);
    this.pauseOverlay.addEventListener('click', (e) => {
      if (e.target === this.pauseOverlay) this.host.resumeGame();
    });
    this.el.appendChild(this.pauseOverlay);
  }

  private buildPlacementBar(): void {
    this.placeBar = document.createElement('div');
    this.placeBar.className = 'bf-panel bf-place';
    this.placeLabel = document.createElement('span');
    this.placeLabel.style.cssText = 'font-size:14px;align-self:center;';
    this.placeConfirm = document.createElement('button');
    this.placeConfirm.className = 'bf-btn';
    this.placeConfirm.textContent = 'Build here';
    this.placeConfirm.addEventListener('click', () => this.host.confirmPlacement());
    const cancel = document.createElement('button');
    cancel.className = 'bf-btn';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => this.host.cancelPlacement());
    this.placeBar.appendChild(this.placeLabel);
    this.placeBar.appendChild(this.placeConfirm);
    this.placeBar.appendChild(cancel);
    this.el.appendChild(this.placeBar);
  }

  // ------------------------------------------------------------------ dynamic

  private updateSelectionPanel(): void {
    const sel = this.host.getSelection();
    if (sel.length === 0) {
      this.selPanel.classList.remove('show');
      return;
    }
    this.selPanel.classList.add('show');
    const first = sel[0];
    const def = gameData.units[first.defId] ?? gameData.buildings[first.defId] ?? gameData.resources[first.defId];
    const name = def?.name ?? first.defId;
    this.selName.textContent = sel.length > 1 ? `${name} ×${sel.length}` : name;
    this.selHp.textContent = first.kind === 'resource'
      ? `${first.amountLeft ?? 0} left`
      : `HP ${Math.max(0, first.hp)} / ${first.maxHp}`;
    const iconName = def?.icon ?? `icon/${first.defId}`;
    if (this.selIcon.dataset.icon !== iconName) {
      this.selIcon.dataset.icon = iconName;
      this.selIcon.replaceChildren(this.host.assets.getIconCanvas(iconName));
    }
  }

  private updateCard(state: GameState): void {
    const sel = this.host.getSelection().filter((e) => e.player === this.host.humanPlayer);
    const placement = this.host.getPlacement();
    const player = state.players[this.host.humanPlayer];

    // signature so we only rebuild the DOM when contents change
    const resKey = player ? RESOURCES.map((r) => Math.floor((player.stockpile[r] ?? 0) / 25)).join(',') : '';
    const key = [
      placement ? `place:${placement.defId}` : '',
      sel.map((e) => `${e.id}:${e.defId}:${e.trainQueue?.length ?? ''}:${e.buildProgress ?? ''}`).join('|'),
      this.host.isAttackMoveArmed() ? 'am' : '',
      player?.age ?? '',
      resKey,
    ].join('#');
    if (key !== this.lastCardKey) {
      this.lastCardKey = key;
      this.rebuildCard(state, sel, !!placement);
    }
    // live queue progress
    for (const q of this.queueProgressEls) {
      const b = state.entities.get(q.buildingId);
      const item = b?.trainQueue?.[q.index];
      if (item) {
        const frac = q.index === 0 ? 1 - item.ticksLeft / item.totalTicks : 0;
        q.el.style.width = `${Math.round(frac * 100)}%`;
      }
    }
  }

  private rebuildCard(state: GameState, sel: Entity[], placementActive: boolean): void {
    this.cardGrid.replaceChildren();
    this.queueRow.replaceChildren();
    this.queueProgressEls = [];
    this.tip.style.display = 'none';
    if (placementActive || sel.length === 0) {
      this.card.classList.remove('show');
      return;
    }
    const player = state.players[this.host.humanPlayer];
    if (!player) return;
    const ageIdx = AGES.indexOf(player.age);

    const buildings = sel.filter((e) => e.kind === 'building');
    const units = sel.filter((e) => e.kind === 'unit');
    const villagers = units.filter((e) => e.defId === 'villager');
    const military = units.filter((e) => e.defId !== 'villager');
    let shown = false;

    if (buildings.length === 1 && units.length === 0) {
      const b = buildings[0];
      const def = gameData.buildings[b.defId];
      const trains = (def?.trains ?? []).filter((uid) => {
        const u = gameData.units[uid];
        return u && !u.requiresTech && AGES.indexOf(u.age) <= ageIdx;
      });
      if ((b.buildProgress ?? 1000) >= 1000 && trains.length > 0) {
        this.cardTitle.textContent = `${def?.name ?? b.defId} — Train`;
        for (const uid of trains) {
          const u = gameData.units[uid];
          this.addButton(u.icon, `${u.name}\n${costText(u.cost)} • ${u.trainTime}s`, canAfford(state, this.host.humanPlayer, u.cost), false, () => this.host.trainUnit(b.id, uid));
        }
        // queue chips
        (b.trainQueue ?? []).forEach((item, i) => {
          const u = gameData.units[item.defId];
          const chip = document.createElement('div');
          chip.className = 'bf-qitem';
          chip.title = `${u?.name ?? item.defId} (tap to cancel)`;
          chip.appendChild(this.host.assets.getIconCanvas(u?.icon ?? `icon/${item.defId}`));
          const prog = document.createElement('div');
          prog.className = 'bf-qprog';
          chip.appendChild(prog);
          chip.addEventListener('click', () => this.host.cancelTrain(b.id, i));
          this.queueRow.appendChild(chip);
          this.queueProgressEls.push({ el: prog, buildingId: b.id, index: i });
        });
        shown = true;
      } else if ((b.buildProgress ?? 1000) < 1000) {
        this.cardTitle.textContent = `${def?.name ?? b.defId} — under construction`;
        shown = true;
      }
    }

    if (villagers.length > 0) {
      this.cardTitle.textContent = 'Build';
      const list = Object.values(gameData.buildings).filter(
        (bd) => !bd.requiresTech && AGES.indexOf(bd.age) <= ageIdx,
      );
      for (const bd of list) {
        this.addButton(bd.icon, `${bd.name}\n${costText(bd.cost)} • ${bd.buildTime}s`, canAfford(state, this.host.humanPlayer, bd.cost), false, () => this.host.startPlacement(bd.id));
      }
      shown = true;
    }

    if (military.length > 0) {
      if (villagers.length === 0) this.cardTitle.textContent = 'Commands';
      this.addButton('icon/cmd/attackMove', 'Attack-move\nNext tap = attack-move there', true, this.host.isAttackMoveArmed(), () => this.host.toggleAttackMove());
      this.addButton('icon/cmd/stop', 'Stop', true, false, () => this.host.stopSelection());
      shown = true;
    } else if (villagers.length > 0) {
      this.addButton('icon/cmd/stop', 'Stop', true, false, () => this.host.stopSelection());
    }

    this.card.classList.toggle('show', shown);
  }

  private addButton(icon: string, tooltip: string, enabled: boolean, active: boolean, onClick: () => void): void {
    const btn = document.createElement('button');
    btn.className = 'bf-cmdbtn' + (active ? ' active' : '');
    btn.disabled = !enabled;
    const iconName = enabled ? icon : this.grayIconName(icon);
    btn.appendChild(this.host.assets.getIconCanvas(iconName));
    btn.addEventListener('click', () => {
      if (enabled) onClick();
      else this.showTip(tooltip + '\n(not enough resources)');
    });
    btn.addEventListener('pointerenter', () => this.showTip(tooltip));
    btn.addEventListener('pointerleave', () => (this.tip.style.display = 'none'));
    this.cardGrid.appendChild(btn);
  }

  private grayIconName(icon: string): string {
    // Contract: every icon has a grayscale companion `icon/<...>/gray`.
    return `${icon}/gray`;
  }

  private showTip(text: string): void {
    this.tip.textContent = '';
    text.split('\n').forEach((line, i) => {
      if (i > 0) this.tip.appendChild(document.createElement('br'));
      this.tip.appendChild(document.createTextNode(line));
    });
    this.tip.style.display = 'block';
  }

  private updatePlacementBar(): void {
    const placement = this.host.getPlacement();
    if (!placement) {
      this.placeBar.classList.remove('show');
      return;
    }
    this.placeBar.classList.add('show');
    const def = gameData.buildings[placement.defId];
    this.placeLabel.textContent = `${def?.name ?? placement.defId} — ${costText(def?.cost ?? {})}`;
    this.placeConfirm.disabled = !placement.valid || !placement.affordable;
    this.placeConfirm.textContent = !placement.affordable
      ? 'Need resources'
      : placement.valid ? 'Build here' : 'Blocked';
  }
}
