import type { RefCallback } from 'react';
import { useCallback, useRef } from 'react';

/**
 * The ref and `container` value a `disablePortal` MUI modal needs to keep
 * itself inside the accessibility tree.
 */
export interface ModalContainer {
  /**
   * Ref for the modal root element — `<Dialog ref={...}>` or the `ref` inside
   * a `MenuProps` / `slotProps.root` object.
   */
  readonly modalRef: RefCallback<HTMLElement>;
  /** Value for MUI's `container` prop. */
  readonly container: () => HTMLElement | null;
}

/**
 * Scopes a `disablePortal` MUI modal's `aria-hidden` bookkeeping to its own
 * parent element.
 *
 * When a modal opens, MUI's `ModalManager` marks every child of the modal's
 * container `aria-hidden="true"` except the modal itself, so a screen reader
 * reads the modal and nothing behind it. That container defaults to
 * `document.body`, which is right for a portalled modal but wrong for a
 * `disablePortal` one: MAIDR renders its dialogs inside the host page's chart
 * wrapper, so the body child MUI hides is an *ancestor* of the dialog. The
 * dialog hides itself, along with the chart it was opened from, and nothing
 * inside it — controls, live regions — is announced while it is open.
 *
 * Pointing `container` at the modal root's own parent restores the intended
 * behaviour: the modal's siblings are hidden, the modal is not.
 *
 * @returns The ref to attach to the modal root and the value for MUI's
 * `container` prop. Both identities are stable across renders.
 *
 * @example
 * ```tsx
 * const { modalRef, container } = useModalContainer();
 * return <Dialog ref={modalRef} container={container} disablePortal open />;
 * ```
 */
export function useModalContainer(): ModalContainer {
  const rootRef = useRef<HTMLElement | null>(null);

  // A callback ref, not a ref object: MUI types the modal root as an
  // `HTMLDivElement`, and a callback accepting the wider `HTMLElement`
  // satisfies that while a `RefObject<HTMLElement>` would not.
  const modalRef = useCallback<RefCallback<HTMLElement>>((node) => {
    rootRef.current = node;
  }, []);

  // MUI resolves `container` in an effect, after React has attached the ref
  // for the commit that mounted the modal root, so the parent is available by
  // the time this runs. Returning `null` before then would fall back to
  // `document.body` — the very default this hook exists to replace.
  const container = useCallback(() => rootRef.current?.parentElement ?? null, []);

  return { modalRef, container };
}
