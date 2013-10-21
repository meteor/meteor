HTML = {
  tokenize: tokenize,

  _$: {
    // stuff exposed for testing
    Scanner: Scanner,
    getCharacterReference: getCharacterReference,
    getComment: getComment,
    getDoctype: getDoctype,
    getData: getData,
    getTag: getTag
  }
};
