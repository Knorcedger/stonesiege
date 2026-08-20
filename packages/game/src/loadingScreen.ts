// Match-start loading and recovery presentation. Resume work has two kinds of
// progress: asset/renderer work whose byte totals are unavailable (honestly
// indeterminate) and deterministic log replay whose completed tick is exact.

export interface LoadingStage {
  title: string;
  status: string;
  detail?: string;
  /** 0..1 when measurable; null when the operation is active but indeterminate. */
  progress: number | null;
}

export interface LoadingPresentationTarget {
  screen: {
    setAttribute(name: string, value: string): void;
  };
  title: { textContent: string | null };
  status: { textContent: string | null };
  detail: { textContent: string | null };
  progress: {
    classList: { toggle(token: string, force?: boolean): boolean };
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
  };
  fill: { style: { width: string } };
  value: { textContent: string | null };
}

/** Apply one loading stage, including accessible determinate/indeterminate semantics. */
export function syncLoadingPresentation(
  target: LoadingPresentationTarget,
  stage: LoadingStage,
): void {
  target.screen.setAttribute('aria-busy', 'true');
  target.title.textContent = stage.title;
  target.status.textContent = stage.status;
  target.detail.textContent = stage.detail ?? '';

  const determinate = stage.progress !== null;
  target.progress.classList.toggle('indeterminate', !determinate);
  if (!determinate) {
    target.progress.removeAttribute('aria-valuenow');
    target.progress.setAttribute('aria-valuetext', `${stage.status} — in progress`);
    target.fill.style.width = '36%';
    target.value.textContent = '';
    return;
  }

  const fraction = Math.min(1, Math.max(0, stage.progress ?? 0));
  const percent = Math.round(fraction * 100);
  target.progress.setAttribute('aria-valuenow', String(percent));
  target.progress.setAttribute('aria-valuetext', `${stage.status} — ${percent}%`);
  target.fill.style.width = `${percent}%`;
  target.value.textContent = `${percent}%`;
}

export type LoadingRecoveryActions = {
  canDiscard: boolean;
  onReturn(): void;
  onDiscard(): void;
};

export function discardControlAction(armed: boolean): 'arm' | 'discard' {
  return armed ? 'discard' : 'arm';
}

const LOADING_CSS = `
.bf-loading { position:absolute; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center;
  box-sizing:border-box; padding:24px; overflow:auto; color:#E9D4A7;
  background:radial-gradient(ellipse at 50% 38%,rgba(230,192,74,.08),transparent 58%),#16100a;
  font:500 18px "Alegreya Sans","Trebuchet MS",sans-serif; letter-spacing:.35px; }
.bf-loading-card { width:min(520px,92vw); text-align:center; }
.bf-loading-mark { width:46px; height:46px; margin:0 auto 18px; transform:rotate(45deg);
  border:2px solid #8A6414; box-shadow:0 0 0 2px #2C1F12 inset,0 0 20px rgba(230,192,74,.12); }
.bf-loading-mark::after { content:""; display:block; width:14px; height:14px; margin:14px;
  background:#E6C04A; box-shadow:0 0 10px rgba(230,192,74,.35); }
.bf-loading h1 { margin:0 0 10px; color:#E9C76A; font:600 26px "Cinzel","Georgia",serif;
  letter-spacing:1.2px; text-shadow:0 2px 3px #0b0703; }
.bf-loading-status { min-height:24px; margin:0 0 15px; color:#EFDDB5; }
.bf-loading-track { position:relative; height:10px; overflow:hidden; border:1px solid #64492B;
  border-radius:999px; background:#241809; box-shadow:0 1px 3px rgba(0,0,0,.55) inset; }
.bf-loading-fill { height:100%; width:0; border-radius:inherit;
  background:linear-gradient(90deg,#8A6414,#E6C04A,#F1D675); transition:width 100ms linear; }
.bf-loading-track.indeterminate .bf-loading-fill { animation:bf-loading-sweep 1.25s ease-in-out infinite; }
@keyframes bf-loading-sweep { from { transform:translateX(-120%); } to { transform:translateX(340%); } }
.bf-loading-meta { display:flex; justify-content:space-between; gap:16px; min-height:20px;
  margin-top:8px; color:#9F835B; font-size:13px; line-height:1.35; }
.bf-loading-detail { text-align:left; }
.bf-loading-value { min-width:42px; text-align:right; color:#DABE8D; font-variant-numeric:tabular-nums; }
.bf-loading-actions { display:none; gap:10px; margin-top:24px; }
.bf-loading.failed .bf-loading-track,.bf-loading.failed .bf-loading-value { display:none; }
.bf-loading.failed .bf-loading-actions { display:flex; }
.bf-loading.failed .bf-loading-meta { justify-content:center; }
.bf-loading.failed .bf-loading-detail { max-width:460px; text-align:center; color:#B99A6B; }
.bf-loading-btn { flex:1; padding:11px 14px; color:#1A1208; background:linear-gradient(#EFDDB5,#DABE8D);
  border:1px solid #B99A6B; border-radius:4px; box-shadow:0 2px 0 #8A6414; cursor:pointer;
  font:600 16px "Alegreya Sans","Trebuchet MS",sans-serif; letter-spacing:.5px; }
.bf-loading-btn.ghost { color:#DABE8D; background:none; border-color:#64492B; box-shadow:none; }
.bf-loading-btn.danger { color:#F2E6CB; background:#6E2118; border-color:#A24737; box-shadow:none; }
.bf-loading-btn:focus-visible { outline:3px solid #FFE98A; outline-offset:3px; }
@media (max-width:520px) { .bf-loading-actions { flex-direction:column; } }
@media (prefers-reduced-motion:reduce) { .bf-loading-track.indeterminate .bf-loading-fill { animation-duration:2.5s; } }
`;

/** Full-screen match loader with an explicit, save-preserving failure state. */
export class MatchLoadingScreen {
  private readonly screen: HTMLDivElement;
  private readonly view: LoadingPresentationTarget;
  private readonly actions: HTMLDivElement;

  constructor(root: HTMLElement, initial: LoadingStage) {
    if (!document.getElementById('bf-loading-style')) {
      const style = document.createElement('style');
      style.id = 'bf-loading-style';
      style.textContent = LOADING_CSS;
      document.head.appendChild(style);
    }

    const screen = document.createElement('div');
    screen.className = 'bf-loading';

    const card = document.createElement('div');
    card.className = 'bf-loading-card';
    const mark = document.createElement('div');
    mark.className = 'bf-loading-mark';
    mark.setAttribute('aria-hidden', 'true');
    const title = document.createElement('h1');
    const status = document.createElement('p');
    status.className = 'bf-loading-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const progress = document.createElement('div');
    progress.className = 'bf-loading-track';
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    const fill = document.createElement('div');
    fill.className = 'bf-loading-fill';
    progress.appendChild(fill);
    const meta = document.createElement('div');
    meta.className = 'bf-loading-meta';
    const detail = document.createElement('span');
    detail.className = 'bf-loading-detail';
    const value = document.createElement('span');
    value.className = 'bf-loading-value';
    meta.append(detail, value);
    this.actions = document.createElement('div');
    this.actions.className = 'bf-loading-actions';
    card.append(mark, title, status, progress, meta, this.actions);
    screen.appendChild(card);
    root.appendChild(screen);

    this.screen = screen;
    this.view = { screen, title, status, detail, progress, fill, value };
    this.update(initial);
  }

  update(stage: LoadingStage): void {
    this.screen.classList.remove('failed');
    this.actions.replaceChildren();
    syncLoadingPresentation(this.view, stage);
  }

  fail(message: string, recovery: LoadingRecoveryActions): void {
    this.screen.classList.add('failed');
    this.screen.setAttribute('role', 'alert');
    this.screen.setAttribute('aria-busy', 'false');
    this.view.title.textContent = 'Saved match could not be restored';
    this.view.status.textContent = 'Your saved match has not been deleted.';
    this.view.detail.textContent = message;
    this.actions.replaceChildren();

    const back = document.createElement('button');
    back.className = 'bf-loading-btn';
    back.textContent = 'Return to title';
    back.addEventListener('click', recovery.onReturn);
    this.actions.appendChild(back);

    if (recovery.canDiscard) {
      const discard = document.createElement('button');
      discard.className = 'bf-loading-btn ghost';
      discard.textContent = 'Discard saved match';
      let armed = false;
      discard.addEventListener('click', () => {
        if (discardControlAction(armed) === 'arm') {
          armed = true;
          discard.className = 'bf-loading-btn danger';
          discard.textContent = 'Tap again to discard';
          return;
        }
        recovery.onDiscard();
      });
      this.actions.appendChild(discard);
    }
    back.focus();
  }

  remove(): void {
    this.screen.remove();
  }
}

/** Reject an async startup phase instead of leaving an unexplained infinite loader. */
export function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
