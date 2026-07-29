/**
 * Writes text to the system clipboard.
 *
 * `navigator.clipboard` is unavailable on insecure origins and on `file://`
 * pages — both of which MAIDR runs on routinely, since py-maidr and r-maidr
 * write charts to standalone HTML files — so a `execCommand` fallback covers
 * the cases the async API refuses.
 * @param text - The text to place on the clipboard.
 * @throws Error if neither the async API nor the fallback can copy.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // Not fatal: the async API also rejects when the document is not
      // focused or the permission was denied, and the fallback still works
      // in both cases. Logged rather than swallowed so a genuine failure of
      // both paths can be traced.
      console.warn('[clipboard] navigator.clipboard.writeText failed, falling back', error);
    }
  }
  copyWithExecCommand(text);
}

/**
 * Copies via a throwaway textarea and the deprecated `execCommand('copy')`.
 *
 * Selecting the textarea steals focus, so the previously focused element is
 * restored afterwards — without that, a keyboard or screen reader user is
 * dropped back to the document body and loses their place in the dialog.
 * @param text - The text to place on the clipboard.
 * @throws Error if the document rejects the copy command.
 */
function copyWithExecCommand(text: string): void {
  if (typeof document === 'undefined') {
    throw new TypeError('Clipboard is unavailable outside a document');
  }

  const previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  // Hidden, but not via `display`/`visibility`/`hidden` — those make the
  // selection empty and turn the copy into a silent no-op.
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  try {
    textarea.select();
    if (!document.execCommand('copy')) {
      throw new Error('document.execCommand("copy") was rejected');
    }
  } finally {
    textarea.remove();
    previouslyFocused?.focus();
  }
}
