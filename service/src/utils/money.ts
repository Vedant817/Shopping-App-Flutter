import { Decimal } from 'decimal.js';
import { z } from 'zod';

const moneyPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function parseMoney(value: unknown, field = 'money'): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${field} must be a finite decimal`);
    value = value.toString();
  }
  if (typeof value !== 'string' || !moneyPattern.test(value.trim())) {
    throw new Error(`${field} must be a fixed decimal string`);
  }
  const trimmed = value.trim();
  const parts = trimmed.split('.');
  const whole = parts[0] ?? '0';
  const fraction = parts[1] ?? '';
  const normalizedFraction = fraction.replace(/0+$/, '');
  const normalized = `${whole === '-0' ? '0' : whole}.${normalizedFraction}`;
  return normalizedFraction.length === 0 ? (whole === '-0' ? '0' : whole) : normalized;
}

export function money(value: unknown, field = 'money'): string {
  return parseMoney(value, field);
}

export function addMoney(left: string, right: string): string {
  return parseMoney(new Decimal(left).plus(new Decimal(right)).toFixed(4));
}

export function subtractMoney(left: string, right: string): string {
  return parseMoney(new Decimal(left).minus(new Decimal(right)).toFixed(4));
}

export function multiplyMoney(value: string, multiplier: string): string {
  return parseMoney(new Decimal(value).times(new Decimal(multiplier)).toFixed(4));
}

export function divideMoney(left: string, right: string): string {
  if (new Decimal(right).isZero()) return '0';
  return parseMoney(new Decimal(left).dividedBy(new Decimal(right)).toFixed(4));
}

export function ratio(numerator: string, denominator: string): string {
  if (new Decimal(denominator).isZero()) return '0';
  return parseMoney(new Decimal(numerator).dividedBy(new Decimal(denominator)).toFixed(4));
}

export const moneySchema = z.string().refine((value) => {
  try {
    parseMoney(value);
    return true;
  } catch {
    return false;
  }
}, 'Invalid fixed decimal money value');
