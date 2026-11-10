// Dependency-free replacement for the parts of forwarded-http@0.3.0
// (https://github.com/ahmadnassri/forwarded-http, MIT) that this package uses:
// the request protocol (`proto`) and the client/proxy addresses (`for`).
//
// For well-formed headers it returns what forwarded-http returned, including
// its header precedence, its lenient RFC 7239 parsing and its address
// filtering, so isLocalConnection and isSslConnection keep their behavior.
// It deliberately differs where forwarded-http threw or stalled on crafted
// headers, which crashed or blocked the server from a single request:
// - `Forwarded: __proto__=x` and a non-string `scheme` in `CF-Visitor` threw
//   a TypeError; they are now ignored.
// - Forwarded `for=` values were matched with ip-port-regex, which
//   backtracked exponentially on input such as `for=[1:1:1:...x`; long space
//   runs also split in quadratic time. Both are now linear.

// Headers that carry a protocol, in forwarded-http's order: a later header
// overrides an earlier one, and Forwarded `proto=` overrides all of them.
const PROTO_HEADERS = [
  'x-forwarded-proto',
  'x-forwarded-protocol',
  'z-forwarded-proto',
  'z-forwarded-protocol',
  'x-real-proto',
  'x-url-scheme',
];

// Headers that carry a comma-separated list of addresses.
const ADDRESS_HEADERS = [
  'x-forwarded-for',
  'z-forwarded-for',
  'fastly-client-ip',
  'x-real-ip',
  'x-cluster-client-ip',
  'cf-connecting-ip',
];

const SPACE = 32;
const COLON = 58;

// Same result as `value.split(new RegExp(` *${separator} *`))`, without the
// regular expression's quadratic backtracking on long runs of spaces.
const splitTrimmingSpaces = (value, separator) => {
  const parts = value.split(separator);
  return parts.map((part, index) => {
    let start = 0;
    let end = part.length;
    if (index > 0) {
      while (start < end && part.charCodeAt(start) === SPACE) start++;
    }
    if (index < parts.length - 1) {
      while (end > start && part.charCodeAt(end - 1) === SPACE) end--;
    }
    return part.slice(start, end);
  });
};

const isHexDigit = code =>
  (code >= 48 && code <= 57) ||
  (code >= 65 && code <= 70) ||
  (code >= 97 && code <= 102);

const isHexOrColon = code => code === COLON || isHexDigit(code);

// The IPv4 and IPv6 patterns of ip-regex@1.0.3, which ip-port-regex used.
const IPV4 =
  '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])' +
  '(?:\\.(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])){3}';
const IPV6 =
  '(?:(?:[0-9a-fA-F:]){1,4}(?:(?::(?:[0-9a-fA-F]){1,4}|:)){2,7})+';
const IPV4_AT = new RegExp(IPV4, 'y');
const IPV6_AT = new RegExp(IPV6, 'y');

// Whether all of `value` matches IPV6. Matching `\[(IPV6)\]` with the regular
// expression backtracks exponentially when the closing bracket is missing, so
// this runs the same pattern as a state machine, in linear time. IPV6 is a
// sequence of chunks; a chunk is 1-4 hex/colon characters followed by 2-7
// groups, and a group is ":" followed by 0-4 hex digits.
const isFullIpv6Match = value => {
  // Prefix states hold the chunk prefix length (0 = a chunk may start here).
  // Group states hold group * 8 + hex digits read in that group.
  let prefixStates = new Set([0]);
  let groupStates = new Set();
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (!isHexOrColon(code)) return false;
    const nextPrefixStates = new Set();
    const nextGroupStates = new Set();
    prefixStates.forEach(length => {
      if (length < 4) nextPrefixStates.add(length + 1);
      if (length > 0 && code === COLON) nextGroupStates.add(1 * 8);
    });
    groupStates.forEach(state => {
      const group = Math.floor(state / 8);
      const digits = state % 8;
      if (digits < 4 && isHexDigit(code)) nextGroupStates.add(state + 1);
      if (group < 7 && code === COLON) nextGroupStates.add((group + 1) * 8);
      // A chunk is complete after 2 groups, so this character may start the
      // next chunk's prefix.
      if (group >= 2) nextPrefixStates.add(1);
    });
    prefixStates = nextPrefixStates;
    groupStates = nextGroupStates;
  }
  return [...groupStates].some(state => state >= 2 * 8);
};

// The address ip-port-regex's `parts(node).ip` found: the leftmost bracketed
// IPv6 address, bare IPv6 address or IPv4 address, in that order of preference
// at each position. Returns null when there is none.
const findAddress = node => {
  for (let index = 0; index < node.length; index++) {
    if (node.charCodeAt(index) === 91 /* [ */) {
      let end = index + 1;
      while (end < node.length && isHexOrColon(node.charCodeAt(end))) end++;
      const candidate = node.slice(index + 1, end);
      if (
        node.charCodeAt(end) === 93 /* ] */ &&
        candidate &&
        isFullIpv6Match(candidate)
      ) {
        return candidate;
      }
    }
    for (const pattern of [IPV6_AT, IPV4_AT]) {
      pattern.lastIndex = index;
      const match = pattern.exec(node);
      if (match) return match[0];
    }
  }
  return null;
};

// forwarded-http's lenient RFC 7239 parser, keeping only `for` and `proto`.
// A repeated parameter becomes an array of values.
const parseForwardedHeader = value => {
  const params = { for: undefined, proto: undefined };
  splitTrimmingSpaces(value, ';').forEach(element => {
    splitTrimmingSpaces(element, ',').forEach(part => {
      const pair = part.split('=');
      const name = pair[0].toLowerCase();
      if (!pair[1] || (name !== 'for' && name !== 'proto')) return;
      const paramValue = pair[1].replace(/"/g, '');
      const current = params[name];
      if (current === undefined) {
        params[name] = paramValue;
      } else if (typeof current === 'string') {
        params[name] = [current, paramValue];
      } else {
        current.push(paramValue);
      }
    });
  });
  if (typeof params.for === 'string') params.for = [params.for];
  return params;
};

const protoFromSpecialHeaders = headers => {
  if (headers['front-end-https'] === 'on') return 'https';
  if (headers['x-forwarded-ssl'] === 'on') return 'https';
  if (headers['fastly-ssl'] === '1' || headers['fastly-ssl'] === 'true') {
    return 'https';
  }
  if (headers['cf-visitor']) {
    try {
      const visitor = JSON.parse(headers['cf-visitor']);
      if (visitor && typeof visitor.scheme === 'string' && visitor.scheme) {
        return visitor.scheme;
      }
    } catch (e) {
      // Ignore a malformed CF-Visitor header, as forwarded-http did.
    }
  }
  return false;
};

// Returns `{ proto, for }` like forwarded-http: `proto` is a string (or an
// array when Forwarded repeats `proto=`), and the keys of `for` are the
// connection's remote address plus every address reported by the headers.
const forwarded = req => {
  const headers = req.headers || {};
  let proto = req.connection.encrypted ? 'https' : 'http';
  const addresses = {};
  addresses[req.connection.remoteAddress] = true;

  if (Object.keys(headers).length === 0) {
    return { proto, for: addresses };
  }

  PROTO_HEADERS.forEach(name => {
    if (headers[name]) proto = headers[name];
  });
  const specialProto = protoFromSpecialHeaders(headers);
  if (specialProto) proto = specialProto;

  ADDRESS_HEADERS.forEach(name => {
    if (typeof headers[name] !== 'string' || !headers[name]) return;
    splitTrimmingSpaces(headers[name], ',').forEach(address => {
      addresses[address] = true;
    });
  });

  if (typeof headers.forwarded === 'string' && headers.forwarded) {
    const params = parseForwardedHeader(headers.forwarded);
    (params.for || []).forEach(node => {
      const address = findAddress(node);
      addresses[address === null ? node : address] = true;
    });
    if (params.proto) proto = params.proto;
  }

  // forwarded-http dropped addresses that do not match the glob `*`: empty,
  // starting with ".", containing "/", or starting with a line break.
  Object.keys(addresses).forEach(address => {
    if (!/^(?!\.)(?=.)[^/]*$/.test(address)) delete addresses[address];
  });

  return { proto, for: addresses };
};

export default forwarded;
