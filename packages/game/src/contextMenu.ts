/** Suppress browser chrome for right-clicks anywhere inside the mounted game. */
export function installContextMenuBlocker(root: EventTarget): () => void {
  const preventContextMenu = (event: Event): void => event.preventDefault();
  root.addEventListener('contextmenu', preventContextMenu);
  return () => root.removeEventListener('contextmenu', preventContextMenu);
}
