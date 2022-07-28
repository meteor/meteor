import { smokeEmailTest } from './email_test_helpers';
import { TEST_CASES } from './email_tests_data';

Email.isTestMode = true;

// Create dynamic sync tests
TEST_CASES.forEach(({ title, options, testCalls }) => {
  Tinytest.add(`[Sync] ${title}`, function (test) {
    smokeEmailTest((stream) => {
      Object.entries(options).forEach(([key, option]) => {
        const testCall = testCalls[key];
        Email.send(option);
        testCall(test, stream);
      });
    });
  });
});

// Create dynamic async tests
TEST_CASES.forEach(({ title, options, testCalls }) => {
  Tinytest.addAsync(`[Async] ${title}`, function (test, onComplete) {
    smokeEmailTest(() => {
      const allPromises = Object.entries(options).map(([key, option]) => {
        const testCall = testCalls[key];
        return Email.sendAsync(option).then((stream) => {
          testCall(test, stream);
        });
      });
      Promise.all(allPromises).then(() => onComplete());
    });
  });
});

// Individual sync tests

Tinytest.add(
  '[Sync] email - alternate API is used for sending gets data',
  function (test) {
    smokeEmailTest(function (stream) {
      Email.customTransport = (options) => {
        test.equal(options.from, 'foo@example.com');
      };
      Email.send({
        from: 'foo@example.com',
        to: 'bar@example.com',
        text: '*Cool*, man',
        html: '<i>Cool</i>, man',
      });
      test.equal(stream.getContentsAsString('utf8'), false);
    });

    smokeEmailTest(function (stream) {
      Meteor.settings.packages = {
        email: { service: '1on1', user: 'test', password: 'pwd' },
      };
      Email.customTransport = (options) => {
        test.equal(options.from, 'foo@example.com');
        test.equal(options.packageSettings?.service, '1on1');
      };

      Email.send({
        from: 'foo@example.com',
        to: 'bar@example.com',
        text: '*Cool*, man',
        html: '<i>Cool</i>, man',
      });

      test.equal(stream.getContentsAsString('utf8'), false);
    });
    Email.customTransport = undefined;
    Meteor.settings.packages = undefined;
  }
);

Tinytest.add('[Sync] email - hooks stop the sending', function (test) {
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
  smokeEmailTest(function (stream) {
    Email.send({
      from: 'foo@example.com',
      to: 'bar@example.com',
      text: '*Cool*, man',
      html: '<i>Cool</i>, man',
    });

    test.equal(stream.getContentsAsString('utf8'), false);
  });
  hook1.stop();
  hook2.stop();
  hook3.stop();
});

// Individual Async tests

Tinytest.addAsync(
  '[Async] email - alternate API is used for sending gets data',
  function (test, onComplete) {
    const allPromises = [];
    smokeEmailTest(() => {
      Email.customTransport = (options) => {
        test.equal(options.from, 'foo@example.com');
      };
      allPromises.push(
        Email.sendAsync({
          from: 'foo@example.com',
          to: 'bar@example.com',
          text: '*Cool*, man',
          html: '<i>Cool</i>, man',
        }).then((stream) => {
          test.equal(stream.getContentsAsString('utf8'), false);
        })
      );
    });

    smokeEmailTest(function () {
      Meteor.settings.packages = {
        email: { service: '1on1', user: 'test', password: 'pwd' },
      };
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
        }).then((stream) => {
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
  '[Async] email - hooks stop the sending',
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
    smokeEmailTest(() => {
      Email.sendAsync({
        from: 'foo@example.com',
        to: 'bar@example.com',
        text: '*Cool*, man',
        html: '<i>Cool</i>, man',
      }).then((stream) => {
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

Tinytest.add('[Sync] email - URL string for known hosts', function (test) {
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

  const falseService = { service: '1on1', user: 'test', password: 'pwd' };
  const errorMsg =
    'Could not recognize e-mail service. See list at https://nodemailer.com/smtp/well-known/ for services that we can configure for you.';
  test.throws(() => EmailTest.knowHostsTransport(falseService), errorMsg);
  test.throws(
    () => EmailTest.knowHostsTransport(null, 'smtp://bbb:bb@bb.com'),
    errorMsg
  );
});
