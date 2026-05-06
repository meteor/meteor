// OpenPGP/MIME plugin for Nodemailer (RFC 3156)

import { Transform } from 'stream';
import crypto from 'crypto';
import * as openpgp from 'openpgp';

// Helpers

function findHeaderEnd(raw) {
  return raw.indexOf('\r\n\r\n');
}

function readHeaders(headerBlock) {
  const headers = [];
  for (const raw of headerBlock.split('\r\n')) {
    if (/^[ \t]/.test(raw) && headers.length > 0) {
      headers[headers.length - 1].value += ` ${raw.trim()}`;
    } else {
      const colon = raw.indexOf(':');
      if (colon > 0) {
        headers.push({
          name: raw.substring(0, colon),
          value: raw.substring(colon + 1).trim(),
        });
      }
    }
  }
  return headers;
}

function makeBoundary() {
  return `_M3_PGP_${crypto.randomBytes(12).toString('hex')}_`;
}

// Splits headers into message-level (From, To) and body-level (Content-Type, etc.)
function splitHeaders(headers) {
  const msg = [];
  const body = [];
  for (const h of headers) {
    if (/^content-(type|transfer-encoding)$/i.test(h.name)) {
      body.push(h);
    } else {
      msg.push(h);
    }
  }
  return { msgHeaders: msg, bodyHeaders: body };
}

function writeHeaders(headers) {
  return headers.map(h => `${h.name}: ${h.value}`).join('\r\n');
}

// Transform stream

export class PGPMimeTransform extends Transform {
  constructor({ signingKey, passphrase, encryptionKeys, shouldSign }) {
    super();
    this._signingKey = signingKey;
    this._passphrase = passphrase;
    this._encryptionKeys = encryptionKeys || [];
    this._shouldSign = shouldSign !== false;
    this._chunks = [];
    this._length = 0;
  }

  _transform(chunk, encoding, done) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
    this._chunks.push(buf);
    this._length += buf.length;
    done();
  }

  async _flush(done) {
    try {
      const raw = Buffer.concat(this._chunks, this._length);
      const result = await this._processMessage(raw.toString());
      this.push(Buffer.from(result));
      done();
    } catch (err) {
      done(err);
    }
  }

  async _processMessage(raw) {
    const splitAt = findHeaderEnd(raw);
    if (splitAt === -1) return raw;

    const headerBlock = raw.substring(0, splitAt);
    const bodyBlock = raw.substring(splitAt + 4);
    const headers = readHeaders(headerBlock);
    const { msgHeaders, bodyHeaders } = splitHeaders(headers);

    const pubKeys = await Promise.all(
      this._encryptionKeys.map(k => openpgp.readKey({ armoredKey: String(k) }))
    );

    const shouldSign = this._shouldSign && this._signingKey != null;
    let signingKey = null;
    if (shouldSign) {
      signingKey = await openpgp.readPrivateKey({
        armoredKey: String(this._signingKey),
      });
      if (this._passphrase) {
        signingKey = await openpgp.decryptKey({
          privateKey: signingKey,
          passphrase: this._passphrase,
        });
      }
    }

    const doEncrypt = pubKeys.length > 0;
    const doSign = shouldSign && signingKey != null;

    if (!doEncrypt && !doSign) return raw;

    const inner =
      bodyHeaders.length > 0
        ? `${writeHeaders(bodyHeaders)}\r\n\r\n${bodyBlock}`
        : bodyBlock;

    if (doEncrypt) {
      return this._buildEncrypted(msgHeaders, inner, pubKeys, doSign ? signingKey : null);
    }
    return this._buildSigned(msgHeaders, inner, signingKey);
  }

  // RFC 3156 §4 — multipart/encrypted

  async _buildEncrypted(msgHeaders, inner, pubKeys, signingKey) {
    const boundary = makeBoundary();
    const message = await openpgp.createMessage({ text: inner });

    const encOpts = { message, encryptionKeys: pubKeys };
    if (signingKey) encOpts.signingKeys = signingKey;

    const ciphertext = await openpgp.encrypt(encOpts);

    const body = [
      'This is an OpenPGP/MIME encrypted message',
      '',
      `--${boundary}`,
      'Content-Type: application/pgp-encrypted',
      'Content-Transfer-Encoding: 7bit',
      '',
      'Version: 1',
      '',
      `--${boundary}`,
      'Content-Type: application/octet-stream; name="encrypted.asc"',
      'Content-Disposition: inline; filename="encrypted.asc"',
      'Content-Transfer-Encoding: 7bit',
      '',
      ciphertext,
      `--${boundary}--`,
    ].join('\r\n');

    const headerLines = [
      writeHeaders(msgHeaders),
      `Content-Type: multipart/encrypted; protocol="application/pgp-encrypted"; boundary="${boundary}"`,
      'Content-Description: OpenPGP encrypted message',
      'Content-Transfer-Encoding: 7bit',
    ].join('\r\n');

    return `${headerLines}\r\n\r\n${body}`;
  }

  // RFC 3156 §5 — multipart/signed

  async _buildSigned(msgHeaders, inner, signingKey) {
    const boundary = makeBoundary();
    const message = await openpgp.createMessage({ text: inner });

    const signResult = await openpgp.sign({
      message,
      signingKeys: signingKey,
      detached: true,
      format: 'armored',
    });

    // Read the hash algo from the signature for the micalg parameter (RFC 3156 §5)
    let micalg = 'pgp-sha512'; // safe default
    try {
      const sigObj = await openpgp.readSignature({
        armoredSignature: typeof signResult === 'string' ? signResult : signResult,
      });
      const hashAlgo = sigObj.packets[0]?.hashAlgorithm;
      if (hashAlgo) {
        const name = openpgp.enums.read(openpgp.enums.hash, hashAlgo).toLowerCase();
        micalg = `pgp-${name}`;
      }
    } catch {
      // fall through with default
    }

    // RFC 3156 §5: signed data must end with CRLF; the CRLF before the
    // boundary delimiter is part of the delimiter, so we emit an extra one.
    const body = [
      `--${boundary}`,
      inner,
      '',
      `--${boundary}`,
      'Content-Type: application/pgp-signature',
      'Content-Disposition: inline; filename="signature.asc"',
      '',
      signResult,
      `--${boundary}--`,
    ].join('\r\n');

    const headerLines = [
      writeHeaders(msgHeaders),
      `Content-Type: multipart/signed; protocol="application/pgp-signature"; micalg=${micalg}; boundary="${boundary}"`,
      'Content-Description: OpenPGP signed message',
    ].join('\r\n');

    return `${headerLines}\r\n\r\n${body}`;
  }
}

// Nodemailer plugin

/**
 * Nodemailer 'stream' plugin for OpenPGP encryption/signing.
 *
 *   transport.use('stream', openpgpEncrypt({ signingKey, passphrase }));
 *   transport.sendMail({ encryptionKeys: [pubKey], shouldSign: true });
 */
export function openpgpEncrypt(options) {
  return function handleStream(mail, done) {
    const hasPluginKey = !!(options && options.signingKey);
    const mailKeys = mail.data.encryptionKeys;
    const hasMailKeys =
      Array.isArray(mailKeys) && mailKeys.length > 0;
    const wantsSign = hasPluginKey && mail.data.shouldSign !== false;

    if (!hasMailKeys && !wantsSign) {
      return setImmediate(done);
    }

    mail.message.transform(() => {
      return new PGPMimeTransform({
        signingKey: options && options.signingKey,
        passphrase: options && options.passphrase,
        encryptionKeys: mail.data.encryptionKeys,
        shouldSign: mail.data.shouldSign,
      });
    });

    setImmediate(done);
  };
}
