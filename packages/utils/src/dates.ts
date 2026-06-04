import {
  addDays,
  addMonths,
  addYears,
  differenceInDays,
  differenceInMonths,
  endOfDay,
  endOfMonth,
  endOfYear,
  format,
  formatISO,
  getMonth,
  getYear,
  isAfter,
  isBefore,
  isEqual,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export const DEFAULT_TZ = 'Asia/Kolkata';
export const DISPLAY_DATE_FORMAT = 'dd-MM-yyyy';
export const DISPLAY_DATETIME_FORMAT = 'dd-MM-yyyy HH:mm';
export const ISO_DATE_FORMAT = 'yyyy-MM-dd';

export function parseDate(value: string): Date {
  const d = parseISO(value);
  if (!isValid(d)) throw new Error(`Invalid date string: ${value}`);
  return d;
}

export function formatDisplayDate(value: string | Date, tz = DEFAULT_TZ): string {
  const d = typeof value === 'string' ? parseDate(value) : value;
  const zoned = toZonedTime(d, tz);
  return format(zoned, DISPLAY_DATE_FORMAT);
}

export function formatDisplayDateTime(value: string | Date, tz = DEFAULT_TZ): string {
  const d = typeof value === 'string' ? parseDate(value) : value;
  const zoned = toZonedTime(d, tz);
  return format(zoned, DISPLAY_DATETIME_FORMAT);
}

export function toIsoDate(value: Date | string, tz = DEFAULT_TZ): string {
  const d = typeof value === 'string' ? parseDate(value) : value;
  const zoned = toZonedTime(d, tz);
  return format(zoned, ISO_DATE_FORMAT);
}

export function nowInTz(tz = DEFAULT_TZ): Date {
  return toZonedTime(new Date(), tz);
}

export function todayIsoDate(tz = DEFAULT_TZ): string {
  return format(toZonedTime(new Date(), tz), ISO_DATE_FORMAT);
}

export function toUtc(localDate: Date, tz = DEFAULT_TZ): Date {
  return fromZonedTime(localDate, tz);
}

export function fromUtc(utcDate: Date, tz = DEFAULT_TZ): Date {
  return toZonedTime(utcDate, tz);
}

// Indian Financial Year starts April 1
export function getFyStart(date: Date | string, tz = DEFAULT_TZ): string {
  const d = typeof date === 'string' ? parseDate(date) : date;
  const zoned = toZonedTime(d, tz);
  const year = getYear(zoned);
  const month = getMonth(zoned); // 0-indexed, April = 3
  const fyYear = month >= 3 ? year : year - 1;
  return `${fyYear}-04-01`;
}

export function getFyEnd(date: Date | string, tz = DEFAULT_TZ): string {
  const d = typeof date === 'string' ? parseDate(date) : date;
  const zoned = toZonedTime(d, tz);
  const year = getYear(zoned);
  const month = getMonth(zoned);
  const fyEndYear = month >= 3 ? year + 1 : year;
  return `${fyEndYear}-03-31`;
}

export function getFyLabel(date: Date | string, tz = DEFAULT_TZ): string {
  const start = getFyStart(date, tz);
  const startYear = start.slice(0, 4);
  const endYear = String(Number(startYear) + 1).slice(-2);
  return `${startYear}-${endYear}`;
}

export function isDateInRange(date: string, from: string, to: string): boolean {
  const d = parseDate(date);
  return !isBefore(d, parseDate(from)) && !isAfter(d, parseDate(to));
}

export {
  format,
  parseISO,
  isValid,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  addDays,
  addMonths,
  addYears,
  subDays,
  subMonths,
  differenceInDays,
  differenceInMonths,
  isBefore,
  isAfter,
  isEqual,
  formatISO,
};
