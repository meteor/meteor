// Temporary workaround for https://github.com/joyent/node/issues/6506
// Our fix involves replicating a bunch of functions in order to change
// a single line.

var PATCH_VERSIONS = ['v0.10.22', 'v0.10.23', 'v0.10.24'];

if (!_.contains(PATCH_VERSIONS, process.version)) {
  if (!process.env.DISABLE_WEBSOCKETS) {
    console.error("This version of Meteor contains a patch for a bug in Node v0.10.");
    console.error("The patch is against only versions 0.10.22 through 0.10.24.");
    console.error("You are using version " + process.version + " instead, so we cannot apply the patch.");
    console.error("To mitigate the most common effect of the bug, websockets will be disabled.");
    console.error("To enable websockets, use Node v0.10.22 through v0.10.24, or upgrade to a later version of Meteor (if available).");
    process.env.DISABLE_WEBSOCKETS = 't';
  }
} else {
  // This code is all copied from Node's lib/_stream_writable.js, git tag
  // v0.10.22, with one change (see "BUGFIX").
  var Writable = Npm.require('_stream_writable');
  var Duplex = Npm.require('_stream_duplex');

  Writable.prototype.write = function(chunk, encoding, cb) {
    var state = this._writableState;
    var ret = false;

    if (typeof encoding === 'function') {
      cb = encoding;
      encoding = null;
    }

    if (Buffer.isBuffer(chunk))
      encoding = 'buffer';
    else if (!encoding)
      encoding = state.defaultEncoding;

    if (typeof cb !== 'function')
      cb = function() {};

    if (state.ended)
      writeAfterEnd(this, state, cb);
    else if (validChunk(this, state, chunk, cb))
      ret = writeOrBuffer(this, state, chunk, encoding, cb);

    return ret;
  };

  // Duplex doesn't directly inherit from Writable: it copies over this function
  // explicitly. So we have to do it too.
  Duplex.prototype.write = Writable.prototype.write;

  function writeAfterEnd(stream, state, cb) {
    var er = new Error('write after end');
    // TODO: defer error events consistently everywhere, not just the cb
    stream.emit('error', er);
    process.nextTick(function() {
      cb(er);
    });
  }

  function validChunk(stream, state, chunk, cb) {
    var valid = true;
    if (!Buffer.isBuffer(chunk) &&
        'string' !== typeof chunk &&
        chunk !== null &&
        chunk !== undefined &&
        !state.objectMode) {
      var er = new TypeError('Invalid non-string/buffer chunk');
      stream.emit('error', er);
      process.nextTick(function() {
        cb(er);
      });
      valid = false;
    }
    return valid;
  }

  function writeOrBuffer(stream, state, chunk, encoding, cb) {
    chunk = decodeChunk(state, chunk, encoding);
    if (Buffer.isBuffer(chunk))
      encoding = 'buffer';
    var len = state.objectMode ? 1 : chunk.length;

    state.length += len;

    var ret = state.length < state.highWaterMark;
    // This next line is the BUGFIX:
    state.needDrain = state.needDrain || !ret;

    if (state.writing)
      state.buffer.push(new WriteReq(chunk, encoding, cb));
    else
      doWrite(stream, state, len, chunk, encoding, cb);

    return ret;
  }

  function decodeChunk(state, chunk, encoding) {
    if (!state.objectMode &&
        state.decodeStrings !== false &&
        typeof chunk === 'string') {
      chunk = new Buffer(chunk, encoding);
    }
    return chunk;
  }

  function WriteReq(chunk, encoding, cb) {
    this.chunk = chunk;
    this.encoding = encoding;
    this.callback = cb;
  }

  function doWrite(stream, state, len, chunk, encoding, cb) {
    state.writelen = len;
    state.writecb = cb;
    state.writing = true;
    state.sync = true;
    stream._write(chunk, encoding, state.onwrite);
    state.sync = false;
  }
}
