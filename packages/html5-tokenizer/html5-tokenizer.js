
HTML5Tokenizer = {
  tokenize: function (inputString) {
    var tokens = [];
    var tokenizer = new HTML5.Tokenizer(inputString);
    tokenizer.addListener('token', function (tok) {
      tokens.push(tok);
    });
    tokenizer.tokenize();
    return tokens;
  },
  tokenizeIncremental: function (tokenFunc) {
    var emitter = new toyevents.EventEmitter();
    var tokenizer = new HTML5.Tokenizer(emitter);
    tokenizer.addListener('token', tokenFunc);
    return {
      add: function (str) {
        emitter.emit('data', str);
      },
      finish: function () {
        emitter.emit('end');
      }
    };
  }
};