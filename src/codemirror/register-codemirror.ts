// Pre-loads a minimal DOM environment so that the npm `codemirror` package (which
// exercises `document` / `window` primitives inside its UMD IIFE at load time)
// can be required from within Node.js. The actual `CodeMirror` global holder is
// installed by the codemirror editor core itself the first time any mode
// package calls `require('../../lib/codemirror')` — so after the side-effect
// mode imports in FormatterWorker.ts execute, `globalThis.CodeMirror` is
// populated with `getMode`, `startState`, `StringStream`, `defineMode`, etc.

const noop = (): undefined => undefined;

class StubClassList {
  private readonly classes = new Set<string>();
  add(...tokens: string[]): void {
    tokens.forEach(t => this.classes.add(t));
  }
  remove(...tokens: string[]): void {
    tokens.forEach(t => this.classes.delete(t));
  }
  contains(token: string): boolean {
    return this.classes.has(token);
  }
  toggle(token: string, force?: boolean): boolean {
    const want = force === undefined ? !this.classes.has(token) : force;
    if (want) {
      this.classes.add(token);
    } else {
      this.classes.delete(token);
    }
    return want;
  }
  get value(): string {
    return Array.from(this.classes).join(' ');
  }
}

class StubElement {
  nodeType = 1;
  readonly childNodes: StubElement[] = [];
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly classList = new StubClassList();
  textContent = '';
  className = '';
  nodeName = 'DIV';
  namespaceURI = 'http://www.w3.org/1999/xhtml';
  parentNode: StubElement | null = null;
  ownerDocument: unknown = null;
  append(child: StubElement | null): StubElement | null {
    if (child) {
      this.appendChild(child);
    }
    return child;
  }
  appendChild(child: StubElement): StubElement {
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  }
  removeChild(child: StubElement): StubElement {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) {
      this.childNodes.splice(i, 1);
    }
    return child;
  }
  insertBefore(child: StubElement, ref?: StubElement | null): StubElement {
    const idx = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
    this.childNodes.splice(idx < 0 ? this.childNodes.length : idx, 0, child);
    child.parentNode = this;
    return child;
  }
  setAttribute(name: string, value: string): void {
    (this as unknown as Record<string, string>)[name] = value;
  }
  getAttribute(name: string): string | null {
    return (this as unknown as Record<string, string>)[name] ?? null;
  }
  removeAttribute(name: string): void {
    delete (this as unknown as Record<string, string>)[name];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addEventListener(_type: string, _handler: any): void {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeEventListener(_type: string, _handler: any): void {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dispatchEvent(_event: any): boolean {
    return false;
  }
  getBoundingClientRect(): {
    top: number; left: number; right: number; bottom: number; width: number; height: number;
  } {
    return {top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0};
  }
  get firstChild(): StubElement | null {
    return this.childNodes[0] ?? null;
  }
  get nextSibling(): StubElement | null {
    if (!this.parentNode) {
      return null;
    }
    const arr = this.parentNode.childNodes;
    return arr[arr.indexOf(this) + 1] ?? null;
  }
}

function makeDocument(): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = {
    nodeType: 9,
    documentElement: null as StubElement | null,
    body: null as StubElement | null,
    _elts: [] as StubElement[],
    createElement(tag: string): StubElement {
      const e = new StubElement();
      e.ownerDocument = doc;
      e.nodeName = tag.toUpperCase();
      doc._elts.push(e);
      return e;
    },
    createElementNS(ns: string, tag: string): StubElement {
      const e = this.createElement(tag);
      e.namespaceURI = ns;
      return e;
    },
    createTextNode(value: string): {nodeType: number, textContent: string, parentNode: StubElement | null} {
      return {nodeType: 3, textContent: value, parentNode: null};
    },
    createRange(): {
      setStart: () => void; setEnd: () => void;
      getBoundingClientRect: () => {top: number; left: number; right: number; bottom: number; width: number; height: number;};
      getClientRects: () => Array<{top: number; left: number; right: number; bottom: number; width: number; height: number;}>;
    } {
      return {
        setStart: noop,
        setEnd: noop,
        getBoundingClientRect: () => ({top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0}),
        getClientRects: () => [],
      };
    },
    querySelector: (): StubElement | null => null,
    querySelectorAll: (): StubElement[] => [],
    addEventListener: noop,
    removeEventListener: noop,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dispatchEvent: (): boolean => false,
  };
  doc.documentElement = doc.createElement('html');
  doc.documentElement.ownerDocument = doc;
  doc.body = doc.createElement('body');
  doc.body.ownerDocument = doc;
  doc.defaultView = doc;
  (doc as {window: unknown}).window = doc;
  return doc;
}

// Only install stubs if they aren't already present.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
if (typeof g.document === 'undefined' || !g.document?.createElement) {
  g.document = makeDocument();
}
if (typeof g.window === 'undefined') {
  g.window = g.document.defaultView || g;
  if (!g.window.window) {
    g.window.window = g.window;
  }
}
if (typeof g.navigator === 'undefined') {
  g.navigator = {userAgent: 'node', platform: 'node', language: 'en', languages: ['en']};
}
