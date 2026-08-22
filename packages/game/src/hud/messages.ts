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
  belowTopBarPx, HUD_LAYER, HUD_NARROW_MAX_PX, HUD_TOP_BAR_BOTTOM_VAR,
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

// ------------------------------------------------------------------ DOM view

const MSG_CSS = `
/* Sits below the responsive resource bar; tap-to-dismiss stays limited to the
   banner's own rect. */
.bf-msgbanner { position:absolute; left:50%;
  top:var(${HUD_TOP_BAR_BOTTOM_VAR}, ${belowTopBarPx(false)}px); transform:translateX(-50%);
  width:min(560px, 92%); padding:9px 14px 10px; z-index:${HUD_LAYER.messageBanner}; cursor:pointer; display:none;
  background:linear-gradient(rgba(44,31,18,0.94), rgba(26,18,8,0.94));
  border:1px solid #64492B; border-radius:5px; box-shadow:0 0 0 1px #1A1208, 0 4px 16px rgba(0,0,0,0.5);
  font-family:"Alegreya Sans","Trebuchet MS",sans-serif; pointer-events:auto; }
/* Clear whichever is lower: the measured top bar, or the objective panel's
   published head clearance. The constants only cover the frames before the
   first measurement lands. */
@media (max-width: ${HUD_NARROW_MAX_PX}px) {
  .bf-msgbanner { top:max(
    var(${HUD_TOP_BAR_BOTTOM_VAR}, ${belowTopBarPx(true)}px),
    var(--bf-objectives-message-top, 0px)); }
}
.bf-msgbanner.show { display:block; animation:bfMsgIn 0.22s ease-out; }
@keyframes bfMsgIn { from { opacity:0; transform:translate(-50%,-6px); } to { opacity:1; transform:translate(-50%,0); } }
.bf-msg-speaker { font-size:13px; color:#E6C04A; letter-spacing:1px; margin:0 0 2px; }
.bf-msg-text { font-size:15px; line-height:1.35; color:#EFDDB5; margin:0; }
.bf-msg-hint { font-size:10px; color:#B99A6B; text-align:right; margin:4px 0 0; }
`;

export class MessageBanner {
  readonly model: MessageQueue;
  private el: HTMLDivElement;
  private speakerEl: HTMLParagraphElement;
  private textEl: HTMLParagraphElement;
  private shownKey = '';

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

  /** Call once per frame. */
  update(now: number): void {
    const cur = this.model.current(now);
    const key = cur ? `${cur.speaker ?? ''}|${cur.text}` : '';
    if (key === this.shownKey) return;
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
  }
}
