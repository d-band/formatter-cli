# formatter-cli

A standalone Node.js CLI that pretty-prints **CSS**, **HTML**, **JavaScript**
and **JSON**.  Formatting logic is ported directly from the [Chrome DevTools
frontend][devtools] `formatter_worker` package, so the results match what you
see in the DevTools **Sources** panel.

[devtools]: https://source.chromium.org/chromium/chromium/src/+/main:third_party/devtools-frontend/src/front_end/entrypoints/formatter_worker/

## Install

Requires Node.js >= 16.

```sh
# From npm (recommended)
npm install -g formatter-cli
```

Then `formatter-cli` is on your `PATH`.

### From source

```sh
git clone https://github.com/d-band/formatter-cli.git
cd formatter-cli
pnpm install
pnpm build
# optionally link it globally
pnpm link --global
```

After linking, the `formatter-cli` command is available anywhere on your
machine.

## Usage

```sh
# Format a file in-place — language auto-detected from extension
formatter-cli src/**/*.js -w

# Format multiple file types
formatter-cli src/**/*.css src/**/*.html -w

# Print formatted output to stdout
formatter-cli index.html

# Force a language, choose indent width
formatter-cli -l json -i 2 package.json

# Read from stdin (language required)
curl -s https://example.com/style.css | formatter-cli -l css

# CI check — exit non-zero if any file is not well-formatted
formatter-cli --check src/

# Check then reformat in-place
formatter-cli --check -w src/
```

Language is auto-detected from the file extension. Supported extensions:
`.css` `.html` `.htm` `.js` `.mjs` `.cjs` `.ts` `.json`.

### Options

| Flag                    | Description                                                   |
| ----------------------- | ------------------------------------------------------------- |
| `[files...]`            | Files or glob patterns (e.g. `src/**/*.js`). Language auto-detected from extension. |
| `-l, --language <lang>` | Force input language: `css`, `html`, `js`, `json`.            |
| `-i, --indent <size>`   | Number of spaces per indent (default 4).                      |
| `-w, --write`           | Write formatted output back to each source file (in-place).   |
| `--check`               | Dry run: exit non-zero if any file is not well-formatted.     |
| `--color`               | Colorize diff-style output when `--check` reports mismatches. |
| `-h, --help`            | Show the usage banner.                                        |
| `-V, --version`         | Print the version.                                            |

## Architecture

The port keeps the same module boundaries as the original DevTools code, with
Node-only compatibility shims layered on top:

```
formatter-cli/
├── bin/formatter-cli.js            # shebang wrapper (ESM `import(...)`)
├── src/
│   ├── index.ts                 # CLI arg reader (commander), stdin/stdout I/O
│   ├── platform/
│   │   ├── ArrayUtilities.ts    # lowerBound + DEFAULT_COMPARATOR
│   │   └── StringUtilities.ts   # findLineEndingIndexes, isWhitespace
│   ├── text-utils/
│   │   └── TextCursor.ts        # line/offset cursor
│   ├── codemirror/
│   │   └── register-codemirror.ts  # loads npm CodeMirror + modes
│   ├── types/
│   │   └── acorn-estree.d.ts    # augments `acorn` with `ESTree.Node`
│   └── formatter-worker/
│       ├── FormattedContentBuilder.ts   # output buffer / source-mapping
│       ├── FormatterActions.ts          # MIME type enum, FormatResult
│       ├── AcornTokenizer.ts            # peekable Acorn token wrapper
│       ├── ESTreeWalker.ts              # AST walker with parent pointers
│       ├── CSSFormatter.ts              # CSS formatter
│       ├── HTMLFormatter.ts             # HTML + embedded CSS/JS/JSON
│       ├── JavaScriptFormatter.ts       # JavaScript (Acorn-based)
│       ├── JSONFormatter.ts             # JSON
│       └── FormatterWorker.ts           # `format(mime, text, indent)` entry
├── test/                         # ported upstream test suite (node:test + tsx)
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.json                 # type-checks src + test
└── tsconfig.build.json           # build config → ./dist
```

### Dependencies

- [`commander`](https://www.npmjs.com/package/commander) — CLI argument parsing
- [`glob`](https://www.npmjs.com/package/glob) — file glob expansion for patterns
  like `src/**/*.js`
- [`codemirror@^5.65.21`](https://www.npmjs.com/package/codemirror) — only the
  CommonJS CSS / XML / JavaScript / HTML-mixed **mode packages** plus the
  editor-core UMD IIFE for the `CodeMirror` global holder (`getMode`,
  `startState`, `StringStream`, `defineMode`…). The DOM-dependent editor pieces
  are never loaded; a tiny DOM stub is installed via
  `register-codemirror.ts` so the UMD wrapper can execute in Node.
- [`acorn@^8.17.0`](https://www.npmjs.com/package/acorn) — the JS/ES parser
  consumed by `JavaScriptFormatter`.

`@types/acorn`, `@types/codemirror`, `@types/node`, `tsx` and `typescript` are
installed as devDependencies.

### How it works — CodeMirror in Node

The original DevTools worker used an `addon/runmode-standalone` JS file that
installed a DOM-free `CodeMirror` global, which the worker's mode-file ESM
imports then attached to. The `codemirror` npm package ships only the
CommonJS/UMD mode packages, whose UMD wrapper references the full DOM editor
core during module evaluation (`document.createElement`, `document.createRange`,
`document.body`, etc).

`register-codemirror.ts` pre-installs a minimal (and non-functional) DOM
stub into `globalThis` long enough for those mode packages to load, at which
point the codemirror IIFE populates `globalThis.CodeMirror` with the
tokenizer-only subset that the formatter needs. This is exactly the same shape
the DevTools worker relies on:

```ts
// original DevTools worker entrypoint
import '../../third_party/codemirror/package/addon/runmode/runmode-standalone.mjs';
import '../../third_party/codemirror/package/mode/css/css.mjs';
import '../../third_party/codemirror/package/mode/xml/xml.mjs';
import '../../third_party/codemirror/package/mode/javascript/javascript.mjs';
```

Becomes:

```ts
// formatter-cli/FormatterWorker.ts
import '../codemirror/register-codemirror.ts';
import 'codemirror/mode/css/css';
import 'codemirror/mode/xml/xml';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/htmlmixed/htmlmixed';
const CodeMirror = globalThis.CodeMirror;
```

### Scope and known limitations

This port covers the four public formatters that the DevTools worker exports
via its `format()` entrypoint:

- `text/css`      → `CSSFormatter`
- `text/html`     → `HTMLFormatter`
- `application/javascript` / `text/javascript` → `JavaScriptFormatter`
- `application/json` → `JSONFormatter`

It does **not** include `CSSRuleParser`, `ScopeParser` or `Substitute`, which
are unrelated to pretty-printing and only consumed by the DevTools debugger /
styles sidebars. `IdentityFormatter` (used as a fallback for unknown media
types) is implemented implicitly — unknown MIME types are returned untouched.

The DevTools build historically patched Acorn to permit a few non-standard
patterns (e.g. the original `ECMA_VERSION = 'latest'` with
`allowImportExportEverywhere`). This port uses the upstream Acorn 8 so a few
legacy patterns (such as class private fields combined with top-level
`import`/`export` under `allowImportExportEverywhere` at `ecmaVersion:'latest'`)
will instead surface as parse errors. The DevTools team's Acorn fork predates
this port; users parsing unusual code should pin a specific `acorn@<X>` in
their project if needed.

## License

`formatter-cli` is BSD-3-Clause (matching the upstream DevTools license on the
ported source files). The `codemirror` package is MIT.

## Development

```sh
pnpm install
pnpm test          # run the ported test suite (node:test via tsx)
pnpm build         # one-shot build to ./dist
pnpm dev           # watch mode
node bin/formatter-cli.js --help
```

Tests live in `test/` — the upstream `formatter_worker` cases migrated to
`node:test` + `node:assert/strict`, run directly against the TypeScript source
with `tsx`.
