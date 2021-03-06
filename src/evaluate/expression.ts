import * as estree from 'estree'
import Scope from '../scope'
import evaluate from '.'
import { createFunc, pattern, createClass } from '../share/helper'
import { define, freeze, getGetter, getSetter, createSymbol } from '../share/util'
import { SUPER, ASYNC } from '../share/const'

import { Identifier } from './identifier'
import { Literal } from './literal'
import { Variable, Prop } from '../scope/variable'

export function* ThisExpression(node: estree.ThisExpression, scope: Scope) {
  return scope.find('this').get()
}

export function* ArrayExpression(node: estree.ArrayExpression, scope: Scope) {
  let results: any[] = []
  for (const item of node.elements) {
    if (item.type === 'SpreadElement') {
      results = results.concat(yield* SpreadElement(item, scope))
    } else {
      results.push(yield* evaluate(item, scope))
    }
  }
  return results
}

export function* ObjectExpression(node: estree.ObjectExpression, scope: Scope) {
  const object: { [key: string]: any } = {}
  
  for (const property of node.properties) {
    const propKey = property.key
    let key: string
    if (propKey.type === 'Identifier') {
      key = yield* Identifier(propKey, scope, { getName: true })
    } else if (propKey.type === 'Literal') {
      key = '' + (yield* Literal(propKey, scope))
    } else {
      throw new SyntaxError('Unexpected token')
    }

    const value = yield* evaluate(property.value, scope)

    const propKind = property.kind
    if (propKind === 'init') {
      object[key] = value
    } else if (propKind === 'get') {
      define(object, key, { get: value })
    } else if (propKind === 'set') {
      define(object, key, { set: value })
    } else {
      throw new SyntaxError('Unexpected token')
    }
  }

  return object
}

export function* FunctionExpression(node: estree.FunctionExpression, scope: Scope) {
  return yield* createFunc(node, scope)
}

export function* UnaryExpression(node: estree.UnaryExpression, scope: Scope) {
  const arg = node.argument
  switch (node.operator) {
    case '+':
      return +(yield* evaluate(arg, scope))
    case '-':
      return -(yield* evaluate(arg, scope))
    case '!':
      return !(yield* evaluate(arg, scope))
    case '~':
      return ~(yield* evaluate(arg, scope))
    case 'void':
      return void (yield* evaluate(arg, scope))
    case 'typeof':
      if (arg.type === 'Identifier') {
        return typeof (yield* Identifier(arg, scope, { throwErr: false }))
      } else {
        return typeof (yield* evaluate(arg, scope))
      }
    case 'delete':
      if (arg.type === 'MemberExpression') {
        const variable: Prop = yield* MemberExpression(arg, scope, { getVar: true })
        return variable.del()
      } else if (arg.type === 'Identifier') {
        const globalScope = scope.global()
        const name = yield* Identifier(arg, globalScope, { getName: true })
        const win = globalScope.find('window').get()
        return delete win[name]
      } else {
        throw new SyntaxError('Unexpected token')
      }
    default:
      throw new SyntaxError(`Unexpected token ${node.operator}`)
  }
}

export function* UpdateExpression(node: estree.UpdateExpression, scope: Scope) {
  const arg = node.argument
  
  let variable: Variable
  if (arg.type === 'Identifier') {
    variable = yield* Identifier(arg, scope, { getVar: true })
  } else if (arg.type === 'MemberExpression') {
    variable = yield* MemberExpression(arg, scope, { getVar: true })
  } else {
    throw new SyntaxError('Unexpected token')
  }

  const value = variable.get()
  if (node.operator === '++') {
    variable.set(value + 1)
    return node.prefix ? variable.get() : value
  } else if (node.operator === '--') {
    variable.set(value - 1)
    return node.prefix ? variable.get() : value
  } else {
    throw new SyntaxError(`Unexpected token ${node.operator}`)
  }
}

export function* BinaryExpression(node: estree.BinaryExpression, scope: Scope) {
  const left = yield* evaluate(node.left, scope)
  const right = yield* evaluate(node.right, scope)

  const binaryOps = {
    '==': () => left == right,
    '!=': () => left != right,
    '===': () => left === right,
    '!==': () => left !== right,
    '<': () => left < right,
    '<=': () => left <= right,
    '>': () => left > right,
    '>=': () => left >= right,
    '<<': () => left << right,
    '>>': () => left >> right,
    '>>>': () => left >>> right,
    '+': () => left + right,
    '-': () => left - right,
    '*': () => left * right,
    '**': () => left ** right,
    '/': () => left / right,
    '%': () => left % right,
    '|': () => left | right,
    '^': () => left ^ right,
    '&': () => left & right,
    'in': () => left in right,
    'instanceof': () => left instanceof right,
  }

  const handler = binaryOps[node.operator]
  if (handler) {
    return handler()
  } else {
    throw new SyntaxError(`Unexpected token ${node.operator}`)
  }
}

export function* AssignmentExpression(node: estree.AssignmentExpression, scope: Scope) {
  const value = yield* evaluate(node.right, scope)

  const left = node.left

  let variable: Variable
  if (left.type === 'Identifier') {
    variable = yield* Identifier(left, scope, { getVar: true, throwErr: false })
    if (!variable) {
      const win = scope.global().find('window').get()
      variable = new Prop(win, left.name)
    }
  } else if (left.type === 'MemberExpression') {
    variable = yield* MemberExpression(left, scope, { getVar: true })
  } else {
    return yield* pattern(left, scope, { feed: value })
  }

  const assignOps = {
    '=': () => {
      variable.set(value)
      return variable.get()
    },
    '+=': () => {
      variable.set(variable.get() + value)
      return variable.get()
    },
    '-=': () => {
      variable.set(variable.get() - value)
      return variable.get()
    },
    '*=': () => {
      variable.set(variable.get() * value)
      return variable.get()
    },
    '/=': () => {
      variable.set(variable.get() / value)
      return variable.get()
    },
    '%=': () => {
      variable.set(variable.get() % value)
      return variable.get()
    },
    '**=': () => {
      variable.set(variable.get() ** value)
      return variable.get()
    },
    '<<=': () => {
      variable.set(variable.get() << value)
      return variable.get()
    },
    '>>=': () => {
      variable.set(variable.get() >> value)
      return variable.get()
    },
    '>>>=': () => {
      variable.set(variable.get() >>> value)
      return variable.get()
    },
    '|=': () => {
      variable.set(variable.get() | value)
      return variable.get()
    },
    '^=': () => {
      variable.set(variable.get() ^ value)
      return variable.get()
    },
    '&=': () => {
      variable.set(variable.get() & value)
      return variable.get()
    },
  }
  
  const handler = assignOps[node.operator]
  if (handler) {
    return handler()
  } else {
    throw new SyntaxError(`Unexpected token ${node.operator}`)
  }
}

export function* LogicalExpression(node: estree.LogicalExpression, scope: Scope) {
  switch (node.operator) {
    case '||':
      return (yield* evaluate(node.left, scope)) || (yield* evaluate(node.right, scope))
    case '&&':
      return (yield* evaluate(node.left, scope)) && (yield* evaluate(node.right, scope))
    default:
      throw new SyntaxError(`Unexpected token ${node.operator}`)
  }
}

export interface MemberExpressionOptions {
  getObj?: boolean
  getVar?: boolean
}

export function* MemberExpression(
  node: estree.MemberExpression,
  scope: Scope,
  options: MemberExpressionOptions = {},
) {
  const { getObj = false, getVar = false } = options

  let object: any
  if (node.object.type === 'Super') {
    object = yield* Super(node.object, scope, { getProto: true })
  } else {
    object = yield* evaluate(node.object, scope)
  }

  if (getObj) {
    if (node.object.type === 'Super') {
      return scope.find('this').get()
    } else {
      return object
    }
  }

  let key: string
  if (node.computed) {
    key = yield* evaluate(node.property, scope)
  } else if (node.property.type === 'Identifier') {
    key = yield* Identifier(node.property, scope, { getName: true })
  } else {
    throw new SyntaxError('Unexpected token')
  }

  if (getVar) {
    // left value
    const setter = getSetter(object, key)
    if (node.object.type === 'Super' && setter) {
      // transfer the setter from super to this with a private key
      const thisObject = scope.find('this').get()
      const privateKey = createSymbol(key)
      define(thisObject, privateKey, { set: setter })
      return new Prop(thisObject, privateKey)
    } else {
      return new Prop(object, key)
    }
  } else {
    // right value
    const getter = getGetter(object, key)
    if (node.object.type === 'Super' && getter) {
      const thisObject = scope.find('this').get()
      return getter.call(thisObject)
    } else {
      return object[key]
    }
  }
}

export function* ConditionalExpression(node: estree.ConditionalExpression, scope: Scope) {
  return (yield* evaluate(node.test, scope))
    ? (yield* evaluate(node.consequent, scope))
    : (yield* evaluate(node.alternate, scope))
}

export interface CallExpressionOptions {
  async?: boolean
}

export function* CallExpression(
  node: estree.CallExpression,
  scope: Scope,
  options: CallExpressionOptions = {}
) {
  const { async = false } = options

  let func: any
  let object: any

  if (node.callee.type === 'MemberExpression') {
    object = yield* MemberExpression(node.callee, scope, { getObj: true })
  
    // get key
    let key: string
    if (node.callee.computed) {
      key = yield* evaluate(node.callee.property, scope)
    } else if (node.callee.property.type === 'Identifier') {
      key = yield* Identifier(node.callee.property, scope, { getName: true })
    } else {
      throw new SyntaxError('Unexpected token')
    }

    // right value
    const getter = getGetter(object, key)
    if (node.callee.object.type === 'Super' && getter) {
      const thisObject = scope.find('this').get()
      func = getter.call(thisObject)
    } else {
      func = object[key]
    }
  } else {
    object = scope.find('this').get()
    func = yield* evaluate(node.callee, scope)
  }

  let args: any[] = []
  for (const arg of node.arguments) {
    if (arg.type === 'SpreadElement') {
      args = args.concat(yield* SpreadElement(arg, scope))
    } else {
      args.push(yield* evaluate(arg, scope))
    }
  }

  if (func[ASYNC] && !async) {
    return func.apply(object, args).then()
  } else {
    return func.apply(object, args)
  }
}

export function* NewExpression(node: estree.NewExpression, scope: Scope) {
  const constructor = yield* evaluate(node.callee, scope)

  let args: any[] = []
  for (const arg of node.arguments) {
    if (arg.type === 'SpreadElement') {
      args = args.concat(yield* SpreadElement(arg, scope))
    } else {
      args.push(yield* evaluate(arg, scope))
    }
  }

  return new constructor(...args)
}

export function* SequenceExpression(node: estree.SequenceExpression, scope: Scope) {
  let result: any
  for (const expression of node.expressions) {
    result = yield* evaluate(expression, scope)
  }
  return result
}

export function* ArrowFunctionExpression(node: estree.ArrowFunctionExpression, scope: Scope) {
  return yield* createFunc(node, scope)
}

export function* YieldExpression(node: estree.YieldExpression, scope: Scope) {
  if (node.delegate) {
    yield* yield* evaluate(node.argument, scope)
  } else {
    yield yield* evaluate(node.argument, scope)
  }
}

export function* AwaitExpression(node: estree.AwaitExpression, scope: Scope) {
  if (node.argument.type === 'CallExpression') {
    return yield yield* CallExpression(node.argument, scope, { async: true })
  } else {
    return yield yield* evaluate(node.argument, scope)
  }
}

export function* TemplateLiteral(node: estree.TemplateLiteral, scope: Scope) {
  const quasis = node.quasis
  const expressions = node.expressions

  let result = ''
  let temEl: estree.TemplateElement
  let expr: estree.Expression

  while (temEl = quasis.shift()) {
    result += yield* TemplateElement(temEl, scope)
    expr = expressions.shift()
    if (expr) {
      result += yield* evaluate(expr, scope)
    }
  }

  return result
}

export function* TaggedTemplateExpression(node: estree.TaggedTemplateExpression, scope: Scope) {
  const tagFunc = yield* evaluate(node.tag, scope)

  const quasis = node.quasi.quasis
  const str = quasis.map(v => v.value.cooked)
  const raw = quasis.map(v => v.value.raw)

  define(str, 'raw', {
    value: freeze(raw)
  })

  const expressions = node.quasi.expressions

  const args = []
  if (expressions) {
    for (const n of node.quasi.expressions) {
      args.push(yield* evaluate(n, scope))
    }
  }

  return tagFunc(freeze(str), ...args)
}

export function* TemplateElement(node: estree.TemplateElement, scope: Scope) {
  return node.value.raw
}

export function* ClassExpression(node: estree.ClassExpression, scope: Scope) {
  return yield* createClass(node, scope)
}

export interface SuperOptions {
  getProto?: boolean
}

export function* Super(
  node: estree.Super,
  scope: Scope,
  options: SuperOptions = {},
) {
  const { getProto = false } = options
  const superClass = scope.find(SUPER).get()
  return getProto ? superClass.prototype: superClass
}

export function* SpreadElement(node: estree.SpreadElement, scope: Scope) {
  return yield* evaluate(node.argument, scope)
}