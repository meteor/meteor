// Expected rows live in the test, independently of the fixture's data helpers.
const cases = [
  ['replace', ['A'], ['B']],
  ['retain', ['retained'], ['retained']],
  ['partial', ['a', 'b', 'c'], ['a', 'd']],
  ['variable', ['A'], ['B']],
  ['nested', ['a', 'b'], ['c']],
  ['cursor', ['a', 'b'], ['c']],
  ['reorder', ['x', 'y'], ['y', 'x']],
  ['parent', ['A'], ['B']],
  ['empty', ['A'], []],
  ['deep', ['A'], ['B']],
];

async function snapshot(id) {
  return page.locator(`#each-${id}`).evaluate(root => ({
    rows: [...root.querySelectorAll('.each-row')].map(row => ({
      id: row.dataset.key, index: Number(row.dataset.index), text: row.textContent,
    })),
    empty: root.querySelectorAll('.each-empty').length,
    renders: JSON.parse(root.querySelector('.each-trace').textContent),
  }));
}

async function act(id, action) {
  await page.locator(`#each-${id} .each-${action}`).click();
  return snapshot(id);
}

function assertRows(result, ids, generation, detail) {
  expect(result.rows).toEqual(ids.map((id, index) => ({
    id, index, text: `${id}:${generation}/${generation}/${detail}`,
  })));
  expect(result.empty).toBe(ids.length ? 0 : 1);
}

function assertLiveRenders(result, ids, generation, detail) {
  // Non-vacuous: each live item must execute its helper, and no removed item
  // may run when we invalidate the independent detail dependency afterward.
  expect([...new Set(result.renders.map(render => render.id))].sort()).toEqual([...ids].sort());
  for (const render of result.renders) {
    expect(render).toEqual({ id: render.id, item: generation, context: generation, detail });
  }
}

export function testEachDataContext() {
  describe('#each data context (meteor/blaze#468, #501) /', () => {
    test.each(cases)('%s: never executes a helper with stale item data', async (id, a, b) => {
      assertRows(await snapshot(id), a, 'A', 0);
      const stale = [];
      // Exercise both directions and a repeated update, plus several changes
      // batched into one flush. Inspect traces even if the final DOM is right.
      for (const [action, generation, ids] of [
        ['switch', 'B', b], ['switch', 'A', a], ['switch', 'B', b], ['burst', 'A', a],
      ]) {
        const result = await act(id, action);
        assertRows(result, ids, generation, 0);
        for (const rowId of ids) {
          expect(result.renders).toContainEqual({ id: rowId, item: generation, context: generation, detail: 0 });
        }
        stale.push(...result.renders.filter(render => render.item !== render.context));
      }
      expect(stale).toEqual([]);
    });

    test.each(cases)('%s: keeps reacting after updates, no-op diffs and remount', async (id, a, b) => {
      let detail = 0;
      for (const [generation, ids] of [['B', b], ['A', a], ['B', b]]) {
        assertRows(await act(id, 'switch'), ids, generation, detail);
        const updated = await act(id, 'detail');
        assertRows(updated, ids, generation, ++detail);
        assertLiveRenders(updated, ids, generation, detail);
        assertRows(await act(id, 'refresh'), ids, generation, detail);
        const refreshed = await act(id, 'detail');
        assertRows(refreshed, ids, generation, ++detail);
        assertLiveRenders(refreshed, ids, generation, detail);
      }
      // Destroy while the source stays alive. Neither detached item helpers
      // nor a stale pending flag should survive into the remounted view.
      await act(id, 'mount');
      for (const action of ['switch', 'detail', 'refresh']) {
        const result = await act(id, action);
        expect(result.rows).toEqual([]);
        expect(result.renders).toEqual([]);
      }
      ++detail;
      const remounted = await act(id, 'mount');
      assertRows(remounted, a, 'A', detail);
      assertLiveRenders(remounted, a, 'A', detail);
      const updated = await act(id, 'detail');
      assertRows(updated, a, 'A', ++detail);
      assertLiveRenders(updated, a, 'A', detail);
    });
  });
}
