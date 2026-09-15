import { expectTypeOf } from "expect-type";
import { Mongo } from "meteor/mongo";
import {
  ServiceConfiguration,
  type Configuration,
} from "./service-configuration.native";

const legacyConfiguration: Configuration = {
  appId: "app-id",
  secret: "secret",
};
const serviceOnlyConfiguration: Configuration = {
  service: "oauth1-test",
};
expectTypeOf<Configuration>().toBeObject();
expectTypeOf(legacyConfiguration.appId).toEqualTypeOf<string | undefined>();
expectTypeOf(serviceOnlyConfiguration.service).toEqualTypeOf<string | undefined>();
expectTypeOf<Configuration["someArbitraryServiceKey"]>().toEqualTypeOf<unknown>();

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
