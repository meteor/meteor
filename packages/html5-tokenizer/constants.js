var HTML5 = require('../html5');

HTML5.CONTENT_MODEL_FLAGS = [
	'PCDATA',
	'RCDATA',
	'CDATA',
	'SCRIPT_CDATA',
	'PLAINTEXT'
];

HTML5.Marker = {type: 'Marker', data: 'this is a marker token'};


(function() {
	function EOF() {
	}

	EOF.prototype = {
		toString: function() { throw new Error("EOF added as string"); }
	};
	HTML5.EOF = new EOF();
})();


HTML5.EOF_TOK = {type: 'EOF', data: 'End of File' };
HTML5.DRAIN = -2;

HTML5.SCOPING_ELEMENTS = [
	'applet', 'caption', 'html', 'table', 'td', 'th', 
	'marquee', 'object', 'math:mi', 'math:mo', 'math:mn', 'math:ms', 'math:mtext', 
	'math:annotation-xml', 'svg:foreignObject', 'svg:desc', 'svg:title'
];

HTML5.LIST_SCOPING_ELEMENTS = [
	'ol', 'ul',
	'applet', 'caption', 'html', 'table', 'td', 'th', 
	'marquee', 'object', 'math:mi', 'math:mo', 'math:mn', 'math:ms', 'math:mtext', 
	'math:annotation-xml', 'svg:foreignObject', 'svg:desc', 'svg:title'
];
HTML5.BUTTON_SCOPING_ELEMENTS = [
	'button',
	'applet', 'caption', 'html', 'table', 'td', 'th', 
	'marquee', 'object', 'math:mi', 'math:mo', 'math:mn', 'math:ms', 'math:mtext', 
	'math:annotation-xml', 'svg:foreignObject', 'svg:desc', 'svg:title'
];
HTML5.TABLE_SCOPING_ELEMENTS = [
	'table', 'html'
];
HTML5.SELECT_SCOPING_ELEMENTS = [
	'option', 'optgroup'
];
HTML5.FORMATTING_ELEMENTS = [
	'a',
	'b',
	'big',
	'code',
	'em',
	'font',
	'i',
	'nobr',
	's',
	'small',
	'strike',
	'strong',
	'tt',
	'u'
];
HTML5.SPECIAL_ELEMENTS = [
	'address',
	'area',
	'base',
	'basefont',
	'bgsound',
	'blockquote',
	'body',
	'br',
	'center',
	'col',
	'colgroup',
	'dd',
	'dir',
	'div',
	'dl',
	'dt',
	'embed',
	'fieldset',
	'form',
	'frame',
	'frameset',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'head',
	'hr',
	'iframe',
	'image',
	'img',
	'input',
	'isindex',
	'li',
	'link',
	'listing',
	'menu',
	'meta',
	'noembed',
	'noframes',
	'noscript',
	'ol',
	'optgroup',
	'option',
	'p',
	'param',
	'plaintext',
	'pre',
	'script',
	'select',
	'spacer',
	'style',
	'tbody',
	'textarea',
	'tfoot',
	'thead',
	'title',
	'tr',
	'ul',
	'wbr'
];
HTML5.SPACE_CHARACTERS_IN = "\t\n\x0B\x0C\x20\u0012\r";
HTML5.SPACE_CHARACTERS = "[\t\n\x0B\x0C\x20\r]";
HTML5.SPACE_CHARACTERS_R = /^[\t\n\x0B\x0C \r]/;

HTML5.TABLE_INSERT_MODE_ELEMENTS = [
	'table',
	'tbody',
	'tfoot',
	'thead',
	'tr'
];

HTML5.ASCII_LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
HTML5.ASCII_UPPERCASE = HTML5.ASCII_LOWERCASE.toUpperCase();
HTML5.ASCII_LETTERS = "[a-zA-Z]";
HTML5.ASCII_LETTERS_R = /^[a-zA-Z]/;
HTML5.DIGITS = '0123456789';
HTML5.DIGITS_R = new RegExp('^[0123456789]');
HTML5.HEX_DIGITS = HTML5.DIGITS + 'abcdefABCDEF';
HTML5.HEX_DIGITS_R = new RegExp('^[' + HTML5.DIGITS + 'abcdefABCDEF' +']' );

// Heading elements need to be ordered 
HTML5.HEADING_ELEMENTS = [
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6'
];

HTML5.VOID_ELEMENTS = [
	'base',
	'link',
	'meta',
	'hr',
	'br',
	'img',
	'embed',
	'param',
	'area',
	'col',
	'input'
];

HTML5.CDATA_ELEMENTS = [
	'title',
	'textarea'
];

HTML5.RCDATA_ELEMENTS = [
	'style',
	'script',
	'xmp',
	'iframe',
	'noembed',
	'noframes',
	'noscript'
];

HTML5.BOOLEAN_ATTRIBUTES = {
	'_global': ['irrelevant'],
	// Fixme?
	'style': ['scoped'],
	'img': ['ismap'],
	'audio': ['autoplay', 'controls'],
	'video': ['autoplay', 'controls'],
	'script': ['defer', 'async'],
	'details': ['open'],
	'datagrid': ['multiple', 'disabled'],
	'command': ['hidden', 'disabled', 'checked', 'default'],
	'menu': ['autosubmit'],
	'fieldset': ['disabled', 'readonly'],
	'option': ['disabled', 'readonly', 'selected'],
	'optgroup': ['disabled', 'readonly'],
	'button': ['disabled', 'autofocus'],
	'input': ['disabled', 'readonly', 'required', 'autofocus', 'checked', 'ismap'],
	'select': ['disabled', 'readonly', 'autofocus', 'multiple'],
	'output': ['disabled', 'readonly']
};

HTML5.ENTITIES = require('html5-entities');

HTML5.ENCODINGS = [
	'ansi_x3.4-1968',
	'iso-ir-6',
	'ansi_x3.4-1986',
	'iso_646.irv:1991',
	'ascii',
	'iso646-us',
	'us-ascii',
	'us',
	'ibm367',
	'cp367',
	'csascii',
	'ks_c_5601-1987',
	'korean',
	'iso-2022-kr',
	'csiso2022kr',
	'euc-kr',
	'iso-2022-jp',
	'csiso2022jp',
	'iso-2022-jp-2',
	'',
	'iso-ir-58',
	'chinese',
	'csiso58gb231280',
	'iso_8859-1:1987',
	'iso-ir-100',
	'iso_8859-1',
	'iso-8859-1',
	'latin1',
	'l1',
	'ibm819',
	'cp819',
	'csisolatin1',
	'iso_8859-2:1987',
	'iso-ir-101',
	'iso_8859-2',
	'iso-8859-2',
	'latin2',
	'l2',
	'csisolatin2',
	'iso_8859-3:1988',
	'iso-ir-109',
	'iso_8859-3',
	'iso-8859-3',
	'latin3',
	'l3',
	'csisolatin3',
	'iso_8859-4:1988',
	'iso-ir-110',
	'iso_8859-4',
	'iso-8859-4',
	'latin4',
	'l4',
	'csisolatin4',
	'iso_8859-6:1987',
	'iso-ir-127',
	'iso_8859-6',
	'iso-8859-6',
	'ecma-114',
	'asmo-708',
	'arabic',
	'csisolatinarabic',
	'iso_8859-7:1987',
	'iso-ir-126',
	'iso_8859-7',
	'iso-8859-7',
	'elot_928',
	'ecma-118',
	'greek',
	'greek8',
	'csisolatingreek',
	'iso_8859-8:1988',
	'iso-ir-138',
	'iso_8859-8',
	'iso-8859-8',
	'hebrew',
	'csisolatinhebrew',
	'iso_8859-5:1988',
	'iso-ir-144',
	'iso_8859-5',
	'iso-8859-5',
	'cyrillic',
	'csisolatincyrillic',
	'iso_8859-9:1989',
	'iso-ir-148',
	'iso_8859-9',
	'iso-8859-9',
	'latin5',
	'l5',
	'csisolatin5',
	'iso-8859-10',
	'iso-ir-157',
	'l6',
	'iso_8859-10:1992',
	'csisolatin6',
	'latin6',
	'hp-roman8',
	'roman8',
	'r8',
	'ibm037',
	'cp037',
	'csibm037',
	'ibm424',
	'cp424',
	'csibm424',
	'ibm437',
	'cp437',
	'437',
	'cspc8codepage437',
	'ibm500',
	'cp500',
	'csibm500',
	'ibm775',
	'cp775',
	'cspc775baltic',
	'ibm850',
	'cp850',
	'850',
	'cspc850multilingual',
	'ibm852',
	'cp852',
	'852',
	'cspcp852',
	'ibm855',
	'cp855',
	'855',
	'csibm855',
	'ibm857',
	'cp857',
	'857',
	'csibm857',
	'ibm860',
	'cp860',
	'860',
	'csibm860',
	'ibm861',
	'cp861',
	'861',
	'cp-is',
	'csibm861',
	'ibm862',
	'cp862',
	'862',
	'cspc862latinhebrew',
	'ibm863',
	'cp863',
	'863',
	'csibm863',
	'ibm864',
	'cp864',
	'csibm864',
	'ibm865',
	'cp865',
	'865',
	'csibm865',
	'ibm866',
	'cp866',
	'866',
	'csibm866',
	'ibm869',
	'cp869',
	'869',
	'cp-gr',
	'csibm869',
	'ibm1026',
	'cp1026',
	'csibm1026',
	'koi8-r',
	'cskoi8r',
	'koi8-u',
	'big5-hkscs',
	'ptcp154',
	'csptcp154',
	'pt154',
	'cp154',
	'utf-7',
	'utf-16be',
	'utf-16le',
	'utf-16',
	'utf-8',
	'iso-8859-13',
	'iso-8859-14',
	'iso-ir-199',
	'iso_8859-14:1998',
	'iso_8859-14',
	'latin8',
	'iso-celtic',
	'l8',
	'iso-8859-15',
	'iso_8859-15',
	'iso-8859-16',
	'iso-ir-226',
	'iso_8859-16:2001',
	'iso_8859-16',
	'latin10',
	'l10',
	'gbk',
	'cp936',
	'ms936',
	'gb18030',
	'shift_jis',
	'ms_kanji',
	'csshiftjis',
	'euc-jp',
	'gb2312',
	'big5',
	'csbig5',
	'windows-1250',
	'windows-1251',
	'windows-1252',
	'windows-1253',
	'windows-1254',
	'windows-1255',
	'windows-1256',
	'windows-1257',
	'windows-1258',
	'tis-620',
	'hz-gb-2312'
];

HTML5.E = {
	"null-character":
		"Null character in input stream, replaced with U+FFFD.",
	"incorrectly-placed-solidus":
		"Solidus (/) incorrectly placed in tag.",
	"incorrect-cr-newline-entity":
		"Incorrect CR newline entity, replaced with LF.",
	"illegal-windows-1252-entity":
		"Entity used with illegal number (windows-1252 reference).",
	"cant-convert-numeric-entity":
		"Numeric entity couldn't be converted to character " +
	"(codepoint U+%(charAsInt)08x).",
	"illegal-codepoint-for-numeric-entity":
		"Numeric entity represents an illegal codepoint=> " +
	"U+%(charAsInt)08x.",
	"numeric-entity-without-semicolon":
		"Numeric entity didn't end with ';'.",
	"expected-numeric-entity-but-got-eof":
		"Numeric entity expected. Got end of file instead.",
	"expected-numeric-entity":
		"Numeric entity expected but none found.",
	"named-entity-without-semicolon":
		"Named entity didn't end with ';'.",
	"expected-named-entity":
		"Named entity expected. Got none.",
	"attributes-in-end-tag":
		"End tag contains unexpected attributes.",
	"expected-tag-name-but-got-right-bracket":
		"Expected tag name. Got '>' instead.",
	"expected-tag-name-but-got-question-mark":
		"Expected tag name. Got '?' instead. (HTML doesn't " +
	"support processing instructions.)",
	"expected-tag-name":
		"Expected tag name. Got something else instead",
	"expected-closing-tag-but-got-right-bracket":
		"Expected closing tag. Got '>' instead. Ignoring '</>'.",
	"expected-closing-tag-but-got-eof":
		"Expected closing tag. Unexpected end of file.",
	"expected-closing-tag-but-got-char":
		"Expected closing tag. Unexpected character '%(data)' found.",
	"eof-in-tag-name":
		"Unexpected end of file in the tag name.",
	"expected-attribute-name-but-got-eof":
		"Unexpected end of file. Expected attribute name instead.",
	"eof-in-attribute-name":
		"Unexpected end of file in attribute name.",
	"duplicate-attribute":
		"Dropped duplicate attribute on tag.",
	"expected-end-of-tag-name-but-got-eof":
		"Unexpected end of file. Expected = or end of tag.",
	"expected-attribute-value-but-got-eof":
		"Unexpected end of file. Expected attribute value.",
	"eof-in-attribute-value-double-quote":
		"Unexpected end of file in attribute value (\").",
	"eof-in-attribute-value-single-quote":
		"Unexpected end of file in attribute value (').",
	"eof-in-attribute-value-no-quotes":
		"Unexpected end of file in attribute value.",
	"expected-dashes-or-doctype":
		"Expected '--' or 'DOCTYPE'. Not found.",
	"incorrect-comment":
		"Incorrect comment.",
	"eof-in-comment":
		"Unexpected end of file in comment.",
	"eof-in-comment-end-dash":
		"Unexpected end of file in comment (-)",
	"unexpected-dash-after-double-dash-in-comment":
		"Unexpected '-' after '--' found in comment.",
	"eof-in-comment-double-dash":
		"Unexpected end of file in comment (--).",
	"unexpected-char-in-comment":
		"Unexpected character in comment found.",
	"need-space-after-doctype":
		"No space after literal string 'DOCTYPE'.",
	"expected-doctype-name-but-got-right-bracket":
		"Unexpected > character. Expected DOCTYPE name.",
	"expected-doctype-name-but-got-eof":
		"Unexpected end of file. Expected DOCTYPE name.",
	"eof-in-doctype-name":
		"Unexpected end of file in DOCTYPE name.",
	"eof-in-doctype":
		"Unexpected end of file in DOCTYPE.",
	"expected-space-or-right-bracket-in-doctype":
		"Expected space or '>'. Got '%(data)'",
	"unexpected-end-of-doctype":
		"Unexpected end of DOCTYPE.",
	"unexpected-char-in-doctype":
		"Unexpected character in DOCTYPE.",
	"eof-in-bogus-doctype":
		"Unexpected end of file in bogus doctype.",
	"eof-in-innerhtml":
		"Unexpected EOF in inner html mode.",
	"unexpected-doctype":
		"Unexpected DOCTYPE. Ignored.",
	"non-html-root":
		"html needs to be the first start tag.",
	"expected-doctype-but-got-eof":
		"Unexpected End of file. Expected DOCTYPE.",
	"unknown-doctype":
		"Erroneous DOCTYPE.",
	"expected-doctype-but-got-chars":
		"Unexpected non-space characters. Expected DOCTYPE.",
	"expected-doctype-but-got-start-tag":
		"Unexpected start tag (%(name)). Expected DOCTYPE.",
	"expected-doctype-but-got-end-tag":
		"Unexpected end tag (%(name)). Expected DOCTYPE.",
	"end-tag-after-implied-root":
		"Unexpected end tag (%(name)) after the (implied) root element.",
	"expected-named-closing-tag-but-got-eof":
		"Unexpected end of file. Expected end tag (%(name)).",
	"two-heads-are-not-better-than-one":
		"Unexpected start tag head in existing head. Ignored.",
	"unexpected-end-tag":
		"Unexpected end tag (%(name)). Ignored.",
	"unexpected-start-tag-out-of-my-head":
		"Unexpected start tag (%(name)) that can be in head. Moved.",
	"unexpected-start-tag":
		"Unexpected start tag (%(name)).",
	"missing-end-tag":
		"Missing end tag (%(name)).",
	"missing-end-tags":
		"Missing end tags (%(name)).",
	"unexpected-start-tag-implies-end-tag":
		"Unexpected start tag (%(startName)) " +
		"implies end tag (%(endName)).",
	"unexpected-start-tag-treated-as":
		"Unexpected start tag (%(originalName)). Treated as %(newName).",
	"deprecated-tag":
		"Unexpected start tag %(name). Don't use it!",
	"unexpected-start-tag-ignored":
		"Unexpected start tag %(name). Ignored.",
	"expected-one-end-tag-but-got-another":
		"Unexpected end tag (%(gotName). " +
		"Missing end tag (%(expectedName)).",
	"end-tag-too-early":
		"End tag (%(name)) seen too early. Expected other end tag.",
	"end-tag-too-early-named":
		"Unexpected end tag (%(gotName)). Expected end tag (%(expectedName).",
	"end-tag-too-early-ignored":
		"End tag (%(name)) seen too early. Ignored.",
	"adoption-agency-1.1":
		"End tag (%(name) violates step 1, " +
		"paragraph 1 of the adoption agency algorithm.",
	"adoption-agency-1.2":
		"End tag (%(name) violates step 1, " +
		"paragraph 2 of the adoption agency algorithm.",
	"adoption-agency-1.3":
		"End tag (%(name) violates step 1, " +
		"paragraph 3 of the adoption agency algorithm.",
	"unexpected-end-tag-treated-as":
		"Unexpected end tag (%(originalName)). Treated as %(newName).",
	"no-end-tag":
		"This element (%(name)) has no end tag.",
	"unexpected-implied-end-tag-in-table":
		"Unexpected implied end tag (%(name)) in the table phase.",
	"unexpected-implied-end-tag-in-table-body":
		"Unexpected implied end tag (%(name)) in the table body phase.",
	"unexpected-char-implies-table-voodoo":
		"Unexpected non-space characters in " +
		"table context caused voodoo mode.",
	"unpexted-hidden-input-in-table":
		"Unexpected input with type hidden in table context.",
	"unexpected-start-tag-implies-table-voodoo":
		"Unexpected start tag (%(name)) in " +
		"table context caused voodoo mode.",
	"unexpected-end-tag-implies-table-voodoo":
		"Unexpected end tag (%(name)) in " +
		"table context caused voodoo mode.",
	"unexpected-cell-in-table-body":
		"Unexpected table cell start tag (%(name)) " +
		"in the table body phase.",
	"unexpected-cell-end-tag":
		"Got table cell end tag (%(name)) " +
		"while required end tags are missing.",
	"unexpected-end-tag-in-table-body":
		"Unexpected end tag (%(name)) in the table body phase. Ignored.",
	"unexpected-implied-end-tag-in-table-row":
		"Unexpected implied end tag (%(name)) in the table row phase.",
	"unexpected-end-tag-in-table-row":
		"Unexpected end tag (%(name)) in the table row phase. Ignored.",
	"unexpected-select-in-select":
		"Unexpected select start tag in the select phase " +
		"treated as select end tag.",
	"unexpected-input-in-select":
		"Unexpected input start tag in the select phase.",
	"unexpected-start-tag-in-select":
		"Unexpected start tag token (%(name)) in the select phase. " +
		"Ignored.",
	"unexpected-end-tag-in-select":
		"Unexpected end tag (%(name)) in the select phase. Ignored.",
	"unexpected-table-element-start-tag-in-select-in-table":
		"Unexpected table element start tag (%(name))s in the select in table phase.",
	"unexpected-table-element-end-tag-in-select-in-table":
		"Unexpected table element end tag (%(name))s in the select in table phase.",
	"unexpected-char-after-body":
		"Unexpected non-space characters in the after body phase.",
	"unexpected-start-tag-after-body":
		"Unexpected start tag token (%(name))" +
		"in the after body phase.",
	"unexpected-end-tag-after-body":
		"Unexpected end tag token (%(name))" +
		" in the after body phase.",
	"unexpected-char-in-frameset":
		"Unepxected characters in the frameset phase. Characters ignored.",
	"unexpected-start-tag-in-frameset":
		"Unexpected start tag token (%(name))" +
		" in the frameset phase. Ignored.",
	"unexpected-frameset-in-frameset-innerhtml":
		"Unexpected end tag token (frameset " +
		"in the frameset phase (innerHTML).",
	"unexpected-end-tag-in-frameset":
		"Unexpected end tag token (%(name))" +
		" in the frameset phase. Ignored.",
	"unexpected-char-after-frameset":
		"Unexpected non-space characters in the " +
		"after frameset phase. Ignored.",
	"unexpected-start-tag-after-frameset":
		"Unexpected start tag (%(name))" +
		" in the after frameset phase. Ignored.",
	"unexpected-end-tag-after-frameset":
		"Unexpected end tag (%(name))" +
		" in the after frameset phase. Ignored.",
	"expected-eof-but-got-char":
		"Unexpected non-space characters. Expected end of file.",
	"expected-eof-but-got-start-tag":
		"Unexpected start tag (%(name))" +
		". Expected end of file.",
	"expected-eof-but-got-end-tag":
		"Unexpected end tag (%(name))" +
		". Expected end of file.",
	"unexpected-end-table-in-caption":
		"Unexpected end table tag in caption. Generates implied end caption.",
	"end-html-in-innerhtml": 
		"Unexpected html end tag in inner html mode.",
	"expected-self-closing-tag":
		"Expected a > after the /.",
	"self-closing-end-tag":
		"Self closing end tag.",
	"eof-in-table":
		"Unexpected end of file. Expected table content.",
	"html-in-foreign-content":
		"HTML start tag \"%(name)\" in a foreign namespace context.",
	"unexpected-start-tag-in-table":
		"Unexpected %(name). Expected table content."
};

HTML5.Models = {PCDATA: 'PCDATA', RCDATA: 'RCDATA', CDATA: 'CDATA', SCRIPT_CDATA: 'SCRIPT_CDATA'};

HTML5.TAGMODES = {
	select: 'inSelect',
	td: 'inCell',
	th: 'inCell',
	tr: 'inRow',
	tbody: 'inTableBody',
	thead: 'inTableBody',
	tfoot: 'inTableBody',
	caption: 'inCaption',
	colgroup: 'inColumnGroup',
	table: 'inTable',
	head: 'inBody',
	body: 'inBody',
	frameset: 'inFrameset'
};

HTML5.SVGAttributeMap = {
	attributename:	'attributeName',
	attributetype:	'attributeType',
	basefrequency:	'baseFrequency',
	baseprofile:	'baseProfile',
	calcmode:	'calcMode',
	clippathunits:	'clipPathUnits',
	contentscripttype:	'contentScriptType',
	contentstyletype:	'contentStyleType',
	diffuseconstant:	'diffuseConstant',
	edgemode:	'edgeMode',
	externalresourcesrequired:	'externalResourcesRequired',
	filterres:	'filterRes',
	filterunits:	'filterUnits',
	glyphref:	'glyphRef',
	gradienttransform:	'gradientTransform',
	gradientunits:	'gradientUnits',
	kernelmatrix:	'kernelMatrix',
	kernelunitlength:	'kernelUnitLength',
	keypoints:	'keyPoints',
	keysplines:	'keySplines',
	keytimes:	'keyTimes',
	lengthadjust:	'lengthAdjust',
	limitingconeangle:	'limitingConeAngle',
	markerheight:	'markerHeight',
	markerunits:	'markerUnits',
	markerwidth:	'markerWidth',
	maskcontentunits:	'maskContentUnits',
	maskunits:	'maskUnits',
	numoctaves:	'numOctaves',
	pathlength:	'pathLength',
	patterncontentunits:	'patternContentUnits',
	patterntransform:	'patternTransform',
	patternunits:	'patternUnits',
	pointsatx:	'pointsAtX',
	pointsaty:	'pointsAtY',
	pointsatz:	'pointsAtZ',
	preservealpha:	'preserveAlpha',
	preserveaspectratio:	'preserveAspectRatio',
	primitiveunits:	'primitiveUnits',
	refx:	'refX',
	refy:	'refY',
	repeatcount:	'repeatCount',
	repeatdur:	'repeatDur',
	requiredextensions:	'requiredExtensions',
	requiredfeatures:	'requiredFeatures',
	specularconstant:	'specularConstant',
	specularexponent:	'specularExponent',
	spreadmethod:	'spreadMethod',
	startoffset:	'startOffset',
	stddeviation:	'stdDeviation',
	stitchtiles:	'stitchTiles',
	surfacescale:	'surfaceScale',
	systemlanguage:	'systemLanguage',
	tablevalues:	'tableValues',
	targetx:	'targetX',
	targety:	'targetY',
	textlength:	'textLength',
	viewbox:	'viewBox',
	viewtarget:	'viewTarget',
	xchannelselector:	'xChannelSelector',
	ychannelselector:	'yChannelSelector',
	zoomandpan:	'zoomAndPan'
};

