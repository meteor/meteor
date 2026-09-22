import { expectTypeOf } from "expect-type";
import * as Otel from "./meteor-otel";
import * as InstalledOtel from "meteor/meteor-otel";
import { Instrumentation } from "meteor/instrumentation";
import type { Attributes, Meter, Span, Tracer } from "@opentelemetry/api";
import * as Api from "@opentelemetry/api";
import type { MeterProvider } from "@opentelemetry/sdk-metrics";
import type { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { Instrumentation as OtelInstrumentation } from "@opentelemetry/instrumentation";

expectTypeOf(InstalledOtel).toEqualTypeOf<typeof Otel>();
expectTypeOf(Otel.initOtel).parameters.toEqualTypeOf<[options?: Otel.OtelOptions]>();
expectTypeOf(Otel.getTracerProvider).returns.toEqualTypeOf<NodeTracerProvider>();
expectTypeOf(Otel.getMeterProvider).returns.toEqualTypeOf<MeterProvider>();
expectTypeOf(Otel.getTracer).parameters.toEqualTypeOf<[name: string, version?: string]>();
expectTypeOf(Otel.getMeter).parameters.toEqualTypeOf<[name: string, version?: string]>();
expectTypeOf(Otel.getInvocationSpan).returns.toEqualTypeOf<Span | undefined>();
expectTypeOf(Otel.getConfig).returns.toEqualTypeOf<Otel.OtelConfig>();
expectTypeOf(Otel.shutdown).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf<Otel.OtelOptions>().toEqualTypeOf<{
  serviceName?: string;
  resourceAttributes?: Attributes;
  instrumentations?: (OtelInstrumentation | OtelInstrumentation[])[];
  spanProcessor?: Otel.SpanProcessorOptions;
  meteorInstrumentation?: Otel.MeteorInstrumentationOptions | false;
}>();
const providers = Otel.initOtel();
expectTypeOf(providers.tracerProvider).toEqualTypeOf<NodeTracerProvider>();
expectTypeOf(providers.meterProvider).toEqualTypeOf<MeterProvider>();
expectTypeOf(Otel.getTracerProvider()).toEqualTypeOf<NodeTracerProvider>();
expectTypeOf(Otel.getMeterProvider()).toEqualTypeOf<MeterProvider>();
expectTypeOf(Otel.getTracer("app", "1")).toEqualTypeOf<Tracer>();
expectTypeOf(Otel.getMeter("app", "1")).toEqualTypeOf<Meter>();
expectTypeOf(Otel.getInvocationSpan()).toEqualTypeOf<Span | undefined>();
expectTypeOf(Otel.shutdown()).toEqualTypeOf<Promise<void>>();

const options: Otel.OtelOptions = {
  serviceName: "app",
  resourceAttributes: { region: "test", enabled: true },
  instrumentations: [] as OtelInstrumentation[],
  spanProcessor: {
    maxQueueSize: 100,
    maxExportBatchSize: 10,
    scheduledDelayMillis: 500,
    exportTimeoutMillis: 1000,
  },
  meteorInstrumentation: {
    maxPendingSpans: 10,
    spanTimeoutMs: 1000,
    filter(event) {
      expectTypeOf(event).toEqualTypeOf<Instrumentation.MethodStartEvent | Instrumentation.PublicationStartEvent>();
      return event.name !== "excluded";
    },
    attributes(event) { return { "app.operation": event.name ?? "universal" }; },
  },
};
Otel.initOtel(options);
Otel.initOtel({ meteorInstrumentation: false });
expectTypeOf(options.resourceAttributes).toEqualTypeOf<Attributes | undefined>();
expectTypeOf<Otel.MeteorInstrumentationOptions>().toEqualTypeOf<{
  maxPendingSpans?: number;
  spanTimeoutMs?: number;
  filter?: (event: Otel.InvocationStartEvent) => boolean;
  attributes?: (event: Otel.InvocationStartEvent) => Attributes | undefined;
}>();
expectTypeOf<Otel.InvocationStartEvent>().toEqualTypeOf<Instrumentation.MethodStartEvent | Instrumentation.PublicationStartEvent>();
expectTypeOf<Otel.SpanProcessorOptions>().toEqualTypeOf<{
  maxQueueSize?: number;
  maxExportBatchSize?: number;
  scheduledDelayMillis?: number;
  exportTimeoutMillis?: number;
}>();
const config = Otel.getConfig();
expectTypeOf(config).toEqualTypeOf<Otel.OtelConfig>();
expectTypeOf(config.serviceName).toBeString();
expectTypeOf(config.debug).toBeBoolean();
expectTypeOf(config.exportIntervalMs).toBeNumber();
expectTypeOf(config.metricsEndpoint).toBeString();
expectTypeOf(config.tracesEndpoint).toBeString();
expectTypeOf(config.hostMetricsEnabled).toBeBoolean();
expectTypeOf(config.runtimeMetricsEnabled).toBeBoolean();
expectTypeOf(config.spanProcessor).toEqualTypeOf<Otel.SpanProcessorOptions>();

expectTypeOf(Otel.trace).toEqualTypeOf<typeof Api.trace>();
expectTypeOf(Otel.metrics).toEqualTypeOf<typeof Api.metrics>();
expectTypeOf(Otel.context).toEqualTypeOf<typeof Api.context>();
expectTypeOf(Otel.propagation).toEqualTypeOf<typeof Api.propagation>();
expectTypeOf(Otel.SpanStatusCode).toEqualTypeOf<typeof Api.SpanStatusCode>();
expectTypeOf(Otel.SpanKind).toEqualTypeOf<typeof Api.SpanKind>();
expectTypeOf(Otel.ROOT_CONTEXT).toEqualTypeOf<typeof Api.ROOT_CONTEXT>();

// @ts-expect-error instrumentation options accept false, not true
Otel.initOtel({ meteorInstrumentation: true });
// @ts-expect-error start events do not contain terminal error payloads
Otel.initOtel({ meteorInstrumentation: { filter: event => !!event.error } });
// @ts-expect-error attributes must use OpenTelemetry attribute values
Otel.initOtel({ resourceAttributes: { nested: { secret: "value" } } });
// @ts-expect-error timer options are numeric
Otel.initOtel({ spanProcessor: { scheduledDelayMillis: "500" } });
