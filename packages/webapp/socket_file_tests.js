import { writeFileSync, unlinkSync, statSync } from 'fs';
import { createServer } from 'net';
import {
  removeExistingSocketFile,
  registerSocketFileCleanup,
} from './socket_file.js';
import { EventEmitter } from 'events';
import { tmpdir, platform } from 'os';

/**
 * On Unix, the local domain is also known as the Unix domain. The path is a filesystem pathname.
 * ...
 * In short, a Unix domain socket will be visible in the filesystem and will persist until unlinked.
 *
 * On Windows, the local domain is implemented using a named pipe.
 * ...
 * Windows will close and remove the pipe when the owning process exits.
 * @see https://nodejs.org/api/net.html#net_identifying_paths_for_ipc_connections
 */
if (platform() !== 'win32') {

  const testSocketFile = `${tmpdir()}/socket_file_tests`;

  const removeTestSocketFile = () => {
    try {
      unlinkSync(testSocketFile);
    } catch (error) {
      // Do nothing
    }
  }

  Tinytest.add("socket file - don't remove a non-socket file", test => {
    writeFileSync(testSocketFile);
    test.throws(
      () => { removeExistingSocketFile(testSocketFile); },
      /An existing file was found/
    );
    removeTestSocketFile()
  });

  Tinytest.addAsync(
    'socket file - remove a previously existing socket file',
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

  Tinytest.add(
    'socket file - no existing socket file, nothing to remove',
    test => {
      removeTestSocketFile();
      removeExistingSocketFile(testSocketFile);
    }
  );

  Tinytest.add('socket file - remove socket file on exit', test => {
    const testEventEmitter = new EventEmitter();
    registerSocketFileCleanup(testSocketFile, testEventEmitter);
    ['exit', 'SIGINT', 'SIGHUP', 'SIGTERM'].forEach(signal => {
      writeFileSync(testSocketFile);
      test.isNotUndefined(statSync(testSocketFile));
      testEventEmitter.emit(signal);
      test.throws(
        () => { statSync(testSocketFile); },
        /ENOENT/
      );
    });
  });
}
