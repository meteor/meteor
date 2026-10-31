import test from "node:test";
import assert from "node:assert/strict";

// O que este teste executa:
// Valida a inserção e movimentação de elementos no OrderedDict com chaves falsy (0 e '') garantindo a ordem correta antes do destino.
test("OrderedDict putBefore e moveBefore com chaves de destino 0 e string vazia", async () => {
  const { OrderedDict } = await import(new URL("../../../../ordered_dict.js", import.meta.url).href);

  function keysInOrder(dict) {
    const keys = [];
    dict.forEach((val, key) => {
      keys.push(key);
    });
    return keys;
  }

  for (const destination of [0, ""]) {
    const inserted = new OrderedDict();
    inserted.append(destination, "target");
    inserted.append("tail", "tail");
    inserted.putBefore("new", "new", destination);
    assert.deepEqual(keysInOrder(inserted), ["new", destination, "tail"]);

    const moved = new OrderedDict();
    moved.append(destination, "target");
    moved.append("tail", "tail");
    moved.append("new", "new");
    moved.moveBefore("new", destination);
    assert.deepEqual(keysInOrder(moved), ["new", destination, "tail"]);
  }

  // Verifica que null continua inserindo ao final
  const nullTarget = new OrderedDict();
  nullTarget.append("first", 1);
  nullTarget.putBefore("second", 2, null);
  assert.deepEqual(keysInOrder(nullTarget), ["first", "second"]);

  // Verifica que chave inexistente lança erro
  assert.throws(() => nullTarget.putBefore("third", 3, "nonexistent"), /could not find item/);
  assert.throws(() => nullTarget.moveBefore("first", "nonexistent"), /Could not find element/);
});
