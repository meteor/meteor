let nextObserveHandleId = 1;

// When the callbacks do not mutate the arguments, we can skip a lot of data clones
export class ObserveHandle {
    _stopped: boolean;
    _id: number;
    _multiplexer: any;
    nonMutatingCallbacks: boolean;

    constructor(multiplexer: any, callbacks: any, nonMutatingCallbacks: boolean) {
        this._multiplexer = multiplexer;

        multiplexer.callbackNames().forEach((name) => {
            if (callbacks[name]) {
                this['_' + name] = callbacks[name];
            } else if (name === "addedBefore" && callbacks.added) {
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

    _addedBefore(id: any, fields: any, before: any) {
        throw new Error("Method not implemented.");
    }
}