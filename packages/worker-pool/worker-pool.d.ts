declare module 'meteor/worker-pool' {
  interface PoolOptions {
    min?: number;
    max?: number;
    idleTimeout?: number;
    taskTimeout?: number;
    recycleAfter?: number;
    heartbeatInterval?: number;
    heartbeatTimeout?: number;
    workerScript?: string;
    userId?: string;
    connectionId?: string;
    callTimeout?: number;
    enableHeartbeat?: boolean;
  }

  interface PoolStats {
    total: number;
    idle: number;
    busy: number;
    spawning?: number;
    pending: number;
  }

  interface DispatchOptions {
    handler?: Function;
    handlerName?: string;
    data?: any;
    timeout?: number;
  }

  class WorkerPool {
    constructor(options?: PoolOptions);
    dispatch(options: DispatchOptions): Promise<any>;
    stats(): PoolStats;
    drain(): Promise<void>;
    terminate(): Promise<void>;
  }
}
