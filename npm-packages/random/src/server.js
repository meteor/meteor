
import nodeCrypto from "crypto";
import RandomGenerator from "./RandomGenerator";

const Random = new RandomGenerator({ nodeCrypto });

Random.createWithSeeds = (...seeds) => {
  if (seeds.length === 0) throw new Error("No seeds were provided");
  return new RandomGenerator({ seeds });
};

export default Random;
