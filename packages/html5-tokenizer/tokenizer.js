require('../core-upgrade');
var HTML5 = require('../html5');
var events = require('events');
var Buffer = require('./buffer').Buffer;
var Models = HTML5.Models;

function keys(h) {
	var r = [];
	for(var k in h) {
		r.push(k);
	}
	return r;
}

var ENTITY_KEYS = keys(HTML5.ENTITIES);

var t = HTML5.Tokenizer = function HTML5Tokenizer(input, document, tree) {
	var state;
	var buffer = new Buffer();
	var escapeFlag = false;
	var lastFourChars = '';
	var current_token = null;
	var script_buffer = null;
	var content_model = Models.PCDATA;
	var source;

	function data_state(buffer) {
		var c = buffer.char();
		if (c !== HTML5.EOF && (content_model == Models.CDATA || content_model == Models.RCDATA || content_model == Models.SCRIPT_CDATA)) {
			lastFourChars += c;
			if (lastFourChars.length >= 4) {
				lastFourChars = lastFourChars.substr(-4);
			}
		}

		if (content_model == Models.SCRIPT_CDATA) {
			if (script_buffer === null) {
				script_buffer = '';
			}
		}

		if (c === HTML5.EOF) {
			emitToken(HTML5.EOF_TOK);
			buffer.commit();
			return false;
		} else if (c === '\0' && (content_model == Models.SCRIPT_CDATA || content_model == Models.PLAINTEXT || content_model == Models.RAWTEXT || content_model == Models.RCDATA)) {
			emitToken({type: 'Characters', data: "\ufffd"});
			buffer.commit();
		} else if (c == '&' && (content_model == Models.PCDATA || content_model == Models.RCDATA) && !escapeFlag) {
			newState(entity_data_state);
		} else if (c == '-' && (content_model == Models.CDATA || content_model == Models.RCDATA || content_model == Models.SCRIPT_CDATA) && !escapeFlag && lastFourChars == '<!--') {
			escapeFlag = true;
			emitToken({type: 'Characters', data: c});
			buffer.commit();
		} else if (c == '<' && !escapeFlag && (content_model == Models.PCDATA || content_model == Models.RCDATA || content_model == Models.CDATA || content_model == Models.SCRIPT_CDATA)) {
			newState(tag_open_state);
		} else if (c == '>' && escapeFlag && (content_model == Models.CDATA || content_model == Models.RCDATA || content_model == Models.SCRIPT_CDATA) && lastFourChars.match(/-->$/)) {
			escapeFlag = false;
			emitToken({type: 'Characters', data: c});
			buffer.commit();
		} else if (HTML5.SPACE_CHARACTERS_R.test(c)) {
			emitToken({type: 'SpaceCharacters', data: c + buffer.matchWhile(HTML5.SPACE_CHARACTERS)});
			buffer.commit();
		} else {
			var o = buffer.matchUntil("[&<>-]");
			if (o !== HTML5.EOF) {
				c = c + o;
			}
			emitToken({type: 'Characters', data: c});
			lastFourChars += c;
			lastFourChars = lastFourChars.slice(-4);
			buffer.commit();
		}
		return true;
	}

	var entity_data_state = function entity_data_state(buffer) {
		var entity = consume_entity(buffer);
		if (entity) {
			emitToken({type: 'Characters', data: entity});
		} else {
			emitToken({type: 'Characters', data: '&'});
		}
		newState(data_state);
		return true;
	};

	this.tokenize = function() {
		if (this.pump) this.pump();
	};

	var emitToken = function emitToken(tok) { 
		tok = normalize_token(tok);
		if (content_model == Models.SCRIPT_CDATA && (tok.type == 'Characters' || tok.type == 'SpaceCharacters') && !buffer.eof) {
			HTML5.debug('tokenizer.addScriptData', tok);
			script_buffer += tok.data;
		} else {
			HTML5.debug('tokenizer.token', tok);
			this.emit('token', tok);
		}
	}.bind(this);

	function consume_entity(buffer, from_attr) {
		var char = null;
		var chars = buffer.char();
		var c;
		if (chars === HTML5.EOF) return false;
		if (chars.match(HTML5.SPACE_CHARACTERS) || chars == '<' || chars == '&') {
			buffer.unget(chars);
		} else if (chars[0] == '#') { // Maybe a numeric entity
			c = buffer.shift(2);
			if (c === HTML5.EOF) {
				buffer.unget(chars);
				return false;
			}
			chars += c;
			if (chars[1] && chars[1].toLowerCase() == 'x' && HTML5.HEX_DIGITS_R.test(chars[2])) {
				// Hex entity
				buffer.unget(chars[2]);
				char = consume_numeric_entity(buffer, true);
			} else if (chars[1] && HTML5.DIGITS_R.test(chars[1])) {
				// Decimal entity
				buffer.unget(chars.slice(1));
				char = consume_numeric_entity(buffer, false);
			} else {
				// Not numeric
				buffer.unget(chars);
				parse_error("expected-numeric-entity");
			}
		} else {
			var filteredEntityList = ENTITY_KEYS.filter(function(e) {
				return e[0] == chars[0];
			});
			var entityName = null;
			var matches = function(e) {
				return e.indexOf(chars) === 0;
			};
			while(true) {
				if (filteredEntityList.some(matches)) {
					filteredEntityList = filteredEntityList.filter(matches);
					c = buffer.char();
					if (c !== HTML5.EOF) {
						chars += c;
					} else {
						break;
					}
				} else {
					break;
				}

				if (HTML5.ENTITIES[chars]) {
					entityName = chars;
					if (entityName[entityName.length - 1] == ';') break;
				}
			} 

			if (entityName) {
				char = HTML5.ENTITIES[entityName];

				if (entityName[entityName.length - 1] != ';' && this.from_attribute && (HTML5.ASCII_LETTERS_R.test(chars.substr(entityName.length, 1) || HTML5.DIGITS.test(chars.substr(entityName.length, 1))))) {
					buffer.unget(chars);
					char = '&';
				} else {
					buffer.unget(chars.slice(entityName.length));
				}
			} else {
				parse_error("expected-named-entity");
				buffer.unget(chars);
			}
		}

		return char;
	}

	function replaceEntityNumbers(c) {
		switch(c) {
			case 0x00: return 0xFFFD; // REPLACEMENT CHARACTER
			case 0x13: return 0x0010; // Carriage return
			case 0x80: return 0x20AC; // EURO SIGN
			case 0x81: return 0x0081; // <control>
			case 0x82: return 0x201A; // SINGLE LOW-9 QUOTATION MARK
			case 0x83: return 0x0192; // LATIN SMALL LETTER F WITH HOOK
			case 0x84: return 0x201E; // DOUBLE LOW-9 QUOTATION MARK
			case 0x85: return 0x2026; // HORIZONTAL ELLIPSIS
			case 0x86: return 0x2020; // DAGGER
			case 0x87: return 0x2021; // DOUBLE DAGGER
			case 0x88: return 0x02C6; // MODIFIER LETTER CIRCUMFLEX ACCENT
			case 0x89: return 0x2030; // PER MILLE SIGN
			case 0x8A: return 0x0160; // LATIN CAPITAL LETTER S WITH CARON
			case 0x8B: return 0x2039; // SINGLE LEFT-POINTING ANGLE QUOTATION MARK
			case 0x8C: return 0x0152; // LATIN CAPITAL LIGATURE OE
			case 0x8D: return 0x008D; // <control>
			case 0x8E: return 0x017D; // LATIN CAPITAL LETTER Z WITH CARON
			case 0x8F: return 0x008F; // <control>
			case 0x90: return 0x0090; // <control>
			case 0x91: return 0x2018; // LEFT SINGLE QUOTATION MARK
			case 0x92: return 0x2019; // RIGHT SINGLE QUOTATION MARK
			case 0x93: return 0x201C; // LEFT DOUBLE QUOTATION MARK
			case 0x94: return 0x201D; // RIGHT DOUBLE QUOTATION MARK
			case 0x95: return 0x2022; // BULLET
			case 0x96: return 0x2013; // EN DASH
			case 0x97: return 0x2014; // EM DASH
			case 0x98: return 0x02DC; // SMALL TILDE
			case 0x99: return 0x2122; // TRADE MARK SIGN
			case 0x9A: return 0x0161; // LATIN SMALL LETTER S WITH CARON
			case 0x9B: return 0x203A; // SINGLE RIGHT-POINTING ANGLE QUOTATION MARK
			case 0x9C: return 0x0153; // LATIN SMALL LIGATURE OE
			case 0x9D: return 0x009D; // <control>
			case 0x9E: return 0x017E; // LATIN SMALL LETTER Z WITH CARON
			case 0x9F: return 0x0178; // LATIN CAPITAL LETTER Y WITH DIAERESIS
			default:
				if ((c >= 0xD800 && c <= 0xDFFF) || c >= 0x10FFFF) { /// @todo. The spec says > 0x10FFFF, not >=. Section 8.2.4.69.
					return 0xFFFD;
				} else if ((c >= 0x0001 && c <= 0x0008) || (c >= 0x000E && c <= 0x001F) ||
					(c >= 0x007F && c <= 0x009F) || (c >= 0xFDD0 && c <= 0xFDEF) ||
					c == 0x000B || c == 0xFFFE || c == 0x1FFFE || c == 0x2FFFFE ||
					c == 0x2FFFF || c == 0x3FFFE || c == 0x3FFFF || c == 0x4FFFE ||
					c == 0x4FFFF || c == 0x5FFFE || c == 0x5FFFF || c == 0x6FFFE ||
					c == 0x6FFFF || c == 0x7FFFE || c == 0x7FFFF || c == 0x8FFFE ||
					c == 0x8FFFF || c == 0x9FFFE || c == 0x9FFFF || c == 0xAFFFE ||
					c == 0xAFFFF || c == 0xBFFFE || c == 0xBFFFF || c == 0xCFFFE ||
					c == 0xCFFFF || c == 0xDFFFE || c == 0xDFFFF || c == 0xEFFFE ||
					c == 0xEFFFF || c == 0xFFFFE || c == 0xFFFFF || c == 0x10FFFE ||
					c == 0x10FFFF) {
					return c;
				}
		}
	}

	function consume_numeric_entity(buffer, hex) {
		var allowed, radix;
		if (hex) {
			allowed = HTML5.HEX_DIGITS_R;
			radix = 16;
		} else {
			allowed = HTML5.DIGITS_R;
			radix = 10;
		}

		var chars = '';

		var c = buffer.char();
		while(c !== HTML5.EOF && allowed.test(c)) {
			chars = chars + c;
			c = buffer.char();
		}

		var charAsInt = parseInt(chars, radix);

		var replacement = replaceEntityNumbers(charAsInt);
		if (replacement) {
			parse_error("invalid-numeric-entity-replaced", {old: charAsInt, 'new': replacement});
			charAsInt = replacement;
		}

		var char = String.fromCharCode(charAsInt);
		/*if (charAsInt <= 0x10FFFF && !(charAsInt >= 0xD800 && charAsInt <= 0xDFFF)) {
		} else {
			char = String.fromCharCode(0xFFFD);
			parse_error("cant-convert-numeric-entity");
		} */

		if (c !== ';') {
			parse_error("numeric-entity-without-semicolon");
			buffer.unget(c);
		} 

		return char;
	}

	function process_entity_in_attribute(buffer) {
		var entity = consume_entity(buffer);
		if (entity) {
			current_token.data.last().nodeValue += entity;
		} else {
			current_token.data.last().nodeValue += '&';
		}
	}

	function process_solidus_in_tag(buffer) {
		var data = buffer.peek(1);
		if (current_token.type == 'StartTag' && data == '>') {
			current_token.type = 'EmptyTag';
			return true;
		} else {
			parse_error("incorrectly-placed-solidus");
			return false;
		}
	}

	function tag_open_state(buffer) {
		var data = buffer.char();
		if (content_model == Models.PCDATA) {
			if (data === HTML5.EOF) {
				parse_error("bare-less-than-sign-at-eof");
				emitToken({type: 'Characters', data: '<'});
				newState(data_state);
			} else if (data !== HTML5.EOF && HTML5.ASCII_LETTERS_R.test(data)) {
				current_token = {type: 'StartTag', name: data, data: []};
				newState(tag_name_state);
			} else if (data == '!') {
				newState(markup_declaration_open_state);
			} else if (data == '/') {
				newState(close_tag_open_state);
			} else if (data == '>') {
				// XXX In theory it could be something besides a tag name. But
				// do we really care?
				parse_error("expected-tag-name-but-got-right-bracket");
				emitToken({type: 'Characters', data: "<>"});
				newState(data_state);
			} else if (data == '?') {
				// XXX In theory it could be something besides a tag name. But
				// do we really care?
				parse_error("expected-tag-name-but-got-question-mark");
				buffer.unget(data);
				newState(bogus_comment_state);
			} else {
				// XXX
				parse_error("expected-tag-name");
				emitToken({type: 'Characters', data: "<"});
				buffer.unget(data);
				newState(data_state);
			}
		} else {
			// We know the content model flag is set to either RCDATA or CDATA or SCRIPT_CDATA
			// now because this state can never be entered with the PLAINTEXT
			// flag.
			if (data === '/') {
				newState(close_tag_open_state);
			} else {
				emitToken({type: 'Characters', data: "<"});
				buffer.unget(data);
				newState(data_state);
			}
		}
		return true;
	}

	function close_tag_open_state(buffer) {
		if (content_model == Models.RCDATA || content_model == Models.CDATA || content_model == Models.SCRIPT_CDATA) {
			var chars = '';
			if (current_token) {
				for(var i = 0; i <= current_token.name.length; i++) {
					var c = buffer.char();
					if (c === HTML5.EOF) break;
					chars += c;
				}
				buffer.unget(chars);
			}

			if (current_token &&
				current_token.name.toLowerCase() == chars.slice(0, current_token.name.length).toLowerCase() &&
				(chars.length > current_token.name.length ? new RegExp('[' + HTML5.SPACE_CHARACTERS_IN + '></\0]').test(chars.substr(-1)) : true)
			) {
				content_model = Models.PCDATA;
			} else {
				emitToken({type: 'Characters', data: '</'});
				newState(data_state);
				return true;
			}
		}

		var data = buffer.char();
		if (data === HTML5.EOF) {
			parse_error("expected-closing-tag-but-got-eof");
			emitToken({type: 'Characters', data: '</'});
			buffer.unget(data);
			newState(data_state);
		} else if (HTML5.ASCII_LETTERS_R.test(data)) {
			current_token = {type: 'EndTag', name: data, data: []};
			newState(tag_name_state);
		} else if (data == '>') {
			parse_error("expected-closing-tag-but-got-right-bracket");
			newState(data_state);
		} else {
			parse_error("expected-closing-tag-but-got-char", {data: data}); // param 1 is datavars:
			buffer.unget(data);
			newState(bogus_comment_state);
		}
		return true;
	}

	function tag_name_state(buffer) {
		var data = buffer.char();
		if (data === HTML5.EOF) {
			parse_error('eof-in-tag-name');
			emit_current_token();
		} else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
			newState(before_attribute_name_state);
		} else if (HTML5.ASCII_LETTERS_R.test(data)) {
			var c = buffer.matchWhile(HTML5.ASCII_LETTERS);
			if (c !== HTML5.EOF) {
				current_token.name += data + c;
			} else {
				current_token.name += data;
				buffer.unget(c);
				newState(data_state);
			}
		} else if (data == '>') {
			emit_current_token();
		} else if (data == '/') {
			process_solidus_in_tag(buffer);
			newState(self_closing_tag_state);
		} else { 
			current_token.name += data;
		}
		buffer.commit();

		return true;
	}

	function before_attribute_name_state(buffer) {
		var data = buffer.shift(1);
		if (data === HTML5.EOF) {
			parse_error("expected-attribute-name-but-got-eof");
			emit_current_token();
		} else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
			buffer.matchWhile(HTML5.SPACE_CHARACTERS);
		} else if (HTML5.ASCII_LETTERS_R.test(data)) {
			current_token.data.push({nodeName: data, nodeValue: ""});
			newState(attribute_name_state);
		} else if (data == '>') {
			emit_current_token();
		} else if (data == '/') {
			newState(self_closing_tag_state);
		} else if (data == "'" || data == '"' || data == '=') {
			parse_error("invalid-character-in-attribute-name");
			current_token.data.push({nodeName: data, nodeValue: ""});
			newState(attribute_name_state);
		} else {
			current_token.data.push({nodeName: data, nodeValue: ""});
			newState(attribute_name_state);
		}
		return true;
	}

	function attribute_name_state(buffer) {
		var data = buffer.shift(1);
		var leavingThisState = true;
		var emitToken = false;
		if (data === HTML5.EOF) {
			parse_error("eof-in-attribute-name");
			newState(data_state);
			emitToken = true;
		} else if (data == '=') {
			newState(before_attribute_value_state);
		} else if (HTML5.ASCII_LETTERS_R.test(data)) {
			current_token.data.last().nodeName += data + buffer.matchWhile(HTML5.ASCII_LETTERS);
			leavingThisState = false;
		} else if (data == '>') {
			// XXX If we emit here the attributes are converted to a dict
			// without being checked and when the code below runs we error
			// because data is a dict not a list
			emitToken = true;
		} else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
			newState(after_attribute_name_state);
		} else if (data == '/') {
			if (!process_solidus_in_tag(buffer)) {
				newState(before_attribute_name_state);
			}
		} else if (data == "'" || data == '"') {
			parse_error("invalid-character-in-attribute-name");
			current_token.data.last().nodeName += data;
			leavingThisState = false;
		} else {
			current_token.data.last().nodeName += data;
			leavingThisState = false;
		}

		if (leavingThisState) {
			// Attributes are not dropped at this stage. That happens when the
			// start tag token is emitted so values can still be safely appended
			// to attributes, but we do want to report the parse error in time.
			if (this.lowercase_attr_name) {
				current_token.data.last().nodeName = current_token.data.last().nodeName.toLowerCase();
			}
			for (var k in current_token.data.slice(0, -1)) {
				// FIXME this is a fucking mess.
				if (current_token.data.slice(-1)[0] == current_token.data.slice(0, -1)[k].name) {
					parse_error("duplicate-attribute");
					break; // Don't emit more than one of these errors
				}
			}
			if (emitToken) emit_current_token();
		} else {
			buffer.commit();
		}
		return true;
	}

	function after_attribute_name_state(buffer) {
		var data = buffer.shift(1);
		if (data === HTML5.EOF) {
			parse_error("expected-end-of-tag-but-got-eof");
			emit_current_token();
		} else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
			buffer.matchWhile(HTML5.SPACE_CHARACTERS);
		} else if (data == '=') {
			newState(before_attribute_value_state);
		} else if (data == '>') {
			emit_current_token();
		} else if (HTML5.ASCII_LETTERS_R.test(data)) {
			current_token.data.push({nodeName: data, nodeValue: ""});
			newState(attribute_name_state);
		} else if (data == '/') {
			newState(self_closing_tag_state);
		} else {
			current_token.data.push({nodeName: data, nodeValue: ""});
			newState(attribute_name_state);
		}
		return true;
	}

	function before_attribute_value_state(buffer) {
		var data = buffer.shift(1);
		if (data === HTML5.EOF) {
			parse_error("expected-attribute-value-but-got-eof");
			emit_current_token();
			newState(attribute_value_unquoted_state);
		} else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
			buffer.matchWhile(HTML5.SPACE_CHARACTERS);
		} else if (data == '"') {
			newState(attribute_value_double_quoted_state);
		} else if (data == '&') {
			newState(attribute_value_unquoted_state);
			buffer.unget(data);
		} else if (data == "'") {
			newState(attribute_value_single_quoted_state);
		} else if (data == '>') {
			emit_current_token();
		} else if (data == '=') {
			parse_error("equals-in-unquoted-attribute-value");
			current_token.data.last().nodeValue += data;
			newState(attribute_value_unquoted_state);
		} else {
			current_token.data.last().nodeValue += data;
			newState(attribute_value_unquoted_state);
		}

		return true;
	}

	function attribute_value_double_quoted_state(buffer) {
		var data = buffer.shift(1);
		if (data === HTML5.EOF) {
			parse_error("eof-in-attribute-value-double-quote");
			newState(data_state);
		} else if (data == '"') {
			newState(after_attribute_value_state);
		} else if (data == '&') {
			process_entity_in_attribute(buffer);
		} else {
			var s = buffer.matchUntil('["&]');
			if (s !== HTML5.EOF) data = data + s;
			current_token.data.last().nodeValue += data;
		}
		return true;
	}

	function attribute_value_single_quoted_state(buffer) {
		var data = buffer.shift(1);
		if (data === HTML5.EOF) {
			parse_error("eof-in-attribute-value-single-quote");
			emit_current_token();
		} else if (data == "'") {
			newState(after_attribute_value_state);
		} else if (data == '&') {
			process_entity_in_attribute(buffer);
		} else {
			current_token.data.last().nodeValue += data + buffer.matchUntil("['&]");
		}
		return true;
	}

	function attribute_value_unquoted_state(buffer) {
		var data = buffer.shift(1);
		if (data === HTML5.EOF) {
			parse_error("eof-in-attribute-value-no-quotes");
			buffer.commit();
			emit_current_token();
		} else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
			newState(before_attribute_name_state);
		} else if (data == '&') {
			process_entity_in_attribute(buffer);
		} else if (data == '>') {
			emit_current_token();
		} else if (data == '"' || data == "'" || data == '=') {
			parse_error("unexpected-character-in-unquoted-attribute-value");
			current_token.data.last().nodeValue += data;
		} else {
			var o = buffer.matchUntil("["+ HTML5.SPACE_CHARACTERS_IN + '&<>' +"]");
			if (o === HTML5.EOF) {
				parse_error("eof-in-attribute-value-no-quotes");
				emit_current_token();
			}
			// Commit here since this state is re-enterable and its outcome won't change with more data.
			buffer.commit();
			current_token.data.last().nodeValue += data + o;
		}
		return true;
	}

	function after_attribute_value_state(buffer) {
		var data = buffer.shift(1);
		if (data === HTML5.EOF) {
			parse_error( "unexpected-EOF-after-attribute-value");
			emit_current_token();
			buffer.unget(data);
			newState(data_state);
		} else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
			newState(before_attribute_name_state);
		} else if (data == '>') {
			emit_current_token();
			newState(data_state);
		} else if (data == '/') {
			newState(self_closing_tag_state);
		} else {
			emitToken({type: 'ParseError', data: "unexpected-character-after-attribute-value"});
			buffer.unget(data);
			newState(before_attribute_name_state);
		}
		return true;
	}

	function self_closing_tag_state(buffer) {
		var c = buffer.shift(1);
		if (c === HTML5.EOF) {
			parse_error("eof-in-tag-name");
			buffer.unget(c);
			newState(data_state);
		} else if (c == '>') {
			current_token.self_closing = true; 
			emit_current_token();
			newState(data_state);
		} else {
			parse_error("expected-self-closing-tag");
			buffer.unget(c);
			newState(before_attribute_name_state);
		}
		return true;
	}

	function bogus_comment_state(buffer) {
		var s = buffer.matchUntil('>');
		if (s === HTML5.EOF) {
			s = '';
		}
		var tok = {type: 'Comment', data: s};
		buffer.char();
		emitToken(tok);
		newState(data_state);
		return true;
	}

	function markup_declaration_open_state(buffer) {
		var chars = buffer.shift(2);
		if (chars === '--') {
			current_token = {type: 'Comment', data: ''};
			newState(comment_start_state);
		} else {
			var newchars = buffer.shift(5);
			if (newchars === HTML5.EOF || chars === HTML5.EOF) {
				parse_error("expected-dashes-or-doctype");
				newState(bogus_comment_state);
				buffer.unget(chars);
				return true;
			}

			chars += newchars;
			if (chars.toUpperCase() == 'DOCTYPE') {
				current_token = {type: 'Doctype', name: '', publicId: null, systemId: null, correct: true};
				newState(doctype_state);
			} else if (tree.open_elements.last() && tree.open_elements.last().namespace && chars == '[CDATA[') {
				newState(cdata_section_state);
			} else {
				parse_error("expected-dashes-or-doctype");
				buffer.unget(chars);
				newState(bogus_comment_state);
			}
		}
		return true;
	}

	function cdata_section_state(buffer) {
		var data = buffer.matchUntil(/\]\]>/);
		var slice;
		if (/\]\]>$/.match(data)) {
			slice = 4;
		} else {
			slice = 0;
		}

		emitToken({type: 'Characters', data: data.slice(0, data.length - slice)});
		newState(data_state);
	}

	function comment_start_state(buffer) {
		var data = buffer.shift(1);
		if (data === HTML5.EOF) {
			parse_error("eof-in-comment");
			emitToken(current_token);
			newState(data_state);
		} else if (data == '-') {
			newState(comment_start_dash_state);
		} else if (data == '>') {
			parse_error("incorrect comment");
			emitToken(current_token);
			newState(data_state);
		} else {
			current_token.data += data + buffer.matchUntil('-');
			newState(comment_state);
		}
		return true;
	}

	function comment_start_dash_state(buffer) {
		var data = buffer.shift(1);
		if (data === HTML5.EOF) {
			parse_error("eof-in-comment");
			emitToken(current_token);
			newState(data_state);
		} else if (data == '-') {
			newState(comment_end_state);
		} else if (data == '>') {
			parse_error("incorrect-comment");
			emitToken(current_token);
			newState(data_state);
		} else {
			var s = buffer.matchUntil('-');
			if (s !== HTML5.EOF) data = data + s;
			current_token.data += '-' + data;
			newState(comment_state);
		}
		return true;
	}

	function comment_state(buffer) {
		var data = buffer.shift(1);
		if (data === HTML5.EOF) {
			parse_error("eof-in-comment");
			emitToken(current_token);
			newState(data_state);
		} else if (data == '-') {
			newState(comment_end_dash_state);
		} else {
			current_token.data += data + buffer.matchUntil('-');
		}
		return true;
	}

	function comment_end_dash_state(buffer) {
		var data = buffer.char();
		if (data === HTML5.EOF) {
			parse_error("eof-in-comment-end-dash");
			emitToken(current_token);
			newState(data_state);
		} else if (data == '-') {
			newState(comment_end_state);
		} else {
			current_token.data += '-' + data + buffer.matchUntil('-');
			// Consume the next character which is either a "-" or an :EOF as
			// well so if there's a "-" directly after the "-" we go nicely to
			// the "comment end state" without emitting a ParseError there.
			buffer.char();
		}
		return true;
	}

	function comment_end_state(buffer) {
		var data = buffer.shift(1);
		if (data === HTML5.EOF) {
			parse_error("eof-in-comment-double-dash");
			emitToken(current_token);
			newState(data_state);
		} else if (data == '>') {
			emitToken(current_token);
			newState(data_state);
		} else if (data == '-') {
			parse_error("unexpected-dash-after-double-dash-in-comment");
			current_token.data += data;
		} else {
			// XXX
			parse_error("unexpected-char-in-comment");
			current_token.data += '--' + data;
			newState(comment_state);
		}
		return true;
	}

	function doctype_state(buffer) {
		var data = buffer.shift(1);
		if (HTML5.SPACE_CHARACTERS_R.test(data)) {
			newState(before_doctype_name_state);
		} else {
			parse_error("need-space-after-doctype");
			buffer.unget(data);
			newState(before_doctype_name_state);
		}
		return true;
	}

	function before_doctype_name_state(buffer) {
		var data = buffer.shift(1);
		if (data === HTML5.EOF) {
			parse_error("expected-doctype-name-but-got-eof");
			current_token.correct = false;
			emit_current_token();
			newState(data_state);
		} else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
		} else if (data == '>') {
			parse_error("expected-doctype-name-but-got-right-bracket");
			current_token.correct = false;
			emit_current_token();
			newState(data_state);
		} else {
			current_token.name = data.toLowerCase();
			newState(doctype_name_state);
		}
		return true;
	}

	function doctype_name_state(buffer) {
		var data = buffer.shift(1);
		if (data === HTML5.EOF) {
			current_token.correct = false;
			buffer.unget(data);
			parse_error("eof-in-doctype");
			emit_current_token();
			newState(data_state);
		} else if (HTML5.SPACE_CHARACTERS_R.test(data)) {
			newState(bogus_doctype_state);
		} else if (data == '>') {
			emit_current_token();
			newState(data_state);
		} else {
			current_token.name += data.toLowerCase();
		}
		return true;
	}

	function bogus_doctype_state(buffer) {
		var data = buffer.shift(1);
		current_token.correct = false;
		if (data === HTML5.EOF) {
			throw(new Error("Unimplemented!"));
		} else if (data == '>') {
			emit_current_token();
			newState(data_state);
		}
		return true;
	}

	function parse_error(message, context) {
		emitToken({type: 'ParseError', data: message});
		HTML5.debug('tokenizer.parseError', message, context);
	}

	function emit_current_token() {
		var tok = current_token;
		switch(tok.type) {
		case 'StartTag':
		case 'EndTag':
		case 'EmptyTag':
			if (tok.type == 'EndTag' && tok.self_closing) {
				parse_error('self-closing-end-tag');
			}
			break;
		}
		if (current_token.name.toLowerCase() == "script" && tok.type == 'EndTag' && script_buffer) {
			emitToken({ type: 'Characters', data: script_buffer });
			script_buffer = null;
		}
		emitToken(tok);
		newState(data_state);
	}

	function normalize_token(token) {
		if (token.type == 'EmptyTag') {
			if (HTML5.VOID_ELEMENTS.indexOf(token.name) == -1) {
				parse_error('incorrectly-placed-solidus');
			}
			token.type = 'StartTag';
		}

		if (token.type == 'StartTag') {
			token.name = token.name.toLowerCase();
			if (token.data.length !== 0) {
				var data = {};
				// the first value for each key wins
				token.data.reverse();
				token.data.forEach(function(e) {
					data[e.nodeName.toLowerCase()] = e.nodeValue;
				});
				token.data = [];
				for(var k in data) {
					token.data.push({nodeName: k, nodeValue: data[k]});
				}
				// restore original attribute order
				token.data.reverse();
			}
		} else if (token.type == 'EndTag') {
			if (token.data.length !== 0) parse_error('attributes-in-end-tag');
			token.name = token.name.toLowerCase();
		}

		return token;
	}

	if (typeof input === 'undefined') throw(new Error("No input given"));
	this.document = document;
	this.__defineSetter__('content_model', function(model) {
		HTML5.debug('tokenizer.content_model=', model);
		content_model = model;
	});
	this.__defineGetter__('content_model', function() {
		return content_model;
	});
	function newState(newstate) {
		HTML5.debug('tokenizer.state=', newstate.name);
		state = newstate;
		buffer.commit();
	}

	newState(data_state);

	if (input instanceof events.EventEmitter) {
		source = input;
		this.pump = null;
	} else {
		source = new events.EventEmitter();
		this.pump = function() {
			source.emit('data', input);
			source.emit('end');
		};
	}
	
	source.addListener('data', function(data) {
		if (typeof data !== 'string') data = data.toString();
		buffer.append(data);
		try {
			while(state(buffer));
		} catch(e) {
			if (e != HTML5.DRAIN) {
				throw(e);
			} else {
				HTML5.debug('tokenizer.drain', 'Drain');
				buffer.undo();
			}
		}
	});
	source.addListener('end', function() {
		buffer.eof = true;
		while(state(buffer));
		this.emit('end');
	}.bind(this));

};

t.prototype = new events.EventEmitter();
