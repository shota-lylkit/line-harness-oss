import { describe, it, expect } from 'vitest';
import {
  calculateHoursFromTimes,
  calculateWithholdingTax,
  calculatePayrollAmounts,
} from './payroll.js';
import type { WithholdingTaxRate } from './payroll.js';

// --- calculateHoursFromTimes ---

describe('calculateHoursFromTimes', () => {
  it('returns 8 hours for 09:00-17:00', () => {
    expect(calculateHoursFromTimes('09:00', '17:00', null)).toBe(8);
  });

  it('returns actualHours when provided (non-null)', () => {
    expect(calculateHoursFromTimes('09:00', '17:00', 6.5)).toBe(6.5);
  });

  it('returns 0 when actualHours is explicitly 0', () => {
    // Bug fix verification: actualHours=0 should NOT fall through to time calculation
    expect(calculateHoursFromTimes('09:00', '17:00', 0)).toBe(0);
  });

  it('calculates fractional hours correctly (09:00-12:30 = 3.5h)', () => {
    expect(calculateHoursFromTimes('09:00', '12:30', null)).toBe(3.5);
  });

  it('returns 0 when endTime < startTime (Math.max guard)', () => {
    expect(calculateHoursFromTimes('17:00', '09:00', null)).toBe(0);
  });

  it('returns 0 when start and end are the same', () => {
    expect(calculateHoursFromTimes('09:00', '09:00', null)).toBe(0);
  });

  it('handles short shifts (09:00-09:30 = 0.5h)', () => {
    expect(calculateHoursFromTimes('09:00', '09:30', null)).toBe(0.5);
  });
});

// --- calculateWithholdingTax ---

describe('calculateWithholdingTax', () => {
  const rate2026: WithholdingTaxRate = {
    id: 'test',
    year: 2026,
    threshold_amount: 9300,
    rate: 0.1021,
    effective_from: '2026-01-01',
  };

  it('returns 0 when rate is null', () => {
    expect(calculateWithholdingTax(10000, null)).toBe(0);
  });

  it('returns 0 when grossAmount is below threshold', () => {
    expect(calculateWithholdingTax(5000, rate2026)).toBe(0);
  });

  it('returns 0 when grossAmount equals threshold', () => {
    expect(calculateWithholdingTax(9300, rate2026)).toBe(0);
  });

  it('calculates tax when grossAmount exceeds threshold', () => {
    // 10000 * 0.1021 = 1021
    expect(calculateWithholdingTax(10000, rate2026)).toBe(1021);
  });

  it('floors the result (no rounding up)', () => {
    // 12345 * 0.1021 = 1260.9345 → floor = 1260
    expect(calculateWithholdingTax(12345, rate2026)).toBe(1260);
  });

  it('returns 0 when rate is 0 (even above threshold)', () => {
    const zeroRate: WithholdingTaxRate = { ...rate2026, rate: 0 };
    expect(calculateWithholdingTax(20000, zeroRate)).toBe(0);
  });
});

// --- calculatePayrollAmounts ---

describe('calculatePayrollAmounts', () => {
  const rate2026: WithholdingTaxRate = {
    id: 'test',
    year: 2026,
    threshold_amount: 9300,
    rate: 0.1021,
    effective_from: '2026-01-01',
  };

  it('calculates correctly without tax (below threshold)', () => {
    // 4h * 1200 = 4800 (below 9300 threshold)
    const result = calculatePayrollAmounts(4, 1200, 500, rate2026);
    expect(result.grossAmount).toBe(4800);
    expect(result.withholdingTax).toBe(0);
    expect(result.netAmount).toBe(5300); // 4800 + 500
  });

  it('calculates correctly with tax (above threshold)', () => {
    // 8h * 1200 = 9600 (above 9300 threshold)
    // tax = floor(9600 * 0.1021) = floor(980.16) = 980
    const result = calculatePayrollAmounts(8, 1200, 500, rate2026);
    expect(result.grossAmount).toBe(9600);
    expect(result.withholdingTax).toBe(980);
    expect(result.netAmount).toBe(9120); // 9600 + 500 - 980
  });

  it('handles zero hourly rate', () => {
    const result = calculatePayrollAmounts(8, 0, 500, rate2026);
    expect(result.grossAmount).toBe(0);
    expect(result.withholdingTax).toBe(0);
    expect(result.netAmount).toBe(500); // transport only
  });

  it('handles zero hours', () => {
    const result = calculatePayrollAmounts(0, 1200, 0, rate2026);
    expect(result.grossAmount).toBe(0);
    expect(result.withholdingTax).toBe(0);
    expect(result.netAmount).toBe(0);
  });

  it('handles null tax rate', () => {
    const result = calculatePayrollAmounts(8, 1200, 500, null);
    expect(result.grossAmount).toBe(9600);
    expect(result.withholdingTax).toBe(0);
    expect(result.netAmount).toBe(10100); // 9600 + 500
  });

  it('rounds gross amount correctly', () => {
    // 3.5h * 1100 = 3850 (exact)
    const result = calculatePayrollAmounts(3.5, 1100, 0, null);
    expect(result.grossAmount).toBe(3850);
  });
});
