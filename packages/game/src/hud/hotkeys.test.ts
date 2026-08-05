import { describe, expect, it } from 'vitest';
import { COMMAND_HOTKEYS, commandRepeatCount } from './hud';

describe('HUD command hotkeys', () => {
  it('provides a three-row command grid without stealing WASD camera keys', () => {
    expect(COMMAND_HOTKEYS.slice(0, 5)).toEqual(['q', 'e', 'r', 't', 'y']);
    expect(new Set(COMMAND_HOTKEYS).size).toBe(15);
    for (const cameraKey of ['w', 'a', 's', 'd']) expect(COMMAND_HOTKEYS).not.toContain(cameraKey);
  });

  it('turns Shift activation into the configured five-order training batch', () => {
    expect(commandRepeatCount(false, 5)).toBe(1);
    expect(commandRepeatCount(true, 5)).toBe(5);
  });
});
