import { DDPTransportRegistry } from "meteor/ddp-transport-registry";

const VALID_NAMES = ["sockjs", "uws"];

export function getTransport() {
  const name = resolveTransportName();
  const createTransport = getTransportFactory(name);

  __meteor_runtime_config__.DDP_TRANSPORT = name;
  return createTransport();
}

export function getTransportFactory(name, registry = DDPTransportRegistry) {
  if (!VALID_NAMES.includes(name)) {
    throw new Error(
      `Unknown DDP transport: "${name}". ` + `Valid transports: ${VALID_NAMES.join(", ")}`,
    );
  }

  const factory = registry.get(name);
  if (!factory) {
    const included = registry.names();
    const runtimeSelectionHint =
      included.length === 1
        ? `To use "${included[0]}", set Meteor.settings.packages["ddp-server"].transport ` +
          `to "${included[0]}" or, if that setting is unset, set DDP_TRANSPORT=${included[0]}. `
        : "";
    throw new Error(
      [
        `DDP transport "${name}" is not included in this application bundle. `,
        `Included transports: ${included.join(", ") || "none"}. `,
        runtimeSelectionHint,
        `To use "${name}", rebuild with --ddp-transport=${name} or --ddp-transport=both.`,
      ].join(""),
    );
  }

  return factory;
}

export function resolveTransportName({
  settings = Meteor.settings,
  env = process.env,
  registry = DDPTransportRegistry,
} = {}) {
  const packageSettings = settings?.packages?.["ddp-server"];
  if (packageSettings?.transport) return packageSettings.transport;
  if (env.DDP_TRANSPORT) return env.DDP_TRANSPORT;
  if (env.DISABLE_SOCKJS) return "uws";
  const included = registry.names();
  if (included.length === 1) return included[0];
  return "sockjs";
}
