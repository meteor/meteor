#!/usr/bin/env node

const url = process.env.DDP_BENCHMARK_URL || 'ws://127.0.0.1:4096/websocket';
const methodName = process.env.DDP_BENCHMARK_METHOD || 'ddp_benchmark_noop';
const verifyResult = process.env.DDP_BENCHMARK_VERIFY_RESULT !== '0';
const totalCalls = Number(process.env.DDP_SERVER_BENCHMARK_CALLS || 10000);
const concurrency = Number(process.env.DDP_SERVER_BENCHMARK_CONCURRENCY || 100);
const connectTimeoutMs = Number(process.env.DDP_BENCHMARK_CONNECT_TIMEOUT_MS || 180000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getMessageText = async (data) => {
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }

  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return await data.text();
  }

  return String(data);
};

const connectWithRetry = async () => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < connectTimeoutMs) {
    const socket = await new Promise((resolve) => {
      let settled = false;
      const ws = new WebSocket(url);

      ws.addEventListener('open', () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(ws);
      });

      ws.addEventListener('error', () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(null);
      });
    });

    if (socket) {
      return socket;
    }

    await sleep(500);
  }

  throw new Error(`Timed out after ${connectTimeoutMs}ms waiting for ${url}`);
};

const main = async () => {
  const ws = await connectWithRetry();

  let sessionConnected = false;
  let nextId = 0;
  let sent = 0;
  let completed = 0;
  let inFlight = 0;
  let startedAtNs;

  const pending = new Map();

  let done = false;
  let resolveDone;
  let rejectDone;
  const donePromise = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const safeResolve = (value) => {
    if (done) {
      return;
    }

    done = true;
    resolveDone(value);
  };

  const safeReject = (error) => {
    if (done) {
      return;
    }

    done = true;
    rejectDone(error);
  };

  const maybeFinishCall = (id) => {
    const state = pending.get(id);
    if (!state || !state.resultReceived || !state.updatedReceived) {
      return;
    }

    pending.delete(id);
    completed += 1;
    inFlight -= 1;

    pump();

    if (completed === totalCalls) {
      const endedAtNs = process.hrtime.bigint();
      const elapsedSeconds = Number(endedAtNs - startedAtNs) / 1e9;
      const callsPerSecond = completed / elapsedSeconds;

      safeResolve({
        method_calls: completed,
        time_to_process_s: elapsedSeconds,
        calls_per_second: callsPerSecond,
      });

      ws.close();
    }
  };

  const pump = () => {
    if (!sessionConnected || completed >= totalCalls) {
      return;
    }

    while (inFlight < concurrency && sent < totalCalls) {
      const id = String(nextId++);

      if (!startedAtNs) {
        startedAtNs = process.hrtime.bigint();
      }

      pending.set(id, {
        resultReceived: false,
        updatedReceived: false,
        expectedResult: sent,
      });

      ws.send(JSON.stringify({
        msg: 'method',
        method: methodName,
        params: [sent],
        id,
      }));

      sent += 1;
      inFlight += 1;
    }
  };

  ws.addEventListener('message', async (event) => {
    try {
      const raw = await getMessageText(event.data);
      const message = JSON.parse(raw);

      if (message.msg === 'connected') {
        sessionConnected = true;
        pump();
        return;
      }

      if (message.msg === 'ping') {
        ws.send(JSON.stringify({
          msg: 'pong',
          ...(message.id ? { id: message.id } : {}),
        }));
        return;
      }

      if (message.msg === 'pong') {
        return;
      }

      if (message.msg === 'failed') {
        safeReject(new Error(`DDP connect failed: ${JSON.stringify(message)}`));
        ws.close();
        return;
      }

      if (message.msg === 'result') {
        if (message.error) {
          safeReject(new Error(`Method error: ${JSON.stringify(message.error)}`));
          ws.close();
          return;
        }

        const state = pending.get(message.id);
        if (!state) {
          return;
        }

        if (verifyResult && message.result !== state.expectedResult) {
          safeReject(new Error(`Invalid method result for id=${message.id}: expected ${state.expectedResult}, got ${message.result}`));
          ws.close();
          return;
        }

        state.resultReceived = true;
        maybeFinishCall(message.id);
        return;
      }

      if (message.msg === 'updated') {
        for (const id of message.methods || []) {
          const state = pending.get(id);
          if (!state) {
            continue;
          }

          state.updatedReceived = true;
          maybeFinishCall(id);
        }
      }
    } catch (error) {
      safeReject(error);
      ws.close();
    }
  });

  ws.addEventListener('error', (event) => {
    safeReject(new Error(`WebSocket error: ${event.message || 'unknown'}`));
  });

  ws.addEventListener('close', () => {
    if (!done && completed < totalCalls) {
      safeReject(new Error('WebSocket closed before benchmark completed'));
    }
  });

  ws.send(JSON.stringify({
    msg: 'connect',
    version: '1',
    support: ['1', 'pre2', 'pre1'],
  }));

  const result = await donePromise;
  console.log(JSON.stringify(result));
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
