import { Email } from 'meteor/email';
import { smokeEmailTest } from './email_test_helpers';
import { TEST_CASES } from './email_tests_data';

const CUSTOM_TRANSPORT_SETTINGS = {
  email: { service: '1on1', user: 'test', password: 'pwd' },
};

// Create dynamic async tests
TEST_CASES.forEach(({ title, options, testCalls }) => {
  Tinytest.addAsync(`${title}`, async function (test, onComplete) {
    let resolver;
    const promise = new Promise(r => resolver = r);
    smokeEmailTest((stream) => {
      const allPromises = Object.entries(options).map(([key, option]) => {
        const testCall = testCalls[key];
        return Email.sendAsync({ ...option, stream }).then(() => {
          testCall(test, stream);
        });
      });
      Promise.all(allPromises).then(() => resolver()).catch(console.error);
    });
    await promise;
  });
});

// Individual Async tests

Tinytest.addAsync(
  'email - alternate API is used for sending gets data',
  function (test, onComplete) {
    const allPromises = [];
    smokeEmailTest((stream) => {
      Email.customTransport = (options) => {
        test.equal(options.from, 'foo@example.com');
      };
      allPromises.push(
        Email.sendAsync({
          from: 'foo@example.com',
          to: 'bar@example.com',
          text: '*Cool*, man',
          html: '<i>Cool</i>, man',
          stream,
        }).then(() => {
          test.equal(stream.getContentsAsString('utf8'), false);
        })
      );
    });

    smokeEmailTest(function (stream) {
      Meteor.settings.packages = CUSTOM_TRANSPORT_SETTINGS;
      Email.customTransport = (options) => {
        test.equal(options.from, 'foo@example.com');
        test.equal(options.packageSettings?.service, '1on1');
      };

      allPromises.push(
        Email.sendAsync({
          from: 'foo@example.com',
          to: 'bar@example.com',
          text: '*Cool*, man',
          html: '<i>Cool</i>, man',
          stream,
        }).then(() => {
          test.equal(stream.getContentsAsString('utf8'), false);
        })
      );
    });
    Promise.all(allPromises).then(() => {
      Email.customTransport = undefined;
      Meteor.settings.packages = undefined;
      onComplete();
    });
  }
);

Tinytest.addAsync(
  'email - hooks stop the sending',
  function (test, onComplete) {
    // Register hooks
    const hook1 = Email.hookSend((options) => {
      // Test that we get options through
      test.equal(options.from, 'foo@example.com');
      console.log('EXECUTE');
      return true;
    });
    const hook2 = Email.hookSend(() => {
      console.log('STOP');
      return false;
    });
    const hook3 = Email.hookSend(() => {
      console.log('FAIL');
    });
    smokeEmailTest((stream) => {
      Email.sendAsync({
        from: 'foo@example.com',
        to: 'bar@example.com',
        text: '*Cool*, man',
        html: '<i>Cool</i>, man',
        stream,
      }).then(() => {
        test.equal(stream.getContentsAsString('utf8'), false);
        hook1.stop();
        hook2.stop();
        hook3.stop();
        onComplete();
      });
    });
  }
);

// Another tests

Tinytest.add('email - URL string for known hosts', function (test) {
  const oneTransport = EmailTest.knowHostsTransport({
    service: '1und1',
    user: 'test',
    password: 'pwd',
  });
  test.equal(oneTransport.transporter.auth.type, 'LOGIN');
  test.equal(oneTransport.transporter.auth.user, 'test');

  const aolUrlTransport = EmailTest.knowHostsTransport(
    null,
    'AOL://test:pwd@aol.com'
  );
  test.equal(aolUrlTransport.transporter.auth.user, 'test');
  test.equal(aolUrlTransport.transporter.auth.type, 'LOGIN');

  const outlookTransport = EmailTest.knowHostsTransport(
    null,
    'Outlook365://firstname.lastname%40hotmail.com:password@hotmail.com'
  );
  const outlookTransport2 = EmailTest.knowHostsTransport(
    undefined,
    'Outlook365://firstname.lastname@hotmail.com:password@hotmail.com'
  );
  test.equal(
    outlookTransport.transporter.auth.user,
    'firstname.lastname%40hotmail.com'
  );
  test.equal(
    outlookTransport.options.auth.user,
    'firstname.lastname%40hotmail.com'
  );
  test.equal(outlookTransport.transporter.options.service, 'outlook365');
  test.equal(
    outlookTransport2.transporter.auth.user,
    'firstname.lastname%40hotmail.com'
  );
  test.equal(outlookTransport2.transporter.options.service, 'outlook365');

  const hotmailTransport = EmailTest.knowHostsTransport(
    undefined,
    'Hotmail://firstname.lastname@hotmail.com:password@hotmail.com'
  );
  console.dir(hotmailTransport);
  test.equal(hotmailTransport.transporter.options.service, 'hotmail');

  const falseService = CUSTOM_TRANSPORT_SETTINGS.email;
  const errorMsg =
    'Could not recognize e-mail service. See list at https://nodemailer.com/smtp/well-known/ for services that we can configure for you.';
  test.throws(() => EmailTest.knowHostsTransport(falseService), errorMsg);
  test.throws(
    () => EmailTest.knowHostsTransport(null, 'smtp://bbb:bb@bb.com'),
    errorMsg
  );
});

Tinytest.addAsync(
  'email - with custom transport exception',
  async function (test) {
    Meteor.settings.packages = CUSTOM_TRANSPORT_SETTINGS;
    Email.customTransport = (options) => {
      test.equal(options.from, 'foo@example.com');
      test.equal(options.packageSettings?.service, '1on1');
      throw new Meteor.Error('Expected error');
    };
    await Email.sendAsync({
      from: 'foo@example.com',
      to: 'bar@example.com',
    }).catch((err) => {
      test.equal(err.error, 'Expected error');
    });
    Meteor.settings.packages = undefined;
    Email.customTransport = undefined;
  }
);

Tinytest.addAsync(
  '[Async] email - with custom encryption',
  function (test, onComplete) {
    const allPromises = [];
    smokeEmailTest((stream) => {
      Email.customTransport = (options) => {
        test.equal(options.encryptionKeys, ['-----BEGIN PGP PUBLIC KEY BLOCK-----…']);
        test.equal(options.shouldSign, true);
      };
      allPromises.push(
        Email.sendAsync({
          from: 'foo@example.com',
          to: 'bar@example.com',
          text: '*Cool*, man',
          html: '<i>Cool</i>, man',
          encryptionKeys: ['-----BEGIN PGP PUBLIC KEY BLOCK-----…'],
          shouldSign: true
        }).then(() => {
          test.equal(stream.getContentsAsString('utf8'), false);
        })
      );
      Promise.all(allPromises).then(() => onComplete());
    });
  }
);

Tinytest.addAsync(
  'email - with custom transport long time running',
  async function (test) {
    Meteor.settings.packages = CUSTOM_TRANSPORT_SETTINGS;
    Email.customTransport = async (options) => {
      await Meteor._sleepForMs(3000);
      test.equal(options.from, 'foo@example.com');
      test.equal(options.packageSettings?.service, '1on1');
    };
    await Email.sendAsync({
      from: 'foo@example.com',
      to: 'bar@example.com',
    });
    Meteor.settings.packages = undefined;
    Email.customTransport = undefined;
  }
);
