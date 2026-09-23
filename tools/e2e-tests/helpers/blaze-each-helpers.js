async function snapshot() {
  return page.locator('#each-partial').evaluate(root => ({
    rows: [...root.querySelectorAll('.each-row')].map(row => ({
      id: row.dataset.key, index: Number(row.dataset.index), text: row.textContent,
    })),
    renders: JSON.parse(root.querySelector('.each-trace').textContent).renders,
  }));
}

async function act(action, step) {
  await page.locator(`#each-partial .each-${action}`).click();
  // Wait for the post-flush report for this click, not a previous DOM state.
  await page.waitForFunction(expectedStep => {
    const trace = document.querySelector('#each-partial .each-trace');
    return JSON.parse(trace.textContent).step === expectedStep;
  }, step);
  return snapshot();
}

function assertRows(result, ids, generation, detail) {
  // Expected rows are independent of the fixture's data helper.
  expect(result.rows).toEqual(ids.map((id, index) => ({
    id, index, text: `${id}:${generation}/${generation}/${detail}`,
  })));
}

export function testEachDataContext() {
  test('#each data context: a user-driven partial update stays consistent and reactive (meteor/blaze#468, #501)', async () => {
    assertRows(await snapshot(), ['a', 'b', 'c'], 'A', 0);
    const retainedRow = await page.locator('#each-partial .each-row[data-key="a"]').elementHandle();
    try {
      const switched = await act('switch', 1);
      assertRows(switched, ['a', 'd'], 'B', 0);
      // The existing row must survive, not be recreated to sidestep revival.
      expect(await retainedRow.evaluate(row => row.isConnected)).toBe(true);
      for (const id of ['a', 'd']) {
        expect(switched.renders).toContainEqual({ id, item: 'B', context: 'B', detail: 0 });
      }

      // A separate user action must still update both live rows. Removed item
      // helpers must not run, and a frozen helper cannot pass with an empty log.
      const detailed = await act('detail', 2);
      assertRows(detailed, ['a', 'd'], 'B', 1);
      expect([...new Set(detailed.renders.map(render => render.id))].sort()).toEqual(['a', 'd']);
      for (const render of detailed.renders) {
        expect(render).toEqual({ id: render.id, item: 'B', context: 'B', detail: 1 });
      }

      // Check every intermediate call, even when the final DOM looks right.
      // Assert last so the baseline also exercises continued reactivity.
      expect(switched.renders.filter(render => render.item !== render.context)).toEqual([]);
    } finally {
      await retainedRow.dispose();
    }
  });
}
