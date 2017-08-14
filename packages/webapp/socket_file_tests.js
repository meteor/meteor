import { writeFileSync, unlinkSync, statSync } from 'fs';
import { createServer } from 'net';
import { removeExistingSocketFile } from './socket_file';

const testSocketFile = '/tmp/socket_file_tests';

const removeTestSocketFile = () => {
  try {
    unlinkSync(testSocketFile);
  } catch (error) {
    // Do nothing
  }
}

Tinytest.add('socket file - file exists but is not a socket file', (test) => {
  writeFileSync(testSocketFile);
  test.throws(
    () => { removeExistingSocketFile(testSocketFile); },
    /An existing file was found/
  );
  removeTestSocketFile()
});

Tinytest.addAsync(
  'socket file - existing socket file is removed',
  (test, done) => {
    removeTestSocketFile();
    const server = createServer();
    server.listen(testSocketFile);

    server.on('listening', Meteor.bindEnvironment(() => {
      test.isNotUndefined(statSync(testSocketFile));
      removeExistingSocketFile(testSocketFile);
      test.throws(
        () => { statSync(testSocketFile); },
        /ENOENT/
      );
      server.close();
      done();
    }));
  }
);

Tinytest.add('socket file - no existing socket file', (test) => {
  removeTestSocketFile();
  removeExistingSocketFile(testSocketFile);
});
