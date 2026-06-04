import { Decimal } from 'decimal.js';

// Configure Decimal for financial calculations
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21,
});

export type MoneyString = string & { __brand: 'MoneyString' };

export function toMoney(value: string | number | Decimal): MoneyString {
  return new Decimal(value).toFixed(2) as MoneyString;
}

export function addMoney(a: string, b: string): MoneyString {
  return new Decimal(a).plus(new Decimal(b)).toFixed(2) as MoneyString;
}

export function subtractMoney(a: string, b: string): MoneyString {
  return new Decimal(a).minus(new Decimal(b)).toFixed(2) as MoneyString;
}

export function multiplyMoney(amount: string, factor: string | number): MoneyString {
  return new Decimal(amount).times(new Decimal(factor)).toFixed(2) as MoneyString;
}

export function divideMoney(amount: string, divisor: string | number): MoneyString {
  return new Decimal(amount).dividedBy(new Decimal(divisor)).toFixed(2) as MoneyString;
}

export function roundMoney(
  value: string | number | Decimal,
  mode: 'nearest' | 'up' | 'down' | 'none' = 'nearest',
): MoneyString {
  const d = new Decimal(value);
  if (mode === 'none') return d.toFixed(2) as MoneyString;
  if (mode === 'up') return d.toDecimalPlaces(0, Decimal.ROUND_UP).toFixed(2) as MoneyString;
  if (mode === 'down') return d.toDecimalPlaces(0, Decimal.ROUND_DOWN).toFixed(2) as MoneyString;
  return d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(2) as MoneyString;
}

export function roundOff(value: string): MoneyString {
  const d = new Decimal(value);
  const rounded = d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return rounded.minus(d).toFixed(2) as MoneyString;
}

export function isPositive(value: string): boolean {
  return new Decimal(value).isPositive();
}

export function isZero(value: string): boolean {
  return new Decimal(value).isZero();
}

export function compareMoney(a: string, b: string): -1 | 0 | 1 {
  return new Decimal(a).comparedTo(new Decimal(b)) as -1 | 0 | 1;
}

export function sumMoney(values: string[]): MoneyString {
  return values.reduce<MoneyString>((acc, v) => addMoney(acc, v), '0.00' as MoneyString);
}

export function parseMoney(value: unknown): MoneyString {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TypeError(`Invalid money value: ${String(value)}`);
  }
  const d = new Decimal(String(value));
  if (d.isNaN()) throw new TypeError(`Not a valid number: ${String(value)}`);
  return d.toFixed(2) as MoneyString;
}

export function parseQuantity(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TypeError(`Invalid quantity value: ${String(value)}`);
  }
  const d = new Decimal(String(value));
  if (d.isNaN()) throw new TypeError(`Not a valid number: ${String(value)}`);
  return d.toFixed(3);
}

export function multiplyQtyRate(qty: string, rate: string): MoneyString {
  return new Decimal(qty).times(new Decimal(rate)).toFixed(2) as MoneyString;
}

export function applyDiscount(amount: string, discountPct: string): MoneyString {
  const disc = new Decimal(amount).times(new Decimal(discountPct)).dividedBy(100);
  return new Decimal(amount).minus(disc).toFixed(2) as MoneyString;
}

export function applyDiscountAmount(amount: string, discountAmt: string): MoneyString {
  return new Decimal(amount).minus(new Decimal(discountAmt)).toFixed(2) as MoneyString;
}

// Indian number formatting: 1234567.89 -> 12,34,567.89
export function formatIndianNumber(value: string | number, decimals = 2, symbol = '₹'): string {
  const d = new Decimal(String(value));
  const fixed = d.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  if (!intPart) return fixed;

  const isNeg = intPart.startsWith('-');
  const digits = isNeg ? intPart.slice(1) : intPart;

  let formatted = '';
  if (digits.length <= 3) {
    formatted = digits;
  } else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, digits.length - 3);
    const groups: string[] = [];
    for (let i = rest.length; i > 0; i -= 2) {
      groups.unshift(rest.slice(Math.max(0, i - 2), i));
    }
    formatted = groups.join(',') + ',' + last3;
  }

  const result = (isNeg ? '-' : '') + formatted + (decPart !== undefined ? '.' + decPart : '');
  return symbol ? `${symbol} ${result}` : result;
}

export { Decimal };
