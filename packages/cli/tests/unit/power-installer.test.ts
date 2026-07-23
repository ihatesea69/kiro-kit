import { describe, it, expect } from 'vitest';
import { POWER_CATALOG, powersForPresets } from '../../src/core/PowerInstaller.js';

const TRUSTED_HOSTS = [
  'https://github.com/kirodotdev/',
  'https://github.com/figma/',
  'https://github.com/supabase-community/',
];

describe('PowerInstaller catalog', () => {
  it('every catalog entry has the required fields', () => {
    for (const [name, spec] of Object.entries(POWER_CATALOG)) {
      expect(spec.cloneUrl, `${name}.cloneUrl`).toBeTruthy();
      expect(spec.pathInRepo, `${name}.pathInRepo`).toBeTruthy();
      expect(spec.registryId, `${name}.registryId`).toBeTruthy();
      expect(Array.isArray(spec.presets) && spec.presets.length > 0, `${name}.presets`).toBe(true);
    }
  });

  it('only clones from trusted, approved sources', () => {
    for (const [name, spec] of Object.entries(POWER_CATALOG)) {
      expect(
        TRUSTED_HOSTS.some((h) => spec.cloneUrl.startsWith(h)),
        `${name} clones from an untrusted source: ${spec.cloneUrl}`,
      ).toBe(true);
    }
  });

  it('powersForPresets returns only powers relevant to the given presets', () => {
    const backend = powersForPresets(['backend']);
    expect(backend).toContain('neon');
    expect(backend).toContain('postman');
    expect(backend).not.toContain('datadog'); // devops-only

    const devops = powersForPresets(['devops']);
    expect(devops).toContain('terraform');
    expect(devops).not.toContain('figma'); // frontend/fullstack/mobile
  });

  it('powersForPresets returns nothing for an unknown preset', () => {
    expect(powersForPresets(['nonexistent'])).toEqual([]);
  });
});
