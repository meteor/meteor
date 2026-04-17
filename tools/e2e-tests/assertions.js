/**
 * This file contains assertion helpers for testing Meteor applications.
 */

import fs from 'fs-extra';
import http from 'http';
import path from 'path';
import { wait } from "./helpers";

/**
 * Poll the Rspack dev-server bundle through the Meteor proxy until it returns
 * 200, or we run out of attempts. In production mode this path 404s, which we
 * treat as "not applicable" and return immediately. Any other outcome is
 * logged so CI can see whether the proxy is timing out (504), refusing
 * connections, or something else, without waiting 60s for Playwright to time
 * out on the h1 selector.
 */
async function waitForRspackBundle(port, { attempts = 10, intervalMs = 500 } = {}) {
  const url = `http://localhost:${port}/__rspack__/client-rspack.js`;
  const probe = () =>
    new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve({ status: res.statusCode });
      });
      req.on('error', (err) => resolve({ error: err.code || err.message }));
      req.setTimeout(5000, () => {
        req.destroy(new Error('probe-timeout'));
      });
    });

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await probe();
    if (result.status === 200) {
      if (attempt > 1) {
        console.log(`✅ Rspack bundle ready after ${attempt} probe(s)`);
      }
      return;
    }
    if (result.status === 404) {
      // Production/no-rspack app: nothing to gate on.
      return;
    }
    console.log(
      `⏳ Rspack bundle not ready (attempt ${attempt}/${attempts}): ${
        result.status ? `status=${result.status}` : `error=${result.error}`
      }`
    );
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  console.log(`⚠️  Rspack bundle probe exhausted; proceeding anyway so Playwright can report its own diagnostics`);
}

/**
 * Helper function to assert that a Meteor app is running correctly
 * @param {number} port - Port where the app is running
 * @param {Object} options - Options for the assertion
 * @param {string} options.title - Expected content in the title
 * @param {string} options.h1 - Expected content in the h1 element
 * @returns {Promise<void>}
 */
export async function assertMeteorApp(port, options = {}) {
  // Extract options with default values
  const { title: inTitle, h1: inH1 = "Welcome to Meteor!" } = options;

  // Collect browser errors and failed HTTP responses to diagnose failures
  const consoleErrors = [];
  const failedResponses = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));
  page.on('response', response => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  // Gate on the Rspack dev bundle actually being reachable through Meteor's
  // proxy before we load the page. Cheap in production (one 404) and avoids
  // the 60s Playwright timeout when the proxy is 504ing.
  await waitForRspackBundle(port);

  // Navigate to the app
  await page.goto(`http://localhost:${port}`);

  // Check the title if specified
  if (inTitle) {
    const title = await page.title();
    expect(title).toMatch(new RegExp(inTitle));
    console.log(`✅ Title: ${title}`);
  }

  // Check for static content if specified
  if (inH1) {
    // In dev mode on slow CI (e.g. Docker), the Rspack proxy may 504 on the
    // first request for the client bundle. Retry the page load once before
    // failing, since the dev server will be warmed up by the second attempt.
    let lastErr;
    const maxAttempts = process.env.CI ? 2 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await page.waitForSelector('h1');
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) {
          console.log(`⏳ h1 not found (attempt ${attempt}/${maxAttempts}), reloading page...`);
          consoleErrors.length = 0;
          await page.reload({ waitUntil: 'load' });
        }
      }
    }
    if (lastErr) {
      // Capture diagnostic info to help debug rendering failures
      const scriptTags = await page.evaluate(() =>
        [...document.querySelectorAll('script[src]')].map(s => s.src).join('\n')
      );
      const bodySnippet = await page.evaluate(() => {
        const root = document.querySelector('app-root') || document.body;
        return root?.innerHTML?.substring(0, 500) || '<empty>';
      });
      console.log(`❌ h1 not found. <app-root> content: ${bodySnippet}`);
      console.log(`❌ Script tags loaded:\n${scriptTags}`);
      if (failedResponses.length > 0) {
        console.log(`❌ Failed HTTP responses:\n${failedResponses.join('\n')}`);
      }
      if (consoleErrors.length > 0) {
        console.log(`❌ Browser console errors:\n${consoleErrors.join('\n')}`);
      }
      throw lastErr;
    }
    const h1Text = await page.$eval('h1', el => el.textContent);
    expect(h1Text).toMatch(new RegExp(inH1));
    console.log(`✅ H1: ${h1Text}`);
  }
}

/**
 * Helper function to assert that a Meteor React app is running correctly
 * @param {number} port - Port where the app is running
 * @param {Object} options - Options for the assertion
 * @param {string} options.title - Expected content in the title (default: "react")
 * @param {string} options.h1 - Expected content in the h1 element (default: "Welcome to Meteor!")
 * @returns {Promise<void>}
 */
export async function assertMeteorReactApp(port, options = {}) {
  const reactOptions = {
    title: "react",
    h1: "Welcome to Meteor!",
    ...options
  };
  await assertMeteorApp(port, reactOptions);
}

/**
 * Helper function to assert that a Meteor app is using Rspack
 * @param {number} port - Port where the app is running
 * @returns {Promise<void>}
 */
export async function assertRspackScriptTag(port, shoudlExist = true) {
  // Navigate to the app
  await page.goto(`http://localhost:${port}`);

  // Get all script tags
  const scriptTags = await page.$$eval('script', scripts => 
    scripts.map(script => script.getAttribute('src'))
  );

  // Check if any script tag has __rspack__ in its path
  const hasRspackScript = scriptTags.some(src => src && src.includes('__rspack__'));
  expect(hasRspackScript).toBe(shoudlExist);
}

/**
 * Helper function to assert that a single file exists and optionally contains specific content
 * @param {string} tempDir - Path to the temporary directory
 * @param {string} filePath - File path relative to tempDir
 * @param {Object} options - Additional options
 * @param {string} options.content - Content to check for
 * @param {boolean} options.exactMatch - Whether the content should be an exact match (default: false)
 * @param {number} options.timeout - Maximum time to wait in milliseconds (default: 5000)
 * @param {number} options.checkInterval - Interval between checks in milliseconds (default: 100)
 * @returns {Promise<void>}
 */
export async function assertFileExist(tempDir, filePath, options = {}) {
  const { content, exactMatch = false, timeout = 5000, checkInterval = 100 } = options;
  const fullPath = path.join(tempDir, filePath);

  const startTime = Date.now();

  // Function to check file existence and content
  const checkFile = async () => {
    // Check if file exists
    const fileExists = await fs.pathExists(fullPath);

    if (!fileExists) {
      // If file doesn't exist and we haven't exceeded the timeout, wait and retry
      if (Date.now() - startTime < timeout) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        return checkFile();
      }
      // If we've exceeded the timeout, fail the test
      throw new Error(`Expected file to exist but it was not found: ${fullPath}`);
      return false;
    }

    // If content check is requested
    if (content) {
      // Read the file content
      const fileContent = await fs.readFile(fullPath, 'utf8');

      if (exactMatch) {
        // Check for exact match
        if (fileContent !== content) {
          // If content doesn't match and we haven't exceeded the timeout, wait and retry
          if (Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            return checkFile();
          }
          // If we've exceeded the timeout, fail the test
          expect(fileContent).toBe(content);
          return false;
        }
      } else {
        // Check if file includes the specified content
        if (!fileContent.includes(content)) {
          // If content doesn't include the specified content and we haven't exceeded the timeout, wait and retry
          if (Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            return checkFile();
          }
          // If we've exceeded the timeout, fail the test
          expect(fileContent).toContain(content);
          return false;
        }
      }
    }

    return true;
  };

  // Start checking
  await checkFile();
}

/**
 * Helper function to assert that a path does NOT exist
 * Retries until the path is gone or the timeout is exceeded
 * @param {string} basePath - Base directory path
 * @param {string} relPath - Relative path from basePath to check
 * @param {Object} options - Additional options
 * @param {number} options.timeout - Maximum time to wait in milliseconds (default: 5000)
 * @param {number} options.checkInterval - Interval between checks in milliseconds (default: 100)
 * @returns {Promise<void>}
 */
export async function assertPathNotExist(basePath, relPath, options = {}) {
  const { timeout = 5000, checkInterval = 100 } = options;
  const fullPath = path.join(basePath, relPath);
  const startTime = Date.now();

  const check = async () => {
    const exists = await fs.pathExists(fullPath);
    if (exists && Date.now() - startTime < timeout) {
      await new Promise(r => setTimeout(r, checkInterval));
      return check();
    }
    if (exists) {
      const stat = await fs.stat(fullPath);
      const isDir = stat.isDirectory();
      let contents = '';
      if (isDir) {
        const entries = await fs.readdir(fullPath);
        contents = ` (contains: ${entries.join(', ')})`;
      }
      console.error(`assertPathNotExist FAILED: ${relPath} still exists at ${fullPath} [${isDir ? 'dir' : 'file'}, ${stat.size} bytes]${contents}`);
    }
    expect(exists).toBe(false);
  };

  await check();
}

/**
 * Helper function to evaluate JavaScript code in the browser console and assert the result
 * @param {string} code - JavaScript code to evaluate in the browser console
 * @param {any} expectedResult - Expected result of the evaluation
 * @param {Object} options - Additional options
 * @param {boolean} options.exactMatch - Whether to check for exact equality (default: true)
 * @param {number} options.timeout - Maximum time to wait in milliseconds (default: 5000)
 * @param {number} options.checkInterval - Interval between checks in milliseconds (default: 100)
 * @returns {Promise<any>} - A promise that resolves with the evaluation result
 */
export async function assertConsoleEval(code, expectedResult, options = {}) {
  const { exactMatch = true, timeout = 5000, checkInterval = 100 } = options;

  console.log(`Evaluating code in browser console: ${code}`);

  const startTime = Date.now();

  // Function to evaluate code and check result
  const evaluateAndCheck = async () => {
    try {
      // Evaluate the code in the browser context
      const result = await page.evaluate(code);

      if (exactMatch) {
        // Check for exact match
        if (JSON.stringify(result) !== JSON.stringify(expectedResult)) {
          // If result doesn't match and we haven't exceeded the timeout, wait and retry
          if (Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            return evaluateAndCheck();
          }
          // If we've exceeded the timeout, fail the test
          expect(result).toEqual(expectedResult);
          return null;
        }
      } else {
        // Check for partial match (contains)
        const resultStr = JSON.stringify(result);
        const expectedStr = JSON.stringify(expectedResult);

        if (!resultStr.includes(expectedStr)) {
          // If result doesn't include the expected result and we haven't exceeded the timeout, wait and retry
          if (Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            return evaluateAndCheck();
          }
          // If we've exceeded the timeout, fail the test
          expect(resultStr).toContain(expectedStr);
          return null;
        }
      }

      console.log(`✅ Console evaluation successful. Result: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      // If evaluation fails and we haven't exceeded the timeout, wait and retry
      if (Date.now() - startTime < timeout) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        return evaluateAndCheck();
      }
      // If we've exceeded the timeout, fail the test
      throw new Error(`Error evaluating code in console: ${error.message}`);
    }
  };

  // Start evaluating
  return await evaluateAndCheck();
}

/**
 * Helper function to assert that an element has the expected CSS styles
 * @param {string} selector - CSS selector string (e.g., 'body', '.my-class') or a string representing a DOM element (e.g., 'document.body')
 * @param {Object} expectedStyles - Expected CSS styles as key-value pairs
 * @param {Object} options - Additional options for assertConsoleEval
 * @returns {Promise<Object>} - A promise that resolves with the computed styles
 */
export async function assertStyles(selector, expectedStyles, options = {}) {
  // Determine if the selector is a CSS selector or a DOM element reference
  const isCssSelector = selector.startsWith('.') || 
    selector.startsWith('#') ||
    selector.startsWith('[') ||
    selector === 'body' ||
    selector.includes(' ');

  console.log(`Asserting styles for ${selector}: ${JSON.stringify(expectedStyles)}`);

  // Create a JavaScript code string that evaluates the computed styles
  const code = `
    (() => {
      let element;

      // Handle the selector based on its type
      ${isCssSelector 
        ? `element = document.querySelector('${selector}');
           if (!element) {
             throw new Error('Element not found with selector: ${selector}');
           }`
        : `element = ${selector};
           if (!element) {
             throw new Error('Element not found: ${selector}');
           }`
      }

      const computedStyle = getComputedStyle(element);
      const result = {};
      ${Object.keys(expectedStyles).map(prop => 
        `result['${prop}'] = computedStyle.getPropertyValue('${prop}');`
      ).join('\n')}
      return result;
    })()
  `;

  // Use assertConsoleEval to evaluate the code and check the result
  return assertConsoleEval(code, expectedStyles, {
    exactMatch: false,
    ...options
  });
}

/**
 * Helper function to assert that the body element has the expected CSS styles
 * @param {Object} expectedStyles - Expected CSS styles as key-value pairs
 * @param {Object} options - Additional options for assertConsoleEval
 * @returns {Promise<Object>} - A promise that resolves with the computed styles
 */
export async function assertBodyStyles(expectedStyles, options = {}) {
  // Use assertStyles with document.body as the selector
  return assertStyles('document.body', expectedStyles, options);
}

/**
 * Helper function to assert that meta tags have the expected content
 * @param {Object} expectedMetaTags - Expected meta tag properties and values as key-value pairs
 * @param {Object} options - Additional options for assertConsoleEval
 * @returns {Promise<Object>} - A promise that resolves with the meta tag values
 * 
 * @example
 * // Assert that the theme-color meta tag has the expected value
 * await assertMetaTags({
 *   'theme-color': '#4285f4'
 * });
 */
export async function assertMetaTags(expectedMetaTags, options = {}) {
  console.log(`Asserting meta tags: ${JSON.stringify(expectedMetaTags)}`);

  // Create a JavaScript code string that evaluates the meta tags
  const code = `
    (() => {
      const result = {};
      ${Object.keys(expectedMetaTags).map(prop => 
        `// Try to find meta tag by property or name attribute
        let metaTag = document.querySelector('meta[property="${prop}"]');
        if (!metaTag) {
          metaTag = document.querySelector('meta[name="${prop}"]');
        }
        result['${prop}'] = metaTag ? metaTag.getAttribute('content') : null;`
      ).join('\n')}
      return result;
    })()
  `;

  // Use assertConsoleEval to evaluate the code and check the result
  return await assertConsoleEval(code, expectedMetaTags, { 
    exactMatch: true,  // We want exact matches for meta tag content
    ...options
  });
}
