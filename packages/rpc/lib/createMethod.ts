import {z} from "zod";
import {Method, Config} from "./types"
import {isThenable} from './utils/isThenable'
import {RateLimiterConfig} from "./utils/RateLimiterConfig";


export const createMethod: Method =
  <Name extends string, S extends z.ZodUndefined | z.ZodTypeAny, T>
  (name: Name, schema: S, run: (this: Meteor.MethodThisType, args: z.output<S>) => T, config?: Config<S, T>) => {

    Meteor.methods({
      [name](data) {
        const parsed: z.output<S> = schema.parse(data);
        const result: T = run.call(this, parsed);

        if (isThenable(result)) {
          return (Promise as any).await(result);
        } else {
          return result;
        }
      }
    });

    if (config?.rateLimit) {
      RateLimiterConfig("method", name, config.rateLimit);
    }

    function call(...args: S extends z.ZodUndefined ? [] : [z.input<S>]): Promise<T>
    function call(args?: z.input<S>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        Meteor.call(name, args, (err: null | Meteor.Error, result: T) => {
          if (config?.methodHooks?.beforeResolve) {
            config.methodHooks.beforeResolve(args, err, result)
          }
          if (err) {
            if (config?.methodHooks?.onErrorResolve) {
              config.methodHooks.onErrorResolve(err, result)
            }
            reject(err);
          } else {
            resolve(result);
            if (config?.methodHooks?.afterResolve) {
              config.methodHooks.afterResolve(args, result)
            }
          }
        });
      });
    }

    call.config = {...config, name, schema, run}

    return call;
  }
