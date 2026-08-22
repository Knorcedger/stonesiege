export interface BootErrorActions {
  retry(): void;
}

function diagnosticText(error: unknown): string {
  try {
    if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`;
    return String(error);
  } catch {
    return 'Technical details are unavailable.';
  }
}

/** Render a dependency-light recovery surface for failures during initial boot. */
export function renderBootError(
  root: HTMLElement,
  error: unknown,
  actions: BootErrorActions,
): HTMLElement {
  const panel = document.createElement('main');
  panel.setAttribute('role', 'alert');
  panel.setAttribute('aria-labelledby', 'stonesiege-boot-error-title');
  panel.tabIndex = -1;
  panel.style.cssText = [
    'box-sizing:border-box',
    'max-width:42rem',
    'margin:0 auto',
    'padding:clamp(2rem,8vw,5rem) 2rem',
    'color:#efdDB5',
    'font:16px system-ui,sans-serif',
    'line-height:1.5',
  ].join(';');

  const title = document.createElement('h1');
  title.id = 'stonesiege-boot-error-title';
  title.textContent = 'StoneSiege could not start';
  title.style.cssText = 'color:#e6c04a;font-size:clamp(1.6rem,5vw,2.4rem);margin:0 0 1rem;';

  const message = document.createElement('p');
  message.textContent = 'The game could not finish loading. Try starting it again.';

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Try again';
  retry.style.cssText = [
    'min-height:44px',
    'margin:1rem 0',
    'padding:.65rem 1.25rem',
    'border:1px solid #c29422',
    'border-radius:4px',
    'background:#5b3518',
    'color:#fff4d6',
    'font:700 1rem system-ui,sans-serif',
    'cursor:pointer',
  ].join(';');
  retry.addEventListener('click', actions.retry);

  const details = document.createElement('details');
  details.style.cssText = 'margin-top:1rem;color:#c9b98a;';
  const summary = document.createElement('summary');
  summary.textContent = 'Technical details';
  const diagnostic = document.createElement('pre');
  diagnostic.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8rem;';
  diagnostic.textContent = diagnosticText(error);
  details.append(summary, diagnostic);

  panel.append(title, message, retry, details);
  root.replaceChildren(panel);
  panel.focus({ preventScroll: true });
  return panel;
}
