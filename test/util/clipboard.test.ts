import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { copyToClipboard } from '@util/clipboard';

/**
 * Minimal stand-in for the handful of DOM surfaces `copyToClipboard` touches.
 *
 * The suite runs on the `node` test environment (see jest.config.ts), so there
 * is no document to lean on. Stubbing just these members keeps the branch under
 * test — async API vs. execCommand fallback, and the focus restore — honest
 * without pulling in a jsdom dependency for one file.
 */
class FakeElement {
  public readonly style: Record<string, string> = {};
  public value = '';
  public focusCount = 0;
  public removed = false;
  public selected = false;
  private readonly attributes = new Map<string, string>();

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  public select(): void {
    this.selected = true;
  }

  public remove(): void {
    this.removed = true;
  }

  public focus(): void {
    this.focusCount += 1;
  }
}

interface FakeDocument {
  activeElement: FakeElement | null;
  createElement: () => FakeElement;
  body: { appendChild: (element: FakeElement) => void };
  execCommand: (command: string) => boolean;
}

const REPORT = 'MAIDR diagnostics\nmaidr.js version: 3.74.0';

let created: FakeElement[];
let appended: FakeElement[];
let previouslyFocused: FakeElement;
let execCommandResult: boolean;
let fakeDocument: FakeDocument;

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function remove(name: string): void {
  Reflect.deleteProperty(globalThis, name);
}

/** Installs the async clipboard API, or removes it to force the fallback. */
function setClipboard(writeText: ((text: string) => Promise<void>) | null): void {
  define('navigator', writeText ? { clipboard: { writeText } } : {});
}

beforeEach(() => {
  created = [];
  appended = [];
  execCommandResult = true;
  previouslyFocused = new FakeElement();

  fakeDocument = {
    activeElement: previouslyFocused,
    createElement: () => {
      const element = new FakeElement();
      created.push(element);
      return element;
    },
    body: { appendChild: element => appended.push(element) },
    execCommand: () => execCommandResult,
  };

  define('document', fakeDocument);
  // `copyWithExecCommand` narrows activeElement with `instanceof HTMLElement`
  // before restoring focus, so the fake has to satisfy that check.
  define('HTMLElement', FakeElement);
  setClipboard(null);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  remove('document');
  remove('HTMLElement');
  remove('navigator');
  jest.restoreAllMocks();
});

describe('copyToClipboard', () => {
  it('uses the async clipboard API when it is available', async () => {
    const writeText = jest.fn(async () => {});
    setClipboard(writeText);

    await copyToClipboard(REPORT);

    expect(writeText).toHaveBeenCalledWith(REPORT);
    // The fallback must not also run — it would steal focus for no reason.
    expect(created).toHaveLength(0);
  });

  it('falls back to execCommand when the async API rejects', async () => {
    const writeText = jest.fn(async () => {
      throw new Error('Document is not focused');
    });
    setClipboard(writeText);

    await copyToClipboard(REPORT);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
    expect(created[0].value).toBe(REPORT);
    expect(created[0].selected).toBe(true);
  });

  it('falls back to execCommand when the async API is missing', async () => {
    await copyToClipboard(REPORT);

    expect(appended).toHaveLength(1);
    expect(appended[0].value).toBe(REPORT);
  });

  it('keeps the textarea off-screen without display, visibility or the hidden attribute', async () => {
    // Any of those would empty the selection and turn the copy into a no-op.
    await copyToClipboard(REPORT);

    const textarea = created[0];
    expect(textarea.style.display).toBeUndefined();
    expect(textarea.style.visibility).toBeUndefined();
    expect(textarea.getAttribute('hidden')).toBeNull();
    expect(textarea.style.position).toBe('fixed');
    expect(textarea.style.opacity).toBe('0');
  });

  it('does not mark the textarea aria-hidden, since select() focuses it', async () => {
    // WAI-ARIA forbids aria-hidden on focused content: assistive technology
    // behaviour is undefined for it, and this runs at the exact moment the
    // user asked for a copy.
    await copyToClipboard(REPORT);

    expect(created[0].getAttribute('aria-hidden')).toBeNull();
  });

  it('removes the textarea and restores focus after a successful copy', async () => {
    await copyToClipboard(REPORT);

    expect(created[0].removed).toBe(true);
    expect(previouslyFocused.focusCount).toBe(1);
  });

  it('rejects when execCommand refuses the copy', async () => {
    execCommandResult = false;

    await expect(copyToClipboard(REPORT)).rejects.toThrow(/execCommand/);
  });

  it('still removes the textarea and restores focus when the copy fails', async () => {
    // The finally block owns this: a failed copy must not strand the user on
    // the document body with a stray textarea left in the DOM.
    execCommandResult = false;

    await expect(copyToClipboard(REPORT)).rejects.toThrow();

    expect(created[0].removed).toBe(true);
    expect(previouslyFocused.focusCount).toBe(1);
  });

  it('copes with nothing being focused beforehand', async () => {
    fakeDocument.activeElement = null;

    await expect(copyToClipboard(REPORT)).resolves.toBeUndefined();
    expect(created[0].removed).toBe(true);
  });

  it('rejects outside a document', async () => {
    remove('document');

    await expect(copyToClipboard(REPORT)).rejects.toThrow(TypeError);
  });
});
