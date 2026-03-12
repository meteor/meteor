jest.mock('./archinfo', () => ({
  host: jest.fn(() => 'os.osx.x86_64'),
  matches: jest.fn((host, pattern) => host.startsWith(pattern)),
}));

jest.mock('./buildmessage.js', () => ({
  error: jest.fn(),
}));

jest.mock('../fs/files', () => ({
  stat: jest.fn(),
  inCheckout: jest.fn(() => true),
  getToolsVersion: jest.fn(() => '3.0.0'),
  getCurrentToolsDir: jest.fn(() => '/mock/tools'),
  convertToOSPath: jest.fn(p => p),
  pathJoin: jest.fn((...args) => args.join('/')),
}));

jest.mock('../packaging/package-version-parser.js', () => ({
  parsePackageConstraint: jest.fn(),
  validatePackageName: jest.fn((name) => {
    if (name === 'INVALID') {
      const err = new Error('bad package name');
      err.versionParserError = true;
      throw err;
    }
  }),
  parse: jest.fn((version) => {
    if (version === 'bad') {
      const err = new Error('bad version');
      err.versionParserError = true;
      throw err;
    }
    return version;
  }),
}));

const utils = require('./utils');
const buildmessage = require('./buildmessage.js');

describe('parseUrl', () => {
  test.each([
    ['3000', {}, { port: '3000', hostname: undefined, protocol: undefined }],
    ['4000', { hostname: 'h', protocol: 'https' }, { port: '4000', hostname: 'h', protocol: 'https' }],
    ['localhost', {}, { hostname: 'localhost' }],
    ['localhost:3000', {}, { hostname: 'localhost', port: '3000', protocol: undefined }],
    ['https://ex.com:8080/path', {}, { protocol: 'https', hostname: 'ex.com', port: '8080', pathname: '/path' }],
    ['ex.com:3000', { protocol: 'https' }, { protocol: 'https', hostname: 'ex.com', port: '3000' }],
    ['http://ex.com', { protocol: 'https' }, { protocol: 'http', hostname: 'ex.com' }],
    ['http://ex.com', { port: '9999' }, { protocol: 'http', hostname: 'ex.com', port: '9999' }],
  ])('parseUrl(%s) with defaults %j', (input, defaults, expected) => {
    const result = utils.parseUrl(input, defaults);
    expect(result).toMatchObject(expected);
  });

  test('excludes pathname for root path', () => {
    expect(utils.parseUrl('http://ex.com/').pathname).toBeUndefined();
  });
});

describe('hasScheme', () => {
  test.each([
    ['http://x', true], ['https://x', true], ['git+ssh://x', true],
    ['my2proto://x', true], ['example.com', false], ['3000', false],
    ['http:x', false], ['2http://x', false],
  ])('(%s) = %s', (input, expected) => {
    expect(!!utils.hasScheme(input)).toBe(expected);
  });
});

describe('isIPv4Address', () => {
  test.each([
    ['192.168.1.1', true], ['0.0.0.0', true], ['255.255.255.255', true],
    ['localhost', false], ['192.168.1', false], ['::1', false], ['1.2.3.4.5', false],
  ])('(%s) = %s', (input, expected) => {
    expect(!!utils.isIPv4Address(input)).toBe(expected);
  });
});

describe('validEmail', () => {
  test.each([
    ['user@example.com', true], ['a.b@mail.co.uk', true],
    ['user+tag@example.com', true], ['a@my-host.com', true],
    ['userexample.com', false], ['user@', false], ['@example.com', false],
    ['us er@x.com', false], ['', false], ['u@x.c', false],
  ])('(%s) = %s', (input, expected) => {
    expect(utils.validEmail(input)).toBe(expected);
  });
});

describe('quotemeta', () => {
  test.each([
    ['a.b*c+d?e', 'a\\.b\\*c\\+d\\?e'],
    ['[a](b)\\c', '\\[a\\]\\(b\\)\\\\c'],
    ['abc123', 'abc123'],
  ])('(%s) = %s', (input, expected) => {
    expect(utils.quotemeta(input)).toBe(expected);
  });

  test('escaped string works as literal RegExp', () => {
    const s = 'price: $100 (USD)';
    expect(new RegExp(utils.quotemeta(s)).test(s)).toBe(true);
  });
});

describe('defaultOrderKeyForReleaseVersion', () => {
  test.each([
    ['1.2.3', '0001.0002.0003$'],
    ['5', '0005$'],
    ['1.2.3.4', '0001.0002.0003.0004$'],
    ['1.0-beta', '0001.0000!beta!!!!!!!!!!!$'],
    ['1.0-beta.rc3', '0001.0000!beta.rc!!!!!!!!0003$'],
  ])('(%s) = %s', (input, expected) => {
    expect(utils.defaultOrderKeyForReleaseVersion(input)).toBe(expected);
  });

  test('prerelease key contains ! and tag, ends with $', () => {
    const key = utils.defaultOrderKeyForReleaseVersion('1.0-rc1');
    expect(key).toMatch(/!.*rc.*\$$/);
  });

  test('sort order: prerelease < release, 1.2 < 1.2.3, 2 < 10', () => {
    const k = (v) => utils.defaultOrderKeyForReleaseVersion(v);
    expect(k('1.0-rc1') < k('1.0')).toBe(true);
    expect(k('1.2') < k('1.2.3')).toBe(true);
    expect(k('2') < k('10')).toBe(true);
  });

  test.each([
    'abc', '01.2.3', '1.02.3', '1.0-rc01', '12345', '',
  ])('returns null for invalid input: %s', (input) => {
    expect(utils.defaultOrderKeyForReleaseVersion(input)).toBeNull();
  });
});

describe('generateSubsetsOfIncreasingSize', () => {
  test('enumerates all subsets in order and supports early stop', () => {
    const all = [];
    utils.generateSubsetsOfIncreasingSize([1, 2, 3], (s) => { all.push([...s]); });
    expect(all).toEqual([[], [1], [2], [3], [1, 2], [1, 3], [2, 3], [1, 2, 3]]);

    const stopped = [];
    utils.generateSubsetsOfIncreasingSize([1, 2, 3], (s) => {
      stopped.push([...s]);
      return s.length === 2;
    });
    expect(stopped).toEqual([[], [1], [2], [3], [1, 2]]);
  });

  test('empty array yields only the empty subset', () => {
    const r = [];
    utils.generateSubsetsOfIncreasingSize([], (s) => { r.push([...s]); });
    expect(r).toEqual([[]]);
  });
});

describe('URL scheme matchers', () => {
  test.each([
    ['isUrlWithFileScheme', 'file:///path', true],
    ['isUrlWithFileScheme', 'file://host/path', true],
    ['isUrlWithFileScheme', 'file://', false],
    ['isUrlWithFileScheme', 'http://x', false],
    ['isUrlWithSha', `https://x/${'a'.repeat(40)}`, true],
    ['isUrlWithSha', `http://x/${'b'.repeat(40)}`, true],
    ['isUrlWithSha', 'https://x/abc123', false],
    ['isUrlWithSha', 'not-a-url', false],
    ['isNpmUrl', 'git://github.com/r', true],
    ['isNpmUrl', 'git+ssh://git@github.com/r', true],
    ['isNpmUrl', 'git+http://github.com/r', true],
    ['isNpmUrl', 'git+https://github.com/r', true],
    ['isNpmUrl', 'https://x/pkg', true],
    ['isNpmUrl', 'http://x/pkg', true],
    ['isNpmUrl', 'lodash', false],
  ])('%s(%s) = %s', (fn, input, expected) => {
    expect(!!utils[fn](input)).toBe(expected);
  });
});

describe('sourceMapLength', () => {
  test.each([
    [null, 0],
    [undefined, 0],
    [{ mappings: 'AAAA' }, 4],
    [{ mappings: 'ABC', sourcesContent: ['hello', 'world'] }, 13],
    [{ mappings: 'AB', sourcesContent: [null, 'code', null] }, 6],
  ])('sourceMapLength(%j) = %s', (input, expected) => {
    expect(utils.sourceMapLength(input)).toBe(expected);
  });
});

describe('parsePackageAndVersion', () => {
  test.each([
    ['my-pkg 1.0.0', { package: 'my-pkg', version: '1.0.0' }],
    ['my-pkg@2.0.0', { package: 'my-pkg', version: '2.0.0' }],
    ['user:pkg 1.0.0', { package: 'user:pkg', version: '1.0.0' }],
  ])('parses %s', (input, expected) => {
    expect(utils.parsePackageAndVersion(input)).toEqual(expected);
  });

  test('throws for missing separator or invalid version', () => {
    expect(() => utils.parsePackageAndVersion('noseparator')).toThrow('Malformed package version');
    expect(() => utils.parsePackageAndVersion('pkg bad')).toThrow();
  });

  test('returns null with useBuildmessage on malformed input', () => {
    buildmessage.error.mockClear();
    expect(utils.parsePackageAndVersion('noseparator', { useBuildmessage: true })).toBeNull();
    expect(buildmessage.error).toHaveBeenCalled();
  });
});
