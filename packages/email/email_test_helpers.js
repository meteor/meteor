import streamBuffers from 'stream-buffers';

export const devWarningBanner =
  '(Mail not sent; to enable ' +
  'sending, set the MAIL_URL environment variable.)\n';

export const smokeEmailTest = (testFunction) => {
  // This only tests dev mode, so don't run the test if this is deployed.
  if (process.env.MAIL_URL) return;
  const stream = new streamBuffers.WritableStreamBuffer();
  EmailTest.resetNextDevModeMailId();
  testFunction(stream);
};

export const canonicalize = (string) => {
  // Remove generated content for test.equal to succeed.
  return string
    .replace(/Message-ID: <[^<>]*>\r\n/, 'Message-ID: <...>\r\n')
    .replace(/Date: (?!dummy).*\r\n/, 'Date: ...\r\n')
    .replace(/(boundary="|^--)--[^\s"]+?(-Part|")/gm, '$1--...$2');
};
