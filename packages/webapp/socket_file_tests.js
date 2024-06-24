import { writeFileSync, unlinkSync, statSync } from 'fs';
import { createServer } from 'net';
import { createServer as createServerHttp } from 'http';
import {
  removeExistingSocketFile,
  registerSocketFileCleanup,
} from './socket_file.js';
import { EventEmitter } from 'events';
import { tmpdir } from 'os';
import { main } from './webapp_server';
import express from 'express';

const testSocketFile = `${tmpdir()}/socket_file_tests`;

const getChownInfo = async (filePath) => {
  try {
    const stats = await statSync(filePath);
    return { uid: stats.uid, gid: stats.gid };
  } catch (error) {
    console.error(`Error fetching ownership info for ${filePath}:`, error.message);
    return null;
  }
};

const removeTestSocketFile = () => {
  try {
    unlinkSync(testSocketFile);
  } catch (error) {
    // Do nothing
  }
}

Tinytest.add("socket file - don't remove a non-socket file", test => {
  writeFileSync(testSocketFile, "");
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
    writeFileSync(testSocketFile, "");
    test.isNotUndefined(statSync(testSocketFile));
    testEventEmitter.emit(signal);
    test.throws(
      () => { statSync(testSocketFile); },
      /ENOENT/
    );
  });
});


Tinytest.addAsync(
  'socket usage - use socket file for inter-process communication',
  async test => {
  removeTestSocketFile();
  removeExistingSocketFile(testSocketFile);

  var app = express();
  const httpServer = createServerHttp(app);
  process.env.UNIX_SOCKET_PATH = testSocketFile;
  process.env.UNIX_SOCKET_GROUP = 'root'; // gid 0

  const result = await main({ httpServer });

  test.equal(result, 'DAEMON');
  test.equal((await getChownInfo(testSocketFile))?.gid, 0);

  return new Promise(resolve => {
    httpServer.on('listening', Meteor.bindEnvironment(() => {
      process.env.UNIX_SOCKET_PATH = '';
      process.env.UNIX_SOCKET_GROUP = '';
      removeExistingSocketFile(testSocketFile);
      httpServer.close();

      resolve();
    }));
  });
});
