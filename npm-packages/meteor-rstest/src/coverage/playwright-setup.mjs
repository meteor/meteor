import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import playwrightCoverage from './playwright.js';

const projectRequire = createRequire(path.join(process.cwd(), 'package.json'));
const playwrightEntry = projectRequire.resolve('@rstest/playwright');
const {
  afterAll,
  afterEach,
  beforeEach,
} = await import(pathToFileURL(playwrightEntry).href);

const collector = playwrightCoverage.createPlaywrightCoverageCollector({
  enabled: true,
  baseUrl: process.env.METEOR_RSTEST_BASE_URL,
  generation: process.env.METEOR_RSTEST_COVERAGE_GENERATION,
  producer: process.env.METEOR_RSTEST_COVERAGE_PRODUCER,
  token: process.env.METEOR_RSTEST_COVERAGE_TOKEN,
});

beforeEach(async ({ browser, context, page }) => {
  await collector.install({ browser, context, page });
});

afterEach(async () => {
  await collector.captureRemaining();
});

afterAll(async () => {
  await collector.submit();
});
