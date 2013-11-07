HTML = {
  tokenize: tokenize,

  Tag: Tag,

  // e.g. `CharRef({html: '&mdash;', str: '\u2014'})`
  CharRef: makeTagFunc('CharRef'),
  // e.g. `Comment("foo")`
  Comment: makeTagFunc('Comment'),
  // e.g. `EmitCode("foo()")`
  EmitCode: makeTagFunc('EmitCode'),

  asciiLowerCase: asciiLowerCase,
  properCaseTagName: properCaseTagName,
  properCaseAttributeName: properCaseAttributeName,
  codePointToString: codePointToString,

  isVoidElement: isVoidElement,

  _$: {
    // stuff exposed for testing
    Scanner: Scanner,
    getCharacterReference: getCharacterReference,
    getComment: getComment,
    getDoctype: getDoctype,
    getHTMLToken: getHTMLToken,
    getTag: getTag,
    getContent: getContent
  }
};

var allElementNames = 'a abbr acronym address applet area b base basefont bdo big blockquote body br button caption center cite code col colgroup dd del dfn dir div dl dt em fieldset font form frame frameset h1 h2 h3 h4 h5 h6 head hr html i iframe img input ins isindex kbd label legend li link map menu meta noframes noscript object ol p param pre q s samp script select small span strike strong style sub sup textarea title tt u ul var article aside audio bdi canvas command data datagrid datalist details embed eventsource figcaption figure footer header hgroup keygen mark meter nav output progress ruby rp rt section source summary time track video wbr'.split(' ');

for (var i = 0; i < allElementNames.length; i++)
  HTML.Tag.defineTag(allElementNames[i]);
