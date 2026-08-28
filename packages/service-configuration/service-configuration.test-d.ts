import { expectTypeOf } from "expect-type";
import { Mongo } from "meteor/mongo";
import {
  ServiceConfiguration,
  type Configuration,
} from "./service-configuration";

const legacyConfiguration: Configuration = {
  appId: "app-id",
  secret: "secret",
};
expectTypeOf(legacyConfiguration.appId).toEqualTypeOf<string>();
expectTypeOf<Configuration["someArbitraryServiceKey"]>().toBeAny();

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
