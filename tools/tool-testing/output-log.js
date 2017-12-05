// Maintains a line-by-line merged log of multiple output channels
// (eg, stdout and stderr).
import TestFailure from './test-failure.js';

const hasOwn = Object.prototype.hasOwnProperty;

export default class OutputLog {
  constructor(run) {
    // each entry is an object withgit p keys 'channel', 'text', and if it is
    // the last entry and there was no newline terminator, 'bare'
    this.lines = [];

    // map from a channel name to an object representing a partially
    // read line of text on that channel. That object has keys 'text'
    // (text read), 'offset' (cursor position, equal to text.length
    // unless a '\r' has been read).
    this.buffers = {};

    // a Run, exclusively for inclusion in exceptions
    this.run = run;
  }

  write(channel, text) {
    if (!hasOwn.call(this.buffers, 'channel')) {
      this.buffers[channel] = { text: '', offset: 0 };
    }
    const b = this.buffers[channel];

    while (text.length) {
      const m = text.match(/^[^\n\r]+/);
      if (m) {
        // A run of non-control characters.
        b.text = b.text.substr(0, b.offset) +
          m[0] + b.text.substr(b.offset + m[0].length);
        b.offset += m[0].length;
        text = text.substr(m[0].length);
        continue;
      }

      if (text[0] === '\r') {
        b.offset = 0;
        text = text.substr(1);
        continue;
      }

      if (text[0] === '\n') {
        this.lines.push({ channel, text: b.text });
        b.text = '';
        b.offset = 0;
        text = text.substr(1);
        continue;
      }

      throw new Error("conditions should have been exhaustive?");
    }
  }

  end() {
    Object.keys(this.buffers).forEach((channel) => {
      if (this.buffers[channel].text.length) {
        this.lines.push({
          channel,
          text: this.buffers[channel].text,
          bare: true,
        });
        this.buffers[channel] = { text: '', offset: 0};
      }
    });
  }

  forbid(pattern, channel) {
    this.lines.forEach((line) => {
      if (channel && channel !== line.channel) {
        return;
      }

      const match = (pattern instanceof RegExp) ?
        (line.text.match(pattern)) : (line.text.indexOf(pattern) !== -1);
      if (match) {
        throw new TestFailure('forbidden-string-present', { run: this.run });
      }
    });
  }

  get() {
    return this.lines;
  }
}
