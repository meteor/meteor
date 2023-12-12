import { CompileError } from './throw-compile-error';

export function scanHtmlForTags(options) {
  const scan = new HtmlScan(options);
  return scan.getTags();
}

/**
 * Scan an HTML file for top-level tags and extract their contents. Pass them to
 * a tag handler (an object with a handleTag method)
 *
 * This is a primitive, regex-based scanner.  It scans
 * top-level tags, which are allowed to have attributes,
 * and ignores top-level HTML comments.
 */
class HtmlScan {
  /**
   * Initialize and run a scan of a single file
   * @param  {String} sourceName The filename, used in errors only
   * @param  {String} contents   The contents of the file
   * @param  {String[]} tagNames An array of tag names that are accepted at the
   * top level. If any other tag is encountered, an error is thrown.
   */
  constructor({
        sourceName,
        contents,
        tagNames
      }) {
    this.sourceName = sourceName;
    this.contents = contents;
    this.tagNames = tagNames;

    this.rest = contents;
    this.index = 0;

    this.tags = [];

    const tagNameRegex = this.tagNames.join("|");
    const openTagRegex = new RegExp(`^((<(${tagNameRegex})\\b)|(<!--)|(<!DOCTYPE|{{!)|$)`, "i");

    while (this.rest) {
      // skip whitespace first (for better line numbers)
      this.advance(this.rest.match(/^\s*/)[0].length);

      const match = openTagRegex.exec(this.rest);

      if (! match) {
        this.throwCompileError(`Expected one of: <${this.tagNames.join('>, <')}>`);
      }

      const matchToken = match[1];
      const matchTokenTagName =  match[3];
      const matchTokenComment = match[4];
      const matchTokenUnsupported = match[5];

      const tagStartIndex = this.index;
      this.advance(match.index + match[0].length);

      if (! matchToken) {
        break; // matched $ (end of file)
      }

      if (matchTokenComment === '<!--') {
        // top-level HTML comment
        const commentEnd = /--\s*>/.exec(this.rest);
        if (! commentEnd)
          this.throwCompileError("unclosed HTML comment in template file");
        this.advance(commentEnd.index + commentEnd[0].length);
        continue;
      }

      if (matchTokenUnsupported) {
        switch (matchTokenUnsupported.toLowerCase()) {
        case '<!doctype':
          this.throwCompileError(
            "Can't set DOCTYPE here.  (Meteor sets <!DOCTYPE html> for you)");
        case '{{!':
          this.throwCompileError(
            "Can't use '{{! }}' outside a template.  Use '<!-- -->'.");
        }

        this.throwCompileError();
      }

      // otherwise, a <tag>
      const tagName = matchTokenTagName.toLowerCase();
      const tagAttribs = {}; // bare name -> value dict
      const tagPartRegex = /^\s*((([a-zA-Z0-9:_-]+)\s*=\s*(["'])(.*?)\4)|(>))/;

      // read attributes
      let attr;
      while ((attr = tagPartRegex.exec(this.rest))) {
        const attrToken = attr[1];
        const attrKey = attr[3];
        let attrValue = attr[5];
        this.advance(attr.index + attr[0].length);

        if (attrToken === '>') {
          break;
        }

        // XXX we don't HTML unescape the attribute value
        // (e.g. to allow "abcd&quot;efg") or protect against
        // collisions with methods of tagAttribs (e.g. for
        // a property named toString)
        attrValue = attrValue.match(/^\s*([\s\S]*?)\s*$/)[1]; // trim
        tagAttribs[attrKey] = attrValue;
      }

      if (! attr) { // didn't end on '>'
        this.throwCompileError("Parse error in tag");
      }

      // find </tag>
      const end = (new RegExp('</'+tagName+'\\s*>', 'i')).exec(this.rest);
      if (! end) {
        this.throwCompileError("unclosed <"+tagName+">");
      }

      const tagContents = this.rest.slice(0, end.index);
      const contentsStartIndex = this.index;

      // trim the tag contents.
      // this is a courtesy and is also relied on by some unit tests.
      var m = tagContents.match(/^([ \t\r\n]*)([\s\S]*?)[ \t\r\n]*$/);
      const trimmedContentsStartIndex = contentsStartIndex + m[1].length;
      const trimmedTagContents = m[2];

      const tag = {
        tagName: tagName,
        attribs: tagAttribs,
        contents: trimmedTagContents,
        contentsStartIndex: trimmedContentsStartIndex,
        tagStartIndex: tagStartIndex,
        fileContents: this.contents,
        sourceName: this.sourceName
      };

      // save the tag
      this.tags.push(tag);

      // advance afterwards, so that line numbers in errors are correct
      this.advance(end.index + end[0].length);
    }
  }

  /**
   * Advance the parser
   * @param  {Number} amount The amount of characters to advance
   */
  advance(amount) {
    this.rest = this.rest.substring(amount);
    this.index += amount;
  }

  throwCompileError(msg, overrideIndex) {
    const finalIndex = (typeof overrideIndex === 'number' ? overrideIndex : this.index);

    const err = new CompileError();
    err.message = msg || "bad formatting in template file";
    err.file = this.sourceName;
    err.line = this.contents.substring(0, finalIndex).split('\n').length;

    throw err;
  }

  throwBodyAttrsError(msg) {
    this.parseError(msg);
  }

  getTags() {
    return this.tags;
  }
}
