const path = require('path');
const os = require('os');
const fs = require('fs');
const { keepOutsideContexts } = require('./clean');

describe('Rspack output cleanup ownership', () => {
  let root;
  let outputPath;

  function writeFile(filename, content = 'generated') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content);
  }

  function linkDirectory(target, link) {
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-clean-'));
    outputPath = path.join(root, 'build', 'build-agent', 'app', 'private');
    fs.mkdirSync(outputPath, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test.each([
    ['build-assets', 'build-chunks'],
    ['build-assets-test', 'build-chunks-test'],
    ['build-assets-local-secondary-app-test', 'build-chunks-local-secondary-app-test'],
    ['generated/assets', 'generated/chunks'],
  ])('cleans only %s and %s, with absolute or relative callbacks', (assets, chunks) => {
    writeFile(path.join(outputPath, assets, 'stale.svg'));
    writeFile(path.join(outputPath, chunks, 'stale.js'));
    const keep = keepOutsideContexts(outputPath, [assets, chunks]);
    const cases = [
      ['', false],
      [assets, false],
      [`${assets}/stale.svg`, false],
      [`${chunks}/stale.js`, false],
      ['ordinary.txt', true],
      ['build', true],
      ['build-notes/guide.txt', true],
      ['docs/build/guide.txt', true],
      [`${assets}-another-mode/keep.svg`, true],
      ['build-assets-local-unrelated/keep.svg', true],
      ['unrelated/build-chunks/stale.js', true],
      ['../private-neighbor/build-assets/keep.txt', true],
    ];
    for (const [file, expected] of cases) {
      for (const input of [file, path.resolve(outputPath, file)]) {
        expect({ input, keep: keep(input) }).toEqual({ input, keep: expected });
      }
    }
  });

  test('traverses a shared parent without cleaning a sibling context', () => {
    writeFile(path.join(outputPath, 'build-chunks/web.browser/stale.js'));
    const keep = keepOutsideContexts(outputPath, [
      'build-chunks/web.browser/assets', 'build-chunks/web.browser',
    ]);
    expect(keep(outputPath)).toBe(false);
    expect(keep(path.join(outputPath, 'build-chunks'))).toBe(false);
    expect(keep('build-chunks/web.browser/stale.js')).toBe(false);
    expect(keep('build-chunks/web.browser.legacy/keep.js')).toBe(true);
    expect(keep('build-chunks/web.cordova/keep.js')).toBe(true);
  });

  test('keeps files when no safe child context is configured', () => {
    const keep = keepOutsideContexts(outputPath, ['', '.', '..', '../public', null]);
    for (const input of [outputPath, 'ordinary.txt', '../public/keep.txt', null, 'bad\0path']) {
      expect({ input, keep: keep(input) }).toEqual({ input, keep: true });
    }
  });

  test.each([
    ['context root', 'build-assets', 'build-assets', false, 'keep.txt'],
    ['nested link', 'build-assets/linked', 'build-assets', true, 'keep.txt'],
    ['custom context parent', 'generated', 'generated/assets', false, 'assets/keep.txt'],
  ])('keeps a symlink at the %s and paths below it', (_name, linkPath, context, targetInsideOutput, child) => {
    const target = path.join(targetInsideOutput ? outputPath : root, 'source-assets');
    writeFile(path.join(target, child), 'source asset');
    linkDirectory(target, path.join(outputPath, linkPath));
    writeFile(path.join(outputPath, 'build-chunks/stale.js'));
    const keep = keepOutsideContexts(outputPath, [context, 'build-chunks']);

    for (const file of [linkPath, `${linkPath}/${child}`]) {
      expect(keep(file)).toBe(true);
      expect(keep(path.join(outputPath, file))).toBe(true);
    }
    expect(keep('build-chunks/stale.js')).toBe(false);
  });

  test('keeps a symlinked output root and its generated descendants', () => {
    const target = path.join(root, 'shared-public');
    writeFile(path.join(target, 'build-assets/keep.txt'), 'shared asset');
    fs.rmdirSync(outputPath);
    linkDirectory(target, outputPath);
    const keep = keepOutsideContexts(outputPath, ['build-assets']);

    expect(keep(outputPath)).toBe(true);
    expect(keep('build-assets/keep.txt')).toBe(true);
  });

  test('preserves an uninspectable path without disabling cleanup elsewhere', () => {
    const denied = path.join(outputPath, 'build-assets');
    writeFile(path.join(denied, 'keep.txt'));
    writeFile(path.join(outputPath, 'build-chunks/stale.js'));
    const lstat = fs.lstatSync;
    const spy = jest.spyOn(fs, 'lstatSync').mockImplementation((filename, ...args) => {
      if (filename === denied) throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      return lstat(filename, ...args);
    });
    try {
      const keep = keepOutsideContexts(outputPath, ['build-assets', 'build-chunks']);
      expect(keep('build-assets/keep.txt')).toBe(true);
      expect(keep('build-chunks/stale.js')).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  test('matches contexts segment-wise with win32 separators', () => {
    jest.isolateModules(() => {
      jest.doMock('path', () => jest.requireActual('path').win32);
      const win32 = jest.requireActual('path').win32;
      const spy = jest.spyOn(fs, 'lstatSync').mockImplementation(() => ({ isSymbolicLink: () => false }));
      try {
        const { keepOutsideContexts: keepWin32 } = require('./clean');
        const output = 'C:\\agent\\build\\app\\private';
        const keep = keepWin32(output, ['build-assets', 'build-chunks']);
        const cases = [
          ['', false],
          ['build-chunks\\0.js', false],
          ['build-chunks/0.js', false],
          ['build-assets\\stale.svg', false],
          ['ordinary.txt', true],
          ['docs\\build\\guide.txt', true],
          ['build-chunks-other\\keep.js', true],
          ['..\\public\\keep.txt', true],
        ];
        for (const [file, expected] of cases) {
          for (const input of [file, win32.resolve(output, file), win32.resolve(output, file).replaceAll('\\', '/')]) {
            expect({ input, keep: keep(input) }).toEqual({ input, keep: expected });
          }
        }
        expect(keep('D:\\other\\keep.txt')).toBe(true);
      } finally {
        spy.mockRestore();
        jest.dontMock('path');
      }
    });
  });
});
