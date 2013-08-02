HTML5Tokenizer = {
  tokenize: function (inputString) {
    var tokens = [];
    var tokenizer = new HTML5.Tokenizer(inputString);
    tokenizer.addListener('token', function (tok) {
      tokens.push(tok);
    });
    tokenizer.tokenize();
    return tokens;
  }
  // Incremental tokenization turns out not to be useful
  // for inspecting intermediate tokenizer state, just
  // for async streaming.
  //
  // tokenizeIncremental: function (tokenFunc) {
  //   var emitter = new toyevents.EventEmitter();
  //   var tokenizer = new HTML5.Tokenizer(emitter);
  //   tokenizer.addListener('token', tokenFunc);
  //   return {
  //     add: function (str) {
  //       emitter.emit('data', str);
  //     },
  //     finish: function () {
  //       emitter.emit('end');
  //     }
  //   };
  // }
};
