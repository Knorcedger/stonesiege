// Scenario dialogue banner: a queue of speaker+text messages shown one at a
// time below the resource bar. Auto-dismisses after a reading-time
// duration or on tap. The queue model is pure (unit-tested); the DOM view
// renders whatever the model says is current.
//
// When a narrator is attached the line is also read aloud, and the banner is
// held past its reading time until the voice finishes (bounded by
// MESSAGE_MAX_HOLD_MS) so spoken dialogue is never cut off mid-sentence.

import type { Narrator } from '../audio/narration';
import {
  belowTopBarPx, cssVarPx, HUD_LAYER, HUD_RIGHT_CLUSTER_TOP_VAR, HUD_TOP_BAR_BOTTOM_VAR,
  OBJECTIVES_LEFT_VAR, OBJECTIVES_MESSAGE_TOP_VAR,
} from './layout';

export interface ScenarioMessage {
  text: string;
  speaker?: string;
}

/** Reading time: base + per-character, clamped 3.2s..9s. */
export function messageDurationMs(msg: ScenarioMessage): number {
  const chars = msg.text.length + (msg.speaker?.length ?? 0);
  return Math.min(9000, Math.max(3200, 1400 + chars * 55));
}

/**
 * Hard ceiling on a held message, measured from the moment it appeared. A
 * narrator that never reports finishing cannot stall the story queue.
 */
export const MESSAGE_MAX_HOLD_MS = 20000;

interface ActiveMessage {
  msg: ScenarioMessage;
  shownAt: number;
}

export interface MessageQueueOptions {
  /**
   * Keeps the current message on screen past its reading time while it returns
   * true — the narration seam, so the banner outlasts the spoken line.
   */
  hold?: (msg: ScenarioMessage, now: number) => boolean;
}

/** Pure banner queue: push, current(now) auto-advances, dismiss skips. */
export class MessageQueue {
  private queue: ScenarioMessage[] = [];
  private active: ActiveMessage | null = null;
  private readonly hold: MessageQueueOptions['hold'];

  constructor(opts: MessageQueueOptions = {}) {
    this.hold = opts.hold;
  }

  push(msg: ScenarioMessage): void {
    this.queue.push(msg);
  }

  /** The message that should be on screen at `now` (advances the queue). */
  current(now: number): ScenarioMessage | null {
    if (this.active) {
      const elapsed = now - this.active.shownAt;
      const held = elapsed < MESSAGE_MAX_HOLD_MS && (this.hold?.(this.active.msg, now) ?? false);
      if (elapsed >= messageDurationMs(this.active.msg) && !held) this.active = null;
    }
    if (!this.active && this.queue.length > 0) {
      this.active = { msg: this.queue.shift()!, shownAt: now };
    }
    return this.active?.msg ?? null;
  }

  /** Tap-to-dismiss: drop the active message (the next shows on the next poll). */
  dismiss(): void {
    this.active = null;
  }

  get pending(): number {
    return this.queue.length + (this.active ? 1 : 0);
  }
}

/** The CSS cap on the banner's width, and its share of a narrow root. */
export const MESSAGE_MAX_WIDTH_PX = 560;
export const MESSAGE_WIDTH_FRACTION = 0.92;
/** Below this the banner is a column of two-word lines — drop instead. */
export const MESSAGE_MIN_WIDTH_PX = 420;
/** Root margin kept on the banner's outer side when it is pushed aside. */
export const MESSAGE_EDGE_PX = 6;

export function messageBannerWidthPx(rootWidth: number): number {
  return Math.min(MESSAGE_MAX_WIDTH_PX, Math.floor(rootWidth * MESSAGE_WIDTH_FRACTION));
}

// ------------------------------------------------------------------ DOM view

const MSG_CSS = `
/* Sits below the responsive resource bar; tap-to-dismiss stays limited to the
   banner's own rect. */
.bf-msgbanner { position:absolute; left:50%;
  top:var(${HUD_TOP_BAR_BOTTOM_VAR}, ${belowTopBarPx(false)}px);
  transform:translateX(calc(-50% + var(--bf-msg-shift, 0px)));
  box-sizing:border-box; width:min(${MESSAGE_MAX_WIDTH_PX}px, ${MESSAGE_WIDTH_FRACTION * 100}%);
  padding:9px 14px 10px; z-index:${HUD_LAYER.messageBanner}; cursor:pointer; display:none;
  background:linear-gradient(rgba(44,31,18,0.94), rgba(26,18,8,0.94));
  border:1px solid #64492B; border-radius:5px; box-shadow:0 0 0 1px #1A1208, 0 4px 16px rgba(0,0,0,0.5);
  font-family:"Alegreya Sans","Trebuchet MS",sans-serif; pointer-events:auto; }
/* The top above is only the pre-measurement fallback: the real one is set
   inline from measurement (see messageBannerTopPx). It used to be a media
   query at the narrow breakpoint, which is not where the collision ends — the
   banner is centred at min(560px,92%) and the objectives panel is right-
   anchored at min(300px,60vw), so they overlap up to ~1172px-wide viewports. */
.bf-msgbanner.show { display:block; animation:bfMsgIn 0.22s ease-out; }
@keyframes bfMsgIn {
  from { opacity:0; transform:translate(calc(-50% + var(--bf-msg-shift, 0px)),-6px); }
  to { opacity:1; transform:translate(calc(-50% + var(--bf-msg-shift, 0px)),0); }
}
.bf-msg-speaker { font-size:13px; color:#E6C04A; letter-spacing:1px; margin:0 0 2px; }
.bf-msg-text { font-size:15px; line-height:1.35; color:#EFDDB5; margin:0; }
.bf-msg-hint { font-size:10px; color:#B99A6B; text-align:right; margin:4px 0 0; }
`;

/** Everything the banner needs to place itself, all root-relative px. */
export interface MessageBannerBounds {
  /** First clear y below the top bar. */
  barClear: number;
  /** First clear y below the objectives panel (its list included, when open). */
  panelClear: number;
  /** Top edge of the bottom-right command cluster: the floor to stay above. */
  clusterTop: number;
  rootWidth: number;
  bannerHeight: number;
  /** Left edge of the objectives panel, or Infinity where there is no panel. */
  panelLeft: number;
}

/** Where the banner ends up: a horizontal shift off centre, and a top edge. */
export interface MessageBannerBox {
  top: number;
  width: number;
  /** Offset from the centred position, px. Negative moves it left. */
  shift: number;
}

/** Breathing room (px) between the banner and whatever it is dodging. */
export const MESSAGE_CLEAR_GAP_PX = 8;

/**
 * Where the banner goes. It is centred under the top bar by default; the
 * objectives panel is right-anchored and both hang from the bar, so their
 * vertical ranges always meet and the collision is decided horizontally — the
 * banner's right edge against the panel's left one.
 *
 * When they do collide there are two ways out, tried in order:
 *
 * 1. **Sideways.** The strip left of the panel is usually wide enough for a
 *    readable line — 524px on an 844px landscape phone — so the banner shifts
 *    into it and stays where the player is already looking. Nothing moves
 *    vertically, which matters most on a short screen, where every row below
 *    the bar is already spoken for.
 * 2. **Down.** Where that strip would squeeze the text into a column (a
 *    portrait phone), the banner drops below everything the panel occupies
 *    instead — bounded by the command cluster, because dodging one HUD onto
 *    another is not a fix: this banner is z-index 28 with pointer-events:auto,
 *    so landing on the card would eat its taps for the message's lifetime.
 *
 * If neither fits, it stays under the bar. Overlapping the panel it came from
 * is the lesser evil there — the panel yields its own taps when the column is
 * that full, and the message is gone in seconds.
 */
export function messageBannerBox(bounds: MessageBannerBounds): MessageBannerBox {
  const { barClear, panelClear, clusterTop, rootWidth, bannerHeight, panelLeft } = bounds;
  const width = messageBannerWidthPx(rootWidth);
  const centredLeft = (rootWidth - width) / 2;
  if (centredLeft + width <= panelLeft) return { top: barClear, width, shift: 0 };

  const strip = panelLeft - MESSAGE_CLEAR_GAP_PX - MESSAGE_EDGE_PX;
  if (strip >= MESSAGE_MIN_WIDTH_PX) {
    const fitted = Math.min(width, strip);
    const left = MESSAGE_EDGE_PX + (strip - fitted) / 2;
    return { top: barClear, width: fitted, shift: Math.round(left - (rootWidth - fitted) / 2) };
  }

  const lowest = Math.max(barClear, clusterTop - bannerHeight - MESSAGE_CLEAR_GAP_PX);
  return { top: Math.max(barClear, Math.min(panelClear, lowest)), width, shift: 0 };
}

export class MessageBanner {
  readonly model: MessageQueue;
  private el: HTMLDivElement;
  private speakerEl: HTMLParagraphElement;
  private textEl: HTMLParagraphElement;
  private shownKey = '';
  private root: HTMLElement;
  /** Last footprint the banner positioned itself against (see position()). */
  private lastFootprint = '';

  /** `narrator` null (menus, tests, platforms without speech) keeps it silent. */
  constructor(root: HTMLElement, private narrator: Narrator | null = null) {
    this.model = new MessageQueue(
      narrator ? { hold: (_msg, now) => narrator.isSpeaking(now) } : {},
    );
    if (!document.getElementById('bf-msg-style')) {
      const style = document.createElement('style');
      style.id = 'bf-msg-style';
      style.textContent = MSG_CSS;
      document.head.appendChild(style);
    }
    this.el = document.createElement('div');
    this.el.className = 'bf-msgbanner';
    this.speakerEl = document.createElement('p');
    this.speakerEl.className = 'bf-msg-speaker';
    this.textEl = document.createElement('p');
    this.textEl.className = 'bf-msg-text';
    const hint = document.createElement('p');
    hint.className = 'bf-msg-hint';
    hint.textContent = 'tap to dismiss';
    this.root = root;
    this.el.append(this.speakerEl, this.textEl, hint);
    this.el.addEventListener('click', () => {
      this.narrator?.cancel(); // tapping away the text takes the voice with it
      this.model.dismiss();
    });
    root.appendChild(this.el);
  }

  destroy(): void {
    this.narrator?.cancel();
    this.el.remove();
  }

  push(msg: ScenarioMessage): void {
    this.model.push(msg);
  }

  /**
   * Position against the objectives panel's published footprint. Called after
   * every render and every frame the panel moves — the panel's own height
   * changes with the objective text, and its list opens and closes.
   */
  private position(): void {
    const rootStyle = this.root.style;
    const barClear = rootStyle.getPropertyValue(HUD_TOP_BAR_BOTTOM_VAR);
    const panelClear = rootStyle.getPropertyValue(OBJECTIVES_MESSAGE_TOP_VAR);
    const panelLeft = rootStyle.getPropertyValue(OBJECTIVES_LEFT_VAR);
    const clusterTop = rootStyle.getPropertyValue(HUD_RIGHT_CLUSTER_TOP_VAR);
    // Published edges only — deliberately no offsetWidth here. This runs every
    // frame a message is up, and reading a layout property forces a synchronous
    // reflow each time. The banner's own width only changes with the viewport,
    // which moves the right-anchored panel's left edge too, so panelLeft
    // already covers it; a new message re-measures by clearing this key.
    const footprint = `${barClear}|${panelClear}|${panelLeft}|${clusterTop}`;
    if (footprint === this.lastFootprint) return;
    this.lastFootprint = footprint;
    const rootRect = this.root.getBoundingClientRect();
    const box = messageBannerBox({
      barClear: cssVarPx(barClear, belowTopBarPx(false)),
      panelClear: cssVarPx(panelClear, 0),
      // An unpublished cluster edge means nothing is selected: the floor is the
      // bottom of the root, which also keeps the banner on screen.
      clusterTop: cssVarPx(clusterTop, rootRect.height),
      rootWidth: rootRect.width,
      bannerHeight: this.el.getBoundingClientRect().height,
      // No panel (a skirmish match) means no obstacle, so nothing to clear.
      panelLeft: cssVarPx(panelLeft, Number.POSITIVE_INFINITY),
    });
    this.el.style.top = `${box.top}px`;
    this.el.style.width = `${box.width}px`;
    this.el.style.setProperty('--bf-msg-shift', `${box.shift}px`);
  }

  /** Call once per frame. */
  update(now: number): void {
    const cur = this.model.current(now);
    const key = cur ? `${cur.speaker ?? ''}|${cur.text}` : '';
    if (key === this.shownKey) {
      if (cur) this.position();
      return;
    }
    this.shownKey = key;
    if (!cur) {
      // Reached only once the hold expired, so a still-running voice here is
      // one that overran its ceiling: stop it with the banner.
      this.narrator?.cancel();
      this.el.classList.remove('show');
      return;
    }
    this.narrator?.speak(cur, now);
    this.speakerEl.textContent = cur.speaker ?? '';
    this.speakerEl.style.display = cur.speaker ? '' : 'none';
    this.textEl.textContent = cur.text;
    // retrigger the entry animation
    this.el.classList.remove('show');
    void this.el.offsetWidth;
    this.el.classList.add('show');
    // Measured only once it is displayed: a hidden banner has no width to
    // compare against the panel's edge.
    this.lastFootprint = '';
    this.position();
  }
}
