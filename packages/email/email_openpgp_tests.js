import nodemailer from 'nodemailer';
import * as openpgp from 'openpgp';
import { Email } from 'meteor/email';
import { PGPMimeTransform, openpgpEncrypt } from './openpgp-encrypt';

await (async () => {
const PRIVATE_KEY_2048 = await Assets.getTextAsync('test/fixtures/test_private_2048bit.key');
const PRIVATE_KEY_1024 = await Assets.getTextAsync('test/fixtures/test_private_1024bit.key');
const PUBLIC_KEY = await Assets.getTextAsync('test/fixtures/test_public.pem');
const PASSPHRASE = 'hello world';

// Builds a stream-based transport, registers the openpgpEncrypt plugin, sends
// a mail and resolves with the raw MIME output as a string.
const sendThroughStreamTransport = (pluginOptions, mailOptions) => {
  return new Promise((resolve, reject) => {
    const transport = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
    transport.use('stream', openpgpEncrypt(pluginOptions));
    transport.sendMail(mailOptions, (err, info) => {
      if (err) {
        return reject(err);
      }
      resolve(info.message.toString());
    });
  });
};

Tinytest.addAsync(
  'email - openpgp - encrypter produces an encrypted message',
  async function (test) {
    const mail =
      'From: andris@node.ee\r\n' +
      'To:andris@kreata.ee\r\n' +
      'Subject:\r\n Hello!\r\n' +
      'Content-Type: text/plain\r\n\r\n' +
      'Hello world!';

    const pgpTransform = new PGPMimeTransform({
      signingKey: PRIVATE_KEY_2048,
      passphrase: PASSPHRASE,
      encryptionKeys: [PUBLIC_KEY],
    });

    const result = await new Promise((resolve, reject) => {
      const chunks = [];
      pgpTransform.on('data', chunk => chunks.push(chunk));
      pgpTransform.on('error', reject);
      pgpTransform.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      pgpTransform.end(mail);
    });

    test.isTrue(
      result.indexOf('This is an OpenPGP/MIME encrypted message') >= 0,
      'output should contain the OpenPGP/MIME encryption marker'
    );
  }
);

Tinytest.addAsync(
  'email - openpgp - encrypts when keys are provided per mail',
  async function (test) {
    const message = await sendThroughStreamTransport(
      {
        signingKey: PRIVATE_KEY_2048,
        passphrase: PASSPHRASE,
      },
      {
        from: 'sender@example.com',
        to: 'receiver@example.com',
        subject: 'hello world!',
        text: 'Hello text!',
        html: 'Hello html!',
        encryptionKeys: [PUBLIC_KEY],
      }
    );

    test.isTrue(
      message.indexOf('This is an OpenPGP/MIME encrypted message') >= 0,
      'output should be encrypted when encryptionKeys is set on the mail'
    );
  }
);

Tinytest.addAsync(
  'email - openpgp - does not encrypt when no keys are provided',
  async function (test) {
    const message = await sendThroughStreamTransport(
      {},
      {
        from: 'sender@example.com',
        to: 'receiver@example.com',
        subject: 'hello world!',
        text: 'Hello text!',
        html: 'Hello html!',
      }
    );

    test.equal(
      message.indexOf('This is an OpenPGP/MIME encrypted message'),
      -1,
      'output should not be encrypted when no keys are provided'
    );
  }
);

Tinytest.addAsync(
  'email - openpgp - signs only when no encryption keys are provided',
  async function (test) {
    const message = await sendThroughStreamTransport(
      {
        signingKey: PRIVATE_KEY_2048,
        passphrase: PASSPHRASE,
      },
      {
        from: 'sender@example.com',
        to: 'receiver@example.com',
        subject: 'hello world!',
        text: 'Hello text!',
        html: 'Hello html!',
      }
    );

    test.isTrue(
      message.indexOf('Content-Description: OpenPGP signed message') >= 0,
      'output should contain the OpenPGP signed message marker'
    );
  }
);

Tinytest.addAsync(
  'email - openpgp - shouldSign:false disables signing',
  async function (test) {
    const message = await sendThroughStreamTransport(
      {
        signingKey: PRIVATE_KEY_2048,
        passphrase: PASSPHRASE,
      },
      {
        from: 'sender@example.com',
        to: 'receiver@example.com',
        subject: 'hello world!',
        text: 'Hello text!',
        html: 'Hello html!',
        shouldSign: false,
      }
    );

    test.equal(
      message.indexOf('Content-Description: OpenPGP signed message'),
      -1,
      'output should not be signed when shouldSign is false'
    );
  }
);

Tinytest.addAsync(
  'email - openpgp - rejects weak signing keys',
  async function (test) {
    let caught = null;
    try {
      await sendThroughStreamTransport(
        {
          signingKey: PRIVATE_KEY_1024,
          passphrase: PASSPHRASE,
        },
        {
          from: 'sender@example.com',
          to: 'receiver@example.com',
          subject: 'hello world!',
          text: 'Hello text!',
          html: 'Hello html!',
          encryptionKeys: [PUBLIC_KEY],
        }
      );
    } catch (err) {
      caught = err;
    }

    test.isNotNull(caught, 'sendMail should reject when the signing key is too weak');
    test.isTrue(
      caught && caught.toString().indexOf('RSA keys shorter than 2047 bits are considered too weak') >= 0,
      'error message should mention the weak-key rejection'
    );
  }
);

// ── Full-stack integration tests (Email.sendAsync + nodemailer + plugin) ──

// Derive a self-encrypt key for round-trip tests.
// The fixture keys are NOT a pair — PUBLIC_KEY is a recipient key,
// PRIVATE_KEY_2048 is a sender key. For decrypt tests we encrypt
// to the private key's own public key so we can decrypt it back.
const SELF_PUBLIC_KEY = (async () => {
  const privKey = await openpgp.readPrivateKey({
    armoredKey: PRIVATE_KEY_2048,
  });
  const decrypted = await openpgp.decryptKey({
    privateKey: privKey,
    passphrase: PASSPHRASE,
  });
  return decrypted.toPublic().armor();
})();

Tinytest.addAsync(
  'email - openpgp - Email.sendAsync encrypts through the full stack',
  async function (test) {
    let capturedMessage = null;

    Email.customTransport = async (options) => {
      const transport = nodemailer.createTransport({
        streamTransport: true,
        buffer: true,
        newline: 'unix',
      });
      if (options.encryptionKeys || options.shouldSign) {
        transport.use(
          'stream',
          openpgpEncrypt({
            signingKey: PRIVATE_KEY_2048,
            passphrase: PASSPHRASE,
          })
        );
      }
      const info = await transport.sendMail(options);
      capturedMessage = info.message.toString();
    };

    await Email.sendAsync({
      from: 'a@b.com',
      to: 'c@d.com',
      subject: 'Full stack encrypt',
      text: 'Secret message',
      encryptionKeys: [PUBLIC_KEY],
    });

    test.isNotNull(capturedMessage, 'customTransport should have been called');
    test.isTrue(
      capturedMessage.indexOf('multipart/encrypted') >= 0,
      'output should be multipart/encrypted'
    );
    test.isTrue(
      capturedMessage.indexOf(
        'This is an OpenPGP/MIME encrypted message'
      ) >= 0,
      'output should contain the OpenPGP encryption marker'
    );

    Email.customTransport = undefined;
  }
);

Tinytest.addAsync(
  'email - openpgp - Email.sendAsync signs through the full stack',
  async function (test) {
    let capturedMessage = null;

    Email.customTransport = async (options) => {
      const transport = nodemailer.createTransport({
        streamTransport: true,
        buffer: true,
        newline: 'unix',
      });
      if (options.encryptionKeys || options.shouldSign) {
        transport.use(
          'stream',
          openpgpEncrypt({
            signingKey: PRIVATE_KEY_2048,
            passphrase: PASSPHRASE,
          })
        );
      }
      const info = await transport.sendMail(options);
      capturedMessage = info.message.toString();
    };

    await Email.sendAsync({
      from: 'a@b.com',
      to: 'c@d.com',
      subject: 'Full stack sign',
      text: 'Signed message',
      shouldSign: true,
    });

    test.isNotNull(capturedMessage, 'customTransport should have been called');
    test.isTrue(
      capturedMessage.indexOf('multipart/signed') >= 0,
      'output should be multipart/signed'
    );
    test.isTrue(
      capturedMessage.indexOf(
        'Content-Description: OpenPGP signed message'
      ) >= 0,
      'output should contain the OpenPGP signed message marker'
    );

    Email.customTransport = undefined;
  }
);

Tinytest.addAsync(
  'email - openpgp - hooks work with encrypted messages',
  async function (test) {
    let hookReceivedOptions = null;
    const hook = Email.hookSend((options) => {
      hookReceivedOptions = options;
      return true;
    });

    Email.customTransport = async (options) => {
      const transport = nodemailer.createTransport({
        streamTransport: true,
        buffer: true,
        newline: 'unix',
      });
      if (options.encryptionKeys || options.shouldSign) {
        transport.use(
          'stream',
          openpgpEncrypt({
            signingKey: PRIVATE_KEY_2048,
            passphrase: PASSPHRASE,
          })
        );
      }
      await transport.sendMail(options);
    };

    await Email.sendAsync({
      from: 'a@b.com',
      to: 'c@d.com',
      text: 'Hook test',
      encryptionKeys: [PUBLIC_KEY],
    });

    test.isNotNull(
      hookReceivedOptions,
      'hook should have been called with mail options'
    );
    test.equal(
      hookReceivedOptions.from,
      'a@b.com',
      'hook should receive the mail options'
    );

    hook.stop();
    Email.customTransport = undefined;
  }
);

Tinytest.addAsync(
  'email - openpgp - encrypted output decrypts and verifies',
  async function (test) {
    const selfPubKey = await SELF_PUBLIC_KEY;
    let capturedMessage = null;

    Email.customTransport = async (options) => {
      const transport = nodemailer.createTransport({
        streamTransport: true,
        buffer: true,
        newline: 'unix',
      });
      transport.use(
        'stream',
        openpgpEncrypt({
          signingKey: PRIVATE_KEY_2048,
          passphrase: PASSPHRASE,
        })
      );
      const info = await transport.sendMail(options);
      capturedMessage = info.message.toString();
    };

    const secretText = `Secret round-trip ${Date.now()}`;

    await Email.sendAsync({
      from: 'a@b.com',
      to: 'c@d.com',
      subject: 'Round trip',
      text: secretText,
      encryptionKeys: [selfPubKey],
    });

    // Extract the PGP armored block from the MIME output
    const beginMarker = '-----BEGIN PGP MESSAGE-----';
    const endMarker = '-----END PGP MESSAGE-----';
    const beginIdx = capturedMessage.indexOf(beginMarker);
    const endIdx = capturedMessage.indexOf(endMarker, beginIdx);

    test.isTrue(
      beginIdx >= 0,
      'MIME output should contain a PGP message armor block'
    );

    const armoredMessage = capturedMessage.substring(
      beginIdx,
      endIdx + endMarker.length
    );

    // Decrypt and verify
    const privKey = await openpgp.readPrivateKey({
      armoredKey: PRIVATE_KEY_2048,
    });
    const decryptedKey = await openpgp.decryptKey({
      privateKey: privKey,
      passphrase: PASSPHRASE,
    });
    const pubKey = await openpgp.readKey({
      armoredKey: selfPubKey,
    });

    const message = await openpgp.readMessage({
      armoredMessage,
    });
    const { data, signatures } = await openpgp.decrypt({
      message,
      decryptionKeys: decryptedKey,
      verificationKeys: pubKey,
    });

    test.isTrue(
      data.includes(secretText),
      'decrypted data should contain the original secret text'
    );
    test.isTrue(
      signatures.length > 0,
      'should have at least one signature after decryption'
    );

    const sigVerified = await signatures[0].verified;
    test.isTrue(
      sigVerified === true,
      'signature should verify against the signing key'
    );

    Email.customTransport = undefined;
  }
);

})();
