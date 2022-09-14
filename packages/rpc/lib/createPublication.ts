import {Config, Subscription, SubscriptionCallbacks} from "./types";
import {z} from "zod";
import {isThenable} from "./utils/isThenable";
import {RateLimiterConfig} from "./utils/RateLimiterConfig";

export const createPublication: Subscription =
  <Name extends string, S extends z.ZodUndefined | z.ZodTypeAny, T>
  (name: Name, schema: S, run: (this: Meteor.MethodThisType, args: z.output<S>) => T, config?: Config<S, T>) => {

  if (Meteor.isServer) {
    Meteor.publish(name, function (data: z.input<S>) {
        const parsed: z.output<S> = schema.parse(data);
        const result: T = run.call(this, parsed);

        if (isThenable(result)) {
          return (Promise as any).await(result);
        } else {
          return result;
        }
      }
    );
  }

    if (config?.rateLimit) {
      RateLimiterConfig("subscription", name, config.rateLimit);
    }

    function subscribe(...args: S extends z.ZodUndefined ? [SubscriptionCallbacks?] : [z.input<S>, SubscriptionCallbacks?]): Meteor.SubscriptionHandle
    function subscribe(args?: z.input<S> | SubscriptionCallbacks, callbacks?: SubscriptionCallbacks): Meteor.SubscriptionHandle {
      return Meteor.subscribe(name, args);
    }

    subscribe.config = {...config, name, schema, run}

    return subscribe;
  }
