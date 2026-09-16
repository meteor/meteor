// Test-only helpers that fabricate real WebAuthn responses in Node, so the
// server can be exercised end to end without a browser. Keys are genuine
// ECDSA P-256 keys from Web Crypto; the CBOR, COSE and DER encoders below
// cover only the fixed shapes an authenticator produces.
import { createHash, webcrypto } from 'crypto';

const { subtle } = webcrypto;

const sha256 = data => createHash('sha256').update(data).digest();
const base64url = data => Buffer.from(data).toString('base64url');

// --- Minimal CBOR encoder -------------------------------------------------

function cborHead(majorType, length) {
  const type = majorType << 5;
  if (length < 24) {
    return Buffer.from([type | length]);
  }
  if (length < 0x100) {
    return Buffer.from([type | 24, length]);
  }
  if (length < 0x10000) {
    const head = Buffer.alloc(3);
    head[0] = type | 25;
    head.writeUInt16BE(length, 1);
    return head;
  }
  const head = Buffer.alloc(5);
  head[0] = type | 26;
  head.writeUInt32BE(length, 1);
  return head;
}

const cborInt = value =>
  value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
const cborBytes = bytes => Buffer.concat([cborHead(2, bytes.length), bytes]);
const cborText = text => {
  const bytes = Buffer.from(text, 'utf8');
  return Buffer.concat([cborHead(3, bytes.length), bytes]);
};
const cborMap = entries =>
  Buffer.concat([cborHead(5, entries.length), ...entries.flat()]);

// COSE_Key for an ES256 (P-256) public key: kty EC2, alg -7, crv P-256.
const coseEc2PublicKey = (x, y) =>
  cborMap([
    [cborInt(1), cborInt(2)],
    [cborInt(3), cborInt(-7)],
    [cborInt(-1), cborInt(1)],
    [cborInt(-2), cborBytes(x)],
    [cborInt(-3), cborBytes(y)],
  ]);

// Attestation object with the `none` format: an empty attestation statement.
const noneAttestationObject = authData =>
  cborMap([
    [cborText('fmt'), cborText('none')],
    [cborText('attStmt'), cborMap([])],
    [cborText('authData'), cborBytes(authData)],
  ]);

// --- Authenticator data ----------------------------------------------------

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_BE = 0x08;
const FLAG_BS = 0x10;
const FLAG_AT = 0x40;

function authenticatorData({
  rpID,
  counter,
  userPresent = true,
  userVerified = true,
  backupEligible = false,
  backedUp = false,
  attested,
}) {
  let flags = 0;
  if (userPresent) flags |= FLAG_UP;
  if (userVerified) flags |= FLAG_UV;
  if (backupEligible) flags |= FLAG_BE;
  if (backedUp) flags |= FLAG_BS;
  if (attested) flags |= FLAG_AT;

  const signCount = Buffer.alloc(4);
  signCount.writeUInt32BE(counter, 0);

  const parts = [sha256(Buffer.from(rpID, 'utf8')), Buffer.from([flags]), signCount];
  if (attested) {
    const aaguid = Buffer.alloc(16);
    const credentialIdLength = Buffer.alloc(2);
    credentialIdLength.writeUInt16BE(attested.credentialId.length, 0);
    parts.push(aaguid, credentialIdLength, attested.credentialId, attested.coseKey);
  }
  return Buffer.concat(parts);
}

const clientDataJSON = ({ type, challenge, origin }) =>
  Buffer.from(
    JSON.stringify({ type, challenge, origin, crossOrigin: false }),
    'utf8'
  );

// Web Crypto returns raw r||s ECDSA signatures; WebAuthn carries ASN.1 DER.
function rawSignatureToDer(raw) {
  const half = raw.length / 2;
  const encodeInteger = bytes => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) {
      start += 1;
    }
    let body = bytes.subarray(start);
    if (body[0] & 0x80) {
      body = Buffer.concat([Buffer.from([0]), body]);
    }
    return Buffer.concat([Buffer.from([0x02, body.length]), body]);
  };
  const r = encodeInteger(Buffer.from(raw.subarray(0, half)));
  const s = encodeInteger(Buffer.from(raw.subarray(half)));
  const sequence = Buffer.concat([r, s]);
  return Buffer.concat([Buffer.from([0x30, sequence.length]), sequence]);
}

// --- Fake authenticator ----------------------------------------------------

// Creates a single-credential authenticator bound to `rpID` and `origin`.
// `register()` answers a registration challenge and `assert()` answers an
// authentication challenge with a real signature. Every option can be
// overridden to produce deliberately invalid responses.
export async function createTestAuthenticator({
  rpID,
  origin,
  transports = ['usb'],
}) {
  const keyPair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const rawPublicKey = Buffer.from(await subtle.exportKey('raw', keyPair.publicKey));
  const coseKey = coseEc2PublicKey(
    rawPublicKey.subarray(1, 33),
    rawPublicKey.subarray(33, 65)
  );
  const credentialId = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32)));
  const credentialIdBase64url = base64url(credentialId);
  let counter = 0;

  return {
    credentialId: credentialIdBase64url,
    transports,
    get counter() {
      return counter;
    },

    register({
      challenge,
      userVerified = true,
      backupEligible = false,
      backedUp = false,
      rpID: responseRpID = rpID,
      origin: responseOrigin = origin,
    }) {
      const authData = authenticatorData({
        rpID: responseRpID,
        counter,
        userVerified,
        backupEligible,
        backedUp,
        attested: { credentialId, coseKey },
      });
      return {
        id: credentialIdBase64url,
        rawId: credentialIdBase64url,
        type: 'public-key',
        response: {
          clientDataJSON: base64url(
            clientDataJSON({ type: 'webauthn.create', challenge, origin: responseOrigin })
          ),
          attestationObject: base64url(noneAttestationObject(authData)),
          transports,
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'cross-platform',
      };
    },

    // The signature counter increases on every call unless a value is forced.
    async assert({
      challenge,
      userHandle,
      userVerified = true,
      counter: forcedCounter,
      rpID: responseRpID = rpID,
      origin: responseOrigin = origin,
    }) {
      counter = forcedCounter === undefined ? counter + 1 : forcedCounter;
      const authData = authenticatorData({
        rpID: responseRpID,
        counter,
        userVerified,
      });
      const clientData = clientDataJSON({
        type: 'webauthn.get',
        challenge,
        origin: responseOrigin,
      });
      const rawSignature = Buffer.from(
        await subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          keyPair.privateKey,
          Buffer.concat([authData, sha256(clientData)])
        )
      );
      return {
        id: credentialIdBase64url,
        rawId: credentialIdBase64url,
        type: 'public-key',
        response: {
          clientDataJSON: base64url(clientData),
          authenticatorData: base64url(authData),
          signature: base64url(rawSignatureToDer(rawSignature)),
          ...(userHandle ? { userHandle } : {}),
        },
        clientExtensionResults: {},
      };
    },
  };
}
