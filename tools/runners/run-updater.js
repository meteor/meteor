import { Console } from '../console/console';

const CHECK_UPDATE_INTERVAL = 3 * 60 * 60 * 1000; // every 3 hours

// XXX make it take a runLog?
// XXX need to deal with updater writing messages (bypassing old
// stdout interception.. maybe it should be global after all..)
export class Updater {
  constructor() {
    this.timer = null;
  }

  start() {
    if (this.timer) {
      throw new Error('already running?');
    }

    const self = this;
    // Check every 3 hours. (Should not share buildmessage state with
    // the main fiber.)
    async function check() {
      self._check();
    }

    this.timer = setInterval(check, CHECK_UPDATE_INTERVAL);

    // Also start a check now, but don't block on it. (This should
    // not share buildmessage state with the main fiber.)
    check();
  }

  _check() {
    const updater = require('../packaging/updater');
    try {
      updater.tryToDownloadUpdate({ showBanner: true });
    } catch (e) {
      // oh well, this was the background. Only show errors if we are in debug
      // mode.
      Console.debug('Error inside updater.');
      Console.debug(e.stack);
    }
  }

  // Returns immediately. However, if an update check is currently
  // running it will complete in the background. Idempotent.
  stop() {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = null;
  }
}
