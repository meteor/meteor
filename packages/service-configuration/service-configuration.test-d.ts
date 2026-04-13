import { expectTypeOf } from "expect-type";
import type { Configuration } from "./service-configuration";
import { ServiceConfiguration } from "./service-configuration";

// Configuration — shape of a stored OAuth service configuration
declare const cfg: Configuration;
expectTypeOf(cfg).toMatchTypeOf<{ appId: string; secret: string }>();
expectTypeOf(cfg.appId).toBeString();
expectTypeOf(cfg.secret).toBeString();

// ServiceConfiguration — object exposing the collection and the error class
expectTypeOf(ServiceConfiguration).toBeObject();
expectTypeOf(ServiceConfiguration.ConfigError).toBeFunction();
expectTypeOf(new ServiceConfiguration.ConfigError()).toBeObject();
expectTypeOf(new ServiceConfiguration.ConfigError("google")).toMatchTypeOf<Error>();
