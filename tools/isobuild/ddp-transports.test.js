const {
  normalizeDdpTransport,
  getExcludedDdpTransportPackages,
} = require('./ddp-transports.js');

describe('build-time DDP transport selection', () => {
  test('defaults to both providers when omitted', () => {
    expect(normalizeDdpTransport()).toBe('both');
  });

  test.each(['sockjs', 'uws', 'both'])('accepts %s exactly', value => {
    expect(normalizeDdpTransport(value)).toBe(value);
  });

  test.each(['websocket', '', 'SockJS', ' uws ', null, false, 0])(
    'rejects invalid value %p with the valid choices', value => {
      expect(() => normalizeDdpTransport(value)).toThrow(
        new Error(`Invalid DDP transport "${value}". Valid values: sockjs, uws, both.`)
      );
    }
  );

  test.each([
    [undefined, []],
    ['both', []],
    ['sockjs', ['ddp-transport-uws']],
    ['uws', ['ddp-transport-sockjs']],
  ])('excludes only the unselected provider for %p', (value, excluded) => {
    expect(getExcludedDdpTransportPackages(value)).toEqual(excluded);
  });
});
