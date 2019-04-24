import Sval from '../src'

describe('testing src/index.ts', () => {
  it('should parse template element normally', () => {  
    const interpreter = new Sval()
    interpreter.run('const a = 1; exports.str = `a: ${a}`')
    expect(interpreter.exports.str).toBe('a: 1')
  })
})
