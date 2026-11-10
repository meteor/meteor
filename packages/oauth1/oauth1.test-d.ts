import { expectTypeOf } from "expect-type";
import { OAuth1Binding } from "./oauth1";

expectTypeOf(OAuth1Binding).toBeConstructibleWith(
  { consumerKey: "k", secret: "s" },
  { requestToken: "r", authorize: "a", accessToken: "t" }
);

const binding = new OAuth1Binding(
  { consumerKey: "k", secret: "s" },
  { requestToken: "r", authorize: "a", accessToken: "t" }
);

expectTypeOf(binding.requestToken).toEqualTypeOf<string | undefined>();
expectTypeOf(binding.prepareRequestToken).parameters.toEqualTypeOf<[string]>();
expectTypeOf(binding.prepareRequestToken).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(binding.prepareAccessToken).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(binding.callAsync).returns.toEqualTypeOf<Promise<unknown>>();
expectTypeOf(binding.getAsync).returns.toEqualTypeOf<Promise<unknown>>();
expectTypeOf(binding.postAsync).returns.toEqualTypeOf<Promise<unknown>>();
expectTypeOf(binding.get).toBeFunction();
expectTypeOf(binding.post).toBeFunction();
