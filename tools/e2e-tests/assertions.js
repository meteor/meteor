/**
 * This file contains assertion helpers for testing Meteor applications.
 */

import fs from 'fs-extra';
import path from 'path';
import { wait } from "./helpers";

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
 * Helper function to assert that a service worker file is served by the app
 * Fetches /sw.js from the browser and checks it returns a valid response
 * @param {number} port - Port where the app is running
 * @param {Object} options - Additional options
 * @param {string} options.swPath - Path to the service worker file (default: '/sw.js')
 * @param {number} options.timeout - Maximum time to wait in milliseconds (default: 10000)
 * @param {number} options.checkInterval - Interval between checks in milliseconds (default: 500)
 * @returns {Promise<void>}
 */
export async function assertServiceWorkerFile(port, options = {}) {
  const { swPath = '/sw.js', timeout = 10000, checkInterval = 500 } = options;
  const url = `http://localhost:${port}${swPath}`;
  const startTime = Date.now();

  const check = async () => {
    const result = await page.evaluate(async (fetchUrl) => {
      try {
        const res = await fetch(fetchUrl);
        return { ok: res.ok, status: res.status, type: res.headers.get('content-type') };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }, url);

    if (result.ok) {
      console.log(`✅ Service worker file served at ${swPath} (status: ${result.status})`);
      return;
    }

    if (Date.now() - startTime < timeout) {
      await new Promise(r => setTimeout(r, checkInterval));
      return check();
    }

    throw new Error(
      `Service worker file not served at ${url}: ${result.error || `status ${result.status}`}`
    );
  };

  await check();
}

/**
 * Helper function to assert that a service worker registers, activates,
 * and still controls the page after a refresh.
 * @param {number} port - Port where the app is running
 * @param {Object} options - Additional options
 * @param {string} options.swPath - Path to the service worker file (default: '/sw.js')
 * @param {number} options.timeout - Maximum time to wait in milliseconds (default: 15000)
 * @returns {Promise<void>}
 */
export async function assertServiceWorkerReady(port, options = {}) {
  const { swPath = '/sw.js', timeout = 15000 } = options;
  const url = `http://localhost:${port}`;

  // Navigate to the app
  await page.goto(url);

  // Register the SW from the browser and wait until it is active
  const regResult = await page.evaluate(async ({ swPath: sw, timeout: t }) => {
    if (!('serviceWorker' in navigator)) {
      return { error: 'Service workers not supported in this browser' };
    }
    try {
      const reg = await navigator.serviceWorker.register(sw);
      // Wait for the SW to become active
      const worker = reg.installing || reg.waiting || reg.active;
      if (!worker) {
        return { error: 'No worker found after registration' };
      }
      if (worker.state !== 'activated') {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('SW activation timed out')), t);
          worker.addEventListener('statechange', () => {
            if (worker.state === 'activated') {
              clearTimeout(timer);
              resolve();
            }
          });
          if (worker.state === 'activated') {
            clearTimeout(timer);
            resolve();
          }
        });
      }
      return { active: true, scope: reg.scope };
    } catch (e) {
      return { error: e.message };
    }
  }, { swPath, timeout });

  if (regResult.error) {
    throw new Error(`Service worker registration failed: ${regResult.error}`);
  }
  console.log(`✅ Service worker active (scope: ${regResult.scope})`);

  // Reload and verify the SW still controls the page
  await page.reload({ waitUntil: 'load' });

  const controllerResult = await page.evaluate(() => {
    if (!navigator.serviceWorker.controller) {
      return { controlling: false };
    }
    return { controlling: true, scriptURL: navigator.serviceWorker.controller.scriptURL };
  });

  expect(controllerResult.controlling).toBe(true);
  console.log(`✅ Service worker controlling page after refresh (${controllerResult.scriptURL})`);
}

/**
 * Helper function to assert that the service worker caches specific resources.
 * Fetches the given URLs so the SW runtime-caching rules can intercept them,
 * then inspects the CacheStorage for matching entries.
 * @param {number} port - Port where the app is running
 * @param {Object} options - Additional options
 * @param {string[]} options.urls - Resource URLs to fetch and expect cached (relative paths, e.g. ['/1x1.png'])
 * @param {string} options.cacheName - Expected cache name (default: 'images')
 * @param {number} options.timeout - Maximum time to wait for cache entries in milliseconds (default: 10000)
 * @param {number} options.checkInterval - Interval between checks in milliseconds (default: 500)
 * @returns {Promise<void>}
 */
export async function assertServiceWorkerCaching(port, options = {}) {
  const {
    urls = [],
    cacheName = 'images',
    timeout = 10000,
    checkInterval = 500,
  } = options;
  const origin = `http://localhost:${port}`;

  // Fetch each URL so the SW can cache them via runtime caching rules
  for (const urlPath of urls) {
    await page.evaluate(async (fetchUrl) => {
      await fetch(fetchUrl);
    }, `${origin}${urlPath}`);
  }

  const startTime = Date.now();

  const check = async () => {
    const cacheResult = await page.evaluate(async ({ cacheName: cn, urls: paths, origin: o }) => {
      try {
        const cache = await caches.open(cn);
        const keys = await cache.keys();
        const cachedUrls = keys.map(r => r.url);
        const missing = paths
          .map(p => new URL(p, o).href)
          .filter(u => !cachedUrls.includes(u));
        return { cachedUrls, missing };
      } catch (e) {
        return { error: e.message };
      }
    }, { cacheName, urls, origin });

    if (cacheResult.error) {
      throw new Error(`CacheStorage check failed: ${cacheResult.error}`);
    }

    if (cacheResult.missing.length === 0) {
      console.log(`✅ All ${urls.length} URL(s) found in "${cacheName}" cache`);
      return;
    }

    if (Date.now() - startTime < timeout) {
      await new Promise(r => setTimeout(r, checkInterval));
      return check();
    }

    throw new Error(
      `Expected URLs cached in "${cacheName}" but missing: ${cacheResult.missing.join(', ')}. ` +
      `Found: ${cacheResult.cachedUrls.join(', ') || '(empty)'}`
    );
  };

  await check();
}

/**
 * Helper function to assert that specific URLs are precached by the service worker.
 * Searches all CacheStorage caches (Workbox uses a generated precache name).
 * Unlike assertServiceWorkerCaching, this does NOT fetch the URLs first —
 * precached entries should already be present after SW activation.
 * @param {number} port - Port where the app is running
 * @param {Object} options - Additional options
 * @param {string[]} options.urls - Resource URLs expected to be precached (relative paths, e.g. ['/icon.png'])
 * @param {number} options.timeout - Maximum time to wait for cache entries in milliseconds (default: 10000)
 * @param {number} options.checkInterval - Interval between checks in milliseconds (default: 500)
 * @returns {Promise<void>}
 */
export async function assertServiceWorkerPrecaching(port, options = {}) {
  const {
    urls = [],
    timeout = 10000,
    checkInterval = 500,
  } = options;
  const origin = `http://localhost:${port}`;

  const startTime = Date.now();

  const check = async () => {
    const cacheResult = await page.evaluate(async ({ urls: paths, origin: o }) => {
      try {
        const cacheNames = await caches.keys();
        const allCachedUrls = [];
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          allCachedUrls.push(...keys.map(r => r.url));
        }
        // Workbox precache appends revision query params, so match by pathname
        const missing = paths.filter(p => {
          const expected = new URL(p, o).pathname;
          return !allCachedUrls.some(u => new URL(u).pathname === expected);
        });
        return { allCachedUrls, missing };
      } catch (e) {
        return { error: e.message };
      }
    }, { urls, origin });

    if (cacheResult.error) {
      throw new Error(`CacheStorage precache check failed: ${cacheResult.error}`);
    }

    if (cacheResult.missing.length === 0) {
      console.log(`✅ All ${urls.length} URL(s) found in precache`);
      return;
    }

    if (Date.now() - startTime < timeout) {
      await new Promise(r => setTimeout(r, checkInterval));
      return check();
    }

    throw new Error(
      `Expected precached URLs but missing: ${cacheResult.missing.join(', ')}. ` +
      `Found across all caches: ${cacheResult.allCachedUrls.join(', ') || '(empty)'}`
    );
  };

  await check();
}

/**
 * Helper function to capture a file's modification time for later comparison.
 * Returns the mtime in milliseconds.
 * @param {string} basePath - Base directory path
 * @param {string} relPath - Relative path from basePath to the file
 * @param {Object} options - Additional options
 * @param {number} options.timeout - Maximum time to wait for the file in milliseconds (default: 10000)
 * @param {number} options.checkInterval - Interval between checks in milliseconds (default: 500)
 * @returns {Promise<number>} - The file's mtime in milliseconds
 */
export async function captureFileMtime(basePath, relPath, options = {}) {
  const { timeout = 10000, checkInterval = 500 } = options;
  const fullPath = path.join(basePath, relPath);
  const startTime = Date.now();

  const check = async () => {
    const exists = await fs.pathExists(fullPath);
    if (exists) {
      const stat = await fs.stat(fullPath);
      return stat.mtimeMs;
    }
    if (Date.now() - startTime < timeout) {
      await new Promise(r => setTimeout(r, checkInterval));
      return check();
    }
    throw new Error(`File not found for mtime capture: ${fullPath}`);
  };

  return check();
}

/**
 * Helper function to assert that a file has NOT been modified since a previous snapshot.
 * Compares the current mtime against a previously captured mtime.
 * @param {string} basePath - Base directory path
 * @param {string} relPath - Relative path from basePath to the file
 * @param {number} previousMtime - The previously captured mtime (from captureFileMtime)
 * @returns {Promise<void>}
 */
export async function assertFileUnchanged(basePath, relPath, previousMtime) {
  const fullPath = path.join(basePath, relPath);
  const exists = await fs.pathExists(fullPath);

  if (!exists) {
    throw new Error(`File not found for unchanged check: ${fullPath}`);
  }

  const stat = await fs.stat(fullPath);
  const currentMtime = stat.mtimeMs;

  if (currentMtime !== previousMtime) {
    console.error(
      `assertFileUnchanged FAILED: ${relPath} was modified ` +
      `(previous mtime: ${previousMtime}, current mtime: ${currentMtime})`
    );
  }
  expect(currentMtime).toBe(previousMtime);
  console.log(`✅ File unchanged: ${relPath}`);
}

/**
 * Helper function to assert that a file HAS been modified since a previous snapshot.
 * Compares the current mtime against a previously captured mtime.
 * @param {string} basePath - Base directory path
 * @param {string} relPath - Relative path from basePath to the file
 * @param {number} previousMtime - The previously captured mtime (from captureFileMtime)
 * @param {Object} options - Additional options
 * @param {number} options.timeout - Maximum time to wait in milliseconds (default: 10000)
 * @param {number} options.checkInterval - Interval between checks in milliseconds (default: 500)
 * @returns {Promise<void>}
 */
export async function assertFileChanged(basePath, relPath, previousMtime, options = {}) {
  const { timeout = 10000, checkInterval = 500 } = options;
  const fullPath = path.join(basePath, relPath);
  const startTime = Date.now();

  const check = async () => {
    const exists = await fs.pathExists(fullPath);
    if (!exists) {
      if (Date.now() - startTime < timeout) {
        await new Promise(r => setTimeout(r, checkInterval));
        return check();
      }
      throw new Error(`File not found for changed check: ${fullPath}`);
    }

    const stat = await fs.stat(fullPath);
    if (stat.mtimeMs !== previousMtime) {
      console.log(`✅ File changed: ${relPath}`);
      return;
    }

    if (Date.now() - startTime < timeout) {
      await new Promise(r => setTimeout(r, checkInterval));
      return check();
    }

    throw new Error(
      `assertFileChanged FAILED: ${relPath} was not modified ` +
      `(mtime still ${previousMtime})`
    );
  };

  await check();
}

/**
 * Helper function to assert that a file exists somewhere within a directory tree.
 * Searches recursively and returns all matching relative paths.
 * @param {string} baseDir - Root directory to search in
 * @param {string} fileName - File name to search for (exact match)
 * @param {Object} options - Additional options
 * @param {number} options.minCount - Minimum number of matches expected (default: 1)
 * @param {number} options.maxCount - Maximum number of matches expected (default: Infinity)
 * @returns {Promise<string[]>} - Array of relative paths where the file was found
 */
export async function assertFileInTree(baseDir, fileName, options = {}) {
  const { minCount = 1, maxCount = Infinity } = options;

  const find = async (dir) => {
    const results = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...await find(full));
      else if (entry.name === fileName) results.push(path.relative(baseDir, full));
    }
    return results;
  };

  const matches = await find(baseDir);

  if (matches.length < minCount) {
    throw new Error(
      `Expected at least ${minCount} "${fileName}" in ${baseDir}, found ${matches.length}: ${matches.join(', ') || '(none)'}`
    );
  }
  if (matches.length > maxCount) {
    throw new Error(
      `Expected at most ${maxCount} "${fileName}" in ${baseDir}, found ${matches.length}: ${matches.join(', ')}`
    );
  }

  console.log(`✅ Found "${fileName}" (${matches.length}): ${matches.join(', ')}`);
  return matches;
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

/**
 * Helper function to assert that a PWA manifest is linked and contains expected fields.
 * Fetches the manifest from the <link rel="manifest"> href and checks key-value pairs.
 * @param {number} port - Port where the app is running
 * @param {Object} expectedFields - Expected top-level fields in the manifest (e.g. { name: 'My App', display: 'standalone' })
 * @param {Object} options - Additional options
 * @param {number} options.timeout - Maximum time to wait in milliseconds (default: 10000)
 * @param {number} options.checkInterval - Interval between checks in milliseconds (default: 500)
 * @returns {Promise<Object>} - The parsed manifest object
 */
export async function assertManifest(port, expectedFields = {}, options = {}) {
  const { timeout = 10000, checkInterval = 500 } = options;
  const startTime = Date.now();

  const check = async () => {
    const result = await page.evaluate(async () => {
      try {
        const link = document.querySelector('link[rel="manifest"]');
        if (!link) return { error: 'No <link rel="manifest"> found' };

        const res = await fetch(link.href);
        if (!res.ok) return { error: `Manifest fetch failed: ${res.status}` };

        const manifest = await res.json();
        return { manifest };
      } catch (e) {
        return { error: e.message };
      }
    });

    if (result.error) {
      if (Date.now() - startTime < timeout) {
        await new Promise(r => setTimeout(r, checkInterval));
        return check();
      }
      throw new Error(`Manifest assertion failed: ${result.error}`);
    }

    const { manifest } = result;
    for (const [key, expected] of Object.entries(expectedFields)) {
      expect(manifest[key]).toEqual(expected);
    }

    console.log(`✅ Manifest verified: ${Object.keys(expectedFields).join(', ')}`);
    return manifest;
  };

  return check();
}
