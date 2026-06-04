import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatMoney(value: string | number | null | undefined, symbol = '₹'): string {
  if (value === null || value === undefined || value === '') return `${symbol} 0.00`;
  const num = Number(value);
  if (Number.isNaN(num)) return `${symbol} 0.00`;

  // Indian number formatting
  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  if (!intPart) return `${symbol} 0.00`;

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

  return `${symbol} ${isNeg ? '-' : ''}${formatted}.${decPart ?? '00'}`;
}

export function formatQuantity(value: string | number | null | undefined, unit?: string): string {
  if (value === null || value === undefined || value === '') return unit ? `0.000 ${unit}` : '0.000';
  const num = Number(value).toFixed(3).replace(/\.?0+$/, '');
  return unit ? `${num} ${unit}` : num;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}
