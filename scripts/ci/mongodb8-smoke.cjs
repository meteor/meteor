// Temporary PR #14663 validation: exercise the actual packaged mongod and driver.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { MongoClient } = require(path.resolve(process.env.MONGO_DRIVER_DIR, 'node_modules/mongodb'));

async function main() {
  const mongod = path.resolve(process.argv[2]);
  const version = execFileSync(mongod, ['--version'], { encoding: 'utf8' });
  assert.match(version, /db version v8\.0\.29\b/);
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const dbpath = fs.mkdtempSync(path.join(os.tmpdir(), 'mongo8-validation-'));
  const child = spawn(mongod, ['--bind_ip', '127.0.0.1', '--port', String(port),
    '--dbpath', dbpath, '--oplogSize', '8', '--replSet', 'meteor', '--noauth']);
  const closed = new Promise(resolve => child.once('close', resolve));
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  let spawnError;
  child.on('error', error => { spawnError = error; });
  const client = new MongoClient(`mongodb://127.0.0.1:${port}/meteor`, {
    directConnection: true, serverSelectionTimeoutMS: 1000, connectTimeoutMS: 1000,
  });
  try {
    const deadline = Date.now() + 60000;
    while (true) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode) throw Error(`mongod exited: ${child.exitCode ?? child.signalCode}`);
      try {
        await client.connect();
        await client.db('admin').command({ ping: 1 });
        break;
      }
      catch (error) { if (Date.now() > deadline) throw error; await delay(200); }
    }
    await client.db('admin').command({ replSetInitiate: {
      _id: 'meteor', members: [{ _id: 0, host: `127.0.0.1:${port}` }],
    } });
    while (!(await client.db('admin').command({ hello: 1 })).isWritablePrimary) {
      if (Date.now() > deadline) throw Error('Replica set did not elect a primary');
      await delay(200);
    }
    const db = client.db('meteor');
    await db.collection('probe').insertOne({ _id: 'pr14663', value: 1 });
    await db.collection('probe').updateOne({ _id: 'pr14663' }, { $set: { value: 2 } });
    assert.equal((await db.collection('probe').findOne({ _id: 'pr14663' })).value, 2);
    const change = db.collection('probe').watch([], { maxAwaitTimeMS: 1000 });
    const pending = change.next();
    const timer = setInterval(() => {
      db.collection('probe').updateOne({ _id: 'pr14663' }, { $inc: { value: 1 } }).catch(() => {});
    }, 250);
    let timeout;
    try {
      const event = await Promise.race([pending, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(Error('Change stream timed out')), 15000);
      })]);
      assert.equal(event.operationType, 'update');
    } finally { clearInterval(timer); clearTimeout(timeout); await change.close(); }
    assert.ok(await client.db('local').collection('oplog.rs').countDocuments({ ns: 'meteor.probe' }));
    assert.equal((await db.collection('probe').deleteOne({ _id: 'pr14663' })).deletedCount, 1);
    const info = await client.db('admin').command({ buildInfo: 1 });
    console.log(JSON.stringify({ version: info.version, platform: process.platform, arch: process.arch,
      driver: require(path.resolve(process.env.MONGO_DRIVER_DIR, 'node_modules/mongodb/package.json')).version,
      replicaSet: 'PASS', crud: 'PASS', oplog: 'PASS', changeStream: 'PASS' }));
  } catch (error) { console.error(logs.slice(-16000)); throw error; }
  finally {
    await client.close();
    if (child.exitCode === null && !child.signalCode && !spawnError) {
      child.kill('SIGTERM');
      let timer;
      await Promise.race([closed, new Promise(resolve => {
        timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 15000);
      })]);
      clearTimeout(timer);
      await closed;
    }
    fs.rmSync(dbpath, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
