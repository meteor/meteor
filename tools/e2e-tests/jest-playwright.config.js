// jest-playwright-preset configuration.
//
// This is the file jest-playwright-preset actually reads. Values placed
// inside `globals['jest-playwright']` in jest.config.js are ignored.
//
// Toggles (set as env vars when invoking jest, no code edits needed):
//   HEADED=1            run the browser windowed instead of headless
//   SLOWMO=250          add ms of delay between actions (only useful with HEADED)
//   DEVTOOLS=1          auto-open chromium devtools (implies HEADED)
//   RECORD=1            record a webm per test file into ./test-results/videos
//   RECORD_DIR=./out    override the recording output directory

module.exports = {
  browsers: ['chromium'],
  launchOptions: {
    headless: !process.env.HEADED && !process.env.DEVTOOLS,
    slowMo: process.env.SLOWMO ? Number(process.env.SLOWMO) : 0,
    devtools: !!process.env.DEVTOOLS,
  },
  contextOptions: process.env.RECORD
    ? {
        recordVideo: {
          dir: process.env.RECORD_DIR || './test-results/videos',
          size: { width: 1280, height: 720 },
        },
        viewport: { width: 1280, height: 720 },
      }
    : {},
};
