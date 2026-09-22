import type { Meteor } from 'meteor/meteor';
import type { EJSONable, EJSONableProperty } from 'meteor/ejson';
import type { DDPCommon } from 'meteor/ddp-common';

export namespace DDP {
  type Argument = EJSONable | EJSONableProperty;
  type Result = EJSONable | EJSONable[] | EJSONableProperty | EJSONableProperty[];

  interface SubscriptionCallbacks {
    onReady?: (() => void) | undefined;
    onStop?: ((error?: Error | Meteor.Error) => void) | undefined;
  }

  type SubscriptionCallback = (() => void) | SubscriptionCallbacks;
  type MethodCallback<Result> = (
    error: Error | Meteor.Error | undefined,
    result?: Result
  ) => void;

  type MethodHandler = {
    bivarianceHack(this: DDPCommon.MethodInvocation, ...args: unknown[]): unknown;
  }["bivarianceHack"];

  interface DDPStatic {
    subscribe(name: string, ...args: Argument[]): Meteor.SubscriptionHandle;
    subscribe(name: string, ...args: [...Argument[], SubscriptionCallback]): Meteor.SubscriptionHandle;
    call<Result extends DDP.Result = DDP.Result>(method: string, ...parameters: [...Argument[], MethodCallback<Result>]): void;
    call<Result extends DDP.Result = DDP.Result>(method: string, ...parameters: Argument[]): Result | undefined | Promise<Result>;
    callAsync<Result extends DDP.Result = DDP.Result>(method: string, ...parameters: Argument[]): Promise<Result>;
    apply<Result extends DDP.Result = DDP.Result>(
      method: string,
      args: ReadonlyArray<Argument>,
      options?: Meteor.MethodApplyOptions<Result>,
      callback?: MethodCallback<Result>
    ): Result;
    methods<T extends {[K in keyof T]: MethodHandler }>(methods: T): void;
    subscribe(name: string, ...rest: unknown[]): Meteor.SubscriptionHandle;
    call<Result = unknown>(method: string, ...parameters: unknown[]): Result | undefined | Promise<Result>;
    callAsync<Result = unknown>(method: string, ...parameters: unknown[]): Promise<Result>;
    apply<Result = unknown>(method: string, ...parameters: unknown[]): Result;
    status(): DDPStatus;
    reconnect(): void;
    disconnect(): void;
    close(): void;
    onReconnect: (() => void | Promise<void>) | null;
  }

  function _allSubscriptionsReady(): boolean;

  type Status = 'connected' | 'connecting' | 'failed' | 'waiting' | 'offline';

  interface DDPStatus {
    connected: boolean;
    status: Status;
    retryCount: number;
    retryTime?: number | undefined;
    reason?: string | undefined;
  }

  function connect(url: string, options?: { retry?: boolean }): DDPStatic;

  function onReconnect(callback: (connection: DDPStatic) => void | Promise<void>): {
    stop(): void;
  };
}
