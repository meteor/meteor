// Shared Node Inspector transport for debugger integration tests.
export async function getInspectorWebSocketUrl(port, timeout = 90000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find(entry => entry.webSocketDebuggerUrl);
        if (target) {
          return target.webSocketDebuggerUrl;
        }
      }
    } catch {
      // The inspector endpoint is unavailable until the server child starts.
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Node Inspector did not start on port ${port}`);
}

export async function connectInspector(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pendingCommands = new Map();
  const queuedEvents = new Map();
  const eventWaiters = [];
  let nextCommandId = 1;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out connecting to Node Inspector')),
      15000
    );

    socket.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('Failed to connect to Node Inspector'));
    }, { once: true });
  });

  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);

    if (message.id) {
      const pending = pendingCommands.get(message.id);
      if (!pending) return;
      pendingCommands.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result || {});
      }
      return;
    }

    if (!message.method) return;
    const waiterIndex = eventWaiters.findIndex(
      waiter =>
        waiter.method === message.method && waiter.predicate(message.params)
    );
    if (waiterIndex !== -1) {
      const [waiter] = eventWaiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(message.params);
      return;
    }

    const queue = queuedEvents.get(message.method) || [];
    queue.push(message.params);
    queuedEvents.set(message.method, queue);
  });

  function send(method, params = {}, timeout = 15000) {
    const id = nextCommandId++;
    return new Promise((resolve, reject) => {
      const commandTimeout = setTimeout(() => {
        pendingCommands.delete(id);
        reject(new Error(`Timed out sending Inspector command ${method}`));
      }, timeout);
      pendingCommands.set(id, {
        resolve,
        reject,
        timeout: commandTimeout,
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function waitForEvent(method, predicate = () => true, timeout = 15000) {
    const queue = queuedEvents.get(method) || [];
    const eventIndex = queue.findIndex(predicate);
    if (eventIndex !== -1) {
      const [event] = queue.splice(eventIndex, 1);
      return Promise.resolve(event);
    }

    return new Promise((resolve, reject) => {
      const eventTimeout = setTimeout(() => {
        const waiterIndex = eventWaiters.findIndex(
          waiter => waiter.resolve === resolve
        );
        if (waiterIndex !== -1) {
          eventWaiters.splice(waiterIndex, 1);
        }
        reject(new Error(`Timed out waiting for Inspector event ${method}`));
      }, timeout);
      eventWaiters.push({
        method,
        predicate,
        resolve,
        reject,
        timeout: eventTimeout,
      });
    });
  }

  function close() {
    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    ) {
      socket.close();
    }
  }

  return { close, send, waitForEvent };
}
