import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import {
  AnyMap,
  generatedPositionFor,
  originalPositionFor,
} from '@jridgewell/trace-mapping';

// Chromium exposes generated locations through CDP. Resolve them with an
// independent consumer, then compare them with the fixture's original text.
// This exercises real breakpoints and stepping without depending on DevTools UI.
export function browserInspector(session, request) {
  const events = [];
  const waiters = [];
  const maps = new Map();
  const scripts = new Map();
  for (const method of ['Debugger.scriptParsed', 'Debugger.paused']) {
    session.on(method, (params) => {
      if (method === 'Debugger.scriptParsed')
        scripts.set(params.scriptId, params);
      if (method === 'Debugger.scriptParsed' && params.sourceMapURL) {
        // Like a debugger frontend, load maps when scripts arrive. A later
        // HMR compilation can remove an earlier hot-update map from the server.
        const map = readScriptMap(params, request);
        map.catch(() => {}); // Surface errors when the test selects this script.
        maps.set(params.scriptId, map);
      }
      const index = waiters.findIndex(
        (waiter) => waiter.method === method && waiter.predicate(params),
      );
      if (index < 0) {
        events.push({ method, params });
      } else {
        const [waiter] = waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(params);
      }
    });
  }
  return {
    send: (method, params) => session.send(method, params),
    readMap: (script) => maps.get(script.scriptId),
    getScript: (id) => scripts.get(id),
    waitForEvent(method, predicate = () => true) {
      const index = events.findIndex(
        (event) => event.method === method && predicate(event.params),
      );
      if (index >= 0) return Promise.resolve(events.splice(index, 1)[0].params);
      return new Promise((resolve, reject) => {
        const waiter = { method, predicate, resolve };
        waiter.timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error(`Timed out waiting for ${method}`));
        }, 15000);
        waiters.push(waiter);
      });
    },
    close: () => session.detach(),
  };
}

export function sourcePosition(contents, token) {
  const offset = contents.indexOf(token);
  expect(offset).toBeGreaterThanOrEqual(0);
  expect(contents.indexOf(token, offset + 1)).toBe(-1);
  const lines = contents.slice(0, offset).split('\n');
  return { line: lines.length, column: lines.at(-1).length };
}

export async function readScriptMap(script, request) {
  expect(script.sourceMapURL).toBeTruthy();
  let raw;
  if (script.sourceMapURL.startsWith('data:')) {
    const [, encoding, data] = script.sourceMapURL.match(
      /^data:[^,]*?(;base64)?,(.*)$/s,
    );
    raw = JSON.parse(
      encoding
        ? Buffer.from(data, 'base64').toString()
        : decodeURIComponent(data),
    );
  } else {
    const url = new URL(script.sourceMapURL, script.url);
    if (url.protocol === 'file:') {
      raw = await fs.readJson(fileURLToPath(url));
    } else {
      const response = await request.get(url.href);
      expect(response.ok()).toBe(true);
      const text = (await response.text()).replace(/^\)\]\}'[^\n]*\n/, '');
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error(
          `Invalid source map at ${url.href} (script ${script.url}): ${text.slice(0, 100)}`,
        );
      }
    }
  }
  return AnyMap(raw);
}

export async function functionMap(inspector, expression, request) {
  const { result } = await inspector.send('Runtime.evaluate', { expression });
  expect(result.type).toBe('function');
  const { internalProperties } = await inspector.send('Runtime.getProperties', {
    objectId: result.objectId,
  });
  await inspector.send('Runtime.releaseObject', { objectId: result.objectId });
  const location = internalProperties.find(
    (property) => property.name === '[[FunctionLocation]]',
  ).value.value;
  const script = inspector.getScript
    ? inspector.getScript(location.scriptId)
    : await inspector.waitForEvent(
        'Debugger.scriptParsed',
        (event) => event.scriptId === location.scriptId,
      );
  return {
    script,
    map: await (inspector.readMap
      ? inspector.readMap(script)
      : readScriptMap(script, request)),
  };
}

function sourceIndex(map, relativePath) {
  return map.sources.findIndex((value) => {
    const normalized = value.replace(/\\/g, '/');
    return (
      normalized === relativePath || normalized.endsWith('/' + relativePath)
    );
  });
}

export function hasSource(raw, relativePath) {
  return sourceIndex(AnyMap(raw), relativePath) >= 0;
}

export function fixtureSource(map, relativePath, contents) {
  const index = sourceIndex(map, relativePath);
  expect(index).toBeGreaterThanOrEqual(0);
  // Embedded source must match the current file, including source-only edits.
  expect(map.sourcesContent[index]).toBe(contents);
  return map.resolvedSources[index];
}

export function expectOriginal(map, location, source, position) {
  expect(
    originalPositionFor(map, {
      line: location.lineNumber + 1,
      column: location.columnNumber,
    }),
  ).toMatchObject({ source, ...position });
}

export function checkEmittedMap(raw, code, relativePath, contents, message) {
  const map = AnyMap(raw);
  const source = fixtureSource(map, relativePath, contents);
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The error message survives minification unchanged. Anchor to the string
  // literal, since optimizers can rewrite `new Error(...)` to `Error(...)`.
  const match = code.match(new RegExp(`(["'])${escaped}\\1`));
  if (!match) {
    const offset = code.indexOf(message);
    throw new Error(
      `Missing error message for ${relativePath}: ${code.slice(Math.max(0, offset - 80), offset + message.length + 80)}`,
    );
  }
  // Locate this representative token in the actual emitted (possibly minified)
  // JavaScript, then require its exact original TypeScript file, line, and column.
  const generated = sourcePosition(code, match[0]);
  expectOriginal(
    map,
    { lineNumber: generated.line - 1, columnNumber: generated.column },
    source,
    sourcePosition(contents, `'${message}'`),
  );
}

export async function checkDebugging(
  inspector,
  request,
  expression,
  relativePath,
  contents,
  { stepToken = 'adjusted *', checkException = true } = {},
) {
  const { script, map } = await functionMap(
    inspector,
    `${expression}.probe`,
    request,
  );
  const source = fixtureSource(map, relativePath, contents);
  // V8 pauses on the initializer expression, not the declaration keyword.
  const start = sourcePosition(contents, 'input +');
  const next = sourcePosition(contents, stepToken);
  const generated = generatedPositionFor(map, { source, ...start });
  expect(generated.line).not.toBeNull();
  const { breakpointId, actualLocation } = await inspector.send(
    'Debugger.setBreakpoint',
    {
      location: {
        scriptId: script.scriptId,
        lineNumber: generated.line - 1,
        columnNumber: generated.column,
      },
    },
  );
  expectOriginal(map, actualLocation, source, start);

  const paused = inspector.waitForEvent('Debugger.paused', (event) =>
    event.hitBreakpoints?.includes(breakpointId),
  );
  const evaluation = inspector.send('Runtime.evaluate', {
    expression: `${expression}.probe(5)`,
    returnByValue: true,
  });
  evaluation.catch(() => {});
  try {
    const pause = await paused;
    expectOriginal(map, pause.callFrames[0].location, source, start);
    const stepped = inspector.waitForEvent('Debugger.paused');
    await inspector.send('Debugger.stepOver');
    expectOriginal(map, (await stepped).callFrames[0].location, source, next);
  } finally {
    await inspector.send('Debugger.removeBreakpoint', { breakpointId });
    await inspector.send('Debugger.resume');
    await evaluation;
  }

  // Browser Error.stack contains generated positions. CDP supplies those same
  // frames structurally; assert that the thrown frame maps to the exact token.
  if (checkException) {
    const { exceptionDetails } = await inspector.send('Runtime.evaluate', {
      expression: `${expression}.fail()`,
    });
    const thrown = exceptionDetails.stackTrace.callFrames[0];
    expect(thrown.scriptId).toBe(script.scriptId);
    expectOriginal(map, thrown, source, sourcePosition(contents, 'new Error'));
  }
  return { script, map };
}
