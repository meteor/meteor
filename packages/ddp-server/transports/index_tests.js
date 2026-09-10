import { getTransportFactory, resolveTransportName } from "./index.js";
import { createTransportRegistry, DDPTransportRegistry } from "meteor/ddp-transport-registry";

Tinytest.add("ddp-server - eager providers register in the shared registry", function (test) {
  test.equal(DDPTransportRegistry.names(), ["sockjs", "uws"]);

  ["sockjs", "uws"].forEach((name) => {
    const provider = DDPTransportRegistry.get(name);
    test.equal(typeof provider, "function");
    test.equal(getTransportFactory(name), provider);
  });
});

Tinytest.add("ddp-server - transport selection priority is compatible", function (test) {
  test.equal(
    resolveTransportName({
      settings: { packages: { "ddp-server": { transport: "sockjs" } } },
      env: { DDP_TRANSPORT: "uws", DISABLE_SOCKJS: "1" },
    }),
    "sockjs",
  );

  test.equal(
    resolveTransportName({
      settings: {},
      env: { DDP_TRANSPORT: "uws", DISABLE_SOCKJS: "1" },
    }),
    "uws",
  );

  test.equal(
    resolveTransportName({
      settings: {},
      env: { DISABLE_SOCKJS: "1" },
    }),
    "uws",
  );

  test.equal(resolveTransportName({ settings: {}, env: {} }), "sockjs");
});

Tinytest.add("ddp-server - a fixed bundle defaults to its included provider", function (test) {
  const registry = createTransportRegistry();
  registry.register("uws", function createUws() {});

  test.equal(resolveTransportName({ settings: {}, env: {}, registry }), "uws");
});

Tinytest.add("ddp-server - explicit runtime selection wins in a fixed bundle", function (test) {
  const registry = createTransportRegistry();
  registry.register("uws", function createUws() {});

  test.equal(
    resolveTransportName({
      settings: { packages: { "ddp-server": { transport: "sockjs" } } },
      env: {},
      registry,
    }),
    "sockjs",
  );
});

Tinytest.add("ddp-server - omitted provider has an actionable error", function (test) {
  const registry = createTransportRegistry();
  registry.register("sockjs", function createSockJS() {});

  test.throws(
    () => getTransportFactory("uws", registry),
    /not included.*Included transports: sockjs.*To use "sockjs".*transport.*to "sockjs".*if that setting is unset.*DDP_TRANSPORT=sockjs.*To use "uws".*--ddp-transport=uws.*--ddp-transport=both/,
  );
});

Tinytest.add("ddp-server - unknown provider remains distinct", function (test) {
  test.throws(
    () => getTransportFactory("invalid", createTransportRegistry()),
    /Unknown DDP transport: "invalid".*Valid transports: sockjs, uws/,
  );
});
