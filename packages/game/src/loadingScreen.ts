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

/** Optional campaign context rendered over its existing chapter artwork. */
export interface LoadingArtwork {
  src: string;
  campaign: string;
  chapter: string;
  setting?: string;
  /** What is at stake this chapter — the last thing read before play starts. */
  stakes?: string;
}

export interface ArtworkLoadProgress {
  completed: number;
  total: number;
  fallback: number;
}

/** Turn real pack completions into player-facing and accessible loading progress. */
export function artworkLoadingStage(
  progress: ArtworkLoadProgress,
  resuming: boolean,
): LoadingStage {
  const total = Math.max(1, progress.total);
  const completed = Math.min(total, Math.max(0, progress.completed));
  const fallback = Math.min(completed, Math.max(0, progress.fallback));
  const fallbackDetail = fallback > 0
    ? ` · ${fallback} ${fallback === 1 ? 'pack could' : 'packs could'} not be loaded`
    : '';
  return {
    title: resuming ? 'Restoring saved match' : 'Mustering the banners',
    status: 'Loading battlefield artwork…',
    detail: `${completed} of ${total} artwork packs checked${fallbackDetail}`,
    progress: completed / total,
  };
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

export type FreshLoadingRecoveryActions = {
  onRetry(): void;
  onReturn(): void;
};

export function freshStartFailureStage(message: string): Omit<LoadingStage, 'progress'> {
  return {
    title: 'Battlefield could not be prepared',
    status: 'The match has not started.',
    detail: message,
  };
}

export function discardControlAction(armed: boolean): 'arm' | 'discard' {
  return armed ? 'discard' : 'arm';
}

const LOADING_CSS = `
.bf-loading { position:absolute; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center;
  box-sizing:border-box; padding:clamp(18px,5vw,64px); overflow:auto; color:#E9D4A7;
  background:radial-gradient(ellipse at 50% 38%,rgba(230,192,74,.08),transparent 58%),#16100a;
  font:500 18px "Alegreya Sans","Trebuchet MS",sans-serif; letter-spacing:.35px; }
.bf-loading.has-art { align-items:flex-end; justify-content:flex-start; isolation:isolate; }
.bf-loading-art { position:absolute; inset:0; z-index:-2; display:block; width:100%; height:100%; object-fit:cover;
  object-position:center 42%; }
.bf-loading.has-art::after { content:""; position:absolute; inset:0; z-index:-1; pointer-events:none;
  background:linear-gradient(90deg,rgba(10,6,3,.9) 0%,rgba(10,6,3,.56) 48%,rgba(10,6,3,.08) 78%),
    linear-gradient(0deg,rgba(10,6,3,.94) 0%,rgba(10,6,3,.2) 66%,rgba(10,6,3,.42) 100%); }
.bf-loading-card { width:min(520px,92vw); text-align:center; }
.bf-loading.has-art .bf-loading-card { width:min(600px,100%); box-sizing:border-box; padding:24px 26px 22px;
  text-align:left; background:linear-gradient(135deg,rgba(25,16,8,.94),rgba(25,16,8,.76));
  border:1px solid rgba(185,154,107,.6); border-left:4px solid #C99B2B; border-radius:4px;
  box-shadow:0 14px 44px rgba(0,0,0,.55),0 0 0 1px rgba(26,18,8,.7) inset;
  -webkit-backdrop-filter:blur(7px); backdrop-filter:blur(7px); }
.bf-loading-story { margin:0 0 18px; padding:0 0 15px; border-bottom:1px solid rgba(185,154,107,.36); }
.bf-loading-campaign { margin:0 0 3px; color:#E6C04A; font-size:12px; line-height:1.3;
  letter-spacing:1.45px; text-transform:uppercase; text-shadow:0 2px 8px #0b0703; }
.bf-loading-chapter { margin:0; color:#F3DE9C; font:600 24px/1.15 "Cinzel","Georgia",serif;
  letter-spacing:.7px; text-shadow:0 2px 8px #0b0703; }
.bf-loading-setting { margin:5px 0 0; color:#C9AE7E; font-size:13px; line-height:1.3; letter-spacing:.5px; }
/* The chapter's stakes, held on screen while the atlases download: the last
   quiet moment before the map appears is the one place a player will read it. */
.bf-loading-stakes { margin:8px 0 0; max-width:52ch; color:#EFDDB5; font-size:14px; line-height:1.45; }
.bf-loading-mark { width:46px; height:46px; margin:0 auto 18px; transform:rotate(45deg);
  border:2px solid #8A6414; box-shadow:0 0 0 2px #2C1F12 inset,0 0 20px rgba(230,192,74,.12); }
.bf-loading.has-art .bf-loading-mark { width:28px; height:28px; margin:0 0 14px; }
.bf-loading.has-art .bf-loading-mark::after { width:8px; height:8px; margin:8px; }
.bf-loading-mark::after { content:""; display:block; width:14px; height:14px; margin:14px;
  background:#E6C04A; box-shadow:0 0 10px rgba(230,192,74,.35); }
.bf-loading h1 { margin:0 0 10px; color:#E9C76A; font:600 26px "Cinzel","Georgia",serif;
  letter-spacing:1.2px; text-shadow:0 2px 3px #0b0703; }
.bf-loading.has-art h1 { font-size:22px; }
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
.bf-loading.has-art.failed .bf-loading-meta { justify-content:flex-start; }
.bf-loading.has-art.failed .bf-loading-detail { text-align:left; }
.bf-loading-btn { flex:1; padding:11px 14px; color:#1A1208; background:linear-gradient(#EFDDB5,#DABE8D);
  border:1px solid #B99A6B; border-radius:4px; box-shadow:0 2px 0 #8A6414; cursor:pointer;
  font:600 16px "Alegreya Sans","Trebuchet MS",sans-serif; letter-spacing:.5px; }
.bf-loading-btn.ghost { color:#DABE8D; background:none; border-color:#64492B; box-shadow:none; }
.bf-loading-btn.danger { color:#F2E6CB; background:#6E2118; border-color:#A24737; box-shadow:none; }
.bf-loading-btn:focus-visible { outline:3px solid #FFE98A; outline-offset:3px; }
@media (max-width:520px) {
  .bf-loading { padding:14px; }
  .bf-loading.has-art .bf-loading-card { padding:18px 18px 16px; }
  .bf-loading-chapter { font-size:20px; }
  .bf-loading-campaign { font-size:10.5px; letter-spacing:1px; }
  .bf-loading-actions { flex-direction:column; }
}
@media (max-height:560px) {
  .bf-loading.has-art .bf-loading-card { padding:14px 18px 13px; }
  .bf-loading-story { margin-bottom:10px; padding-bottom:9px; }
  .bf-loading-chapter { font-size:19px; }
  .bf-loading-setting { margin-top:3px; font-size:11.5px; }
  .bf-loading-stakes { margin-top:5px; font-size:12px; }
  .bf-loading.has-art .bf-loading-mark { display:none; }
  .bf-loading.has-art h1 { margin-bottom:5px; font-size:19px; }
  .bf-loading-status { min-height:20px; margin-bottom:9px; font-size:16px; }
}
@media (prefers-reduced-motion:reduce) { .bf-loading-track.indeterminate .bf-loading-fill { animation-duration:2.5s; } }
`;

/** Full-screen match loader with an explicit, save-preserving failure state. */
export class MatchLoadingScreen {
  private readonly root: HTMLElement;
  private readonly screen: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly view: LoadingPresentationTarget;
  private readonly actions: HTMLDivElement;
  private artworkImage: HTMLImageElement | null = null;
  private artworkStory: HTMLDivElement | null = null;

  constructor(root: HTMLElement, initial: LoadingStage, artwork?: LoadingArtwork | null) {
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

    this.root = root;
    this.screen = screen;
    this.card = card;
    this.view = { screen, title, status, detail, progress, fill, value };
    if (artwork) this.setArtwork(artwork);
    this.update(initial);
  }

  update(stage: LoadingStage): void {
    this.screen.classList.remove('failed');
    syncLoadingPresentation(this.view, stage);
  }

  /** Add campaign context after a saved match has been resolved. */
  setArtwork(artwork: LoadingArtwork | null): void {
    this.artworkImage?.remove();
    this.artworkStory?.remove();
    this.artworkImage = null;
    this.artworkStory = null;
    this.screen.classList.remove('has-art');
    if (!artwork) return;

    const image = document.createElement('img');
    image.className = 'bf-loading-art';
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.loading = 'eager';
    image.decoding = 'async';
    image.fetchPriority = 'high';
    image.addEventListener('error', () => {
      if (this.artworkImage !== image) return;
      image.remove();
      story.remove();
      this.artworkImage = null;
      this.artworkStory = null;
      this.screen.classList.remove('has-art');
    }, { once: true });

    const story = document.createElement('div');
    story.className = 'bf-loading-story';
    const campaign = document.createElement('p');
    campaign.className = 'bf-loading-campaign';
    campaign.textContent = artwork.campaign;
    const chapter = document.createElement('p');
    chapter.className = 'bf-loading-chapter';
    chapter.textContent = artwork.chapter;
    story.append(campaign, chapter);
    if (artwork.setting) {
      const setting = document.createElement('p');
      setting.className = 'bf-loading-setting';
      setting.textContent = artwork.setting;
      story.appendChild(setting);
    }
    if (artwork.stakes) {
      const stakes = document.createElement('p');
      stakes.className = 'bf-loading-stakes';
      stakes.textContent = artwork.stakes;
      story.appendChild(stakes);
    }

    this.artworkImage = image;
    this.artworkStory = story;
    this.screen.classList.add('has-art');
    this.screen.prepend(image);
    this.card.prepend(story);
    image.src = artwork.src;
  }

  fail(message: string, recovery: LoadingRecoveryActions): void {
    this.ensureAttached();
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

  failFresh(message: string, recovery: FreshLoadingRecoveryActions): void {
    const stage = freshStartFailureStage(message);
    this.ensureAttached();
    this.screen.classList.add('failed');
    this.screen.setAttribute('role', 'alert');
    this.screen.setAttribute('aria-busy', 'false');
    this.view.title.textContent = stage.title;
    this.view.status.textContent = stage.status;
    this.view.detail.textContent = stage.detail ?? '';
    this.actions.replaceChildren();

    const retry = document.createElement('button');
    retry.className = 'bf-loading-btn';
    retry.textContent = 'Try again';
    retry.addEventListener('click', recovery.onRetry, { once: true });
    this.actions.appendChild(retry);

    const back = document.createElement('button');
    back.className = 'bf-loading-btn ghost';
    back.textContent = 'Return to title';
    back.addEventListener('click', recovery.onReturn, { once: true });
    this.actions.appendChild(back);
    retry.focus();
  }

  private ensureAttached(): void {
    if (!this.screen.isConnected) this.root.appendChild(this.screen);
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
