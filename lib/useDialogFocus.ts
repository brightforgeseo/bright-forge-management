import { useEffect, useRef } from 'react';

/** Contain keyboard focus, support Escape, then restore the opening control. */
export function useDialogFocus(active: boolean, selector: string, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!active) return;
    const dialog = document.querySelector<HTMLElement>(selector);
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]'))
        .filter(el => el.getClientRects().length && !el.closest('[inert]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    dialog.addEventListener('keydown', keydown);
    return () => {
      dialog.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [active, selector]);
}
