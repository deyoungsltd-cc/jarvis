/**
 * Calculator Plugin for JARVIS
 *
 * Evaluates mathematical expressions safely — NO eval().
 * Supports: add, subtract, multiply, divide, power, sqrt.
 *
 * Two calling conventions:
 *   1. Binary mode  — { operation, a, b }
 *   2. Expression mode — { expression }  (e.g. "2 + 3 * 4")
 */

// ---- Safe recursive-descent math parser ----
// Grammar:
//   expr   → term (('+' | '-') term)*
//   term   → power (('*' | '/') power)*
//   power  → unary ('^' unary)*
//   unary  → '-' unary | sqrt_call | atom
//   sqrt_call → 'sqrt' '(' expr ')'
//   atom   → NUMBER | '(' expr ')'

class SafeMathParser {
  constructor(input) {
    this.pos = 0;
    this.input = input.replace(/\s+/g, '');
  }

  parse() {
    const result = this.expr();
    if (this.pos < this.input.length) {
      throw new Error(`Unexpected character at position ${this.pos}: '${this.input[this.pos]}'`);
    }
    return result;
  }

  expr() {
    let left = this.term();
    while (this.pos < this.input.length && (this.input[this.pos] === '+' || this.input[this.pos] === '-')) {
      const op = this.input[this.pos++];
      const right = this.term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  term() {
    let left = this.power();
    while (this.pos < this.input.length && (this.input[this.pos] === '*' || this.input[this.pos] === '/')) {
      const op = this.input[this.pos++];
      const right = this.power();
      if (op === '/' && right === 0) throw new Error('Division by zero');
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  power() {
    let base = this.unary();
    while (this.pos < this.input.length && this.input[this.pos] === '^') {
      this.pos++;
      const exp = this.unary();
      base = Math.pow(base, exp);
    }
    return base;
  }

  unary() {
    if (this.pos < this.input.length && this.input[this.pos] === '-') {
      this.pos++;
      return -this.unary();
    }
    if (this._peekKeyword('sqrt')) {
      this._consumeKeyword('sqrt');
      this._expect('(');
      const val = this.expr();
      this._expect(')');
      if (val < 0) throw new Error('Square root of negative number');
      return Math.sqrt(val);
    }
    return this.atom();
  }

  atom() {
    if (this.pos < this.input.length && this.input[this.pos] === '(') {
      this.pos++;
      const val = this.expr();
      this._expect(')');
      return val;
    }
    const start = this.pos;
    let hasDot = false;
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch >= '0' && ch <= '9') {
        this.pos++;
      } else if (ch === '.' && !hasDot) {
        hasDot = true;
        this.pos++;
      } else {
        break;
      }
    }
    if (this.pos === start) throw new Error(`Expected number at position ${this.pos}`);
    return parseFloat(this.input.substring(start, this.pos));
  }

  _expect(ch) {
    if (this.pos >= this.input.length || this.input[this.pos] !== ch)
      throw new Error(`Expected '${ch}' at position ${this.pos}`);
    this.pos++;
  }

  _peekKeyword(kw) {
    return this.input.substring(this.pos, this.pos + kw.length) === kw;
  }

  _consumeKeyword(kw) {
    if (!this._peekKeyword(kw))
      throw new Error(`Expected '${kw}' at position ${this.pos}`);
    this.pos += kw.length;
  }
}

/** Evaluate a math expression string safely. */
function safeEval(expression) {
  if (!/^[0-9+\-*/().^\s]*$/.test(expression) && !expression.includes('sqrt')) {
    throw new Error('Expression contains disallowed characters');
  }
  return new SafeMathParser(expression).parse();
}

/** Perform a named binary operation. */
function binaryOp(operation, a, b) {
  switch (operation) {
    case 'add':      return a + b;
    case 'subtract': return a - b;
    case 'multiply': return a * b;
    case 'divide':
      if (b === 0) throw new Error('Division by zero');
      return a / b;
    case 'power':    return Math.pow(a, b);
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

// ---- Plugin manifest ----

export default {
  name: 'calculator',
  description: 'Evaluates mathematical expressions safely. Supports add, subtract, multiply, divide, power, sqrt.',
  inputSchema: {
    type: 'object',
    properties: {
      a:         { type: 'number', description: 'First operand (used with operation parameter)' },
      b:         { type: 'number', description: 'Second operand (used with operation parameter)' },
      operation: { type: 'string', description: 'Binary operation: add, subtract, multiply, divide, power' },
      expression:{ type: 'string', description: 'Mathematical expression to evaluate (e.g. "2 + 3 * 4")' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      result:     { type: 'number' },
      expression: { type: 'string' },
      method:     { type: 'string' },
    },
  },
  riskLevel: 'low',

  async execute(input) {
    const start = Date.now();
    let result;
    let method;

    // Mode 1: binary operation via { operation, a, b }
    if (input.operation && input.a !== undefined && input.b !== undefined) {
      result = binaryOp(input.operation, Number(input.a), Number(input.b));
      method = `binary(${input.operation})`;
    }
    // Mode 2: expression parsing
    else if (input.expression) {
      result = safeEval(String(input.expression));
      method = 'expression';
    }
    // Mode 3: sqrt via { operation: 'sqrt', a }
    else if (input.operation === 'sqrt' && input.a !== undefined) {
      const val = Number(input.a);
      if (val < 0) throw new Error('Square root of negative number');
      result = Math.sqrt(val);
      method = 'sqrt';
    }
    else {
      return {
        success: false,
        output: null,
        error: 'Must provide either (expression) or (operation, a, b)',
        durationMs: Date.now() - start,
      };
    }

    // Round to 10 decimal places to avoid floating-point artefacts
    result = Math.round(result * 1e10) / 1e10;

    return {
      success: true,
      output: {
        result,
        expression: input.expression || `${input.a} ${input.operation} ${input.b}`,
        method,
      },
      durationMs: Date.now() - start,
    };
  },
};
