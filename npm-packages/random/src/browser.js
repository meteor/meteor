import RandomGenerator from "./RandomGenerator";

let crypto;
let userAgent;
let innerHeight;
let innerWidth;
let documentElement;
let body;

if (typeof window !== "undefined") {
  ({ crypto, innerHeight, innerWidth } = window);
}

if (typeof navigator !== "undefined") {
  ({ userAgent } = navigator);
}

if (typeof document !== "undefined") {
  ({ body, documentElement } = document);
}

let seeds;
if (!crypto || !crypto.getRandomValues) {
  // instantiate RNG. Heuristically collect entropy from various sources when a
  // cryptographic PRNG isn't available.
  const agent = userAgent || "";

  const width = innerWidth ||
    (documentElement && documentElement.clientWidth) ||
    (body && body.clientWidth) ||
    1;

  const height = innerHeight ||
    (documentElement && documentElement.clientHeight) ||
    (body && body.clientHeight) ||
    1;

  seeds = [new Date(), height, width, agent, Math.random()];
}

const Random = new RandomGenerator({
  getRandomValues: crypto && crypto.getRandomValues && crypto.getRandomValues.bind(crypto),
  seeds
});

Random.createWithSeeds = (...seedArray) => {
  if (seedArray.length === 0) throw new Error("No seeds were provided");
  return new RandomGenerator({ seeds: seedArray });
};

export default Random;
