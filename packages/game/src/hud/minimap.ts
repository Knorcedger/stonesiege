// Bottom-left minimap (ARCHITECTURE: offscreen canvas, terrain baked once,
// entities/fog refreshed ~4 Hz). Tap to jump. Entity dots use the player mid
// tone; resources are outlined dots per ART_BIBLE §8.1.

import { FP, GAIA, type Entity, type GameState, type PlayerId } from '@bf/sim/types';
import type { GameAssets } from '../assets';
import type { Camera } from '../camera';
import { worldToTile } from '../camera';
import { setGameTooltip } from '../tooltip';

const SIZE = 168;
const TERRAIN_MINI_COLORS: Record<string, string> = {
  grass: '#527033', dirt: '#6B4E2E', sand: '#A8854F', water: '#1D4763',
  shallows: '#2C6283', road: '#A8854F', farmland: '#5E4A2C', snow: '#B9B9C4', cliff: '#3E4654',
};
const RES_COLORS: Record<string, string> = {
  goldMine: '#E6C04A', stoneMine: '#C0C0C6', berryBush: '#A62E3E', tree: '#2E5426',
};

const PING_MS = 3000;
const MOVE_MARKER_MS = 700;

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private terrainBase: HTMLCanvasElement; // tile-space, 1px per tile
  private lastRefresh = 0;
  private pings: Array<{ tileX: number; tileY: number; at: number }> = [];
  private moveMarkers: Array<{ tileX: number; tileY: number; at: number }> = [];
  private objectiveTarget: { tileX: number; tileY: number } | null = null;

  constructor(
    slot: HTMLElement,
    private assets: GameAssets,
    private getState: () => GameState,
    private camera: Camera,
    private humanPlayer: PlayerId,
    private fogCanvas: HTMLCanvasElement,
    private onJump: (tileX: number, tileY: number) => void,
    private onMove: (tileX: number, tileY: number) => boolean,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bf-minimapcanvas';
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.canvas.style.cssText =
      `width:${SIZE}px;height:${SIZE}px;display:block;background:#14100a;` +
      'border:1px solid #1A1208;box-shadow:0 0 0 1px #8A6414, 0 0 0 3px #2C1F12;border-radius:3px;cursor:pointer;';
    slot.appendChild(this.canvas);
    setGameTooltip(this.canvas, 'Left-click: center camera\nRight-click: move selected units');
    this.ctx = this.canvas.getContext('2d')!;

    const state = this.getState();
    this.terrainBase = document.createElement('canvas');
    this.terrainBase.width = state.map.width;
    this.terrainBase.height = state.map.height;
    this.bakeTerrain(state);

    this.canvas.addEventListener('pointerdown', (ev) => {
      // CSS may downscale the canvas on narrow screens (media query) — map
      // pointer coords back into the fixed internal SIZE space before inverting.
      const rect = this.canvas.getBoundingClientRect();
      const sx = rect.width > 0 ? SIZE / rect.width : 1;
      const sy = rect.height > 0 ? SIZE / rect.height : 1;
      const t = this.pixelToTile((ev.clientX - rect.left) * sx, (ev.clientY - rect.top) * sy);
      if (t) {
        if (ev.button === 2) {
          if (this.onMove(t.x, t.y)) {
            this.moveMarkers.push({ tileX: t.x, tileY: t.y, at: performance.now() });
            this.redraw();
          }
        }
        else if (ev.button === 0) this.onJump(t.x, t.y);
      }
      ev.preventDefault();
      ev.stopPropagation();
    });
    this.canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  /** Rebake the terrain base (terrain rarely changes). */
  bakeTerrain(state: GameState): void {
    const { map } = state;
    const ctx = this.terrainBase.getContext('2d')!;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const id = map.terrainIds[map.terrain[y * map.width + x]];
        ctx.fillStyle = TERRAIN_MINI_COLORS[id] ?? '#527033';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /** ~4 Hz refresh; call every frame with the elapsed clock. */
  update(nowMs: number): void {
    // active pings animate at full refresh so the alert reads as motion
    const interval = this.pings.length > 0 || this.moveMarkers.length > 0 ? 50 : 250;
    if (nowMs - this.lastRefresh < interval) return;
    this.lastRefresh = nowMs;
    this.redraw();
  }

  /** Red expanding alert ring (underAttack event). Redraws immediately. */
  ping(tileX: number, tileY: number): void {
    this.pings.push({ tileX, tileY, at: performance.now() });
    this.redraw();
  }

  /** Persistent current-objective marker; null for progress-only goals. */
  setObjectiveTarget(target: { x: number; y: number } | null): void {
    if (
      this.objectiveTarget?.tileX === target?.x
      && this.objectiveTarget?.tileY === target?.y
    ) return;
    this.objectiveTarget = target ? { tileX: target.x, tileY: target.y } : null;
    this.redraw();
  }

  private tileTransform(state: GameState): { a: number; b: number; c: number; d: number; e: number; f: number } {
    const w = state.map.width;
    const h = state.map.height;
    // tile (x,y) -> minimap px: iso diamond fitted into the square canvas
    const a = SIZE / (2 * w);
    const c = -SIZE / (2 * h);
    const b = SIZE / (2 * w);
    const d = SIZE / (2 * h);
    return { a, b, c, d, e: SIZE / 2, f: 0 };
  }

  private redraw(): void {
    const state = this.getState();
    const ctx = this.ctx;
    const m = this.tileTransform(state);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.imageSmoothingEnabled = false;

    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.drawImage(this.terrainBase, 0, 0);
    // fog (reuse the FogLayer tile-space canvas: alpha = darkness)
    ctx.drawImage(this.fogCanvas, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // entities
    const vis = state.players[this.humanPlayer]?.visibility;
    for (const e of state.entities.values()) {
      const tv = vis ? vis[e.tileY * state.map.width + e.tileX] : 2;
      const px = m.a * (e.x / FP) + m.c * (e.y / FP) + m.e;
      const py = m.b * (e.x / FP) + m.d * (e.y / FP) + m.f;
      if (e.kind === 'resource') {
        if (tv < 1) continue;
        ctx.fillStyle = '#1A1208';
        ctx.fillRect(px - 1, py - 1, 3, 3);
        ctx.fillStyle = RES_COLORS[e.defId] ?? '#C0C0C6';
        ctx.fillRect(px, py, 1, 1);
      } else {
        const own = e.player === this.humanPlayer;
        if (!own && tv < 2) continue;
        if (e.activity === 'dying') continue;
        if (e.player === GAIA) {
          ctx.fillStyle = '#EFDDB5';
          ctx.fillRect(px, py, 1, 1);
          continue;
        }
        const color = state.players[e.player]?.setup.color ?? 6;
        ctx.fillStyle = this.assets.getPlayerRampCss(color)[1];
        const s = e.kind === 'building' ? 3 : 2;
        ctx.fillRect(px - s / 2, py - s / 2, s, s);
      }
    }

    // under-attack pings: expanding red rings, ~3 s
    const now = performance.now();
    this.pings = this.pings.filter((p) => now - p.at < PING_MS);
    for (const p of this.pings) {
      const t = (now - p.at) / PING_MS;
      const px = m.a * p.tileX + m.c * p.tileY + m.e;
      const py = m.b * p.tileX + m.d * p.tileY + m.f;
      const cycle = (t * 3) % 1; // three expanding pulses over the ping's life
      ctx.strokeStyle = `rgba(214,49,38,${(1 - cycle).toFixed(2)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 3 + cycle * 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Right-click move confirmation: a compact descending chevron at the exact
    // minimap destination. The full-sized counterpart is drawn in FxLayer.
    this.moveMarkers = this.moveMarkers.filter((p) => now - p.at < MOVE_MARKER_MS);
    for (const marker of this.moveMarkers) {
      const t = (now - marker.at) / MOVE_MARKER_MS;
      const px = m.a * marker.tileX + m.c * marker.tileY + m.e;
      const py = m.b * marker.tileX + m.d * marker.tileY + m.f - (1 - t) * 5;
      ctx.save();
      ctx.globalAlpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      ctx.fillStyle = '#8FD45E';
      ctx.strokeStyle = '#1A1208';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px - 5, py - 4);
      ctx.lineTo(px, py + 2);
      ctx.lineTo(px + 5, py - 4);
      ctx.lineTo(px + 5, py);
      ctx.lineTo(px, py + 6);
      ctx.lineTo(px - 5, py);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Current spatial objective: a persistent pulsing gold diamond with a dark
    // backing, deliberately distinct from resource dots and red attack pings.
    if (this.objectiveTarget) {
      const px = m.a * this.objectiveTarget.tileX + m.c * this.objectiveTarget.tileY + m.e;
      const py = m.b * this.objectiveTarget.tileX + m.d * this.objectiveTarget.tileY + m.f;
      const radius = 4.5 + (Math.sin(now / 180) + 1) * 1.25;
      ctx.save();
      ctx.fillStyle = '#1A1208';
      ctx.beginPath();
      ctx.moveTo(px, py - radius - 2);
      ctx.lineTo(px + radius + 2, py);
      ctx.lineTo(px, py + radius + 2);
      ctx.lineTo(px - radius - 2, py);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#E6C04A';
      ctx.beginPath();
      ctx.moveTo(px, py - radius);
      ctx.lineTo(px + radius, py);
      ctx.lineTo(px, py + radius);
      ctx.lineTo(px - radius, py);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // camera view trapezoid
    const view = this.camera.getWorldView();
    ctx.strokeStyle = '#F4EEDD';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const corners: Array<[number, number]> = [
      [view.x0, view.y0], [view.x1, view.y0], [view.x1, view.y1], [view.x0, view.y1],
    ];
    corners.forEach(([wx, wy], i) => {
      const t = worldToTile(wx, wy);
      const px = m.a * t.x + m.c * t.y + m.e;
      const py = m.b * t.x + m.d * t.y + m.f;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
  }

  private pixelToTile(px: number, py: number): { x: number; y: number } | null {
    const state = this.getState();
    const m = this.tileTransform(state);
    // invert [a c; b d]
    const det = m.a * m.d - m.c * m.b;
    if (det === 0) return null;
    const dx = px - m.e;
    const dy = py - m.f;
    const tx = (m.d * dx - m.c * dy) / det;
    const ty = (-m.b * dx + m.a * dy) / det;
    if (tx < 0 || ty < 0 || tx >= state.map.width || ty >= state.map.height) return null;
    return { x: tx, y: ty };
  }
}
