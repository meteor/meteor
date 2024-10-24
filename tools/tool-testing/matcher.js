// Handles the job of waiting until text is seen that matches a
// regular expression.
import { makeFulfillablePromise } from '../utils/als_helpers.js';
import TestFailure from './test-failure.js';
import { Console } from '../console/console.js';

export default class Matcher {
  constructor(run) {
    this.buf = "";
    this.fullBuffer = "";
    this.ended = false;
    this.resetMatch();
    this.run = run; // used only to set a field on exceptions
    this.endPromise = new Promise((resolve) => {
      this.resolveEndPromise = resolve;
    });
  }

  async write(data) {
    this.buf += data;
    this.fullBuffer += data;
    await this._tryMatch();
  }

  getFullBuffer() {
    return this.fullBuffer;
  }

  resetMatch() {
    const mp = this.matchPromise;

    this.matchPattern = null;
    this.matchPromise = null;
    this.matchStrict = null;
    this.matchFullBuffer = false;

    return mp;
  }

  setMatchStrict(strict) {
    this.matchStrict = strict;
  }

  rejectMatch(error) {
    const mp = this.resetMatch();
    if (mp) {
      mp.reject(error);
    } else {
      // If this.matchPromise was not defined, we should not swallow this
      // error, so we must throw it instead.
      throw error;
    }
  }

  resolveMatch(value) {
    const mp = this.resetMatch();
    if (mp) {
      mp.resolve(value);
    }
  }

  match(pattern, timeout, strict) {
    return this.matchAsync(pattern, { timeout, strict });
  }

  // Like match, but returns a Promise without calling .await().
  async matchAsync(pattern, {
    timeout = null,
    strict = false,
    matchFullBuffer = false,
  }) {
    if (this.matchPromise) {
      return Promise.reject(new Error("already have a match pending?"));
    }
    this.matchPattern = pattern;
    this.matchStrict = strict;
    this.matchFullBuffer = matchFullBuffer;
    const mp = this.matchPromise = makeFulfillablePromise();
    await this._tryMatch(); // could clear this.matchPromise

    let timer = null;
    if (timeout) {
      const failure = new TestFailure('match-timeout', {
        run: this.run,
        pattern: this.matchPattern,
      });

      timer = setTimeout(() => {
        this.rejectMatch(failure);
      }, timeout * 1000);
    } else {
      return mp;
    }

    return mp.then(
      (result) => {
        clearTimeout(timer);
        return result;
      },
      (error) => {
        clearTimeout(timer);
        throw error;
      }
    );
  }

  matchBeforeEnd(pattern, timeout) {
    return this._beforeEnd(() => this.matchAsync(pattern, {
      timeout: timeout || 15,
      matchFullBuffer: true,
    }));
  }

  _beforeEnd(promiseCallback) {
    this.endPromise = this.endPromise.then(promiseCallback);
    return this.endPromise;
  }

  end() {
    return this.endAsync();
  }

  endAsync() {
    this.resolveEndPromise();
    return this._beforeEnd(async () => {
      this.ended = true;
      this._tryMatch();
      return this.matchPromise;
    });
  }

  matchEmpty() {
    if (this.buf.length > 0) {
      Console.info("Extra junk is :", this.buf);
      throw new TestFailure('junk-at-end', { run: this.run });
    }
  }

  async awaitMatchPromise() {
    if (!this.matchPromise) {
      return;
    }
    await this.matchPromise;
    this.matchPattern = null;
  }

  async _tryMatch() {
    const mp = this.matchPromise;
    if (! mp) {
      return;
    }

    let ret = null;

    if (this.matchFullBuffer) {
      // Note: this.matchStrict is ignored if this.matchFullBuffer truthy.
      if (this.matchPattern instanceof RegExp) {
        ret = this.fullBuffer.match(this.matchPattern);
      } else if (this.fullBuffer.indexOf(this.matchPattern) >= 0) {
        ret = this.matchPattern;
      }
    } else if (this.matchPattern instanceof RegExp) {
      const m = this.buf.match(this.matchPattern);
      if (m) {
        if (this.matchStrict && m.index !== 0) {
          Console.info("Extra junk is: ", this.buf.substr(0, m.index));
          this.rejectMatch(new TestFailure('junk-before', {
            run: this.run,
            pattern: this.matchPattern,
          }));
          return;
        }
        ret = m;
        this.buf = this.buf.slice(m.index + m[0].length);
      }
    } else {
      const i = this.buf.indexOf(this.matchPattern);
      if (i !== -1) {
        if (this.matchStrict && i !== 0) {
          Console.info("Extra junk is: ", this.buf.substr(0, i));
          this.rejectMatch(new TestFailure('junk-before', {
            run: this.run,
            pattern: this.matchPattern,
          }));
          return;
        }
        ret = this.matchPattern;
        this.buf = this.buf.slice(i + this.matchPattern.length);
      }
    }

    if (ret !== null) {
      this.resolveMatch(ret);
      return;
    }

    if (this.ended) {
      this.rejectMatch(new TestFailure('no-match', {
        run: this.run,
        pattern: this.matchPattern,
      }));
      return;
    }
  }
}

import { markThrowingMethods } from "./test-utils.js";
markThrowingMethods(Matcher.prototype);
