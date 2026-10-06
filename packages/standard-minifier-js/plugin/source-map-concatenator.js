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

  append(code, map) {
    if (map) {
      this._appendMappings(typeof map === 'string' ? JSON.parse(map) : map);
    }
    this._advance(code);
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

  _appendMappings(map) {
    const sourceRoot = map.sourceRoot ? map.sourceRoot.replace(/\/?$/, '/') : '';
    const sourceIndexes = (map.sources || []).map((source, i) =>
      this._addSource(sourceRoot + source, map.sourcesContent?.[i] ?? null)
    );
    const nameIndexes = (map.names || []).map((name) => this._addName(name));

    decode(map.mappings).forEach((segments, i) => {
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

  _advance(code) {
    const lines = code.split('\n');
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
    const known = this._sourceIndexes.get(source);
    if (known !== undefined && this._sourcesContent[known] === content) {
      return known;
    }
    const index = this._sources.push(source) - 1;
    this._sourcesContent.push(content);
    this._sourceIndexes.set(source, index);
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
