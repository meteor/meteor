const selftest = require('../tool-testing/selftest.js');
const { ProjectContext } = require('../project-context.js');
const { loadIsopackage } = require('../tool-env/isopackets.js');

selftest.define(
  'release constraints preserve minimum wrap versions',
  async function () {
    const { ConstraintSolver } = await loadIsopackage('constraint-solver');
    const constraints = { constraints: [] };
    ProjectContext.prototype._addReleaseConstraints.call(
      {
        _releaseForConstraints: { packages: { 'security-helper': '1.2.3_2' } },
      },
      constraints,
    );

    const admitted = (version) =>
      constraints.constraints.every((constraint) =>
        ConstraintSolver.isConstraintSatisfied(
          'security-helper',
          constraint.versionConstraint,
          version,
        ),
      );
    for (const version of ['1.2.3', '1.2.3_1', '1.3.0']) {
      await selftest.expectEqual(admitted(version), false);
    }
    for (const version of ['1.2.3_2', '1.2.3_3', '1.2.4']) {
      await selftest.expectEqual(admitted(version), true);
    }

    const records = [
      {
        packageName: 'app',
        version: '1.0.0',
        dependencies: {
          'security-helper': {
            constraint: '1.2.3',
            references: [{ arch: 'os' }],
          },
        },
      },
      ...['1.2.3', '1.2.3_1', '1.2.3_2', '1.2.4', '1.3.0'].map((version) => ({
        packageName: 'security-helper',
        version,
        dependencies: {},
      })),
    ];
    const resolver = new ConstraintSolver.PackagesResolver({
      getSortedVersionRecords: (name) =>
        records.filter((record) => record.packageName === name),
      getVersion: (name, version) =>
        records.find(
          (record) => record.packageName === name && record.version === version,
        ),
    });
    const resolved = await resolver.resolve(['app'], constraints.constraints, {
      previousSolution: { app: '1.0.0', 'security-helper': '1.2.3' },
    });
    await selftest.expectEqual(resolved.answer['security-helper'], '1.2.3_2');
    const updated = await resolver.resolve(['app'], constraints.constraints, {
      previousSolution: resolved.answer,
      upgrade: ['security-helper'],
    });
    await selftest.expectEqual(updated.answer['security-helper'], '1.2.4');
  },
);
