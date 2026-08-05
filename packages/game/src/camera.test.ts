import { describe, expect, it } from 'vitest';
import { Camera, tileToWorld, worldToTile } from './camera';

describe('iso transforms (ASSET_CONTRACT geometry)', () => {
  it('tileToWorld matches sx=(x-y)*32, sy=(x+y)*16', () => {
    expect(tileToWorld(0, 0)).toEqual({ x: 0, y: 0 });
    expect(tileToWorld(1, 0)).toEqual({ x: 32, y: 16 });
    expect(tileToWorld(0, 1)).toEqual({ x: -32, y: 16 });
    expect(tileToWorld(3, 5)).toEqual({ x: -64, y: 128 });
  });

  it('worldToTile inverts tileToWorld exactly', () => {
    for (const [tx, ty] of [[0, 0], [5, 3], [119, 119], [7.5, 2.25]]) {
      const w = tileToWorld(tx, ty);
      const t = worldToTile(w.x, w.y);
      expect(t.x).toBeCloseTo(tx, 10);
      expect(t.y).toBeCloseTo(ty, 10);
    }
  });
});

describe('Camera', () => {
  function makeCam(): Camera {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.setMapBounds(120, 120);
    cam.centerOnTile(60, 60);
    return cam;
  }

  it('screenToWorld/worldToScreen round-trip at every zoom', () => {
    const cam = makeCam();
    for (const zoom of [1, 2, 3]) {
      cam.zoom = zoom;
      const w = cam.screenToWorld(123, 456);
      const s = cam.worldToScreen(w.x, w.y);
      expect(s.x).toBeCloseTo(123, 8);
      expect(s.y).toBeCloseTo(456, 8);
    }
  });

  it('panBy follows the finger 1:1 in screen space', () => {
    const cam = makeCam();
    cam.zoom = 2;
    const before = cam.screenToWorld(400, 300);
    cam.panBy(50, -30);
    const after = cam.screenToWorld(450, 270);
    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
  });

  it('zoomStep clamps to 1..3 and keeps the anchor point fixed', () => {
    const cam = makeCam();
    expect(cam.zoom).toBe(1);
    cam.zoomStep(-1);
    expect(cam.zoom).toBe(1); // clamped low
    const anchorWorldBefore = cam.screenToWorld(600, 200);
    cam.zoomStep(1, 600, 200);
    expect(cam.zoom).toBe(2);
    const anchorWorldAfter = cam.screenToWorld(600, 200);
    expect(anchorWorldAfter.x).toBeCloseTo(anchorWorldBefore.x, 6);
    expect(anchorWorldAfter.y).toBeCloseTo(anchorWorldBefore.y, 6);
    cam.zoomStep(1);
    cam.zoomStep(1);
    expect(cam.zoom).toBe(3); // clamped high
  });

  it('repeated wheel-in steps at maximum zoom are strict no-ops', () => {
    const cam = makeCam();
    cam.zoomStep(1, 100, 100);
    cam.zoomStep(1, 700, 500);
    const before = {
      zoom: cam.zoom, x: cam.x, y: cam.y,
      transform: cam.getTransform(), view: cam.getWorldView(),
    };
    for (let i = 0; i < 100; i++) {
      expect(cam.zoomStep(1, i * 7, i * 5)).toBe(false);
    }
    expect({
      zoom: cam.zoom, x: cam.x, y: cam.y,
      transform: cam.getTransform(), view: cam.getWorldView(),
    }).toEqual(before);
  });

  it('clamps to map bounds', () => {
    const cam = makeCam();
    cam.panBy(1e9, 1e9); // fling far up-left of the map
    expect(cam.x).toBeGreaterThanOrEqual(-120 * 32);
    expect(cam.y).toBeGreaterThanOrEqual(0);
    cam.panBy(-1e9, -1e9);
    expect(cam.x).toBeLessThanOrEqual(120 * 32);
    expect(cam.y).toBeLessThanOrEqual(240 * 16);
  });

  it('inertia decays to a stop', () => {
    const cam = makeCam();
    const x0 = cam.x;
    cam.fling(-2, 0); // finger flung left -> camera moves right
    for (let i = 0; i < 300; i++) cam.update(16);
    expect(cam.x).toBeGreaterThan(x0);
    const xAfter = cam.x;
    cam.update(16);
    expect(cam.x).toBe(xAfter); // fully stopped
  });

  it('getTransform returns integer-snapped offsets for crisp NN scaling', () => {
    const cam = makeCam();
    cam.x += 0.37;
    cam.y += 0.61;
    const t = cam.getTransform();
    expect(Number.isInteger(t.x)).toBe(true);
    expect(Number.isInteger(t.y)).toBe(true);
  });
});
