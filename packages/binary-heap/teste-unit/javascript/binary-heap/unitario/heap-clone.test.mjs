import test from "node:test";
import assert from "node:assert/strict";

// Implementação standalone ou mock para IdMap
class SimpleIdMap {
  constructor() {
    this._map = new Map();
  }
  set(id, value) {
    this._map.set(id, value);
  }
  get(id) {
    return this._map.get(id);
  }
  has(id) {
    return this._map.has(id);
  }
  remove(id) {
    this._map.delete(id);
  }
  clear() {
    this._map.clear();
  }
}

// O que este teste executa:
// Valida a lógica cirúrgica de clone() em MaxHeap passando { initData: this._heap } conforme a especificação do construtor.
test("MaxHeap clone mantém elementos e integridade estrutural", async () => {
  // Configura IdMap global temporário para o módulo se necessário
  globalThis.IdMap = SimpleIdMap;
  const { MaxHeap } = await import(new URL("../../../../max-heap.js", import.meta.url).href);

  const heap = new MaxHeap((a, b) => a - b);
  heap.set("a", 1);
  heap.set("b", 5);
  heap.set("c", 3);

  const clone = heap.clone();

  assert.equal(clone.size(), 3);
  assert.equal(clone.empty(), false);
  assert.equal(clone.maxElementId(), "b");
  assert.equal(clone.get("a"), 1);
  assert.equal(clone.get("b"), 5);
  assert.equal(clone.get("c"), 3);

  // Mutações no clone não afetam o original
  clone.set("d", 10);
  assert.equal(clone.size(), 4);
  assert.equal(clone.maxElementId(), "d");
  assert.equal(heap.size(), 3);
  assert.equal(heap.maxElementId(), "b");
});

// O que este teste executa:
// Valida a lógica cirúrgica de clone() em MinMaxHeap mantendo tanto o max quanto o min heap e integridade estrutural.
test("MinMaxHeap clone mantém elementos, minElementId e maxElementId", async () => {
  globalThis.IdMap = SimpleIdMap;
  const { MinMaxHeap } = await import(new URL("../../../../min-max-heap.js", import.meta.url).href);

  const heap = new MinMaxHeap((a, b) => a - b);
  heap.set("a", 1);
  heap.set("b", 10);
  heap.set("c", -5);
  heap.set("d", 7);

  const clone = heap.clone();

  assert.equal(clone.size(), 4);
  assert.equal(clone.empty(), false);
  assert.equal(clone.maxElementId(), "b");
  assert.equal(clone.minElementId(), "c");
  assert.equal(clone.get("a"), 1);
  assert.equal(clone.get("b"), 10);
  assert.equal(clone.get("c"), -5);
  assert.equal(clone.get("d"), 7);

  // Remove elemento mínimo no clone
  clone.remove("c");
  assert.equal(clone.size(), 3);
  assert.equal(clone.minElementId(), "a");
  assert.equal(heap.size(), 4);
  assert.equal(heap.minElementId(), "c");
});
