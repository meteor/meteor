/** A GeoJSON position: `[longitude, latitude]` (with optional altitude). */
type Position = number[];

/** A GeoJSON geometry object, e.g. a Point, LineString or Polygon. */
interface Geometry {
  type: string;
  coordinates: Position | Position[] | Position[][];
}

/**
 * Geometry helpers operating on GeoJSON objects. Ported from the
 * `geojson-utils` library.
 */
export namespace GeoJSON {
  /** Area of a polygon, in square units of its coordinates. */
  export function area(polygon: Geometry): number;
  /** Centroid point of a polygon. */
  export function centroid(polygon: Geometry): Geometry;
  /** Point reached by travelling `dist` from `point` on bearing `brng`. */
  export function destinationPoint(point: Geometry, brng: number, dist: number): Geometry;
  /** Approximate a circle of `radiusInMeters` around `centerPoint`. */
  export function drawCircle(radiusInMeters: number, centerPoint: Geometry, steps?: number): Geometry;
  /** Whether every vertex of `geometry` lies within `radius` of `center`. */
  export function geometryWithinRadius(geometry: Geometry, center: Geometry, radius: number): boolean;
  /** Intersection points of two line strings, or `false` if none. */
  export function lineStringsIntersect(line1: Geometry, line2: Geometry): Geometry[] | false;
  /** Convert degrees to radians. */
  export function numberToRadius(degrees: number): number;
  /** Convert radians to degrees. */
  export function numberToDegree(radians: number): number;
  /** Great-circle distance between two points, in kilometres. */
  export function pointDistance(pt1: Geometry, pt2: Geometry): number;
  /** Whether `point` lies inside the given bounding box. */
  export function pointInBoundingBox(point: Geometry, bounds: Geometry): boolean;
  /** Whether `point` lies inside `polygon`. */
  export function pointInPolygon(point: Geometry, polygon: Geometry): boolean;
  /** Centroid of a rectangle geometry. */
  export function rectangleCentroid(rectangle: Geometry): Geometry;
  /** Simplify a set of points using the Douglas–Peucker algorithm. */
  export function simplify(source: Geometry[], kink?: number): Geometry[];
}
