HTML.parseFragment = parseFragment;


HTML.codePointToString = codePointToString;

HTML.TEMPLATE_TAG_POSITION = TEMPLATE_TAG_POSITION,

// Could move Scanner into its own package if use it for other stuff.
HTML.Scanner = Scanner;

HTML._$ = {
  // stuff exposed for testing
  Scanner: Scanner,
  getCharacterReference: getCharacterReference,
  getComment: getComment,
  getDoctype: getDoctype,
  getHTMLToken: getHTMLToken,
  getTag: getTagToken,
  getContent: getContent
};
