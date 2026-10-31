import test from "node:test";
import assert from "node:assert/strict";

// O que este teste executa:
// Valida que validateExamplesData descarta entradas nulas ou com formato inválido com avisos, preservando entradas válidas.
test("validateExamplesData ignora null e entradas invalidas preservando validas", async () => {
  function validateExamplesData(data, { warn = () => {} } = {}) {
    if (!Array.isArray(data)) {
      throw new Error('Invalid examples.json format: expected a JSON array.');
    }
    return data.filter(entry => {
      if (!entry || typeof entry !== 'object') {
        warn('Skipping invalid example entry: expected an object');
        return false;
      }
      if (!entry.slug || typeof entry.slug !== 'string') {
        warn('Skipping example entry with missing slug');
        return false;
      }
      if (!entry.repositoryUrl || typeof entry.repositoryUrl !== 'string') {
        warn(`Skipping example '${entry.slug}' with missing repositoryUrl`);
        return false;
      }
      return true;
    });
  }

  const warnings = [];
  const warn = (msg) => warnings.push(msg);

  const valid = {
    slug: "svelte-app",
    repositoryUrl: "https://github.com/meteor/examples/tree/main/svelte",
  };

  const result = validateExamplesData([null, undefined, "not-an-obj", { slug: 123 }, valid], { warn });

  assert.deepEqual(result, [valid]);
  assert.equal(warnings.length, 4);

  // Valida que formato não-array continua lançando exceção
  assert.throws(() => validateExamplesData("not-array"), /Invalid examples\.json format/);
});
