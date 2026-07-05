#!/usr/bin/env node
// formatter-cli: pretty-printer for CSS, HTML, JavaScript, JSON. CLI entrypoint.

import {Command} from 'commander';
import {glob} from 'glob';
import {existsSync, readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, extname, resolve} from 'node:path';
import {format} from './formatter-worker/FormatterWorker.js';

// Supported extension <-> MIME mappings for language auto-detection.
const EXT_TO_MIME = {
  css: 'text/css',
  html: 'text/html',
  htm: 'text/html',
  js: 'text/javascript',
  mjs: 'text/javascript',
  cjs: 'text/javascript',
  ts: 'text/javascript',
  json: 'application/json',
} as Record<string, string>;

function findPackageJson(startDir: string): string | undefined {
  let dir = startDir;
  // Walk upward at most ~6 levels to find the package.json for this project.
  for (let i = 0; i < 8; ++i) {
    const candidate = `${dir}/package.json`;
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

function readPackageVersion(): string | undefined {
  try {
    const moduleDir = dirname(getModuleDir());
    const pkgJsonPath = findPackageJson(moduleDir);
    if (!pkgJsonPath) {
      return undefined;
    }
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as {version?: string; name?: string};
    // Only accept the path as "ours" if name matches, to avoid grabbing an
    // unrelated parent project's package.json on a global install.
    if (pkgJson.name !== 'formatter-cli') {
      return undefined;
    }
    return pkgJson.version;
  } catch {
    return undefined;
  }
}

function getModuleDir(): string {
  return fileURLToPath(new URL('.', import.meta.url));
}

function guessLanguage(filename: string): string | undefined {
  const ext = extname(filename).slice(1).toLowerCase();
  return EXT_TO_MIME[ext];
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Expand a set of literal file paths and glob patterns into a flat list of
 * matched files. Patterns that don't glob-resolve are kept so we can still try
 * them as literal paths.
 */
function expandPatterns(patterns: string[]): string[] {
  const out: string[] = [];
  for (const pattern of patterns) {
    // Use glob for patterns containing glob chars; otherwise treat literally.
    if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
      const matches = glob.sync(pattern, {nodir: true, dot: true, posix: true});
      out.push(...matches.map(p => resolve(p)));
    } else if (existsSync(pattern)) {
      out.push(resolve(pattern));
    } else {
      out.push(pattern);
    }
  }
  return dedupe(out);
}

async function readStdin(): Promise<string> {
  process.stdin.setEncoding('utf-8');
  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as string);
  }
  return chunks.join('');
}

interface ActionOptions {
  language?: string;
  indent?: string;
  write: boolean;
  check: boolean;
  color: boolean;
  stash: boolean;
}

async function runCommand(files: string[], opts: ActionOptions): Promise<number> {
  const indentSize = opts.indent ? parseInt(opts.indent, 10) : 4;
  const indentString = Number.isFinite(indentSize) && indentSize >= 0 ? ' '.repeat(indentSize) : '    ';

  // --language maps to MIME types understood by FormatterWorker.
  const LANGUAGE_TO_MIME: Record<string, string> = {
    css: 'text/css',
    html: 'text/html',
    js: 'text/javascript',
    javascript: 'text/javascript',
    json: 'application/json',
  };
  const forceMime = opts.language ? LANGUAGE_TO_MIME[opts.language.toLowerCase()] : undefined;

  // --- stdin mode (no files) ---
  if (files.length === 0) {
    if (!forceMime) {
      console.error(
          'formatter-cli: cannot guess input language from stdin. ' +
          'Pass --language css|html|js|json, or pipe a file with a known extension.');
      return 2;
    }
    const text = await readStdin();
    const out = format(forceMime, text, indentString);
    if (opts.check) {
      return out.content === text ? 0 : 1;
    }
    process.stdout.write(out.content);
    return 0;
  }

  // --- file mode ---
  const resolved = expandPatterns(files);

  let exitCode = 0;
  for (const file of resolved) {
    // Resolve MIME: forced > extension-guessed.
    const mime = forceMime ?? guessLanguage(file);
    if (!mime) {
      console.error(
          `formatter-cli: cannot guess language for "${file}". ` +
          'Use --language css|html|js|json, or pass a file with a known extension.');
      exitCode = 2;
      continue;
    }

    let text: string;
    try {
      text = await readFile(file, 'utf-8');
    } catch {
      console.error(`formatter-cli: failed to read "${file}" (no such file or permission denied).`);
      exitCode = 2;
      continue;
    }

    const result = format(mime, text, indentString);

    if (opts.check) {
      if (result.content !== text) {
        exitCode = 1;
        console.error(`formatter-cli: ${file} is not well-formatted.`);
      }
      continue;
    }

    if (opts.write) {
      // In-place reformat.
      const {writeFile} = await import('node:fs/promises');
      if (result.content !== text) {
        await writeFile(file, result.content, 'utf-8');
      }
      continue;
    }

    // Default: print to stdout.
    if (resolved.length > 1) {
      process.stdout.write(`\n// ===== ${file} =====\n`);
    }
    process.stdout.write(result.content);
  }

  return exitCode;
}

async function main(): Promise<void> {
  const program = new Command();
  program
      .name('formatter-cli')
      .description('formatter-cli — pretty-printer for CSS / HTML / JavaScript / JSON. Formatting logic ported from Chrome DevTools.')
      .version(readPackageVersion() ?? 'unknown', '-V, --version')
      .argument('[files...]', 'Files or glob patterns to format. Leave empty to read from stdin.')
      .option('-l, --language <lang>', 'Force input language: css, html, js, json.')
      .option('-i, --indent <size>', 'Indent size in spaces (default: 4).')
      .option('-w, --write', 'Write formatted output back to each source file (in-place).')
      .option('--check', 'Check mode: exit non-zero if any file is not already well-formatted.')
      .option('--color', 'Colorize diff-style output when --check reports mismatches.');

  program.addHelpText(
      'after',

      `
Examples:
  $ formatter-cli src/**/*.js -w                # format all .js under src/ in-place
  $ formatter-cli src/**/*.css src/**/*.html    # print formatted output to stdout
  $ formatter-cli -l json -i 2 package.json
  $ curl -s URL | formatter-cli -l css           # pipe from stdin
  $ formatter-cli --check src/ -w                # check then reformat (CI-friendly)
  $ cat script.js | formatter-cli --language js  # force language on stdin

Language is auto-detected from the file extension. Supported:
  .css .html .htm .js .mjs .cjs .ts .json
`);

  program.parse(process.argv);

  const exitCode = await runCommand(program.args, program.opts<ActionOptions>());
  process.exitCode = exitCode;
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error('formatter-cli: unhandled error:', err);
  process.exitCode = 2;
});
