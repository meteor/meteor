import { ObserveHandleCallback, ObserveMultiplexer } from './observe_multiplex';

let nextObserveHandleId = 1;

export type ObserveHandleCallbackInternal = '_added' | '_addedBefore' | '_changed' | '_movedBefore' | '_removed';


export type Callback<T = any> = (...args: T[]) => Promise<void> | void;

/**
 * The "observe handle" returned from observeChanges.
 * Contains a reference to an ObserveMultiplexer.
 * Used to stop observation and clean up resources.
 */
export class ObserveHandle<T = any> {
  _id: number;
  _multiplexer: ObserveMultiplexer;
  nonMutatingCallbacks: boolean;
  _stopped: boolean;

  public initialAddsSentResolver: (value: void) => void = () => {};
  public initialAddsSent: Promise<void>

  _added?: Callback<T>;
  _addedBefore?: Callback<T>;
  _changed?: Callback<T>;
  _movedBefore?: Callback<T>;
  _removed?: Callback<T>;

  constructor(multiplexer: ObserveMultiplexer, callbacks: Record<ObserveHandleCallback, Callback<T>>, nonMutatingCallbacks: boolean) {
    this._multiplexer = multiplexer;

    multiplexer.callbackNames().forEach((name: ObserveHandleCallback) => {
      if (callbacks[name]) {
        this[`_${name}` as ObserveHandleCallbackInternal] = callbacks[name];
        return;
      }

      if (name === "addedBefore" && callbacks.added) {
        this._addedBefore = async function (id, fields, before) {
          await callbacks.added(id, fields);
        };
      }
    });

    this._stopped = false;
    this._id = nextObserveHandleId++;
    this.nonMutatingCallbacks = nonMutatingCallbacks;

    this.initialAddsSent = new Promise(resolve => {
      const ready = () => {
        resolve();
        this.initialAddsSent = Promise.resolve();
      }

      const timeout = setTimeout(ready, 30000)

      this.initialAddsSentResolver = () => {
        ready();
        clearTimeout(timeout);
      };
    });
  }

  /**
   * Using property syntax and arrow function syntax to avoid binding the wrong context on callbacks.
   */
  stop = async () => {
    if (this._stopped) return;
    this._stopped = true;
    await this._multiplexer.removeHandle(this._id);
  }
}