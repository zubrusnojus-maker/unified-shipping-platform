import { describe, it, expect, beforeEach, vi } from 'vitest';

async function loadEnvModule() {
  const resolved = await import('../src/index.ts');
  return resolved as typeof import('../src/index');
}

describe('Env validation', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV };
    delete process.env.EASYSHIP_API_KEY;
    delete process.env.ENV_VALIDATION_STRICT;
    // baseline defaults
    process.env.EASYSHIP_MODE = 'sandbox';
    process.env.EASYSHIP_WEIGHT_UNIT = 'kg';
    process.env.EASYSHIP_DIMENSION_UNIT = 'cm';
    process.env.EASYSHIP_INCOTERM_DEFAULT = 'DDP';
    process.env.EASYSHIP_CURRENCY = 'USD';
  });

  it('warns on missing keys when not strict', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await loadEnvModule();
    expect(mod.shippingEnv.easyship.apiKey).toBe('');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('throws on missing keys when strict', async () => {
    process.env.ENV_VALIDATION_STRICT = 'true';
    await expect(loadEnvModule()).rejects.toThrow(/EASYSHIP_API_KEY is required/);
  });
});
