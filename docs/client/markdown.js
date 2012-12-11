// Wrap in a closure so the module can be used either in node
// or in a browser.
(function(exports) {

///// Utility functions

// Returns `true` if `obj` is an array.
var isArray = function(obj) {
  return obj && (typeof obj === 'object') && (typeof obj.length === 'number');
};

// The `trim` method removes leading and trailing whitespace from a string.
// Most javascript interpreters define the `trim` method natively, so we test to
// see if it is defined before defining it here.
if (typeof String.prototype.trim != 'function') {
  String.prototype.trim = function() {
    return this.replace(/^\s+/, '').replace(/\s+$/, '');
  };
}

// Link labels are case-insensitive and collapse whitespace.
var normalizeLabel = function(str) {
  return str.replace(/[\n ]+/g, ' ').toUpperCase();
};

// Tries to match `regex` at index `pos` in `str`.  On success,
// returns a string, possibly empty.  On failure, returns `null`.
var matchAt = function(regex, str, pos) {
  var match = regex.exec(str.slice(pos));
  if (match && match.index === 0) {
    return match[0];
  } else {
    return null;
  }
};

// Convert tabs to spaces on each line using a 4-space tab stop.
var detabLine = function(text) {
  if (text) {
    var lastStop = 0;
    return text.replace(/\t/g, function(match, offset) {
      var result = '    '.slice((offset - lastStop) % 4);
      lastStop = offset + 1;
      return result;
    });
  } else {
    return text;
  }
};

// `nth(n)` is a function that returns the nth element of an array
// (where the first element of `x` is `x[0]`).
var nth = function(n) {
  return function(arr) {
    return arr[n - 1];
  }
};

///// LineReader abstraction

// new LineReader(input)
//
// We use this abstraction to ensure that our parser goes line by
// line.  The markdown parser should not require that the whole source be
// stored in memory.
var LineReader = function(input) {
  this.input = input;
  // Split the input up front; doesn't seem too costly.
  this._lines = input.split('\n');
  this._curLine = 0;
};

// Each time getLine() is called, it returns the next line of text,
// or null at the end of input.  Tabs are converted to spaces with
// a tabstop of 4.
LineReader.prototype.getLine = function() {
  if (this._curLine >= this._lines.length) {
    return null;
  } else {
    var res = detabLine(this._lines[this._curLine]);
    this._curLine++;
    return res;
  }
};

///// Lightweight parser combinators

// A parser is a function that takes a parserState and returns a value,
// while possibly mutating parser state. The null value indicates
// failure. Failing parsers are not allowed to mutate state.
// Parser state is an object with 'source' and 'pos' properties.

P = {};

// returns an object with 'result' and final 'pos'.
P.parse = function(parser, source, userstate) {
  var state = userstate || {};
  state.source = source;
  state.pos = 0;
  var result = parser(state);
  return { result: result, pos: state.pos };
};

// applies parser.  if it fails, return null. if it
// succeeds, applies fun(x), where x is the value returned
// by parser.
P.bind = function(parser, fun) {
  return function(state) {
    var startpos = state.pos;
    var res = parser(state);
    if (res === null) {
      return null;
    } else {
      var newres = fun(res)(state);
      if (newres === null) {
        state.pos = startpos;
        return null;
      } else {
        return newres;
      }
    }
  };
};

// returns a value without parsing anything.
P.constant = function(value) {
  return function(state) {
    return value;
  }
}

// succeeds iff parser fails.  Does not advance input.
P.not = function(parser) {
  return function(state) {
    var startpos = state.pos;
    if (parser(state) === null) {
      return true;
    } else {
      state.pos = startpos;
      return null;
    }
  };
}

// Parse 0 or more instances of parser, return an array.
// If stop is provided, this behaves like manyTill parser stop.
P.many = function(parser, stop) {
  return function(state) {
    var results = [];
    var result;
    var startpos = state.pos;
    while (state.pos < state.source.length) {
      var initialPos = state.pos;
      if (stop && stop(state) !== null) {
        return results;
      }
      if ((result = parser(state)) !== null) {
        if (initialPos == state.pos) {
          throw 'many combinator applied to a parser that can match empty';
        }
        results.push(result);
      } else {
        return results;
      }
    }
    // if we get out here, we've hit end of input
    if (stop) { // stop was specified but not matched
      state.pos = startpos;
      return null;
    } else {
      return results;
    }
  }
};

P.many1 = function(parser, stop) {
  return P.unless(function(x) { return (x && x.length === 0) },
                  P.many(parser, stop));
};

// Try a series of parsers and return first match or null.
P.or = function(/*parsers*/) {
  var args = arguments;
  var result;
  return function(state) {
    for (var i = 0, N = args.length; i < N; i++) {
      result = args[i](state);
      if (result !== null) {
        return result;
      }
    }
    return null;
  };
};

// If regex matches, return matched value.
P.regex = function(re) {
  return function(state) {
    var res = matchAt(re, state.source, state.pos);
    if (res === null) {
      return null;
    } else {
      state.pos += res.length;
      return res;
    }
  };
};

// If parser matches, return the value supplied.
P.value = function(parser, val) {
  return function(state) {
    var res = parser(state);
    if (res === null) {
      return null;
    } else {
      return val;
    }
  };
};

// If parser matches, return result of applying fun to the matched
// value.  If the result of fun is null, the whole parser fails.
P.apply = function(parser, fun) {
  return function(state) {
    var startpos = state.pos;
    var res = parser(state);
    if (res === null) {
      return null;
    } else {
      var newres = fun(res);
      if (newres === null) {
        state.pos = startpos;
        return null;
      } else {
        return newres;
      }
    }
  };
};

// Match a sequence of parsers, return array with matches.
P.seq = function(/*parsers*/) {
  var args = arguments;
  return function(state) {
    var results = [];
    var oldpos = state.pos; // save state
    for (var i = 0, N = args.length; i < N; i++) {
      var res = args[i](state);
      if (res === null) {
        state.pos = oldpos; // restore state
        return null;
      } else {
        results.push(res);
      }
    }
    return results;
  };
};

// 'not followed by' - match a parser unless another parser would succeed.
P.nfb = function(notParser, parser) {
  return function(state) {
    var oldpos = state.pos;
    var res = notParser(state);
    if (res === null) {
      return parser(state);
    } else {
      state.pos = oldpos;
      return null;
    }
  };
};

// Match a parser provided the match doesn't satisfy a predicate.
P.unless = function(pred, parser) {
  return function(state) {
    var oldpos = state.pos;
    var res = parser(state);
    if (!pred(res)) {
      return res;
    } else {
      state.pos = oldpos;
      return null;
    }
  }
};

// Return an object containing the parser's return value 'value'
// and the raw string parsed 'raw'.
P.withRaw = function(parser) {
  return function(state) {
    var oldpos = state.pos;
    var res = parser(state);
    if (res === null) {
      return null;
    } else {
      return { value: res,
               raw: state.source.slice(oldpos, state.pos)
             };
    }
  };
};

// Return the raw string parsed by a parser, discarding its returned
// value.
P.raw = function(parser) {
  return P.apply(P.withRaw(parser),
                 function(x) {
                   return x.raw;
                 });
};

P.char = function(c) {
  return function(state) {
    if (state.source[state.pos] === c) {
      state.pos += 1;
      return c;
    } else {
      return null;
    }
  };
};

P.lazy = function(parserFunc) {
  var inner = null;
  return function(state) {
    if (! inner) {
      inner = parserFunc();
    }
    return inner(state);
  };
};

// func is applied to the inner parses of inBalanced.
P.inBalanced = function(left, right, parser, func) {
  var func = func || function(x) { return x };
  return P.apply(P.seq(
    left,
    P.many1(P.or(
      P.lazy(function() {
        return P.inBalanced(left, right, parser, func);
      }),
      parser
    ), right)
  ), function(x) {
    if (x === null) {
      return null;
    } else {
      return func(x[1]);
    }
  });
};

P.string = function(str) {
  return function(state) {
    if (state.source.slice(state.pos, state.pos + str.length) === str) {
      state.pos += str.length;
      return str;
    } else {
      return null;
    }
  };
};

var toStr = function(s) {
  return {t: 'Str', v: s};
};

var toCode = function(s) {
  return {t: 'Code', v: s.replace(/^`*/, '').replace(/`*$/, '').trim()};
};

var pCodeSpan = function(state) {
  var oldpos = state.pos;
  var ticks = P.regex(/^`+/)(state);
  if (ticks === null) {
    state.pos = oldpos;
    return null;
  }
  var matchesOpening = function(s) {
    return (s === ticks);
  };
  var res = P.seq(P.many(P.unless(matchesOpening,
                                   P.regex(/^(?:`+|[^`]+)/m))),
                  P.regex(/^`+/)
                 )(state);
  if (res === null) {
    state.pos = oldpos;
    return null;
  } else {
    return res;
  }
};

// Schemes from http://www.iana.org/assignments/uri-schemes.html plus
// the unofficial schemes coap, doi, javascript.
var pScheme = P.regex(/^(?:coap|doi|javascript|aaa|aaas|about|acap|cap|cid|crid|data|dav|dict|dns|file|ftp|geo|go|gopher|h323|http|https|iax|icap|im|imap|info|ipp|iris|iris.beep|iris.xpc|iris.xpcs|iris.lwz|ldap|mailto|mid|msrp|msrps|mtqp|mupdate|news|nfs|ni|nih|nntp|opaquelocktoken|pop|pres|rtsp|service|session|shttp|sieve|sip|sips|sms|snmp|soap.beep|soap.beeps|tag|tel|telnet|tftp|thismessage|tn3270|tip|tv|urn|vemmi|ws|wss|xcon|xcon-userid|xmlrpc.beep|xmlrpc.beeps|xmpp|z39.50r|z39.50s|adiumxtra|afp|afs|aim|apt|attachment|aw|beshare|bitcoin|bolo|callto|chrome|chrome-extension|com-eventbrite-attendee|content|cvs|dlna-playsingle|dlna-playcontainer|dtn|dvb|ed2k|facetime|feed|finger|fish|gg|git|gizmoproject|gtalk|hcp|icon|ipn|irc|irc6|ircs|itms|jar|jms|keyparc|lastfm|ldaps|magnet|maps|market|message|mms|ms-help|msnim|mumble|mvn|notes|oid|palm|paparazzi|platform|proxy|psyc|query|res|resource|rmi|rsync|rtmp|secondlife|sftp|sgn|skype|smb|soldat|spotify|ssh|steam|svn|teamspeak|things|udp|unreal|ut2004|ventrilo|view-source|webcal|wtai|wyciwyg|xfire|xri|ymsgr):/i);

var pUriChars =
  P.regex(/^[\/\w\u0080-\uffff]+|%[A-Fa-f0-9]+|&#?\w+;|(?:[,]+|[\S])[%&~\w\u0080-\uffff]/);

var pUri = P.raw(P.seq(
  pScheme,
  P.regex(/^(?:\/\/)?/),
  P.many1(P.or(
    P.raw(P.inBalanced(P.char('('), P.char(')'), pUriChars)),
    P.raw(P.inBalanced(P.char('['), P.char(']'), pUriChars)),
    P.raw(P.inBalanced(P.char('{'), P.char('}'), pUriChars)),
    pUriChars
  ))));

var pEmail = P.regex(/[^\s>]+@[^\s>]+/);

var pAutolink = P.or(
  P.apply(pUri,
          function(s) {
            return {t: 'Link', v: [{t: 'Str', v: s}], url: s, bare: true};
          }),
  P.apply(P.seq(P.char('<'), pUri, P.char('>')),
          function(x) {
            return {t: 'Link', v: [{t: 'Str', v: x[1]}], url: x[1]};
          }),
  P.apply(P.seq(P.char('<'), pEmail, P.char('>')),
          function(x) {
            return {t: 'Link', v: [{t: 'Str', v: x[1]}], url: 'mailto:' + x[1]};
          })
);

// captures: 1 = open tag type, 2 = close tag type
var reHtmlTag = /^<(?:([A-Za-z][A-Za-z0-9:]*)\s*(?:[A-Za-z][A-Za-z0-9:]*=(?:'[^']*'|"[^"]*"|\w+)\s*)*\/?|\/([A-Za-z][A-Za-z0-9:]*)\s*)>/;

var pHtmlTag = P.regex(reHtmlTag);

var pHtmlComment = P.regex(/^<!--[\s\S]*-->/);

var toRawHtml = function(s) {
  return {t: 'HtmlInline', v: s};
};

var pEmphasis = function(state) {
  var startpos = state.pos;
  var source = state.source;
  var cs = matchAt(/^(?:\*+|_+)/, source, startpos);
  if (cs === null) {
    return null;
  }
  var c = cs[0];
  state.pos += cs.length;
  if (c === '_' && startpos > 0 && matchAt(/^\w/, source, startpos - 1) !== null) {
    // disallow intraword emphasis for _
    // problem is that \w is not unicode aware, is it?
    return {t: 'Str', v: cs};
  }
  if (matchAt(/\s/, source, state.pos)) {
    // emphasis start can't precede a space character
    return {t: 'Str', v: cs};
  }
  switch (cs.length) {
  case 1:
    return pOne(c)(state);
  case 2:
    return pTwo(c)(state);
  case 3:
    return pThree(c)(state);
  default:
    return {t: 'Str', v: cs};
  }
};

// parse inlines til you hit a c, and emit Emph.
// if you never hit a c, emit c + inlines parsed.
var pOne = function(c, prefix) {
  if (!prefix) {
    prefix = [];
  }
  return function(state) {
    var contents = P.many(P.or(
      P.nfb(P.char(c), pInline),
      P.apply(P.seq(P.string(c + c), P.nfb(P.char(c), pTwo(c))), nth(2))
    ))(state);
    var ch = P.char(c)(state);
    if (ch === null) {
      return [{t: 'Str', v: c}].concat(prefix, contents);
    } else if (contents.length === 0 && prefix.length === 0) {
      return {t: 'Str', v: c + c};
    } else {
      return {t: 'Emph', v: prefix.concat(contents)};
    }
  }
};

// parse inlines til you hit two c's, and emit Strong.
// if you never do hit two c's, emit cc plus + inlines parsed.
var pTwo = function(c, prefix) {
  if (!prefix) {
    prefix = [];
  }
  return function(state) {
    var ender = P.string(c + c);
    var contents = P.many(P.nfb(ender, pInline))(state);
    var end = ender(state);
    if (end === null) {
      return [{t: 'Str', v: c + c}].concat(prefix, contents);
    } else {
      return {t: 'Strong', v: prefix.concat(contents)};
    }
  };
};

// parse inlines til you hit one c or a sequence of two c's.
// If one c, emit Emph and then parse pTwo.
// if two c's, emit Strong and then parse pOne.
// otherwise, emit ccc then the results.
var pThree = function(c) {
  return function(state) {
    var contents = P.many(P.nfb(P.char(c), pInline))(state);
    var c1 = P.char(c)(state);
    if (c1 === null) {
      return [{t: 'Str', v: c + c + c}].concat(contents);
    } else {
      var c2 = P.char(c)(state);
      if (c2 === null) {
        return pTwo(c, [{t: 'Emph', v: contents}])(state);
      } else {
        return pOne(c, [{t: 'Strong', v: contents}])(state);
      }
    }
  };
};

var pEscaped = P.apply(P.regex(/^\\[-`~!@#$%^&*()_,.;:\\'"\/?\|=+<>{}[\]]/),
                       function(s) {
                         return s.slice(1);
                       });

// note, [\S\s] will match newlines, unlike .
var pAnyChar = P.or(pEscaped, P.regex(/^[\S\s]/));

var inBrackets = function(x) {
  return [{t: 'Str', v: '['}].concat(x, [{t: 'Str', v: ']'}]);
};

var pLinkLabelAux = P.apply(P.seq(P.char('['),
                                  P.many(P.or(
                                    P.apply(P.lazy(function() {
                                      return pLinkLabelAux;
                                    }), inBrackets),
                                    P.lazy(function() {
                                      return pInline;
                                    })
                                  ), P.char(']'))
                                 ), nth(2));

// A link label [like this].
var pLinkLabel = P.withRaw(pLinkLabelAux);

var removeDelims = function(str) {
  return str.slice(1, str.length - 1);
};

var pUrlChunk = P.or(P.regex(/^[^\\\s()]+/), pEscaped);

// A URL in a link or reference.  This may optionally be contained
// in `<..>`; otherwise whitespace and unbalanced right parentheses
// aren't allowed.  Newlines aren't allowed in any case.
var pLinkUrl =
  P.or(
    P.apply(
      P.seq(P.char('<'),
            P.many(pAnyChar, P.char('>'))),
      function(x) { return x[1].join(''); }),
    P.apply(
      P.many(
        P.or(
          P.inBalanced(P.char('('), P.char(')'), pUrlChunk,
                       function(x) { return ('(' + x.join('') + ')'); }),
          pUrlChunk)),
      function(x) { return x.join(''); })
  );

// A link title, single or double quoted or in parentheses.
// Note that Markdown.pl doesn't allow the parenthesized form in
// inline links -- only in references -- but this restriction seems
// arbitrary, so we remove it here.
var pLinkTitle =
  P.apply(P.or(
    P.inBalanced(P.regex(/^"(?![\s)])/), P.regex(/"(?![\w\u0080-\uffff])/),
                 pAnyChar,
                 function(x) {
                   return ('"' + x.join('') + '"');
                 }),
    P.inBalanced(P.regex(/^'(?![\s)])/), P.regex(/'(?![\w\u0080-\uffff])/),
                 pAnyChar,
                 function(x) {
                   return ("'" + x.join('') + "'");
                 }),
    P.inBalanced(P.regex(/^\((?![\s)])/), P.regex(/\)(?![\w\u0080-\uffff])/),
                 pAnyChar,
                 function(x) {
                   return ('(' + x.join('') + ')');
                 })
    ), removeDelims);

// An inline link: [label](/url "optional title").
// This parser assumes that the link label has already
// been parsed (in pLink), so it comes as a parameter.
var pInlineLink = function(label) {
  return P.apply(P.seq(P.regex(/\( */),
                       pLinkUrl,
                       P.regex(/\s*/),
                       P.or(
                         pLinkTitle,
                         P.constant('')
                       ),
                       P.regex(/ *\)/)
                      ),
                 function(x) {
                   return {t: 'Link', v: label.value, url: x[1], title: x[3]};
                 });
};

var pGetReferences = function(state) {
  return state.references;
};

// A reference link: [label], [foo][label], or [label][].
// This parser assumes that the link label has already
// been parsed (in pLink), so it comes as a parameter
// in both raw and parsed forms.
var pReferenceLink = function(label) {
  return P.apply(
    P.seq(
      P.or(
        P.apply(P.seq(P.regex(/^\s*/), pLinkLabel), nth(2)),
        P.constant(label)
      ),
      pGetReferences),
    function(res) {
      var ref = res[0].raw === '[]' ? label.raw : res[0].raw;
      var references = res[1];
      var found = references[normalizeLabel(ref)];
      if (found) {
        return {t: 'Link', v: label.value,
                url: found.url, title: found.title };
      } else {
        return null;
      }
    });
};

var pLink = P.bind(pLinkLabel,
                   function(label) {
                     return P.or(pInlineLink(label),
                                 pReferenceLink(label));
                   });

// An image. A link preceded by !.
var pImage = P.apply(P.seq(P.char('!'), pLink),
                     function(x) {
                       var link = x[1];
                       link.t = 'Image';
                       return link;
                     });

var toEntity = function(x) { return {t: 'Entity', v: x}; };

var pEntity = P.apply(P.regex(/^\&(?:#[Xx][0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);/),
                      toEntity);

var pReference =
  P.apply(
    P.seq(
      P.regex(/^ {0,3}/),
      pLinkLabel,
      P.char(':'),
      P.regex(/^\s*/),
      P.or(pLinkUrl, P.constant('')),
      P.regex(/^\s*/),
      P.or(pLinkTitle, P.constant('')),
      P.regex(/^ *\n?/)
    ),
    function(x) {
      var label = x[1];
      var url = x[4];
      var title = x[6];
      return {label: normalizeLabel(label.raw), url: url, title: title};
    });

var pInline = P.or(
  P.value(P.regex(/^ {2,}\n/), {t: 'LineBreak'}),
  P.value(P.regex(/^ *\n/), {t: 'SoftBreak'}),
  P.value(P.regex(/^ +/), {t: 'Space'}),
  pAutolink,
  P.apply(P.or(pHtmlTag, pHtmlComment), toRawHtml),
  P.apply(P.regex(/[^-()[\]{}\s![\]\\&*_`<](?:_*[^-()[\]{}\s![\]\\&*_`<])*/), toStr),
  P.value(P.regex(/^\\\n/), {t: 'LineBreak'}),
  P.apply(pEscaped, toStr),
  pEmphasis,
  pLink,
  pImage,
  P.apply(P.raw(pCodeSpan), toCode),
  pEntity,
  P.apply(P.regex(/^./), toStr)
);

// parse a string into an array of inline objects,
// resolving references.
var parseInlines = function(str, references) {
  return P.parse(P.many(pInline), str, { references: references }).result;
};

///// Scanners

// A scanner is a function that takes a string and a position
// and returns either null (if no match) or a matched string.

var nullScanner = function(str, pos) {
  return '';
};

// scans spaces up to a specified column.
var scanToCol = function(col) {
  return function(str, pos) {
    var ind = str.substring(pos, col);
    if (/^ *$/.test(ind)) {
      return ind;
    } else {
      return null;
    }
  };
};

// make scanner from regex
var reScanner = function(re) {
  return function(str, pos) {
    return matchAt(re, str, pos);
  }
};

var scanLookaheadNonblank = function(str, pos) {
  if (str.lastIndexOf(' ') < str.length - 1) {
    return '';
  } else {
    return null;
  }
};

var scanBlockquoteStart = reScanner(/^ {0,3}> ?/);
var scanBlankline = reScanner(/^ *$/);
var scanHrule = reScanner(/^ {0,3}(?:(?:[*] *){3,}|(?:- *){3,}|(?:_ *){3,}) *$/);
var scanIndentedCode = reScanner(/^(?: {4}| *$)/);
var scanAtxHeaderStart = reScanner(/^#{1,6}(?: +|$)/);
var scanSetextHeaderLine = reScanner(/^(-{1,}|={1,}) *$/);

// captures: 1 = bullet, 2 = digits, 3 = number delimiter ('.' or ')')
var reListItemStart = /^ {0,3}(?:([-+*])|([0-9]+)([.)]))( |$)/;
var scanListItemStart = reScanner(reListItemStart);
var reCodeFence = /^(`{3,}|~{3,}) *(\w+)? *([^`]*)$/;
var scanCodeFence = reScanner(reCodeFence);
var scanHtmlBlockStart = reScanner(/^ {0,3}(?:<\/?(article|header|aside|hgroup|blockquote|hr|body|li|br|map|button|object|canvas|ol|caption|output|col|p|colgroup|pre|dd|progress|div|section|dl|table|dt|tbody|embed|textarea|fieldset|tfoot|figcaption|th|figure|thead|footer|footer|tr|form|ul|h1|h2|h3|h4|h5|h6|video)[ \/>]|<!--|-->)/);

var scanReferenceStart = function(str, pos) {
  return P.parse(P.raw(P.seq(
    P.regex(/^ {0,3}/),
    pLinkLabel,
    P.char(':')
  )), str.slice(pos)).result;
};

// stop parsing reference at a blankline or another reference.
var scanReferenceLine = reScanner(/^(?!\s*(?:$|\[))/);

///// Container Stack

// To aid in building a hierarchical structure while parsing the
// source string, we use a global "container stack" onto which
// containers are pushed and popped.
//
// Containers come in two varieties: regular containers (which have
// 'children') and line containers (which have 'lines').  A "leaf"
// is non-container object that is the child of a regular container.
// Line containers have a boolean property 'lineContainer' set to
// true.
//
// In addition to 'children', 'lines', and 'lineContainer', containers
// have the following properties:
//
//   - 't'        - a descriptive string, e.g. 'Blockquote'
//   - 'startPos' - an object with 'line' and 'column' properties
//   - 'depth'    - the length of the stack when the property was added
//   - other metadata properties that vary with the type of container
//
// Some types of containers are parameterized by named properties,
// which are only used during parsing and are not part of the output.
//
// The container stack is implemented as an array of objects with
// 'container' and 'blockIndent' properties.  The 'blockIndent' is a
// scanner that must be matched if the block is to continue (leaving
// aside "lazy" continuations of paragraph text).  For example, the
// blockIndent for a blockquote container is a scanner that matches
// 0-3 spaces, a '>' character, and an optional space.  These scanners
// are put in the stack, but not in the containers themselves, because
// they are no longer needed once the containers are closed.

var ContainerStack = function() {
  // array of objects with 'container' and 'blockIndent' properties.
  this._contents = [{ container: { t: 'Document',
                                   startPos: { line: 0, col: 0 },
                                   children: [],
                                   depth: 0 },
                      blockIndent: nullScanner }];
};

ContainerStack.prototype.currentContainer = function() {
  return this._contents[this._contents.length - 1].container;
};

ContainerStack.prototype.closeContainer = function(container) {
  if (container.depth == 0) {
    return null; // don't remove the root
  } else {
    this._contents.splice(container.depth,
                          this._contents.length - container.depth);
  }
};

ContainerStack.prototype.closeCurrentContainer = function() {
  this.closeContainer(this.currentContainer());
};

ContainerStack.prototype.closeNestedContainers = function(container) {
  this._contents.splice(container.depth + 1,
                        this._contents.length - (container.depth + 1));
};

ContainerStack.prototype.openContainer =
  function(containerType, line, column, blockIndent) {
    var newContainer = {t: containerType};
    if (this.currentContainer().lineContainer) {
      // if current container is a line container,
      // close it and add to its parent:
      this.closeCurrentContainer();
    }
    newContainer.depth = this._contents.length;
    newContainer.children = [];
    newContainer.startPos = { line: line, column: column };
    this.currentContainer().children.push(newContainer);
    this._contents.push({ container: newContainer,
                          blockIndent: blockIndent || nullScanner });
    return newContainer;
  };

// A line container can't have children; instead it has lines.
ContainerStack.prototype.openLineContainer =
  function(containerType, line, column, blockIndent) {
    var newContainer = this.openContainer(containerType, line,
                                          column, blockIndent);
    delete newContainer.children;
    newContainer.lineContainer = true;
    newContainer.lines = [];
    return newContainer;
  };

ContainerStack.prototype.addLeaf = function(object, line, col) {
  if (this.currentContainer().lineContainer) {
    // if current container is a line container,
    // close it and add to its parent:
    this.closeCurrentContainer();
  }
  object.startPos = { line: line, col: col };
  this.currentContainer().children.push(object);
};

ContainerStack.prototype.addLine = function(line) {
  var current = this.currentContainer();
  if (current.lines === null) {
    throw "Can't add line to a non-line container";
  } else {
    current.lines.push(line);
  }
};

ContainerStack.prototype.contents = function() {
  return this._contents;
};

// for debugging
ContainerStack.prototype.toString = function() {
  var stack = [];
  for (var i = 0; i < this._contents.length; i++) {
    stack.push(this._contents[i].container.t);
  }
  return stack.join(':');
};

///// Main parser

// Converts source to markdown AST.  Returns an object
// with methods toAST() and toHtml(options).
// So, markdown.parse("hello").toHtml() === "<p>hello</p>"
var parse = function(source) {
  var reader = new LineReader(source);
  var ast = parseLines(reader);
  return { toAST: function() { return ast; },
           toHtml: toHtml(ast)
         };
};

// Parameter is a 'reader' object, with method getLine(),
// which returns a string (the next line of text) each time
// it is called.  getLine() returns null when there are no more lines.
var parseLines = function(reader) {

  var stack = new ContainerStack();
  var doc = stack.currentContainer();
  doc.blankLines = {}; // map of numbers of blank lines
  var referenceStack = [];

  var line = 0; // keep track of line number
  var text;

  while ((text = reader.getLine()) !== null) {

    line++;
    var allMatched = true; // did all the container parsers match?
    var lastMatchedContainer = doc;
    var col = 0;

    // Iterate over open containers, trying to match blockIndent
    // for each.  On failure close the block and set allMatched to
    // false.  If all succeed, allMatched will be true.
    var stackContents = stack.contents();
    for (var i = 0; i < stackContents.length; i++) {
      var item = stackContents[i];
      var match = item.blockIndent(text, col);
      if (match == null) {
        // Once we fail to match a blockIndent, we have either
        // a lazy text line or a new block.  Note that in the following,
        // 'there' is not a lazy text continuation of 'hi':
        // > - > hi
        // > > there
        allMatched = false;
        // lastMatchedContainer will contain the last matched container,
        // so we can close its nested containers before adding new ones
        break;
      } else {
        lastMatchedContainer = item.container;
        col += match.length;
      }
    }

    // Call this function later to close unmatched containers.
    // We don't do that now, because we might have a lazy text line.
    var closeUnmatchedContainers = function() {
      if (!allMatched) {
        stack.closeNestedContainers(lastMatchedContainer);
        allMatched = true; // needed for the case where we add more
        // containers later in the loop; we don't want to close them
      }
    };

    // If we're parsing a code block, reference, or html block,
    // add the line.

    if (allMatched) {

      switch (stack.currentContainer().t) {

      case 'CodeBlock':
        var t = text.slice(col);
        if (stack.currentContainer().indented) {
          stack.addLine(t);
          continue;
        } else if (stack.currentContainer().fenced) {
          var endfence = new RegExp('^' +
                                    stack.currentContainer().fence + '+');
          if (endfence.test(t)) {
            stack.closeCurrentContainer();
          } else {
            stack.addLine(t);
          }
          continue;
        }

      case 'Reference':
        stack.addLine(text.slice(col));
        continue;

      case 'HtmlBlock':
        stack.addLine(text.slice(col));
        continue;

      default:
      }
    }

    // Now we look ahead on the line to see what remains.
    // Do we have a blankline, a new block start, or text?

    //  check for new container starts
    var first = true;
    var listStart = false;
    while (true) {
      var match;
      // blockquote start?
      if (match = scanBlockquoteStart(text, col)) {
        // open new blockquote container
        if (first) {
          closeUnmatchedContainers();
        }
        stack.openContainer('Blockquote', line,
                            col, scanBlockquoteStart);
        col = col += match.length;
      } else if ((match = scanListItemStart(text, col)) !== null &&
                 scanHrule(text, col) === null) {
        if (first) {
          closeUnmatchedContainers();
        }
        listStart = true;
        // captures: 1 = bullet, 2 = digits, 3 = number delimiter
        var newcol = col + match.length;
        var li = stack.openContainer('ListItem', line, col,
                                     scanToCol(newcol));
        var captures = reListItemStart.exec(match);
        li.bullet = captures[1];
        li.number = captures[2];
        li.delimiter = captures[3];
        col = newcol;
      } else {
        break;
      }
      first = false;
    }

    // blankline?
    if ((match = scanBlankline(text, col)) !== null) {
      // add to list of blank lines -- unless this is
      // an empty list item, then we don't count it as
      // blank for purposes of tight/loose
      doc.blankLines[line] = !listStart;
      closeUnmatchedContainers();
      if (stack.currentContainer().t == 'Para') {
        stack.closeCurrentContainer();
      }
      if (stack.currentContainer().t == 'ListItem' &&
          doc.blankLines[line - 1]) {
        // if previous line also blank, close ListItem
        stack.closeCurrentContainer();
      }
      continue;
    }

    // indented code block
    if ((match = scanIndentedCode(text, col)) !== null) {
      col += match.length;
      closeUnmatchedContainers();
      var c = stack.openLineContainer('CodeBlock', line, col,
                                      scanIndentedCode);
      c.indented = true;
      stack.addLine(text.slice(col));
      continue;
    }

    // TODO - make the nonindent space generic so it needn't be repeated
    // in the scanners

    // TODO - define consume or something to abstract out the pattern
    // of applying a scanner, then incrementing col if it matches.

    // ATX header
    if ((match = scanAtxHeaderStart(text, col)) !== null) {
      var hashes = matchAt(/^#*/, text, col);
      var level = hashes.length;
      col += match.length;
      var raw = text.slice(col).replace(/([^\\])#* *$/, '$1').trim();
      closeUnmatchedContainers();
      stack.addLeaf({t: 'Header', level: level, raw: raw}, line, col);
      continue;
    }

    // Setext header: if this is a setext header line,
    // and we're currently in a paragraph, and neither this
    // nor the previous line is lazy, then remove the last
    // line of the paragraph and use it as a setext header,
    // closing the paragraph.
    if (allMatched &&
        stack.currentContainer().t === 'Para' &&
        stack.currentContainer().lines.length > 0 &&
        !lastLineLazy &&
        (match = scanSetextHeaderLine(text, col)) !== null) {
      var para = stack.currentContainer();
      var level = matchAt(/^ *=/, text, col) ? 1 : 2;
      var raw = para.lines[para.lines.length - 1];
      para.lines.splice(para.lines.length - 1, 1);
      stack.closeContainer(para);
      if (para.lines.length == 0) {
        // if we've emptied the paragraph remove it entirely
        // TODO this breaks the abstraction a bit
        stack.currentContainer().children.
          splice(stack.currentContainer().children.length - 1, 1);
      }
      stack.addLeaf({t: 'Header', level: level, raw: raw}, line, col);
      continue;
    }

    // hrule
    if ((match = scanHrule(text, col)) !== null) {
      closeUnmatchedContainers();
      stack.addLeaf({t: 'Hrule'}, line, col);
      continue;
    }

    if ((match = scanCodeFence(text, col)) !== null) {
      var captures = reCodeFence.exec(text.slice(col)); // 1 = fence, 2 = lang, 3 = rest
      closeUnmatchedContainers();
      var cont = stack.openLineContainer('CodeBlock', line, col);
      cont.fenced = true;
      cont.fence = captures[1];
      cont.lang = captures[2];
      cont.rest = captures[3];
      continue;
    }

    if ((match = scanReferenceStart(text, col)) !== null) {
      closeUnmatchedContainers();
      var r = stack.openLineContainer('Reference', line, col,
                                      scanReferenceLine);
      referenceStack.push(r);
      stack.addLine(text.slice(col));
      continue;
    }

    // HTML block
    // for now, this is really primitive.  if a block starts
    // with an html tag, we just scan til the next blank line.
    // we don't try to parse balanced tags.  an alternative would
    // keep a count of open tags in the container metadata.
    if ((match = scanHtmlBlockStart(text, col)) !== null) {
      closeUnmatchedContainers();
      stack.openLineContainer('HtmlBlock', line, col, scanLookaheadNonblank);
      stack.addLine(text.slice(col));
      continue;
    }

    // no block starts match:  we have a text line.

    if (stack.currentContainer().t !== 'Para') {

      closeUnmatchedContainers();
      stack.openLineContainer('Para', line, col);
      lastLineLazy = false;
    } else {
      lastLineLazy = !allMatched;
    }
    stack.addLine(text.slice(col).replace(/^ +/, ''));
    continue;
  }

  // close all containers above Document and return Document
  stack.closeNestedContainers(doc);

  // referenceStack should now contain all the references.
  // parse them and populate doc.references.
  var references = processReferenceStack(referenceStack);

  return processBlocks(doc.children, references, doc.blankLines);
};

// Parse all the references and return a reference map.
var processReferenceStack = function(referenceStack) {
  var references = {};
  for (i = 0; i < referenceStack.length; i++) {
    var rawref = referenceStack[i].lines.join('\n').trim();
    var res = P.parse(pReference, rawref);
    // If parse fails, or parse is not complete,
    // take remainder and make it into a 'Para'
    if (res) {
      var ref = res.result;
      var endpos = res.pos;
      if (endpos < rawref.length - 1) {
        referenceStack[i].lines = rawref.slice(endpos).split('\n');
        referenceStack[i].t = 'Para';
      }
      references[ref.label] = ref;
    } else {
      referenceStack[i].t = 'Para';
    }
  }
  return references;
};

// Construct AST from the Document container built by parseLines.
// This involves:
// - assembling sequences of list items into lists, and determining
//   their status as tight/loose
// - combining lines in paragraphs and parsing them into inline elements.
// - combining lines in code blocks.
// - parsing 'raw' properties and replacing with inline elements.
// - deleting properties not needed in the AST
// - resolving link references.

var processBlocks = function(blocks, references, blankLines) {
  var bs = [];  // the result to return
  var i = 0;

  var deleteUselessProperties = function(block) {
    delete block.lineContainer;
    delete block.lines;
    delete block.depth;
    delete block.children;
  };

  // iterate over blocks
  while (blocks[i]) {
    var block = blocks[i];
    switch (block.t) {
    case 'Para':
      block.v = parseInlines(block.lines.join('\n'), references);
      deleteUselessProperties(block);
      bs.push(block);
      break;
    case 'Blockquote':
      block.v = processBlocks(block.children, references, blankLines);
      deleteUselessProperties(block);
      bs.push(block);
      break;
    case 'Hrule':
      bs.push(block);
      break;
    case 'ListItem':
      var tight = true;
      block.v = processBlocks(block.children, references, blankLines);
      // check for blanklines before start of any of the
      // blocks, excepting the first
      for (j = block.v.length - 1; j > 0; j--) {
        tight = tight && !blankLines[block.v[j].startPos.line - 1];
      }
      var bullet = block.bullet;
      var start = block.number;
      var delimiter = block.delimiter;
      delete block.number;
      delete block.bullet;
      delete block.delimiter;
      deleteUselessProperties(block);

      var items = [block];

      // Collect list items as long as style doesn't change:
      while (blocks[i + 1] &&
             blocks[i + 1].t == 'ListItem' &&
             blocks[i + 1].bullet == bullet &&
             blocks[i + 1].delimiter == delimiter &&
             // two blank lines ends a list
             !(blankLines[blocks[i + 1].startPos.line - 1] &&
               blankLines[blocks[i + 1].startPos.line - 2])) {
        var item = blocks[i + 1];
        item.v = processBlocks(item.children, references, blankLines);
        // check for blanklines before the start of any of the blocks:
        for (j = item.v.length - 1; j >= 0; j--) {
          tight = tight && !blankLines[item.v[j].startPos.line - 1];
        }
        deleteUselessProperties(item);
        delete item.number;
        delete item.bullet;
        delete item.delimiter;
        items.push(blocks[i + 1]);
        i++;
      }

      // now items holds the list items
      var list = { t: bullet ? 'BulletList' : 'OrderedList',
                   tight: tight,
                   startPos: items[0].startPos,
                   v: items};
      if (bullet) {
        list.bullet = bullet;
      } else {
        list.start = start;
        list.delimiter = delimiter;
      }
      bs.push(list);
      break;
    case 'Header':
      block.v = parseInlines(block.raw, references);
      bs.push(block);
      break;
    case 'CodeBlock':
      block.v = block.lines.join('\n');
      if (block.indented) {
        block.v = block.v.replace(/\n*$/, '');
      }
      deleteUselessProperties(block);
      bs.push(block);
      break;
    case 'HtmlBlock':
      block.v = block.lines.join('\n');
      deleteUselessProperties(block);
      bs.push(block);
      break;
    case 'Reference':
      // Don't include in AST
      break;
    default:
      throw ('processBlocks, unknown block type "' + block.t + '"');
    }
    i++;
  }
  return bs;
};

///// Writers

var toHtml = function(ast) {
  return function(options) {
    options = options || { rawHtml: true,
			   preserveNewlines: true,
			   newlinesAsBreaks: false
                         }
    return blocksToHtml(ast, options);
  }
};

var escapeHtml = function(x) {
  return x.replace(/[&<>'"]/g,
                   function(c) {
                     if (c == '&') {
                       return '&amp;';
                     } else if (c == '<') {
                       return '&lt;';
                     } else if (c == '>') {
                       return '&gt;';
                     } else if (c == "'") {
                       return '&#39;';
                     } else if (c == '"') {
                       return '&quot;';
                     } else {
                       return c;
                     }
                   });
};

var blocksToHtml = function(blocks, options, tight) {
  var xs = [];
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];
    switch (block && block.t) {
    case 'Blankline':
      // xs.push(""); // preserve user's blanks
      break;
    case 'Para':
      if (tight) {
        xs.push(inlinesToHtml(block.v, options));
      } else {
        xs.push('<p>' + inlinesToHtml(block.v, options) + '</p>');
      }
      break;
    case 'Blockquote':
      xs.push('<blockquote>\n' + blocksToHtml(block.v, options) + '\n</blockquote>');
      break;
    case 'CodeBlock':
      var attr = '';
      if (block.lang) {
        attr = ' class="' + escapeHtml(block.lang) + '"';
      }
      xs.push('<pre' + attr + '><code>' + escapeHtml(block.v) +
              '\n</code></pre>');
      break;
    case 'Header':
      xs.push('<h' + block.level + '>' + inlinesToHtml(block.v, options) +
              '</h' + block.level + '>');
      break;
    case 'Hrule':
      xs.push('<hr />');
      break;
    case 'OrderedList':
      var mbstart = (block.start && block.start > 1) ?
        (' start="' + block.start + '"') : '';
      xs.push('<ol' + mbstart + '>\n' + blocksToHtml(block.v, options, block.tight) + '\n</ol>');
      break;
    case 'BulletList':
      xs.push('<ul>\n' + blocksToHtml(block.v, options, block.tight) + '\n</ul>');
      break;
    case 'ListItem':  // TODO handle tight/loose
      xs.push('<li>' + blocksToHtml(block.v, options, tight) + '</li>');
      break;
    case 'HtmlBlock':
      if (options.rawHtml) {
	xs.push(block.v);
      } else {
        xs.push(escapeHtml(block.v));
      }
      break;
    default:
      throw ('blocksToHtml: unimplemented: ' + block.t);
    }
  }
  return xs.join('\n');
};

var inlinesToHtml = function(inlines, options) {
  var xs = [];
  for (var i = 0; i < inlines.length; i++) {
    var inline = inlines[i];
    // An inline list contains inline objects and possibly
    // also lists of them.  So we deal with both cases.
    if (isArray(inline)) { // an array of inlines
      xs.push(inlinesToHtml(inline, options));
    } else {
      switch (inline.t) {
      case 'Str':
        xs.push(escapeHtml(inline.v));
        break;
      case 'Entity':
        xs.push(inline.v);
        break;
      case 'Space':
        xs.push(' ');
        break;
      case 'Link':
        var mbtitle = inline.title ?
          (' title="' + escapeHtml(inline.title) + '"') : '';
        xs.push('<a href="' + escapeHtml(inline.url) + '"' + mbtitle +
                '>' + inlinesToHtml(inline.v, options) + '</a>');
        break;
      case 'Image':
        xs.push('<img src="' + escapeHtml(inline.url) +
                '" alt="' + escapeHtml(inlinesToHtml(inline.v, options)) + '"' +
                (inline.title ? (' title="' + escapeHtml(inline.title) + '"') : '') +
                ' />');
        break;
      case 'Emph':
        xs.push('<em>' + inlinesToHtml(inline.v, options) + '</em>');
        break;
      case 'Strong':
        xs.push('<strong>' + inlinesToHtml(inline.v, options) + '</strong>');
        break;
      case 'Code':
        xs.push('<code>' + escapeHtml(inline.v) + '</code>');
        break;
      case 'SoftBreak':
	if (options.newlinesAsBreaks) {
	  xs.push('<br />');
	}
	if (options.preserveNewlines) {
          xs.push('\n'); // retain user's linebreaks
	} else {
	  xs.push(' ');
	}
        break;
      case 'LineBreak':
        xs.push('<br />\n');
        break;
      case 'HtmlInline':
	if (options.rawHtml) {
          xs.push(inline.v);
	} else {
          xs.push(escapeHtml(inline.v));
        }
        break;
      default:
        throw ('inlinesToHtml: unimplemented: ' + inline);
      }
    }
  }
  return xs.join('');
};


exports.parse = parse;

})(typeof exports === 'undefined' ? this['markdown'] = {} : exports);
