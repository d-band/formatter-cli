// Provide the `acorn.ESTree` namespace that the DevTools source historically
// exposed (their acorn bundle exported an `ESTree` namespace re-exporting the
// @types/estree interfaces). The bundled acorn npm package does not declare
// this namespace, but does declare every individual `Node`/`Comment`/`Token`
// interface. We re-declare the namespace here referencing @types/estree so the
// original formatter code continues to typecheck unchanged.
import type * as Estree from '@types/estree';

declare module 'acorn' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ESTree {
    type Node = Estree.Node;
  }
}
