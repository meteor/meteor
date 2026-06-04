const http = require('http');
const https = require('https');

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function requestOnce(url, {
  method = 'GET',
  headers = {},
  requestTimeoutMs = 2000,
  maxBodyBytes = 1024 * 1024,
} = {}) {
  return new Promise(resolve => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      resolve({ ok: false, url, error });
      return;
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      resolve({
        ok: false,
        url,
        error: new Error(`Unsupported protocol: ${parsedUrl.protocol}`),
      });
      return;
    }

    const transport = parsedUrl.protocol === 'https:' ? https : http;
    let req;
    try {
      req = transport.request(parsedUrl, { method, headers }, response => {
        const chunks = [];
        let bodyBytes = 0;

        response.on('data', chunk => {
          bodyBytes += chunk.length;
          if (bodyBytes <= maxBodyBytes) {
            chunks.push(chunk);
          }
        });

        response.on('end', () => {
          resolve({
            ok: true,
            url,
            statusCode: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      });
    } catch (error) {
      resolve({ ok: false, url, error });
      return;
    }

    req.setTimeout(requestTimeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${requestTimeoutMs}ms`));
    });

    req.on('error', error => {
      resolve({ ok: false, url, error });
    });

    req.end();
  });
}

async function requestFollowingRedirects(url, options = {}) {
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl = url;

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const result = await requestOnce(currentUrl, options);
    if (!result.ok) return result;

    const location = result.headers?.location;
    if (
      REDIRECT_STATUS_CODES.has(result.statusCode) &&
      location &&
      redirects < maxRedirects
    ) {
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return {
      ...result,
      url: currentUrl,
      redirected: currentUrl !== url,
    };
  }
}

function defaultValidateResponse(response) {
  return response.statusCode >= 200 && response.statusCode < 300;
}

/**
 * Polls an HTTP(S) endpoint until it satisfies a response validator.
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=30000]
 * @param {number} [options.intervalMs=500]
 * @param {number} [options.requestTimeoutMs=2000]
 * @param {Function} [options.validateResponse]
 * @returns {Promise<{ok:boolean,response?:Object,error?:Error,timedOut?:boolean,attempts:number}>}
 */
export async function waitForHttpReady(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 500;
  const validateResponse = options.validateResponse || defaultValidateResponse;
  const start = Date.now();
  let attempts = 0;
  let lastResult = null;

  while (Date.now() - start <= timeoutMs) {
    attempts += 1;
    lastResult = await requestFollowingRedirects(url, options);

    if (lastResult?.ok) {
      try {
        if (await validateResponse(lastResult)) {
          return { ok: true, response: lastResult, attempts };
        }
      } catch (error) {
        lastResult = { ...lastResult, error };
      }
    }

    const elapsed = Date.now() - start;
    if (elapsed >= timeoutMs) break;
    await delay(Math.min(intervalMs, timeoutMs - elapsed));
  }

  return {
    ok: false,
    response: lastResult?.ok ? lastResult : undefined,
    error: lastResult?.error,
    timedOut: true,
    attempts,
  };
}
