import { expectTypeOf } from "expect-type";
import { GeoJSON } from "./geojson-utils";

expectTypeOf(GeoJSON).toBeObject();

expectTypeOf(GeoJSON.area).returns.toBeNumber();
expectTypeOf(GeoJSON.centroid).toBeFunction();
expectTypeOf(GeoJSON.destinationPoint).toBeFunction();
expectTypeOf(GeoJSON.drawCircle).toBeFunction();
expectTypeOf(GeoJSON.geometryWithinRadius).returns.toBeBoolean();
expectTypeOf(GeoJSON.lineStringsIntersect).toBeFunction();
expectTypeOf(GeoJSON.numberToRadius).parameters.toEqualTypeOf<[number]>();
expectTypeOf(GeoJSON.numberToRadius).returns.toBeNumber();
expectTypeOf(GeoJSON.numberToDegree).parameters.toEqualTypeOf<[number]>();
expectTypeOf(GeoJSON.numberToDegree).returns.toBeNumber();
expectTypeOf(GeoJSON.pointDistance).returns.toBeNumber();
expectTypeOf(GeoJSON.pointInBoundingBox).returns.toBeBoolean();
expectTypeOf(GeoJSON.pointInPolygon).returns.toBeBoolean();
expectTypeOf(GeoJSON.rectangleCentroid).toBeFunction();
expectTypeOf(GeoJSON.simplify).toBeFunction();
