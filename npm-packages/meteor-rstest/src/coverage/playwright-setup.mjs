import { pathToFileURL } from 'node:url';

import playwrightCoverage from './playwright.js';

const playwrightEntry = playwrightCoverage.resolveProjectPlaywrightEntry(
  process.cwd(),
);
const playwrightModuleEntry = playwrightCoverage.resolveProjectPlaywrightModuleEntry(
  process.cwd(),
);
const {
  afterAll,
  afterEach,
} = await import(pathToFileURL(playwrightEntry).href);
const playwrightModule = await import(pathToFileURL(playwrightModuleEntry).href);
const playwright = playwrightModule.default || playwrightModule;

const collector = playwrightCoverage.createPlaywrightCoverageCollector({
  enabled: true,
  generation: process.env.METEOR_RSTEST_COVERAGE_GENERATION,
  producer: process.env.METEOR_RSTEST_COVERAGE_PRODUCER,
});

playwrightCoverage.installFixturelessPlaywrightCoverageLifecycle({
  playwright,
  collector,
  afterEach,
  afterAll,
  directory: process.env.METEOR_RSTEST_COVERAGE_SHARD_DIR,
});
