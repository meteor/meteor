// Replace the heavy modules examples.js loads with small fakes
jest.mock('../fs/files', () => ({
  pathJoin: (...parts) => parts.join('/'),
  convertToOSPath: (p) => p,
  statOrNull: jest.fn(),
}));
jest.mock('../utils/http-helpers.js', () => ({}));
jest.mock('../console/console.js', () => ({ Console: { warn: jest.fn() } }));

const files = require('../fs/files');
const { validateMeteorApp } = require('./examples.js');

describe('validateMeteorApp', () => {
  beforeEach(() => files.statOrNull.mockReset());

  it('accepts a .meteor directory', () => {
    files.statOrNull.mockReturnValue({ isDirectory: () => true });
    expect(() => validateMeteorApp('/fake-app')).not.toThrow();
    expect(files.statOrNull).toHaveBeenCalledWith('/fake-app/.meteor');
  });

  it('rejects a missing .meteor path', () => {
    files.statOrNull.mockReturnValue(null);
    expect(() => validateMeteorApp('/fake-app')).toThrow('is not a Meteor app');
  });

  it('rejects a regular file named .meteor', () => {
    files.statOrNull.mockReturnValue({ isDirectory: () => false });
    expect(() => validateMeteorApp('/fake-app')).toThrow('is not a Meteor app');
  });
});
