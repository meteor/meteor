import { pathToFileURL } from 'node:url';

import playwrightCoverage from './playwright.js';

const playwrightEntry = playwrightCoverage.resolveProjectPlaywrightEntry(
  process.cwd(),
);
const {
  afterAll,
  afterEach,
  beforeEach,
} = await import(pathToFileURL(playwrightEntry).href);

const collector = playwrightCoverage.createPlaywrightCoverageCollector({
  enabled: true,
  generation: process.env.METEOR_RSTEST_COVERAGE_GENERATION,
  producer: process.env.METEOR_RSTEST_COVERAGE_PRODUCER,
});

beforeEach(async ({ browser, context, page }) => {
  await collector.install({ browser, context, page });
});

afterEach(async () => {
  await collector.captureRemaining();
});

afterAll(async () => {
  await collector.writeShard({
    directory: process.env.METEOR_RSTEST_COVERAGE_SHARD_DIR,
  });
});
