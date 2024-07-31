captureConnectionMessagesClient = async function () {
  const messages = []

  const conn = DDP.connect(Meteor.absoluteUrl());

  const send = conn._stream.send;

  conn._stream.send = function (...args) {
    messages.push(EJSON.parse(args[0]));
    send.apply(this, args);
  }

  conn._stream.on('message', message => {
    return messages.push(EJSON.parse(message));
  });

  function cleanup() {
    conn._stream.send = send
  }

  return {
    conn,
    messages,
    cleanup
  }
};