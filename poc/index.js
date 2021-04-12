const vm = require('vm');

const slice = (arr, start, end) => {
  if (start === undefined) return arr;

  if (end === undefined && start > -1) {
    end = start - 1;
    start = 0;
  }

  if (end === 'tail') return arr.slice(start);

  if (start > -1) {
    end = end + 1;
  }

  return arr.slice(start, end);
};

const arraygen = arr =>
  function* gen(start, end) {
    yield* slice(arr, start, end);
  };
global.a = 0;

const loadServerBundles = async () => {
  const array = [1, 2, 3, 4];
  for await (const n of arraygen(array)()) {
    console.log('promise 0');
    await vm.runInThisContext(
      `Promise.resolve(${n}).then(result => {a += result; console.log('promise 1');  })`
    );
    console.log('promise 2');
    console.log('a', a);
  }
};
(async () => {
  try {
    await loadServerBundles();
  } catch (e) {
    console.error(' error', e);
  }
})().catch(e => console.error(' main error', e));
