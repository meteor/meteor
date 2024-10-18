import { ObserveHandleCallback, ObserveMultiplexer } from './observe_multiplex';

let nextObserveHandleId = 1;

export type ObserveHandleCallbackInternal = '_added' | '_addedBefore' | '_changed' | '_movedBefore' | '_removed';

// When the callbacks do not mutate the arguments, we can skip a lot of data clones
export class ObserveHandle {
  _id: number;
  _multiplexer: ObserveMultiplexer;
  nonMutatingCallbacks: boolean;
  _stopped: boolean;

  _added?: (...args: any[]) => void;
  _addedBefore?: (...args: any[]) => void;
  _changed?: (...args: any[]) => void;
  _movedBefore?: (...args: any[]) => void;
  _removed?: (...args: any[]) => void;

  constructor(multiplexer: any, callbacks: Record<ObserveHandleCallback, any>, nonMutatingCallbacks: boolean) {
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
  }

  async stop() {
    if (this._stopped) return;
    this._stopped = true;
    await this._multiplexer.removeHandle(this._id);
  }
}