const puppeteer = require('../../dev_bundle/lib/node_modules/puppeteer');

let testNumber = 0;

async function runNextUrl(browser) {
  const page = await browser.newPage();

  page.on('console', msg => {
    // this is a way to make sure the travis does not timeout
    // if the test is running for too long without any output to the console (10 minutes)
    if (msg._text !== undefined) console.log(msg._text);
    else console.log(`Test number: ${ testNumber }`);
    testNumber++;
  });

  if (!process.env.URL) {
    process.exit(1);
    return;
  }

  await page.goto(process.env.URL);

  async function poll() {
    if (await isDone(page)) {
      let failCount = await getFailCount(page);
      console.log(`
      The number of tests from Test number may be different because 
      of the way the test is written. causing the test to fail or
      to run more than once. in the console. Test number total: ${ testNumber }`);
      console.log(`Tests complete with ${ failCount } failures`);
      console.log(`Tests complete with ${ await getPassCount(page) } passes`);
      if (failCount > 0) {
        const failed = await getFailed(page);
        failed.map((f) => console.log(`${ f.name } failed: ${ f.info }`));
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
  return await page.evaluate(function () {
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
  return await page.evaluate(function () {
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
  return await page.evaluate(function () {
    if (typeof TEST_STATUS !== 'undefined') {
      return TEST_STATUS.FAILURES;
    }

    return typeof FAILURES !== 'undefined' && FAILURES;
  });
}

/**
 *
 * @param page
 * @return {Promise<[{name: string, info: string}]>}
 */
async function getFailed(page) {
  return await page.evaluate(function () {
    if (typeof TEST_STATUS !== 'undefined') {
      return TEST_STATUS.WHERE_FAILED;
    }
    return typeof WHERE_FAILED !== 'undefined' && WHERE_FAILED;
  });
}

async function runTests() {
  console.log(`Running test with Puppeteer at ${ process.env.URL }`);

  // --no-sandbox and --disable-setuid-sandbox must be disabled for CI compatibility
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  console.log(`Using version: ${ await browser.version() }`);
  runNextUrl(browser);
}

runTests();
