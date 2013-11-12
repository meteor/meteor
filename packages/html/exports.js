HTML = {
  parseFragment: parseFragment,

  Tag: Tag,
  getTag: getTag,
  defineTag: defineTag,

  // e.g. `CharRef({html: '&mdash;', str: '\u2014'})`
  CharRef: makeTagFunc('CharRef'),
  // e.g. `Comment("foo")`
  Comment: makeTagFunc('Comment'),
  // e.g. `EmitCode("foo()")`
  EmitCode: makeTagFunc('EmitCode'),
  // e.g. `Special({ ... stuff ... })`
  Special: makeTagFunc('Special'),

  asciiLowerCase: asciiLowerCase,
  properCaseTagName: properCaseTagName,
  properCaseAttributeName: properCaseAttributeName,
  codePointToString: codePointToString,

  isVoidElement: isVoidElement,
  isKnownElement: isKnownElement,

  typeOf: typeOf,

  TEMPLATE_TAG_POSITION: TEMPLATE_TAG_POSITION,

  _$: {
    // stuff exposed for testing
    Scanner: Scanner,
    getCharacterReference: getCharacterReference,
    getComment: getComment,
    getDoctype: getDoctype,
    getHTMLToken: getHTMLToken,
    getTag: getTagToken,
    getContent: getContent
  }
};

for (var i = 0; i < knownElementNames.length; i++)
  HTML.defineTag(knownElementNames[i]);
