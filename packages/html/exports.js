HTML = {
  tokenize: tokenize,

  _$: {
    // stuff exposed for testing
    Scanner: Scanner,
    getCharacterReference: getCharacterReference,
    getComment: getComment,
    getDoctype: getDoctype,
    getHTMLToken: getHTMLToken,
    getTag: getTag
  }
};
