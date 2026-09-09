import { createTransportRegistry } from "meteor/ddp-transport-registry";

Tinytest.add("ddp-transport-registry - register, get, and names", function (test) {
  const registry = createTransportRegistry();
  const provider = function provider() {};

  registry.register("sockjs", provider);

  test.equal(registry.get("sockjs"), provider);
  test.isUndefined(registry.get("uws"));
  test.equal(registry.names(), ["sockjs"]);
});

Tinytest.add("ddp-transport-registry - duplicate names fail", function (test) {
  const registry = createTransportRegistry();
  registry.register("sockjs", function first() {});

  test.throws(
    () => registry.register("sockjs", function second() {}),
    /DDP transport provider "sockjs" is already registered/,
  );
});
