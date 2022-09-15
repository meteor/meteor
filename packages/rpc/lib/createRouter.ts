import {z} from "zod";
import {Config, ReturnMethod, ReturnSubscription} from "./types";
import {createMethod} from "./createMethod";
import {createPublication} from "./createPublication";



export const createRouter =
  <RouteName extends string | undefined, Submodules extends Record<string, unknown> = {}>
  (prefix?: RouteName, subModules?: Submodules) => {
    const addMethod =
      <Name extends string, S extends z.ZodUndefined | z.ZodTypeAny, T>
      (name: Name,
       schema: S,
       resolver:
         (this: Meteor.MethodThisType, args: z.output<S>) => T,
       config?: Config<S, T>) => {
        const nameWithPrefix = prefix ? `${prefix}.${name}` : name;
        const obj = {[name]: createMethod(nameWithPrefix, schema, resolver, config)};
        return createRouter <RouteName,Submodules & Record<Name, ReturnMethod<RouteName extends undefined ? Name : `${RouteName}.${Name}`, S, T>>>(prefix, {
          ...subModules,
          ...obj
        } as Submodules & Record<Name, ReturnMethod<RouteName extends undefined ? Name : `${RouteName}.${Name}`, S, T>>)
      }

    const addPublication =
      <Name extends string, S extends z.ZodUndefined | z.ZodTypeAny, T>
      (name: Name,
       schema: S,
       resolver:
         (this: Meteor.MethodThisType, args: z.output<S>) => T,
       config?: Config<S, T>) => {
        const nameWithPrefix = prefix ? `${prefix}.${name}` : name;
        const obj = {[name]: createPublication(nameWithPrefix, schema, resolver, config)};
        return createRouter<RouteName, Submodules & Record<Name, ReturnSubscription<RouteName extends undefined ? Name : `${RouteName}.${Name}`, S, T>>>(prefix, {
          ...subModules,
          ...obj
        } as Submodules & Record<Name, ReturnSubscription<RouteName extends undefined ? Name : `${RouteName}.${Name}`, S, T>>)
      }

    const build =
      () => subModules as Submodules extends infer O ? { [K in keyof O]: O[K] } : never;

    return {
      addMethod,
      addPublication,
      build
    }
  }
export type Router = typeof createRouter
