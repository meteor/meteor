import EventEmitter from "events";
import { Tinytest } from "meteor/tinytest";
import { enable } from "./inter-process-messaging.js";
import { PING, PONG } from "./types.js";

// Simulated handle for a child process held by the parent process, like
// the object returned by child_process.spawn. Emits any sent messages in
// the child process, represented by this.child.
class FakeChildProcess extends EventEmitter {
  constructor() {
    super();
    this.child = new FakeProcess(this);
    enable(this);
  }

  send(message) {
    this.child.emit("message", JSON.parse(JSON.stringify(message)));
  }
}

// Fake process object analogous to global.process.
class FakeProcess extends EventEmitter {
  constructor(parent) {
    super();
    this.parent = parent;
    enable(this);
  }

  send(message) {
    this.parent.emit("message", JSON.parse(JSON.stringify(message)));
  }
}

Tinytest.addAsync('inter-process-messaging - basic', async (test) => {
  const proc = new FakeChildProcess;

  // Reach into the fake child process to register a listener.
  proc.child.onMessage("add-one-eleven", value => {
    return value + 111;
  });

  const results = await proc.sendMessage("add-one-eleven", 123);

  test.equal(results, [234]);
});

Tinytest.addAsync('inter-process-messaging - multiple listeners', async (test) => {
  const proc = new FakeChildProcess;

  proc.child.onMessage("popular-topic", () => "a");
  proc.child.onMessage("popular-topic", async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    return "b";
  });
  proc.child.onMessage("popular-topic", async () => "c");

  const popularResults = await proc.sendMessage("popular-topic");
  test.equal(popularResults, ["a", "b", "c"]);

  const unpopularResults = await proc.sendMessage("unpopular-topic");
  test.equal(unpopularResults, []);

  proc.child.onMessage("unpopular-topic", () => "finally");
  test.equal(await proc.sendMessage("unpopular-topic"), ["finally"]);
});

Tinytest.addAsync('inter-process-messaging - errors', async (test) => {
  const proc = new FakeChildProcess;
  const expectedError = new Error("expected");

  proc.child.onMessage("risky-topic", () => "a");
  proc.child.onMessage("risky-topic", () => {
    throw expectedError;
  });

  return proc.sendMessage("risky-topic").then(result => {
    throw new Error("should have thrown");
  }, error => {
    test.equal(error.message, "expected");
  });
});

Tinytest.addAsync('inter-process-messaging - message from child', async (test) => {
  const proc = new FakeChildProcess;

  proc.onMessage("from-child", async (payload) => {
    test.equal(payload.hello, "hi");
    return "right back atcha";
  });

  const results = await proc.child.sendMessage("from-child", {
    hello: "hi"
  });

  test.equal(results, ["right back atcha"]);
});

Tinytest.addAsync('inter-process-messaging - exotic payloads', async (test) => {
  const proc = new FakeChildProcess;

  // Reach into the fake child process to register a listener.
  proc.child.onMessage("self-reference", payload => {
    test.ok(payload.self === payload);
    return payload;
  });

  const obj = {};
  obj.self = obj;
  const [obj2] = await proc.sendMessage("self-reference", obj);

  test.ok(obj2 !== obj);
  test.ok(obj2.self === obj2);

  // Reach into the fake child process to register a listener.
  proc.child.onMessage("repeated-reference", payload => {
    test.ok(payload[0] === payload[1]);
    return payload;
  });

  const arr = [obj, obj, obj];
  const [arr2] = await proc.sendMessage("repeated-reference", arr);

  test.ok(arr2 !== arr);
  test.ok(arr2[0] === arr2[1]);
  test.ok(arr2[1] === arr2[2]);

  // Reach into the fake child process to register a listener.
  proc.child.onMessage("Set-Map-containment", map => {
    checkMap(map);
    return map;
  });

  function checkMap(map) {
    test.equal(map.size, 1);
    map.forEach((set, self) => {
      test.ok(self === map);
      test.equal(set.size, 2);
      test.ok(set.has(map));
      test.ok(set.has(set));
    });
  }

  const map = new Map;
  const set = new Set;
  map.set(map, set);
  set.add(map).add(set);

  const [map2] = await proc.sendMessage("Set-Map-containment", map);
  test.ok(map2 !== map);
  checkMap(map2);
});
Tinytest.addAsync('inter-process-messaging - uuid v4 format validation', async function (test) {
  const proc = new FakeChildProcess;

  let capturedId = null;

  const originalSend = proc.child.parent.send.bind(proc.child.parent);
  proc.child.parent.send = function (message, cb) {
    if (message.responseId) {
      capturedId = message.responseId;
    }
    return originalSend(message, cb);
  };

  proc.child.onMessage("uuid-test", () => "ok");
  await proc.sendMessage("uuid-test");

  test.isTrue(!!capturedId, "UUID should be generated");

  const uuidV4Regex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  test.isTrue(
    uuidV4Regex.test(capturedId),
    `UUID should match v4 format: ${capturedId}`
  );
});

for (const failure of ["throw", "callback"]) {
  Tinytest.addAsync(`inter-process-messaging - readiness retry ${failure}`, async test => {
    const proc = enable(new EventEmitter);
    const expectedError = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    let sends = 0;

    proc.send = (message, callback) => {
      test.equal(message.type, PING);
      if (++sends === 1) {
        // The second send runs from a timer, outside the Promise executor.
        callback(null);
      } else if (failure === "throw") {
        throw expectedError;
      } else {
        setImmediate(() => callback(expectedError));
      }
    };

    await proc.sendMessage("never-ready").then(() => {
      test.fail("sending to a closed pipe should reject");
    }, error => {
      test.isTrue(error === expectedError);
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    test.equal(sends, 2);
  });
}

for (const event of ["exit", "disconnect"]) {
  Tinytest.addAsync(`inter-process-messaging - ${event} before readiness`, async test => {
    const proc = enable(new EventEmitter);
    let sends = 0;
    let sent;
    let callback;
    proc.send = (message, cb) => {
      sends++;
      sent = message;
      callback = cb;
    };

    const pending = proc.sendMessage("never-ready").then(() => {
      test.fail("a terminated readiness handshake should reject");
    }, error => error);
    proc.emit(event, 0, "SIGTERM");

    // The write callback and even an already queued PONG may arrive after
    // shutdown. Neither should resume polling or deliver the pending message.
    callback(null);
    proc.emit("message", { type: PONG, id: sent.id });

    const error = await pending;
    test.equal(error.message, event === "exit" ? "process exited" : "channel closed");
    if (event === "exit") {
      test.equal(error.code, 0);
      test.equal(error.signal, "SIGTERM");
    }
    await proc.sendMessage("after-shutdown").then(() => {
      test.fail("future messages should reject after shutdown");
    }, nextError => {
      test.isTrue(nextError === error);
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    test.equal(sends, 1);
  });
}

Tinytest.addAsync('inter-process-messaging - delayed readiness succeeds', async test => {
  const proc = new FakeChildProcess;
  const originalSend = proc.send.bind(proc);
  let pings = 0;
  proc.send = (message, callback) => {
    if (message.type === PING && ++pings === 1) {
      callback(null);
      return;
    }
    originalSend(message);
    callback(null);
  };
  proc.child.onMessage("ready-on-retry", value => value + 1);

  test.equal(await proc.sendMessage("ready-on-retry", 41), [42]);
  test.equal(await proc.sendMessage("ready-on-retry", 99), [100]);
  await new Promise(resolve => setTimeout(resolve, 100));
  test.equal(pings, 2);
});
