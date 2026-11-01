const {
  findPackageReasons,
  isStrongDependency,
  getStrongDependencies,
} = require('./package-why.js');

function records(graph) {
  const result = {};
  for (const [name, dependencies] of Object.entries(graph)) {
    result[name] = {
      packageName: name,
      version: '1.0.0',
      dependencies,
    };
  }
  return result;
}

function mapRecords(graph) {
  const result = new Map;
  for (const [name, dependencies] of Object.entries(graph)) {
    result.set(name, {
      packageName: name,
      version: '1.0.0',
      dependencies,
    });
  }
  return result;
}

describe('package why graph traversal', () => {
  test('finds shortest chains from Map package records', () => {
    const packageRecords = mapRecords({
      admin: { shared: { references: [{}] } },
      app: { ui: { references: [{}] } },
      ui: { shared: { references: [{}] } },
      shared: {},
    });

    expect(findPackageReasons(packageRecords, ['app', 'admin'], 'shared'))
      .toEqual({
        status: 'found',
        paths: [['admin', 'shared'], ['app', 'ui', 'shared']],
      });
  });

  test('reports missing and weak-only targets from Map package records', () => {
    const packageRecords = mapRecords({
      root: { weakTarget: { references: [{ weak: true }] } },
      weakTarget: {},
      otherTarget: {},
    });

    expect(findPackageReasons(packageRecords, ['root'], 'missing'))
      .toEqual({ status: 'missing', paths: [] });
    expect(findPackageReasons(packageRecords, ['root'], 'weakTarget'))
      .toEqual({ status: 'no-path', paths: [] });
    expect(findPackageReasons(packageRecords, ['root'], 'otherTarget'))
      .toEqual({ status: 'no-path', paths: [] });
  });

  test('finds a direct dependency', () => {
    const packageRecords = records({ root: {} });
    expect(findPackageReasons(packageRecords, ['root'], 'root')).toEqual({
      status: 'found',
      paths: [['root']],
    });
  });

  test('finds a single transitive chain', () => {
    const packageRecords = records({
      root: { middle: { references: [{}] } },
      middle: { target: { references: [{}] } },
      target: {},
    });
    expect(findPackageReasons(packageRecords, ['root'], 'target').paths)
      .toEqual([['root', 'middle', 'target']]);
  });

  test('returns one chain from every reachable direct dependency', () => {
    const packageRecords = records({
      app: { shared: { references: [{}] } },
      admin: { shared: { references: [{}] } },
      shared: {},
    });
    expect(findPackageReasons(packageRecords, ['admin', 'app'], 'shared')).toEqual({
      status: 'found',
      paths: [['admin', 'shared'], ['app', 'shared']],
    });
  });

  test('uses the shortest deterministic diamond path', () => {
    const packageRecords = records({
      root: {
        beta: { references: [{}] },
        alpha: { references: [{}] },
      },
      alpha: { target: { references: [{}] } },
      beta: { target: { references: [{}] } },
      target: {},
    });
    expect(findPackageReasons(packageRecords, ['root'], 'target').paths)
      .toEqual([['root', 'alpha', 'target']]);
  });

  test('does not repeat nodes and terminates on cycles', () => {
    const packageRecords = records({
      root: { a: { references: [{}] } },
      a: { root: { references: [{}] }, b: { references: [{}] } },
      b: { target: { references: [{}] } },
      target: {},
    });
    expect(findPackageReasons(packageRecords, ['root'], 'target').paths)
      .toEqual([['root', 'a', 'b', 'target']]);
  });

  test('handles shared dependencies once without losing roots', () => {
    const packageRecords = records({
      app: { shared: { references: [{}] } },
      admin: { shared: { references: [{}] } },
      shared: { target: { references: [{}] } },
      target: {},
    });
    expect(findPackageReasons(packageRecords, ['app', 'admin'], 'target').paths)
      .toEqual([['admin', 'shared', 'target'], ['app', 'shared', 'target']]);
  });

  test('excludes weak-only dependencies', () => {
    const packageRecords = records({
      root: { weakTarget: { references: [{ weak: true }] } },
      weakTarget: {},
    });
    expect(findPackageReasons(packageRecords, ['root'], 'weakTarget'))
      .toEqual({ status: 'no-path', paths: [] });
  });

  test('treats a dependency with strong and weak references as strong', () => {
    expect(isStrongDependency({
      references: [{ weak: true }, {}],
    })).toBe(true);

    const packageRecords = records({
      root: {
        target: { references: [{ weak: true }, {}] },
      },
      target: {},
    });
    expect(findPackageReasons(packageRecords, ['root'], 'target').paths)
      .toEqual([['root', 'target']]);
  });

  test('reports a missing target', () => {
    expect(findPackageReasons(records({ root: {} }), ['root'], 'missing'))
      .toEqual({ status: 'missing', paths: [] });
  });

  test('reports an installed target with no strong path', () => {
    const packageRecords = records({
      root: { other: { references: [{}] } },
      other: {},
      target: {},
    });
    expect(findPackageReasons(packageRecords, ['root'], 'target'))
      .toEqual({ status: 'no-path', paths: [] });
  });

  test('excludes meteor and isobuild dependencies', () => {
    const packageRecords = records({
      root: {
        meteor: { references: [{}] },
        'isobuild:features': { references: [{}] },
        target: { references: [{}] },
      },
      meteor: {},
      'isobuild:features': {},
      target: {},
    });
    expect(getStrongDependencies(packageRecords.root)).toEqual(['target']);
  });
});
