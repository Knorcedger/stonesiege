// Scenario dialogue banner: a queue of speaker+text messages shown one at a
// time below the resource bar. Auto-dismisses after a reading-time
// duration or on tap. The queue model is pure (unit-tested); the DOM view
// renders whatever the model says is current.

import { belowTopBarPx, HUD_NARROW_MAX_PX } from './layout';

export interface ScenarioMessage {
  text: string;
  speaker?: string;
}

/** Reading time: base + per-character, clamped 3.2s..9s. */
export function messageDurationMs(msg: ScenarioMessage): number {
  const chars = msg.text.length + (msg.speaker?.length ?? 0);
  return Math.min(9000, Math.max(3200, 1400 + chars * 55));
}

interface ActiveMessage {
  msg: ScenarioMessage;
  shownAt: number;
}

/** Pure banner queue: push, current(now) auto-advances, dismiss skips. */
export class MessageQueue {
  private queue: ScenarioMessage[] = [];
  private active: ActiveMessage | null = null;

  push(msg: ScenarioMessage): void {
    this.queue.push(msg);
  }

  /** The message that should be on screen at `now` (advances the queue). */
  current(now: number): ScenarioMessage | null {
    if (this.active && now - this.active.shownAt >= messageDurationMs(this.active.msg)) {
      this.active = null;
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
.bf-msgbanner { position:absolute; left:50%; top:${belowTopBarPx(false)}px; transform:translateX(-50%);
  width:min(560px, 92vw); padding:9px 14px 10px; z-index:28; cursor:pointer; display:none;
  background:linear-gradient(rgba(44,31,18,0.94), rgba(26,18,8,0.94));
  border:1px solid #64492B; border-radius:5px; box-shadow:0 0 0 1px #1A1208, 0 4px 16px rgba(0,0,0,0.5);
  font-family:"Pixelify Sans",monospace; pointer-events:auto; }
@media (max-width: ${HUD_NARROW_MAX_PX}px) { .bf-msgbanner { top:${belowTopBarPx(true)}px; } }
.bf-msgbanner.show { display:block; animation:bfMsgIn 0.22s ease-out; }
@keyframes bfMsgIn { from { opacity:0; transform:translate(-50%,-6px); } to { opacity:1; transform:translate(-50%,0); } }
.bf-msg-speaker { font-size:13px; color:#E6C04A; letter-spacing:1px; margin:0 0 2px; }
.bf-msg-text { font-size:15px; line-height:1.35; color:#EFDDB5; margin:0; }
.bf-msg-hint { font-size:10px; color:#B99A6B; text-align:right; margin:4px 0 0; }
`;

export class MessageBanner {
  readonly model = new MessageQueue();
  private el: HTMLDivElement;
  private speakerEl: HTMLParagraphElement;
  private textEl: HTMLParagraphElement;
  private shownKey = '';

  constructor(root: HTMLElement) {
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
    this.el.addEventListener('click', () => this.model.dismiss());
    root.appendChild(this.el);
  }

  destroy(): void {
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
      this.el.classList.remove('show');
      return;
    }
    this.speakerEl.textContent = cur.speaker ?? '';
    this.speakerEl.style.display = cur.speaker ? '' : 'none';
    this.textEl.textContent = cur.text;
    // retrigger the entry animation
    this.el.classList.remove('show');
    void this.el.offsetWidth;
    this.el.classList.add('show');
  }
}
