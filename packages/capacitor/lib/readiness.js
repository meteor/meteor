import { waitForHttpReady } from 'meteor/tools-core/lib/readiness';
import { getMeteorAppPort } from 'meteor/tools-core/lib/meteor';

function parseMeteorPort(value) {
  const raw = String(value || '3000');
  const match = raw.match(/^(?:(.+):)?([0-9]+)$/);
  if (!match) {
    return { host: '127.0.0.1', port: raw };
  }

  const host = match[1] && match[1] !== '0.0.0.0'
    ? match[1]
    : '127.0.0.1';
  return { host, port: match[2] };
}

export function getMeteorIndexUrl() {
  if (process.env.METEOR_CAPACITOR_READY_URL) {
    return process.env.METEOR_CAPACITOR_READY_URL;
  }

  const { host, port } = parseMeteorPort(getMeteorAppPort());
  return `http://${host}:${port}/`;
}

export function isMeteorIndexReadyResponse(response) {
  if (!response || response.statusCode < 200 || response.statusCode >= 300) {
    return false;
  }

  const contentType = String(response.headers?.['content-type'] || '');
  const body = String(response.body || '');
  return (
    contentType.includes('text/html') &&
    body.includes('__meteor_runtime_config__')
  );
}

export function waitForMeteorIndexReady({
  url = getMeteorIndexUrl(),
  timeoutMs = 120_000,
  intervalMs = 500,
  requestTimeoutMs = 2000,
} = {}) {
  return waitForHttpReady(url, {
    timeoutMs,
    intervalMs,
    requestTimeoutMs,
    validateResponse: isMeteorIndexReadyResponse,
  });
}
