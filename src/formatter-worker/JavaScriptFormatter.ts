// Ported from DevTools entrypoints/formatter_worker/JavaScriptFormatter.ts
// Original: Copyright 2011 The Chromium Authors. BSD-style license.

import * as Acorn from 'acorn';
import {AcornTokenizer, type TokenOrComment, ECMA_VERSION} from './AcornTokenizer.js';
import {ESTreeWalker} from './ESTreeWalker.js';
import type {FormattedContentBuilder} from './FormattedContentBuilder.js';

export class JavaScriptFormatter {
  readonly #builder: FormattedContentBuilder;
  #tokenizer!: AcornTokenizer;
  #content!: string;
  #fromOffset!: number;
  #lastLineNumber!: number;
  #toOffset?: number;
  constructor(builder: FormattedContentBuilder) {
    this.#builder = builder;
  }

  format(text: string, _lineEndings: number[], fromOffset: number, toOffset: number): void {
    this.#fromOffset = fromOffset;
    this.#toOffset = toOffset;
    this.#content = text.substring(this.#fromOffset, this.#toOffset);
    this.#lastLineNumber = 0;
    const tokens: Array<Acorn.Token | Acorn.Comment> = [];
    const ast = Acorn.parse(this.#content, {
      ranges: false,
      preserveParens: true,
      allowAwaitOutsideFunction: true,
      allowImportExportEverywhere: true,
      ecmaVersion: ECMA_VERSION,
      allowHashBang: true,
      onToken: tokens as Acorn.Token[],
      onComment: tokens as Acorn.Comment[],
    });
    this.#tokenizer = new AcornTokenizer(this.#content, tokens);
    const walker =
        new ESTreeWalker(this.#beforeVisit.bind(this), this.#afterVisit.bind(this));
    walker.walk(ast as unknown as Parameters<typeof walker.walk>[0]);
  }

  #push(token: Acorn.Token | Acorn.Comment | null, format: string): void {
    for (let i = 0; i < format.length; ++i) {
      if (format[i] === 's') {
        this.#builder.addSoftSpace();
      } else if (format[i] === 'S') {
        this.#builder.addHardSpace();
      } else if (format[i] === 'n') {
        this.#builder.addNewLine();
      } else if (format[i] === '>') {
        this.#builder.increaseNestingLevel();
      } else if (format[i] === '<') {
        this.#builder.decreaseNestingLevel();
      } else if (format[i] === 't') {
        if (this.#tokenizer.tokenLineStart() - this.#lastLineNumber > 1) {
          this.#builder.addNewLine(true);
        }
        this.#lastLineNumber = this.#tokenizer.tokenLineEnd();
        if (token) {
          this.#builder.addToken(
              this.#content.substring(token.start, token.end), this.#fromOffset + token.start);
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #beforeVisit(node: any): undefined {
    if (!node.parent) {
      return;
    }
    if (node.type === 'TemplateLiteral') {
      this.#builder.setEnforceSpaceBetweenWords(false);
    }
    let token;
    while ((token = this.#tokenizer.peekToken()) && token.start < node.start) {
      const next = this.#tokenizer.nextToken() as TokenOrComment;
      const format = this.#formatToken(node.parent, next);
      this.#push(next, format);
    }
    // ${expressions} within a template literal need space enforced, while the
    // literal text itself must be preserved verbatim (crbug.com/442209349).
    if (node.parent?.type === 'TemplateLiteral' && node.type !== 'TemplateElement' && node.type !== 'TemplateLiteral') {
      this.#builder.setEnforceSpaceBetweenWords(true);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #afterVisit(node: any): void {
    let token;
    while ((token = this.#tokenizer.peekToken()) && token.start < node.end) {
      const next = this.#tokenizer.nextToken() as TokenOrComment;
      const format = this.#formatToken(node, next);
      this.#push(next, format);
    }
    this.#push(null, this.#finishNode(node));
    if (node.parent?.type === 'TemplateLiteral' && node.type !== 'TemplateElement' && node.type !== 'TemplateLiteral') {
      this.#builder.setEnforceSpaceBetweenWords(false);
    } else if (node.type === 'TemplateLiteral' && node.parent?.type !== 'TemplateLiteral') {
      this.#builder.setEnforceSpaceBetweenWords(true);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #inForLoopHeader(node: any): boolean {
    const parent = node.parent;
    if (!parent) {
      return false;
    }
    if (parent.type === 'ForStatement') {
      return node === parent.init || node === parent.test || node === parent.update;
    }
    if (parent.type === 'ForInStatement' || parent.type === 'ForOfStatement') {
      return node === parent.left || node === parent.right;
    }
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #formatToken(node: any, tokenOrComment: TokenOrComment): string {
    const AT = AcornTokenizer;
    if (AT.lineComment(tokenOrComment)) {
      return 'tn';
    }
    if (AT.blockComment(tokenOrComment)) {
      return 'tn';
    }
    const token = tokenOrComment as Acorn.Token;
    const nodeType = node.type;
    if (nodeType === 'ContinueStatement' || nodeType === 'BreakStatement') {
      return node.label && AT.keyword(token) ? 'ts' : 't';
    }
    if (nodeType === 'Identifier') {
      return 't';
    }
    if (nodeType === 'PrivateIdentifier') {
      return 't';
    }
    if (nodeType === 'ReturnStatement') {
      if (AT.punctuator(token, ';')) {
        return 't';
      }
      return (node as {argument?: unknown}).argument ? 'ts' : 't';
    }
    if (nodeType === 'AwaitExpression') {
      if (AT.punctuator(token, ';')) {
        return 't';
      }
      return (node as {argument?: unknown}).argument ? 'ts' : 't';
    }
    if (nodeType === 'Property') {
      if (AT.punctuator(token, ':')) {
        return 'ts';
      }
      return 't';
    }
    if (nodeType as string === 'ImportAttribute') {
      if (AT.punctuator(token, ':')) {
        return 'ts';
      }
      return 't';
    }
    if (nodeType === 'ArrayExpression') {
      if (AT.punctuator(token, ',')) {
        return 'ts';
      }
      return 't';
    }
    if (nodeType === 'LabeledStatement') {
      if (AT.punctuator(token, ':')) {
        return 'ts';
      }
    } else if (
        nodeType === 'LogicalExpression' || nodeType === 'AssignmentExpression' ||
        nodeType === 'BinaryExpression') {
      if (AT.punctuator(token) && !AT.punctuator(token, '()')) {
        return 'sts';
      }
    } else if (nodeType === 'ConditionalExpression') {
      if (AT.punctuator(token, '?:')) {
        return 'sts';
      }
    } else if (nodeType === 'VariableDeclarator') {
      if (AT.punctuator(token, '=')) {
        return 'sts';
      }
    } else if (nodeType === 'ObjectPattern') {
      if (node.parent?.type === 'VariableDeclarator' && AT.punctuator(token, '{')) {
        return 'st';
      }
      if (AT.punctuator(token, ',')) {
        return 'ts';
      }
    } else if (nodeType === 'FunctionDeclaration') {
      if (AT.punctuator(token, ',)')) {
        return 'ts';
      }
    } else if (nodeType === 'FunctionExpression') {
      if (AT.punctuator(token, ',)')) {
        return 'ts';
      }
      if (AT.keyword(token, 'function')) {
        return (node as {id?: unknown}).id ? 'ts' : 't';
      }
    } else if (nodeType === 'ArrowFunctionExpression') {
      if (AT.punctuator(token, ',)')) {
        return 'ts';
      }
      if (AT.punctuator(token, '(')) {
        return 'st';
      }
      if (AT.arrowIdentifier(token, '=>')) {
        return 'sts';
      }
    } else if (nodeType === 'WithStatement') {
      if (AT.punctuator(token, ')')) {
        return (node.body as {type?: string})?.type === 'BlockStatement' ? 'ts' : 'tn>';
      }
    } else if (nodeType === 'SwitchStatement') {
      if (AT.punctuator(token, '{')) {
        return 'tn>';
      }
      if (AT.punctuator(token, '}')) {
        return 'n<tn';
      }
      if (AT.punctuator(token, ')')) {
        return 'ts';
      }
    } else if (nodeType === 'SwitchCase') {
      if (AT.keyword(token, 'case')) {
        return 'n<ts';
      }
      if (AT.keyword(token, 'default')) {
        return 'n<t';
      }
      if (AT.punctuator(token, ':')) {
        return 'tn>';
      }
    } else if (nodeType === 'VariableDeclaration') {
      if (AT.punctuator(token, ',')) {
        let allVariablesInitialized = true;
        const declarations = node.declarations as Array<{init?: unknown}>;
        for (let i = 0; i < declarations.length; ++i) {
          allVariablesInitialized = allVariablesInitialized && Boolean(declarations[i].init);
        }
        return !this.#inForLoopHeader(node) && allVariablesInitialized ? 'nSSts' : 'ts';
      }
    } else if (nodeType === 'PropertyDefinition') {
      if (AT.punctuator(token, '=')) {
        return 'sts';
      }
      if (AT.punctuator(token, ';')) {
        return 'tn';
      }
    } else if (nodeType === 'BlockStatement') {
      if (AT.punctuator(token, '{')) {
        return ((node.body as unknown[]).length) ? 'tn>' : 't';
      }
      if (AT.punctuator(token, '}')) {
        return ((node.body as unknown[]).length) ? 'n<t' : 't';
      }
    } else if (nodeType === 'CatchClause') {
      if (AT.punctuator(token, ')')) {
        return 'ts';
      }
    } else if (nodeType === 'ObjectExpression') {
      if (!(node.properties as unknown[]).length) {
        return 't';
      }
      if (AT.punctuator(token, '{')) {
        return 'tn>';
      }
      if (AT.punctuator(token, '}')) {
        return 'n<t';
      }
      if (AT.punctuator(token, ',')) {
        return 'tn';
      }
    } else if (nodeType === 'IfStatement') {
      if (AT.punctuator(token, ')')) {
        return (node.consequent as {type?: string})?.type === 'BlockStatement' ? 'ts' : 'tn>';
      }

      if (AT.keyword(token, 'else')) {
        const preFormat = (node.consequent as {type?: string})?.type === 'BlockStatement' ? 'st' : 'n<t';
        let postFormat = 'n>';
        if (node.alternate &&
            ((node.alternate as {type?: string}).type === 'BlockStatement' ||
             (node.alternate as {type?: string}).type === 'IfStatement')) {
          postFormat = 's';
        }
        return preFormat + postFormat;
      }
    } else if (nodeType === 'CallExpression') {
      if (AT.punctuator(token, ',')) {
        return 'ts';
      }
    } else if (
        nodeType === 'SequenceExpression' && AT.punctuator(token, ',')) {
      return node.parent?.type === 'SwitchCase' ? 'ts' : 'tn';
    } else if (
        nodeType === 'ForStatement' || nodeType === 'ForOfStatement' ||
        nodeType === 'ForInStatement') {
      if (AT.punctuator(token, ';')) {
        return 'ts';
      }
      if (AT.keyword(token, 'in') || AT.identifier(token, 'of')) {
        return 'sts';
      }

      if (AT.punctuator(token, ')')) {
        return (node.body as {type?: string})?.type === 'BlockStatement' ? 'ts' : 'tn>';
      }
    } else if (nodeType === 'WhileStatement') {
      if (AT.punctuator(token, ')')) {
        return (node.body as {type?: string})?.type === 'BlockStatement' ? 'ts' : 'tn>';
      }
    } else if (nodeType === 'DoWhileStatement') {
      const blockBody = (node.body as {type?: string})?.type === 'BlockStatement';
      if (AT.keyword(token, 'do')) {
        return blockBody ? 'ts' : 'tn>';
      }
      if (AT.keyword(token, 'while')) {
        return blockBody ? 'sts' : 'n<ts';
      }
      if (AT.punctuator(token, ';')) {
        return 'tn';
      }
    } else if (nodeType === 'ClassBody') {
      if (AT.punctuator(token, '{')) {
        return 'stn>';
      }
      if (AT.punctuator(token, '}')) {
        return '<ntn';
      }
      return 't';
    } else if (nodeType === 'YieldExpression') {
      return 't';
    } else if (nodeType === 'Super') {
      return 't';
    } else if (nodeType === 'ImportExpression') {
      return 't';
    } else if (nodeType === 'ExportAllDeclaration') {
      if (AT.punctuator(token, '*')) {
        return 'sts';
      }
      return 't';
    } else if (nodeType === 'ExportNamedDeclaration' || nodeType === 'ImportDeclaration') {
      if (AT.punctuator(token, '{')) {
        return 'st';
      }
      if (AT.punctuator(token, ',')) {
        return 'ts';
      }
      if (AT.punctuator(token, '}')) {
        // Acorn >= 8 attaches `attributes: ImportAttribute[]` to declaration
        // nodes; older/proxy bundles may skip it, so defensively default to 0.
        const attributes = (node.attributes as unknown[]) ?? [];
        if (attributes.length > 0) {
          return 't';
        }
        return (node.source) ? 'ts' : 't';
      }
      if (AT.punctuator(token, '*')) {
        return 'sts';
      }
      if (AT.keyword(token, 'with')) {
        return 'sts';
      }
      return 't';
    } else if (nodeType === 'MemberExpression') {
      if ((node.object as {type?: string, value?: unknown}).type === 'Literal' &&
          typeof (node.object as {value?: unknown}).value === 'number') {
        return 'st';
      }
      return 't';
    }
    return AT.keyword(token) && !AT.keyword(token, 'this') ? 'ts' : 't';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #finishNode(node: any): string {
    const nodeType = node.type;
    if (nodeType === 'WithStatement') {
      if (node.body && node.body.type !== 'BlockStatement') {
        return 'n<';
      }
    } else if (nodeType === 'VariableDeclaration') {
      if (!this.#inForLoopHeader(node)) {
        return 'n';
      }
    } else if (
        nodeType === 'ForStatement' || nodeType === 'ForOfStatement' ||
        nodeType === 'ForInStatement') {
      if (node.body && node.body.type !== 'BlockStatement') {
        return 'n<';
      }
    } else if (nodeType === 'BlockStatement') {
      if (node.parent?.type === 'IfStatement') {
        if (node.parent.alternate && node.parent.consequent === node) {
          return '';
        }
      }
      if (node.parent?.type === 'FunctionExpression' && node.parent.parent?.type === 'Property') {
        return '';
      }
      if (node.parent?.type === 'FunctionExpression' && node.parent.parent?.type === 'VariableDeclarator') {
        return '';
      }
      if (node.parent?.type === 'FunctionExpression' && node.parent.parent?.type === 'CallExpression') {
        return '';
      }
      if (node.parent?.type === 'DoWhileStatement') {
        return '';
      }
      if (node.parent?.type === 'TryStatement') {
        if (node.parent.block === node) {
          return 's';
        }
      }
      if (node.parent?.type === 'CatchClause') {
        if (node.parent.parent?.finalizer) {
          return 's';
        }
      }
      return 'n';
    } else if (nodeType === 'WhileStatement') {
      if (node.body && node.body.type !== 'BlockStatement') {
        return 'n<';
      }
    } else if (nodeType === 'IfStatement') {
      if (node.alternate) {
        if ((node.alternate as {type?: string}).type !== 'BlockStatement' &&
            (node.alternate as {type?: string}).type !== 'IfStatement') {
          return '<';
        }
      } else if (node.consequent) {
        if ((node.consequent as {type?: string}).type !== 'BlockStatement') {
          return '<';
        }
      }
    } else if (
        nodeType === 'BreakStatement' || nodeType === 'ContinueStatement' ||
        nodeType === 'ThrowStatement' || nodeType === 'ReturnStatement' ||
        nodeType === 'ExpressionStatement') {
      return 'n';
    } else if (
        nodeType === 'ImportDeclaration' || nodeType === 'ExportAllDeclaration' ||
        nodeType === 'ExportDefaultDeclaration' || nodeType === 'ExportNamedDeclaration') {
      return 'n';
    }
    return '';
  }
}
