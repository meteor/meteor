/** Server-only Meteor lifecycle tracing and the standard OpenTelemetry API. */
import type { Attributes, Meter, Span, Tracer } from "@opentelemetry/api";
import type { MeterProvider } from "@opentelemetry/sdk-metrics";
import type { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { Instrumentation as OtelInstrumentation } from "@opentelemetry/instrumentation";
import type { Instrumentation } from "meteor/instrumentation";

export { trace, metrics, context, propagation, SpanStatusCode, SpanKind, ROOT_CONTEXT } from "@opentelemetry/api";

export type InvocationStartEvent = Instrumentation.MethodStartEvent | Instrumentation.PublicationStartEvent;

export interface MeteorInstrumentationOptions {
  filter?: (event: InvocationStartEvent) => boolean;
  attributes?: (event: InvocationStartEvent) => Attributes | undefined;
  /** Positive integer; defaults to 10000. */
  maxPendingSpans?: number;
  /** Positive duration in milliseconds; defaults to 30 minutes. */
  spanTimeoutMs?: number;
}

export interface SpanProcessorOptions {
  maxQueueSize?: number;
  maxExportBatchSize?: number;
  scheduledDelayMillis?: number;
  exportTimeoutMillis?: number;
}

export interface OtelOptions {
  serviceName?: string;
  resourceAttributes?: Attributes;
  instrumentations?: (OtelInstrumentation | OtelInstrumentation[])[];
  spanProcessor?: SpanProcessorOptions;
  meteorInstrumentation?: MeteorInstrumentationOptions | false;
}

export interface OtelConfig {
  serviceName: string;
  debug: boolean;
  exportIntervalMs: number;
  metricsEndpoint: string;
  tracesEndpoint: string;
  hostMetricsEnabled: boolean;
  runtimeMetricsEnabled: boolean;
  spanProcessor: SpanProcessorOptions;
}

export function initOtel(options?: OtelOptions): {
  tracerProvider: NodeTracerProvider;
  meterProvider: MeterProvider;
};
/** Throws before initialization or after shutdown. */
export function getTracerProvider(): NodeTracerProvider;
/** Throws before initialization or after shutdown. */
export function getMeterProvider(): MeterProvider;
export function getTracer(name: string, version?: string): Tracer;
export function getMeter(name: string, version?: string): Meter;
/** Undefined outside an observed invocation or when instrumentation is disabled. */
export function getInvocationSpan(): Span | undefined;
export function getConfig(): OtelConfig;
/** Detaches listeners and flushes both providers; repeated calls share a promise. */
export function shutdown(): Promise<void>;
