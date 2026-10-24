const fs = require('fs');
const os = require('os');
const path = require('path');
const { RequireExternalsPlugin } = require('./RequireExtenalsPlugin');

describe('Meteor entry imports across Rspack rebuilds', () => {
  let directory;
  let filePath;
  let compile;
  const trailingImports = "import './client-blaze.js';\nimport './client-rspack.js';";

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-externals-'));
    filePath = path.join(directory, 'client-meteor.js');
    new RequireExternalsPlugin({
      filePath,
      enableGlobalPolyfill: false,
      lastImports: ['./client-blaze.js', './client-rspack.js'],
    }).apply({
      hooks: {
        done: {
          tap(options, callback) {
            compile = (externals = [], hasErrors = false) => callback({
              hasErrors: () => hasErrors,
              toJson: () => ({
                modules: externals.map(name => ({ name: `external "${name}"` })),
              }),
            });
          },
        },
      },
    });
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const read = () => fs.readFileSync(filePath, 'utf8');

  test('keeps templates before app startup when externals are added and removed', () => {
    compile(['meteor/templating']);
    compile(['meteor/templating', 'meteor/reactive-var']);
    expect(read()).toContain(trailingImports);
    expect(read().indexOf("require('meteor/reactive-var')"))
      .toBeLessThan(read().indexOf(trailingImports));

    compile(['meteor/templating']);
    expect(read()).not.toContain('meteor/reactive-var');
    expect(read()).toContain(trailingImports);
    const source = read();
    compile(['meteor/templating']);
    expect(read()).toBe(source);
  });

  test('upgrades an existing entry and removes its formerly eager HTML import', () => {
    fs.writeFileSync(filePath, `
// (function eagerExternalImports1() {
import '../../imports/route.html';
// })
// (function lastImports() {
import './client-rspack.js';
// })
`);
    compile();
    expect(read()).not.toContain('route.html');
    expect(read()).toContain(trailingImports);
    expect(read().match(/import '\.\/client-rspack\.js';/g)).toHaveLength(1);
  });

  test('preserves the last working entry when compilation fails', () => {
    compile(['meteor/templating']);
    const source = read();
    compile([], true);
    expect(read()).toBe(source);
  });

  test('restores ordered startup imports after the build directory is removed', () => {
    compile();
    fs.rmSync(directory, { recursive: true });

    compile();

    expect(read()).toContain(trailingImports);
  });
});
