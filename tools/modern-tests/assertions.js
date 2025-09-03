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
    await page.waitForSelector('h1');
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
      expect(fileExists).toBe(true);
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
 * Helper function to assert that the body element has the expected CSS styles
 * @param {Object} expectedStyles - Expected CSS styles as key-value pairs
 * @param {Object} options - Additional options for assertConsoleEval
 * @returns {Promise<Object>} - A promise that resolves with the computed styles
 */
export async function assertBodyStyles(expectedStyles, options = {}) {
  console.log(`Asserting body styles: ${JSON.stringify(expectedStyles)}`);

  // Create a JavaScript code string that evaluates the computed styles
  const code = `
    (() => {
      const computedStyle = getComputedStyle(document.body);
      const result = {};
      ${Object.keys(expectedStyles).map(prop => 
        `result['${prop}'] = computedStyle.getPropertyValue('${prop}');`
      ).join('\n')}
      return result;
    })()
  `;

  // Use assertConsoleEval to evaluate the code and check the result
  return await assertConsoleEval(code, expectedStyles, { 
    exactMatch: false,
    ...options
  });
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
