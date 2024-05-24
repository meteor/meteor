import { canonicalize, devWarningBanner } from './email_test_helpers';

export const TEST_CASES = [
  {
    title: 'email - fully customizable',
    options: {
      0: {
        from: 'foo@example.com',
        to: 'bar@example.com',
        cc: ['friends@example.com', 'enemies@example.com'],
        subject: 'This is the subject',
        text: 'This is the body\nof the message\nFrom us.',
        headers: {
          'X-Meteor-Test': 'a custom header',
          Date: 'dummy',
        },
      },
    },
    testCalls: {
      0: (test, stream) => {
        // XXX brittle if mailcomposer changes header order, etc
        test.equal(
          canonicalize(stream.getContentsAsString('utf8')),
          '====== BEGIN MAIL #0 ======\n' +
            devWarningBanner +
            'Content-Type: text/plain; charset=utf-8\r\n' +
            'X-Meteor-Test: a custom header\r\n' +
            'Date: dummy\r\n' +
            'From: foo@example.com\r\n' +
            'To: bar@example.com\r\n' +
            'Cc: friends@example.com, enemies@example.com\r\n' +
            'Subject: This is the subject\r\n' +
            'Message-ID: <...>\r\n' +
            'Content-Transfer-Encoding: 7bit\r\n' +
            'MIME-Version: 1.0\r\n' +
            '\r\n' +
            'This is the body\n' +
            'of the message\n' +
            'From us.\r\n' +
            '====== END MAIL #0 ======\n'
        );
      },
    },
  },
  {
    title: 'email - undefined headers sends properly',
    options: {
      0: {
        from: 'foo@example.com',
        to: 'bar@example.com',
        subject: 'This is the subject',
        text: 'This is the body\nof the message\nFrom us.',
      },
    },
    testCalls: {
      0: (test, stream) => {
        test.matches(
          canonicalize(stream.getContentsAsString('utf8')),
          /^====== BEGIN MAIL #0 ======$[\s\S]+^To: bar@example.com$/m
        );
      },
    },
  },
  {
    title: 'email - multiple e-mails same stream',
    options: {
      0: {
        from: 'foo@example.com',
        to: 'bar@example.com',
        subject: 'This is the subject',
        text: 'This is the body\nof the message\nFrom us.',
      },
      1: {
        from: 'qux@example.com',
        to: 'baz@example.com',
        subject: 'This is important',
        text: 'This is another message\nFrom Qux.',
      },
    },

    testCalls: {
      0: (test, stream) => {
        const contents = canonicalize(stream.getContentsAsString('utf8'));
        test.matches(contents, /^====== BEGIN MAIL #0 ======$/m);
        test.matches(contents, /^From: foo@example.com$/m);
        test.matches(contents, /^To: bar@example.com$/m);
      },
      1: (test, stream) => {
        const contents2 = canonicalize(stream.getContentsAsString('utf8'));
        test.matches(contents2, /^====== BEGIN MAIL #1 ======$/m);
        test.matches(contents2, /^From: qux@example.com$/m);
        test.matches(contents2, /^To: baz@example.com$/m);
      },
    },
  },
  {
    title: 'email - using mail composer',
    options: {
      0: {
        mailComposer: new EmailInternals.NpmModules.mailcomposer.module({
          from: 'a@b.com',
          text: 'body',
        }),
      },
    },

    testCalls: {
      0: (test, stream) => {
        test.equal(
          canonicalize(stream.getContentsAsString('utf8')),
          '====== BEGIN MAIL #0 ======\n' +
            devWarningBanner +
            'Content-Type: text/plain; charset=utf-8\r\n' +
            'From: a@b.com\r\n' +
            'Message-ID: <...>\r\n' +
            'Content-Transfer-Encoding: 7bit\r\n' +
            'Date: ...\r\n' +
            'MIME-Version: 1.0\r\n' +
            '\r\n' +
            'body\r\n' +
            '====== END MAIL #0 ======\n'
        );
      },
    },
  },
  {
    title: 'email - date auto generated',
    options: {
      0: {
        from: 'foo@example.com',
        to: 'bar@example.com',
        subject: 'This is the subject',
        text: 'This is the body\nof the message\nFrom us.',
        headers: {
          'X-Meteor-Test': 'a custom header',
        },
      },
    },
    testCalls: {
      0: (test, stream) => {
        test.matches(
          canonicalize(stream.getContentsAsString('utf8')),
          /^Date: .+$/m
        );
      },
    },
  },
  {
    title: 'email - long lines',
    options: {
      0: {
        from: 'foo@example.com',
        to: 'bar@example.com',
        subject:
          'This is a very very very very very very very very very very very very long subject',
        text: 'This is a very very very very very very very very very very very very long text',
      },
    },
    testCalls: {
      0: (test, stream) => {
        test.equal(
          canonicalize(stream.getContentsAsString('utf8')),
          '====== BEGIN MAIL #0 ======\n' +
            devWarningBanner +
            'Content-Type: text/plain; charset=utf-8\r\n' +
            'From: foo@example.com\r\n' +
            'To: bar@example.com\r\n' +
            'Subject: This is a very very very very very very very very ' +
            'very very very\r\n very long subject\r\n' +
            'Message-ID: <...>\r\n' +
            'Content-Transfer-Encoding: quoted-printable\r\n' +
            'Date: ...\r\n' +
            'MIME-Version: 1.0\r\n' +
            '\r\n' +
            'This is a very very very very very very very very very very ' +
            'very very long =\r\ntext\r\n' +
            '====== END MAIL #0 ======\n'
        );
      },
    },
  },
  {
    title: 'email - unicode',
    options: {
      0: {
        from: 'foo@example.com',
        to: 'bar@example.com',
        subject: '\u263a',
        text: 'I \u2665 Meteor',
      },
    },
    testCalls: {
      0: (test, stream) => {
        test.equal(
          canonicalize(stream.getContentsAsString('utf8')),
          '====== BEGIN MAIL #0 ======\n' +
            devWarningBanner +
            'Content-Type: text/plain; charset=utf-8\r\n' +
            'From: foo@example.com\r\n' +
            'To: bar@example.com\r\n' +
            'Subject: =?UTF-8?B?4pi6?=\r\n' +
            'Message-ID: <...>\r\n' +
            'Content-Transfer-Encoding: quoted-printable\r\n' +
            'Date: ...\r\n' +
            'MIME-Version: 1.0\r\n' +
            '\r\n' +
            'I =E2=99=A5 Meteor\r\n' +
            '====== END MAIL #0 ======\n'
        );
      },
    },
  },
  {
    title: 'email - text and html',
    options: {
      0: {
        from: 'foo@example.com',
        to: 'bar@example.com',
        text: '*Cool*, man',
        html: '<i>Cool</i>, man',
      },
    },
    testCalls: {
      0: (test, stream) => {
        test.equal(
          canonicalize(stream.getContentsAsString('utf8')),
          '====== BEGIN MAIL #0 ======\n' +
            devWarningBanner +
            'Content-Type: multipart/alternative;\r\n' +
            ' boundary="--...-Part_1"\r\n' +
            'From: foo@example.com\r\n' +
            'To: bar@example.com\r\n' +
            'Message-ID: <...>\r\n' +
            'Date: ...\r\n' +
            'MIME-Version: 1.0\r\n' +
            '\r\n' +
            '----...-Part_1\r\n' +
            'Content-Type: text/plain; charset=utf-8\r\n' +
            'Content-Transfer-Encoding: 7bit\r\n' +
            '\r\n' +
            '*Cool*, man\r\n' +
            '----...-Part_1\r\n' +
            'Content-Type: text/html; charset=utf-8\r\n' +
            'Content-Transfer-Encoding: 7bit\r\n' +
            '\r\n' +
            '<i>Cool</i>, man\r\n' +
            '----...-Part_1--\r\n' +
            '====== END MAIL #0 ======\n'
        );
      },
    },
  },
];

