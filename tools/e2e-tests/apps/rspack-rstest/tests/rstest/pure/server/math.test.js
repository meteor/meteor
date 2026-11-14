import { describeToolchain } from './coverage-target.js';

test('pure Rstest uses Meteor-generated context', () => {
  expect(process.env.METEOR_RSTEST_COMMAND).toBe('test');
  expect(process.env.METEOR_RSTEST_APP_ROOT).toMatch(/rspack-rstest/);
  expect(process.env.METEOR_RSTEST_SERVER).toBe('true');
  expect(process.env.METEOR_RSTEST_CLIENT).toBe('false');
  expect(process.env.METEOR_RSTEST_ARCHITECTURES).toMatch(/^os\./);
});

test('pure Rstest supports inline snapshots', () => {
  expect({ compiler: 'rspack', runner: 'rstest' }).toMatchInlineSnapshot(`
    {
      "compiler": "rspack",
      "runner": "rstest",
    }
  `);
});

test('pure Rstest supports committed external snapshots', () => {
  expect({
    compiler: '@rspack/core@2.1.8',
    integration: '@meteorjs/rstest',
    runner: '@rstest/core@0.11.6',
  }).toMatchSnapshot();
});

test('pure Rstest supports committed file snapshots', async () => {
  await expect('Rspack 2.1.8\nRstest 0.11.6\n').toMatchFileSnapshot(
    '../../snapshots/toolchain.txt',
  );
});

test('pure Rstest coverage instruments imported Rspack source', () => {
  expect(describeToolchain()).toBe('Rspack + Rstest');
});
