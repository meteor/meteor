import { expectTypeOf } from "expect-type";
import {
  Accounts,
  AccountsClient,
} from "./accounts-base";
import type {
  URLS,
  EmailFields,
  AccountsClientOptions,
  Header,
  EmailTemplates,
} from "./accounts-base";

expectTypeOf<URLS>().toBeObject();
expectTypeOf<EmailFields>().toBeObject();
expectTypeOf<AccountsClientOptions>().toBeObject();
expectTypeOf<Header>().toBeObject();
expectTypeOf<EmailTemplates>().toBeObject();

expectTypeOf(AccountsClient).toBeConstructibleWith();
expectTypeOf(Accounts).toBeObject();
