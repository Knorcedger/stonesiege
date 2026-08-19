import { PNG } from 'pngjs';

/**
 * Remove disconnected matte specks and neighboring-cell bleed from an authored
 * cutout. The approved units, animals, clothing, and carried tools are each one
 * connected silhouette; tiny secondary components are chroma-removal debris.
 */
export function clearMinorAlphaComponents(png: PNG): void {
  const seen = new Uint8Array(png.width * png.height);
  const components: number[][] = [];

  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || png.data[start * 4 + 3] < 8) continue;
    const component: number[] = [];
    const queue = [start];
    seen[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      component.push(index);
      const x = index % png.width;
      const y = Math.floor(index / png.width);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= png.width || ny >= png.height) continue;
          const next = ny * png.width + nx;
          if (seen[next] || png.data[next * 4 + 3] < 8) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    components.push(component);
  }

  if (components.length <= 1) return;
  components.sort((a, b) => b.length - a.length);
  for (const component of components.slice(1)) {
    for (const index of component) png.data.fill(0, index * 4, index * 4 + 4);
  }
}
