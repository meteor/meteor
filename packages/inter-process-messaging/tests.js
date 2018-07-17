import EventEmitter from "events";
import { Tinytest } from "meteor/tinytest";
import { enable } from "./inter-process-messaging.js";

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
    this.child.emit("message", message);
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
    this.parent.emit("message", message);
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
