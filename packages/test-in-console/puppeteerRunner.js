const puppeteer = require('../../dev_bundle/lib/node_modules/puppeteer');

async function runNextUrl(browser) {
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg._text !== undefined) {
      console.log(msg._text);
    }
  });

  if (!process.env.URL) {
    process.exit(1);
    return;
  }

  await page.goto(process.env.URL);

  async function poll() {
    if (await isDone(page)) {
      let failCount = await getFailCount(page);
      console.log(`Tests complete with ${failCount} failures`);
      console.log(`Tests complete with ${await getPassCount(page)} passes`);
      if (failCount > 0) {
        const failed = await getFailed(page);
        failed.map( (f) => console.log(`${f.name} failed: ${f.info}`));
        await page.close();
        await browser.close();
        process.exit(1);
      } else {
        await page.close();
        await browser.close();
        process.exit(0);
      }
    } else {
      setTimeout(poll, 1000);
    }
  }

  poll();
}

/**
 *
 * @param page
 * @return {Promise<boolean>}
 */
async function isDone(page) {
  return await page.evaluate(function() {
    if (typeof TEST_STATUS !== 'undefined') {
      return TEST_STATUS.DONE;
    }

    return typeof DONE !== 'undefined' && DONE;
  });
}

/**
 *
 * @param page
 * @return {Promise<number>}
 */
async function getPassCount(page) {
  return await page.evaluate(function() {
    if (typeof TEST_STATUS !== 'undefined') {
      return TEST_STATUS.PASSED;
    }

    return typeof PASSED !== 'undefined' && PASSED;
  });
}

/**
 *
 * @param page
 * @return {Promise<number>}
 */
async function getFailCount(page) {
  return await page.evaluate(function() {
    if (typeof TEST_STATUS !== 'undefined') {
      return TEST_STATUS.FAILURES;
    }

    if (typeof FAILURES === 'undefined') {
      return 1;
    }

    return 0;
  });
}

/**
 *
 * @param page
 * @return {Promise<[{name: string, info: string}]>}
 */
async function getFailed(page) {
  return await page.evaluate(function() {
    if (typeof TEST_STATUS !== 'undefined') {
      return TEST_STATUS.WHERE_FAILED;
    }
    return typeof WHERE_FAILED !== 'undefined' && WHERE_FAILED;
  });
}

async function runTests() {
  console.log(`Running test with Puppeteer at ${process.env.URL}`);

  // --no-sandbox and --disable-setuid-sandbox must be disabled for CI compatibility
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  console.log(`Using version: ${await browser.version()}`);
  runNextUrl(browser);
}

runTests();
