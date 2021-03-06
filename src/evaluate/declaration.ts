import * as estree from 'estree'
import Scope from '../scope'
import evaluate from '.'
import { createFunc, pattern, createClass } from '../share/helper'
import { VarKind } from '../scope/variable'
import { define, getDptor, assign } from '../share/util'

import { Identifier } from './identifier'
import { NOINIT } from '../share/const'

export function* FunctionDeclaration(node: estree.FunctionDeclaration, scope: Scope) {
  scope.func(node.id.name, yield* createFunc(node, scope))
}

export interface VariableDeclarationOptions {
  hoist?: boolean
  feed?: any
}

export function* VariableDeclaration(
  node: estree.VariableDeclaration,
  scope: Scope,
  options: VariableDeclarationOptions = {},
) {
  for (const declarator of node.declarations) {
    yield* VariableDeclarator(declarator, scope, assign({ kind: node.kind }, options))
  }
}

export interface VariableDeclaratorOptions {
  kind?: VarKind
}

export function* VariableDeclarator(
  node: estree.VariableDeclarator,
  scope: Scope,
  options: VariableDeclaratorOptions & VariableDeclarationOptions = {},
) {
  const { kind = 'let', hoist = false, feed } = options
  if (hoist) {
    // hoist the var variable
    if (kind === 'var') {
      if (node.id.type === 'Identifier') {
        const name = yield* Identifier(node.id, scope, { getName: true })
        scope.var(name, undefined)
      } else {
        yield* pattern(node.id, scope, { kind, hoist })
      }
    }
  } else if (
    kind === 'var'
    || kind === 'let'
    || kind === 'const'
  ) {
    const value = 'feed' in options ? feed : yield* evaluate(node.init, scope)
    if (node.id.type === 'Identifier') {
      const name = yield* Identifier(node.id, scope, { getName: true })
      if (kind === 'var' && !node.init) {
        scope.var(name, NOINIT)
      } else {
        scope[kind](name, value)
      }
    } else {
      yield* pattern(node.id, scope, { kind, feed: value })
    }
  } else {
    throw new SyntaxError('Unexpected identifier')
  }
}

export function* ClassDeclaration(node: estree.ClassDeclaration, scope: Scope): IterableIterator<any> {
  scope.func(node.id.name, yield* createClass(node, scope))
}

export interface ClassOptions {
  klass?: (...args: any[]) => any
}

export function* ClassBody(node: estree.ClassBody, scope: Scope, options: ClassOptions = {}) {
  const { klass = function () { } } = options

  for (const method of node.body) {
    yield* MethodDefinition(method, scope, { klass })
  }
}

export function* MethodDefinition(node: estree.MethodDefinition, scope: Scope, options: ClassOptions = {}) {
  const { klass = function () { } } = options

  let key: string
  if (node.computed) {
    key = yield* evaluate(node.key, scope)
  } else if (node.key.type === 'Identifier') {
    key = yield* Identifier(node.key, scope, { getName: true })
  } else {
    throw new SyntaxError('Unexpected token')
  }

  const obj = node.static ? klass : klass.prototype
  const value = yield* createFunc(node.value, scope)

  switch (node.kind) {
    case 'constructor':
      break
    case 'method':
      define(obj, key, {
        value,
        writable: true,
        configurable: true,
      })
      break
    case 'get': {
      const oriDptor = getDptor(obj, key)
      define(obj, key, {
        get: value,
        set: oriDptor && oriDptor.set,
        configurable: true,
      })
      break
    }
    case 'set': {
      const oriDptor = getDptor(obj, key)
      define(obj, key, {
        get: oriDptor && oriDptor.get,
        set: value,
        configurable: true,
      })
      break
    }
    default:
      throw new SyntaxError('Unexpected token')
  } 
}
