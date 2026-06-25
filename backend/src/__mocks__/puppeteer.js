/**
 * Manual Jest stub for the `puppeteer` ESM package.
 *
 * Puppeteer ships as a pure ESM module (`"type": "module"`) which the
 * CommonJS Jest / ts-jest environment cannot parse directly.  This stub is
 * picked up via the `moduleNameMapper` entry in `package.json` (unit tests)
 * and the equivalent entry in `test/jest-e2e.json` (e2e tests), replacing the
 * real package with a no-op CJS object for every test file that does NOT
 * explicitly `jest.mock('puppeteer', factory)` with its own implementation.
 *
 * Tests that need to control puppeteer behaviour (e.g. mail.service.spec.ts)
 * use `jest.mock('puppeteer', () => ({ ... }))` which overrides this mapper
 * stub via Jest's manual mock system.
 */
const puppeteer = {
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.alloc(0)),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
};

module.exports = puppeteer;
module.exports.default = puppeteer;
