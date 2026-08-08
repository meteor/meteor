import { expectTypeOf } from "expect-type";
import { Mongo } from "meteor/mongo";
import {
  ServiceConfiguration,
  type Configuration,
} from "./service-configuration";

// Configuration models a stored service-config document: `service` is mandatory,
// `_id` optional, plus arbitrary service-specific keys.
expectTypeOf<Configuration["service"]>().toEqualTypeOf<string>();
expectTypeOf<Configuration["someArbitraryServiceKey"]>().toEqualTypeOf<unknown>();
expectTypeOf<Configuration>().toExtend<{ service: string }>();

// ServiceConfiguration namespace object
expectTypeOf(ServiceConfiguration).toBeObject();
expectTypeOf(ServiceConfiguration.configurations).toEqualTypeOf<
  Mongo.Collection<Configuration>
>();

// ConfigError static
expectTypeOf(ServiceConfiguration.ConfigError).toBeConstructibleWith();
expectTypeOf(ServiceConfiguration.ConfigError).toBeConstructibleWith("google");

const err = new ServiceConfiguration.ConfigError("facebook");
expectTypeOf(err).toMatchTypeOf<Error>();
expectTypeOf(err.message).toBeString();
