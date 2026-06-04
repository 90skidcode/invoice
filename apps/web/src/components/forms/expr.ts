import type { FormValues } from './types';

/**
 * Tiny, dependency-free expression evaluator for form `visibleWhen` and
 * `computed` rules (a constrained subset of the spec's expression language).
 * Supports: ${field} refs, number/string/boolean literals, ( ), unary !,
 * arithmetic + - * /, comparisons == != < > <= >=, and && || .
 * Implemented as a shunting-yard parser — NO eval/Function (§11.7).
 */

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'ref'; v: string }
  | { t: 'op'; v: string }
  | { t: 'paren'; v: '(' | ')' };

const OPS: Record<string, { prec: number; fn: (a: unknown, b: unknown) => unknown }> = {
  '||': { prec: 1, fn: (a, b) => !!a || !!b },
  '&&': { prec: 2, fn: (a, b) => !!a && !!b },
  '==': { prec: 3, fn: (a, b) => looseEq(a, b) },
  '!=': { prec: 3, fn: (a, b) => !looseEq(a, b) },
  '<': { prec: 4, fn: (a, b) => Number(a) < Number(b) },
  '>': { prec: 4, fn: (a, b) => Number(a) > Number(b) },
  '<=': { prec: 4, fn: (a, b) => Number(a) <= Number(b) },
  '>=': { prec: 4, fn: (a, b) => Number(a) >= Number(b) },
  '+': { prec: 5, fn: (a, b) => Number(a) + Number(b) },
  '-': { prec: 5, fn: (a, b) => Number(a) - Number(b) },
  '*': { prec: 6, fn: (a, b) => Number(a) * Number(b) },
  '/': { prec: 6, fn: (a, b) => (Number(b) === 0 ? 0 : Number(a) / Number(b)) },
};

function looseEq(a: unknown, b: unknown): boolean {
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
  if (a === '' || b === '' || a == null || b == null) return String(a) === String(b);
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  return String(a) === String(b);
}

function tokenize(expr: string, values: FormValues): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i]!;
    if (c === ' ') {
      i++;
      continue;
    }
    if (c === '$' && expr[i + 1] === '{') {
      const end = expr.indexOf('}', i);
      const name = expr.slice(i + 2, end);
      tokens.push({ t: 'ref', v: name });
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = expr.indexOf(c, i + 1);
      tokens.push({ t: 'str', v: expr.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (c === '(' || c === ')') {
      tokens.push({ t: 'paren', v: c });
      i++;
      continue;
    }
    // multi-char operators
    const two = expr.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
      tokens.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if (c === '!') {
      tokens.push({ t: 'op', v: '!' });
      i++;
      continue;
    }
    if ('+-*/<>'.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i++;
      continue;
    }
    // number
    const numMatch = /^\d+(\.\d+)?/.exec(expr.slice(i));
    if (numMatch) {
      tokens.push({ t: 'num', v: Number(numMatch[0]) });
      i += numMatch[0].length;
      continue;
    }
    // identifier literal (true/false or bare word)
    const idMatch = /^[A-Za-z_]\w*/.exec(expr.slice(i));
    if (idMatch) {
      const word = idMatch[0];
      if (word === 'true') tokens.push({ t: 'bool', v: true });
      else if (word === 'false') tokens.push({ t: 'bool', v: false });
      else tokens.push({ t: 'str', v: word });
      i += word.length;
      continue;
    }
    i++; // skip unknown char
  }
  // Resolve refs against form values
  return tokens.map((tok) =>
    tok.t === 'ref' ? resolveRef(tok.v, values) : tok,
  );
}

function resolveRef(name: string, values: FormValues): Token {
  const raw = values[name];
  if (typeof raw === 'boolean') return { t: 'bool', v: raw };
  if (typeof raw === 'number') return { t: 'num', v: raw };
  if (raw == null || raw === '') return { t: 'str', v: '' };
  const num = Number(raw);
  if (!Number.isNaN(num) && String(raw).trim() !== '') return { t: 'num', v: num };
  return { t: 'str', v: String(raw) };
}

function toRpn(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const stack: Token[] = [];
  for (const tok of tokens) {
    if (tok.t === 'num' || tok.t === 'str' || tok.t === 'bool') {
      out.push(tok);
    } else if (tok.t === 'op') {
      if (tok.v === '!') {
        stack.push(tok);
        continue;
      }
      const prec = OPS[tok.v]?.prec ?? 0;
      while (
        stack.length > 0 &&
        stack.at(-1)!.t === 'op' &&
        (OPS[(stack.at(-1) as { v: string }).v]?.prec ?? 0) >= prec
      ) {
        out.push(stack.pop()!);
      }
      stack.push(tok);
    } else if (tok.t === 'paren') {
      if (tok.v === '(') stack.push(tok);
      else {
        while (stack.length > 0 && !(stack.at(-1)!.t === 'paren')) out.push(stack.pop()!);
        stack.pop(); // discard '('
      }
    }
  }
  while (stack.length > 0) out.push(stack.pop()!);
  return out;
}

function evalRpn(rpn: Token[]): unknown {
  const stack: unknown[] = [];
  for (const tok of rpn) {
    if (tok.t === 'num' || tok.t === 'str' || tok.t === 'bool') {
      stack.push(tok.v);
    } else if (tok.t === 'op') {
      if (tok.v === '!') {
        stack.push(!stack.pop());
        continue;
      }
      const b = stack.pop();
      const a = stack.pop();
      stack.push(OPS[tok.v]?.fn(a, b));
    }
  }
  return stack.pop();
}

export function evalExpr(expr: string, values: FormValues): unknown {
  try {
    return evalRpn(toRpn(tokenize(expr, values)));
  } catch {
    return undefined;
  }
}

export function evalBool(expr: string, values: FormValues): boolean {
  return !!evalExpr(expr, values);
}
