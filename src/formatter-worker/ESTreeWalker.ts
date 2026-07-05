// Ported from DevTools entrypoints/formatter_worker/ESTreeWalker.ts
// Original: Copyright 2014 The Chromium Authors. BSD-style license.

import type * as Acorn from 'acorn';

// DevTools convention: acorn nodes carry a back-pointer to their parent, which
// the ESTree types don't model. We patch it in via declaration merging because
// the formatters read `node.parent` everywhere.
interface AcornNodeWithParent extends Acorn.Node {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parent?: any;
}

export class ESTreeWalker {
  readonly #beforeVisit: (arg0: AcornNodeWithParent) => unknown;
  readonly #afterVisit: (arg0: AcornNodeWithParent) => unknown;

  constructor(
      beforeVisit: (arg0: AcornNodeWithParent) => unknown,
      afterVisit: (arg0: AcornNodeWithParent) => unknown) {
    this.#beforeVisit = beforeVisit;
    this.#afterVisit = afterVisit;
  }

  walk(ast: AcornNodeWithParent): void {
    this.#innerWalk(ast, null);
  }

  #innerWalk(node: AcornNodeWithParent, parent: AcornNodeWithParent | null): void {
    if (!node) {
      return;
    }
    node.parent = parent;

    this.#beforeVisit.call(null, node);

    const walkOrder = WALK_ORDER[node.type as keyof typeof WALK_ORDER];
    if (!walkOrder) {
      // eslint-disable-next-line no-console
      console.error('Walk order not defined for ' + node.type);
      return;
    }

    if (node.type === 'TemplateLiteral') {
      // Acorn's TemplateLiteral has `quasis: TemplateElement[]` and `expressions:
      // Expression[]`, but the @types/acorn declaration of TemplateLiteral uses
      // slightly different inner types than the runtime bundle. The walker only
      // needs structural access (`length`, index), so we gulp through `any` to
      // avoid fighting the type system on a node type that isn't really used by
      // downstream formatters with strict typing.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const templateLiteral = node as any;
      const expressionsLength = templateLiteral.expressions.length;
      for (let i = 0; i < expressionsLength; ++i) {
        this.#innerWalk(templateLiteral.quasis[i], templateLiteral);
        this.#innerWalk(templateLiteral.expressions[i], templateLiteral);
      }
      this.#innerWalk(templateLiteral.quasis[expressionsLength], templateLiteral);
    } else {
      for (let i = 0; i < walkOrder.length; ++i) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entity = (node as any)[walkOrder[i]];
        if (Array.isArray(entity)) {
          this.#walkArray(entity as AcornNodeWithParent[], node);
        } else if (entity) {
          this.#innerWalk(entity as AcornNodeWithParent, node);
        }
      }
    }

    this.#afterVisit.call(null, node);
  }

  #walkArray(nodeArray: AcornNodeWithParent[], parentNode: AcornNodeWithParent | null): void {
    for (let i = 0; i < nodeArray.length; ++i) {
      this.#innerWalk(nodeArray[i], parentNode);
    }
  }
}


const WALK_ORDER = {
  AwaitExpression: ['argument'],
  ArrayExpression: ['elements'],
  ArrayPattern: ['elements'],
  ArrowFunctionExpression: ['params', 'body'],
  AssignmentExpression: ['left', 'right'],
  AssignmentPattern: ['left', 'right'],
  BinaryExpression: ['left', 'right'],
  BlockStatement: ['body'],
  BreakStatement: ['label'],
  CallExpression: ['callee', 'arguments'],
  CatchClause: ['param', 'body'],
  ClassBody: ['body'],
  ClassDeclaration: ['id', 'superClass', 'body'],
  ClassExpression: ['id', 'superClass', 'body'],
  ChainExpression: ['expression'],
  ConditionalExpression: ['test', 'consequent', 'alternate'],
  ContinueStatement: ['label'],
  DebuggerStatement: [],
  DoWhileStatement: ['body', 'test'],
  EmptyStatement: [],
  ExpressionStatement: ['expression'],
  ForInStatement: ['left', 'right', 'body'],
  ForOfStatement: ['left', 'right', 'body'],
  ForStatement: ['init', 'test', 'update', 'body'],
  FunctionDeclaration: ['id', 'params', 'body'],
  FunctionExpression: ['id', 'params', 'body'],
  Identifier: [],
  ImportDeclaration: ['specifiers', 'source', 'attributes'],
  ImportAttribute: ['key', 'value'],
  ImportDefaultSpecifier: ['local'],
  ImportNamespaceSpecifier: ['local'],
  ImportSpecifier: ['imported', 'local'],
  ImportExpression: ['source'],
  ExportAllDeclaration: ['source'],
  ExportDefaultDeclaration: ['declaration'],
  ExportNamedDeclaration: ['specifiers', 'source', 'declaration'],
  ExportSpecifier: ['exported', 'local'],
  IfStatement: ['test', 'consequent', 'alternate'],
  LabeledStatement: ['label', 'body'],
  Literal: [],
  LogicalExpression: ['left', 'right'],
  MemberExpression: ['object', 'property'],
  MetaProperty: ['meta', 'property'],
  MethodDefinition: ['key', 'value'],
  NewExpression: ['callee', 'arguments'],
  ObjectExpression: ['properties'],
  ObjectPattern: ['properties'],
  ParenthesizedExpression: ['expression'],
  PrivateIdentifier: [],
  PropertyDefinition: ['key', 'value'],
  Program: ['body'],
  Property: ['key', 'value'],
  RestElement: ['argument'],
  ReturnStatement: ['argument'],
  SequenceExpression: ['expressions'],
  SpreadElement: ['argument'],
  StaticBlock: ['body'],
  Super: [],
  SwitchCase: ['test', 'consequent'],
  SwitchStatement: ['discriminant', 'cases'],
  TaggedTemplateExpression: ['tag', 'quasi'],
  TemplateElement: [],
  TemplateLiteral: ['quasis', 'expressions'],
  ThisExpression: [],
  ThrowStatement: ['argument'],
  TryStatement: ['block', 'handler', 'finalizer'],
  UnaryExpression: ['argument'],
  UpdateExpression: ['argument'],
  VariableDeclaration: ['declarations'],
  VariableDeclarator: ['id', 'init'],
  WhileStatement: ['test', 'body'],
  WithStatement: ['object', 'body'],
  YieldExpression: ['argument'],
} as const;
