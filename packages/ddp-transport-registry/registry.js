export function createTransportRegistry() {
  const providers = new Map();

  return Object.freeze({
    register(name, provider) {
      if (providers.has(name)) {
        throw new Error(
          `DDP transport provider "${name}" is already registered`
        );
      }

      providers.set(name, provider);
    },

    get(name) {
      return providers.get(name);
    },

    names() {
      return Array.from(providers.keys());
    },
  });
}

export const DDPTransportRegistry = createTransportRegistry();
