import { decode, encode } from '@jridgewell/sourcemap-codec';

// Builds one source map for code that is appended piece by piece, the way
// processFilesForBundle joins the minified files into a single bundle.
export class SourceMapConcatenator {
  constructor() {
    this._lines = [[]];
    this._line = 0;
    this._column = 0;
    this._sources = [];
    this._sourcesContent = [];
    this._sourceIndexes = new Map();
    this._names = [];
    this._nameIndexes = new Map();
  }

  // filePath is the appended file's path in the bundle; its map's ./ and ../ sources resolve against it.
  append(code, map, filePath = '') {
    const lines = code.split('\n');
    if (map) {
      this._appendMappings(typeof map === 'string' ? JSON.parse(map) : map, lines.length, filePath);
    }
    this._advance(lines);
  }

  toJSON() {
    return {
      version: 3,
      sources: this._sources,
      sourcesContent: this._sourcesContent,
      names: this._names,
      mappings: encode(this._lines),
    };
  }

  _appendMappings(map, lineCount, filePath) {
    const sourceRoot = map.sourceRoot ? map.sourceRoot.replace(/\/?$/, '/') : '';
    const sourceIndexes = (map.sources || []).map((source, i) =>
      this._addSource(resolveSource(sourceRoot + source, filePath), map.sourcesContent?.[i] ?? null)
    );
    const nameIndexes = (map.names || []).map((name) => this._addName(name));

    decode(map.mappings).slice(0, lineCount).forEach((segments, i) => {
      const columnOffset = i === 0 ? this._column : 0;
      const line = this._lineAt(this._line + i);
      for (const segment of segments) {
        const shifted = [segment[0] + columnOffset];
        if (segment.length >= 4) {
          shifted.push(sourceIndexes[segment[1]], segment[2], segment[3]);
        }
        if (segment.length === 5) {
          shifted.push(nameIndexes[segment[4]]);
        }
        line.push(shifted);
      }
    });
  }

  _advance(lines) {
    const lastLine = lines[lines.length - 1];
    this._line += lines.length - 1;
    this._column = lines.length === 1 ? this._column + lastLine.length : lastLine.length;
    this._lineAt(this._line);
  }

  _lineAt(index) {
    while (this._lines.length <= index) {
      this._lines.push([]);
    }
    return this._lines[index];
  }

  _addSource(source, content) {
    const indexes = this._sourceIndexes.get(source) ?? [];
    const known = indexes.find((index) => this._sourcesContent[index] === content);
    if (known !== undefined) {
      return known;
    }
    const index = this._sources.push(source) - 1;
    this._sourcesContent.push(content);
    this._sourceIndexes.set(source, [...indexes, index]);
    return index;
  }

  _addName(name) {
    let index = this._nameIndexes.get(name);
    if (index === undefined) {
      index = this._names.push(name) - 1;
      this._nameIndexes.set(name, index);
    }
    return index;
  }
}

// Meteor reads plain source paths from the app root, so only explicitly relative ones move.
function resolveSource(source, filePath) {
  if (!/^\.\.?\//.test(source)) {
    return source;
  }
  const parts = filePath.split('/').slice(0, -1);
  for (const part of source.split('/')) {
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') {
      parts.pop();
    } else if (part !== '.' && part !== '') {
      parts.push(part);
    }
  }
  return parts.join('/');
}
