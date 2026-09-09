const VALID_DDP_TRANSPORTS = Object.freeze(['sockjs', 'uws', 'both']);

function normalizeDdpTransport(value) {
  if (value === undefined) {
    return 'both';
  }
  if (!VALID_DDP_TRANSPORTS.includes(value)) {
    throw new Error(
      `Invalid DDP transport "${String(value)}". Valid values: sockjs, uws, both.`
    );
  }
  return value;
}

function getExcludedDdpTransportPackages(value) {
  switch (normalizeDdpTransport(value)) {
    case 'sockjs':
      return ['ddp-transport-uws'];
    case 'uws':
      return ['ddp-transport-sockjs'];
    default:
      return [];
  }
}

module.exports = {
  VALID_DDP_TRANSPORTS,
  normalizeDdpTransport,
  getExcludedDdpTransportPackages,
};
