import { describe, it, expect, beforeEach, vi } from 'vitest';

// To ensure we re-evaluate module with new envs, import dynamically
async function loadEnvModule() {
  // Import fresh to pick up current process.env
  const resolved = await import('../src/index.ts');
  return resolved as typeof import('../src/index');
}

describe('Easyship env fallbacks', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV };
    // Cleanup relevant vars
    delete process.env.EASYSHIP_WEIGHT_UNIT;
    delete process.env.EASYSHIP_DIMENSION_UNIT;
    delete process.env.EASYSHIP_UNITS_WEIGHT;
    delete process.env.EASYSHIP_UNITS_DIMENSIONS;
  });

  it('uses new vars when provided', async () => {
    process.env.EASYSHIP_WEIGHT_UNIT = 'kg';
    process.env.EASYSHIP_DIMENSION_UNIT = 'cm';
    const { shippingEnv } = await loadEnvModule();
    expect(shippingEnv.easyship.weightUnit).toBe('kg');
    expect(shippingEnv.easyship.dimensionUnit).toBe('cm');
  });

  it('falls back to legacy vars when new are missing', async () => {
    process.env.EASYSHIP_UNITS_WEIGHT = 'lb';
    process.env.EASYSHIP_UNITS_DIMENSIONS = 'in';
    const { shippingEnv } = await loadEnvModule();
    expect(shippingEnv.easyship.weightUnit).toBe('lb');
    expect(shippingEnv.easyship.dimensionUnit).toBe('in');
  });

  it('applies defaults when none provided', async () => {
    const { shippingEnv } = await loadEnvModule();
    expect(shippingEnv.easyship.weightUnit).toBeDefined();
    expect(shippingEnv.easyship.dimensionUnit).toBeDefined();
  });
});
