import { expectTypeOf } from "expect-type";
import { XmlBuilder } from "./xmlbuilder";

// xmlbuilder exports the XmlBuilder factory (the `xmlbuilder` npm module).
expectTypeOf(XmlBuilder).toBeObject();
expectTypeOf(XmlBuilder.create).toBeFunction();
expectTypeOf(XmlBuilder.create("root").ele("child")).toBeObject();
expectTypeOf(XmlBuilder.create("root").end()).toEqualTypeOf<string>();
