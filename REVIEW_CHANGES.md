---

## Commit: fix(review): resolve comment #3150512931 - align trace docs with actual span names and attrs

**Comentário original:**
> Align the trace examples with the emitted span names and attributes.
>
> `packages/meteor-otel/server/ddp-instrumentation.js` emits `method:` / `publish:` span names and `ddp.*` / `meteor.*` attributes, but this page still documents `meteor.method.*`, `meteor.userId`, and `meteor.connection.*`. The TraceQL snippets here will not match real traces until they use the actual emitted names and keys.

**Arquivo(s) alterado(s):**
- `v3-docs/docs/performance/otel-instrumentation.md` — quadro ASCII do trace, tabela "Span Attributes", exemplos de TraceQL

**O que foi feito:**
Atualizei os docs para refletir o que `ddp-instrumentation.js` realmente emite:
- Span name: `method:<methodName>` (não `meteor.method links.insert`).
- Atributos: troquei `meteor.userId` por `user.id`/`meteor.user.id`, `meteor.connection.id` por `ddp.session.id`, `meteor.connection.clientAddress` por `net.peer.ip`. Adicionei `ddp.type`, `ddp.method.id`, `ddp.method.params.length`, `ddp.method.params.types`, `ddp.connection.header.<name>` à tabela.
- Acrescentei nota sobre publications (mesmo bloco usa `publish:<name>` e atributos `ddp.publication.name`/`ddp.subscription.*`).
- Corrigi TraceQL: `name =~ "meteor.method.*"` → `name =~ "method:.*"`; `span.meteor.method.name` → `span.ddp.method.name`.
- Substituí o exemplo de filho `mongodb.insert` por uma nota deixando claro que ele só aparece se houver instrumentation registrada antes do driver carregar.

**Antes:**
```
│ Span: meteor.method links.insert
│ Attributes:
│   • meteor.method.name: "links.insert"
│   • meteor.userId: "abc123" (if authenticated)
│   • meteor.connection.id: "xyz789"
```
```traceql
{ resource.service.name = "meteor-app" && name =~ "meteor.method.*" }
{ span.meteor.method.name = "links.insert" }
```

**Depois:**
```
│ Span: method:links.insert
│ Attributes:
│   • ddp.type: "method"
│   • ddp.method.name: "links.insert"
│   • user.id / meteor.user.id: "abc123" (or "anonymous")
│   • ddp.session.id: "xyz789"
│   • net.peer.ip: "192.168.1.1" (unless OTEL_DDP_CAPTURE_IP=0)
```
```traceql
{ resource.service.name = "meteor-app" && name =~ "method:.*" }
{ span.ddp.method.name = "links.insert" }
```

---

## Commit: fix(review): resolve comment #3150512928 - bootstrap entrypoint pattern in instrumentation docs

**Comentário original:**
> Rewrite the bootstrap example so it actually initializes first.
>
> This still keeps follow-on imports in the same module, so it doesn't model the "call `initOtel()` before anything else" startup sequence you're describing. Please show a dedicated bootstrap entrypoint, or another pattern, that lets readers copy/paste a working startup flow. The later minimal example repeats the same problem.

**Arquivo(s) alterado(s):**
- `v3-docs/docs/performance/otel-instrumentation.md` — seções "Initializing OpenTelemetry" e "A Complete Minimal Example"

**O que foi feito:**
Os dois snippets agora seguem o pattern de bootstrap dedicado: um arquivo `server/otel-bootstrap.js` que apenas chama `initOtel(...)`, importado como primeiro statement em `server/main.js` via `import './otel-bootstrap.js';`. Acrescentei prosa explicando o motivo (hoisting de imports ESM dentro de um mesmo módulo) e por que importar do mesmo arquivo não garante a ordem.

**Antes:**
```js
// server/main.js
import os from 'node:os';
import { initOtel } from 'meteor/meteor-otel';
initOtel({...});

import { Meteor } from 'meteor/meteor';
import { MyCollection } from '/imports/api/collections';
```

**Depois:**
```js
// server/otel-bootstrap.js
import os from 'node:os';
import { initOtel } from 'meteor/meteor-otel';
initOtel({...});
```
```js
// server/main.js
import './otel-bootstrap.js'; // FIRST
import { Meteor } from 'meteor/meteor';
import { MyCollection } from '/imports/api/collections';
```

Mesmo padrão aplicado no "Complete Minimal Example".

---

## Commit: fix(review): resolve comment #3150512921 - remove undeclared Loki datasource link from infra docs

**Comentário original:**
> Remove the undeclared Loki dependency or add it to the stack.
>
> The Tempo datasource is provisioned with `tracesToLogsV2.datasourceUid: loki`, but this guide never provisions a Loki datasource or service anywhere in the stack. That leaves users with a broken trace-to-logs link out of the box.

**Arquivo(s) alterado(s):**
- `v3-docs/docs/performance/otel-infrastructure.md` — bloco de provisionamento do Tempo datasource

**O que foi feito:**
Comentei o bloco `tracesToLogsV2` no provisioning do Tempo, com uma nota explicando que o stack proposto neste guia não inclui Loki. Mantive o snippet pronto para reativar (com instruções de adicionar Loki ao docker-compose e à lista de datasources). Optei pelo "remover/comentar" em vez de "adicionar Loki" para não inflar o escopo do guide; quem quiser logs trace-to-logs pode descomentar.

**Antes:**
```yaml
jsonData:
  httpMethod: GET
  tracesToLogsV2:
    datasourceUid: loki
    spanStartTimeShift: '-10m'
    spanEndTimeShift: '10m'
    filterByTraceID: true
    filterBySpanID: false
  tracesToMetrics:
    ...
```

**Depois:**
```yaml
jsonData:
  httpMethod: GET
  # NOTE: tracesToLogsV2 is intentionally omitted from this guide because
  # this stack does not provision a Loki datasource. If you add Loki to
  # your Compose file, also add it to the datasources list above and
  # uncomment this block (the `datasourceUid` must match the Loki uid).
  #
  # tracesToLogsV2:
  #   datasourceUid: loki
  #   spanStartTimeShift: '-10m'
  #   spanEndTimeShift: '10m'
  #   filterByTraceID: true
  #   filterBySpanID: false
  tracesToMetrics:
    ...
```

---

## Commit: fix(review): resolve comment #3150512913 - correct meter-name vs metric-name docs

**Comentário original:**
> Update metric naming documentation: meter name does not prefix exported metric names.
>
> The guide incorrectly claims that `createMetricsRecorder('myapp')` prefixes metrics with the meter name. In reality, only the instrument names are used when exporting metrics. A call to `appMetrics.counter('orders.created')` produces a metric named `orders_created_total`, not `myapp_orders_created_total`. The meter name is available as Prometheus labels (otel_scope_name) if using a Prometheus exporter, but not as a metric name prefix.

**Arquivo(s) alterado(s):**
- `v3-docs/docs/performance/otel-advanced.md` — seções "Creating a Metrics Recorder", "Histogram (PromQL)", "Querying Custom Metrics in Grafana"

**O que foi feito:**
Corrigi a prosa enganosa: o argumento de `createMetricsRecorder` é o nome do meter (instrumentation scope), não um prefixo de metric name. Esclareci que com o exporter Prometheus o nome do meter aparece como label `otel_scope_name`, e que para um prefixo real no nome da métrica é preciso incluir no próprio nome do instrument ou configurar prefix no exporter. Reescrevi todas as queries PromQL afetadas para usar os nomes reais de métrica (sem `myapp_` / `ecommerce_`) e label-filter `otel_scope_name`.

**Antes:**
```markdown
// Create a recorder - all metrics will be prefixed with this namespace
const appMetrics = createMetricsRecorder('myapp');
```
```promql
histogram_quantile(0.95, rate(myapp_checkout_latency_bucket[5m]))
increase(ecommerce_orders_created_total[1h])
```

**Depois:**
```markdown
const appMetrics = createMetricsRecorder('myapp');
```
> The meter name does **not** prefix exported metric names. ... With the Prometheus exporter, the meter name shows up only as the `otel_scope_name` label.

```promql
histogram_quantile(0.95, rate(checkout_latency_bucket{otel_scope_name="myapp"}[5m]))
increase(orders_created_total{otel_scope_name="ecommerce"}[1h])
```

---

## Commit: fix(review): resolve comment #3150512910 - assert traceparent presence in tests

**Comentário original:**
> Trace-context assertions are optional, so regressions can pass CI.
>
> Both tests gate the regex check behind `if (...)`, so they still pass when `traceparent` is missing. Assert presence first, then validate format.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/tests/tracing_tests.js` — testes "injectTraceContext adds traceparent when in span" e "getTraceContext returns traceparent when in span"

**O que foi feito:**
Removi a guarda `if (headers.traceparent)` / `if (ctx.traceparent)` que mascarava regressões: testes passariam mesmo sem traceparent. Agora, primeiro chamo `test.isTrue(!!headers.traceparent, ...)` para falhar caso o header esteja ausente, e só então validar o formato com `test.matches(...)`.

**Antes:**
```js
test.isNotNull(headers);
if (headers.traceparent) {
  test.matches(headers.traceparent, /^00-[a-f0-9]{32}-[a-f0-9]{16}-0[0-1]$/);
}
```

**Depois:**
```js
test.isNotNull(headers);
test.isTrue(!!headers.traceparent, 'expected traceparent when inside a span');
test.matches(headers.traceparent, /^00-[a-f0-9]{32}-[a-f0-9]{16}-0[0-1]$/);
```

(Mesma mudança aplicada no teste paralelo de `getTraceContext`.)

---

## Commit: fix(review): resolve comment #3150512906 - per-key queue for pendingSpans (critical roundtrip fix)

**Comentário original:**
> Roundtrip correlation can overwrite active spans and leave some spans unclosed.
>
> `pendingSpans` stores a single entry per `collection:id`. Concurrent `trackDocument` calls for the same key overwrite previous entries, which can break matching and skip cleanup for earlier spans.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/server/ddp-instrumentation.js` — estrutura `pendingSpans`, hook DDP `send`, `trackDocument`, `fail`, `end`

**O que foi feito:**
Refatorei `pendingSpans` de `Map<string, SpanInfo>` para `Map<string, SpanInfo[]>` (FIFO queue por chave) e mantive um contador agregado `pendingSpansCount`. Acrescentei três helpers: `enqueueSpanInfo`, `dequeueSpanInfo` (consome o mais antigo) e `removeSpanInfo` (remove uma instância específica de span por identidade). 
- O hook DDP `'added'` agora dequeue o span mais antigo, garantindo que dois roundtrips concorrentes para o mesmo doc-id sejam ambos finalizados na ordem correta.
- `trackDocument` enfileira em vez de substituir; o callback do timer remove o span específico via `removeSpanInfo` (não mais usar `pendingSpans.delete(key)` que apagaria a fila inteira).
- `fail` e `end` da handle também usam `removeSpanInfo` para tirar apenas a entrada deles, preservando outras roundtrips concorrentes.
- O cap `MAX_PENDING_SPANS` agora é checado contra o contador agregado (`pendingSpansCount`), não contra `pendingSpans.size` que contava apenas chaves distintas.

**Antes:**
```js
const pendingSpans = new Map();
// ...
const spanInfo = pendingSpans.get(key); // single entry
// ...
pendingSpans.set(trackedKey, spanInfo); // overwrites concurrent span
// ...
pendingSpans.delete(trackedKey); // removes whole entry
```

**Depois:**
```js
const pendingSpans = new Map(); // Map<string, SpanInfo[]>
let pendingSpansCount = 0;

function enqueueSpanInfo(key, spanInfo) { /* push to queue */ }
function dequeueSpanInfo(key) { /* shift oldest */ }
function removeSpanInfo(key, span) { /* remove by identity */ }

// hook 'added':
const spanInfo = dequeueSpanInfo(key);

// trackDocument:
enqueueSpanInfo(trackedKey, spanInfo);
// timer:
if (removeSpanInfo(trackedKey, span)) { ... }

// fail / end:
removeSpanInfo(trackedKey, span);
```

---

## Commit: fix(review): resolve comment #3150512890 - clamp exportIntervalMs to a valid positive number

**Comentário original:**
> Clamp `exportIntervalMs` before returning config.
>
> `Number(...)` will happily return `NaN`, `0`, or a negative value here, which then propagates into the metrics setup. Please fall back to the default when parsing fails or the interval is non-positive.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/server/config.js` — bloco do `exportIntervalMs`

**O que foi feito:**
Tirei o `|| 1000` do `Number(...)` (que já tratava `undefined` mas não filtra `NaN`/`0`/negativos) e troquei por uma checagem `Number.isFinite(parsedInterval) && parsedInterval > 0`. Caso contrário, cai em `DEFAULT_EXPORT_INTERVAL_MS = 1000`. Isso protege o `PeriodicExportingMetricReader` de receber valores inválidos vindos do env var.

**Antes:**
```js
const exportIntervalMs = Number(process.env.OTEL_METRICS_EXPORT_INTERVAL_MS || 1000);
```

**Depois:**
```js
const DEFAULT_EXPORT_INTERVAL_MS = 1000;
// ...
const parsedInterval = Number(process.env.OTEL_METRICS_EXPORT_INTERVAL_MS);
const exportIntervalMs =
  Number.isFinite(parsedInterval) && parsedInterval > 0
    ? parsedInterval
    : DEFAULT_EXPORT_INTERVAL_MS;
```

---

## Commit: fix(review): resolve comment #3150512886 - replace undefined `result` in withSpan example

**Comentário original:**
> Replace the undefined `result` in the `withSpan` example.
>
> As written, this snippet throws because `result` is never declared inside the callback. Replace it with the actual operation you want to time, or return the awaited call directly.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/README.md` — seção "Custom Tracing > Simple spans"

**O que foi feito:**
Substituí o `return result;` placeholder por uma operação plausível (`await OrdersCollection.findOneAsync({ _id: orderId })`). Mantive os mesmos atributos do exemplo original. A intenção é que o snippet rode sem erro se copiado.

**Antes:**
```js
async function processOrder(orderId) {
  return withSpan('orders', 'processOrder', async () => {
    // your code here
    return result;
  }, { 'order.id': orderId });
}
```

**Depois:**
```js
async function processOrder(orderId) {
  return withSpan('orders', 'processOrder', async () => {
    return await OrdersCollection.findOneAsync({ _id: orderId });
  }, { 'order.id': orderId });
}
```

---

## Commit: fix(review): resolve comment #3150512885 - dedicated bootstrap entrypoint in README quick-start

**Comentário original:**
> Fix the quick-start bootstrap example.
>
> This has the same ordering problem as the docs page: the later imports are still in the same module, so readers don't get a copy/pasteable "initialize first" entrypoint. Please show a bootstrap file or another pattern that guarantees `initOtel()` runs before the rest of the server graph loads.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/README.md` — seção Quick Start

**O que foi feito:**
Refiz o quick start em dois snippets: um arquivo dedicado `server/otel-bootstrap.js` que apenas chama `initOtel(...)`, e um `server/main.js` cujo primeiro statement é `import './otel-bootstrap.js'`. Adicionei também uma nota explicando o porquê (hoisting de imports ESM dentro do mesmo módulo) para que o leitor entenda a motivação e não apenas copie o snippet.

**Antes:**
```js
// server/main.js - import FIRST, before other imports
import { initOtel } from 'meteor/meteor-otel';

initOtel();

// Rest of your imports...
import { Meteor } from 'meteor/meteor';
```

**Depois:**
```js
// server/otel-bootstrap.js
import { initOtel } from 'meteor/meteor-otel';
initOtel({ serviceName: 'my-meteor-app' });
```
```js
// server/main.js
import './otel-bootstrap.js'; // must be first
import { Meteor } from 'meteor/meteor';
import './methods.js';
import './publications.js';
```

---

## Commit: fix(review): resolve comment #3150512884 - forward options to object-form Meteor.publish

**Comentário original:**
> Clarify or support `options.otel` for object-form `Meteor.publish`.
>
> The new JSDoc exposes `options.otel` on a signature where `name` can also be an object, but the implementation only reads `options` in the `!isObject(name)` branch. That leaves no way to opt object-form registrations into tracing, even though the updated API docs read as if the overload supports it.

**Arquivo(s) alterado(s):**
- `packages/ddp-server/livedata_server.js` — branch de `Meteor.publish` para forma de objeto (~linhas 1538-1547)

**O que foi feito:**
A forma de objeto (`Meteor.publish({ name: handler, ... }, options)`) agora encaminha `options` para cada chamada interna `self.publish(key, value, publishOptions)`. Antes, esse branch passava `{}` literal e qualquer `options.otel` era silenciosamente descartado, contradizendo o que o JSDoc anuncia.

**Antes:**
```js
else{
  Object.entries(name).forEach(function([key, value]) {
    self.publish(key, value, {});
  });
}
```

**Depois:**
```js
else{
  // Object-form Meteor.publish({ name: handler, ... }, options).
  // Forward options (including `otel`) to each individual registration so
  // tracing can be opted-in at the dictionary level just like the
  // single-name form.
  var publishOptions = options || {};
  Object.entries(name).forEach(function([key, value]) {
    self.publish(key, value, publishOptions);
  });
}
```

---

## Commit: fix(review): resolve comment #2730030040 - drop hardcoded fallback messages from helpers

**Comentário original:**
> Do you think it's helpful to provide such helpers? Different applications require different patterns and I don't think Meteor should suggest any. Especially the hardcoded messages (`'Operation failed'`) seem like a bad practice to me, as every app will have a different approach to error messages.
>
> The same goes for the helpers in `metrics.js`.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/server/tracing.js` — `withSpan`, `withSpanSync`, `createSpanBuilder.error`, `createLinkedSpan.fail`
- `packages/meteor-otel/server/ddp-instrumentation.js` — `wrapMethod`, `wrapPublication`, `setSpanError`, roundtrip `fail`

**O que foi feito:**
Removi todos os fallbacks hardcoded (`'Operation failed'`, `'Method failed'`, `'Publication failed'`, `'Unknown error'`). Agora o `setStatus` só inclui `message` quando o erro realmente carrega uma mensagem; senão fica apenas `{ code: SpanStatusCode.ERROR }`, deixando o backend / consumidor decidir como apresentar erros sem mensagem. As mensagens factuais que são parte do protocolo (ex.: `'Timeout waiting for DDP added message'`, `'pendingSpans capacity exceeded'`) permanecem porque descrevem condição interna específica, não erro de aplicação. Optei por preservar os helpers em si (remoção total seria breaking change), apenas tirando o tom prescritivo dos textos. As helpers em `metrics.js` não tinham strings prescritivas — só wrappers finos do meter — então não precisaram de mudança.

**Antes:**
```js
} catch (error) {
  span.recordException(error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error?.message || 'Operation failed',
  });
  throw error;
}
```

**Depois:**
```js
} catch (error) {
  span.recordException(error);
  const status = { code: SpanStatusCode.ERROR };
  if (error?.message) status.message = error.message;
  span.setStatus(status);
  throw error;
}
```

(Padrão aplicado em `withSpan`, `withSpanSync`, `createSpanBuilder.error`, `createLinkedSpan.fail`, `wrapMethod`, `wrapPublication.onError`, `setSpanError` e `roundtrip.fail`.)

---

## Commit: fix(review): resolve comment #2730016754 - GDPR-friendly IP capture and custom attributes hook

**Comentário original:**
> IPs are not always "safe" to store, e.g., in case of GDPR. (Then you'd need a way to remove the traces.) It'd be better to make it an option. Or even better, have a hook to extract span-related attributes from the request (just like `applyCustomAttributesOnSpan` on `HttpInstrumentation`).

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/server/ddp-instrumentation.js` — lógica de captura de IP e novo hook
- `packages/meteor-otel/server/index.js` — re-export
- `packages/meteor-otel/server/config.js` — header doc
- `packages/meteor-otel/README.md` — tabela de env vars

**O que foi feito:**
Atendi os dois pedidos do reviewer:
1. **Opção**: variável `OTEL_DDP_CAPTURE_IP` (default `1`); definir `0` omite `net.peer.ip` dos spans, preservando as outras attrs.
2. **Hook**: nova função pública `setConnectionAttributesHook(fn)` (exportada do package) inspirada no `applyCustomAttributesOnSpan` do `@opentelemetry/instrumentation-http`. O hook recebe `(attrs, { connection, session })` e pode mutar `attrs` ou retornar uma substituição. Erros lançados pelo hook são capturados e logados — telemetria nunca quebra a request.

**Antes:**
```js
if (connection?.clientAddress) attrs['net.peer.ip'] = connection.clientAddress;
// ...
return attrs;
```

**Depois:**
```js
const CAPTURE_CLIENT_IP = process.env.OTEL_DDP_CAPTURE_IP !== '0';
let connectionAttributesHook = null;

export function setConnectionAttributesHook(fn) { /* ... */ }

// dentro de extractConnectionAttributes:
if (CAPTURE_CLIENT_IP && connection?.clientAddress) attrs['net.peer.ip'] = connection.clientAddress;
// ...
if (connectionAttributesHook) {
  try {
    const replacement = connectionAttributesHook(attrs, { connection, session });
    if (replacement && typeof replacement === 'object') return replacement;
  } catch (e) {
    console.warn('[meteor-otel] connectionAttributesHook threw:', e?.message || e);
  }
}
return attrs;
```

---

## Commit: fix(review): resolve comment #2705921241 - warn when custom instrumentations may no-op

**Comentário original:**
> The TODO comment mentions that instrumentations like HTTP, MongoDB, etc. can't work since modules are loaded before opentelemetry. However, the code still pushes custom instrumentations from options. This could lead to user confusion when they pass instrumentations expecting them to work. Consider either removing the ability to pass custom instrumentations until the bootstrap order is fixed, or adding a warning when instrumentations are provided that their effectiveness depends on load order.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/server/providers.js` — bloco que registra instrumentations

**O que foi feito:**
Removi o TODO antigo e mantive a capacidade de passar `options.instrumentations`, mas agora emito um warning explícito apontando que core-module instrumentations só funcionam se o OTel for inicializado antes do import dos módulos correspondentes. Optei pelo warning (não pelo bloqueio) porque alguns usuários podem efetivamente garantir essa ordem via bootstrap entrypoint próprio.

**Antes:**
```js
// Add any custom instrumentations passed in options
// TODO: instrumentations like HTTP, MongoDB, etc
// can't work since modules like http or mongo is loaded before opentelemetry
if (options.instrumentations) {
  instrumentations.push(...options.instrumentations);
}
```

**Depois:**
```js
if (options.instrumentations && options.instrumentations.length > 0) {
  console.warn(
    '[meteor-otel] Custom instrumentations were provided. Note: instrumentations for core modules (e.g., http, mongodb) may not be effective unless OpenTelemetry is initialized before those modules are loaded.'
  );
  instrumentations.push(...options.instrumentations);
}
```

---

## Commit: fix(review): resolve comment #2705921214 - safer meteor-otel availability check in livedata_server

**Comentário original:**
> The otel options checking uses Package['meteor-otel'] to test if the package is available. However, this doesn't verify that the package has been initialized with initOtel(). If methods/publications are defined with otel:true before initOtel() is called, the wrapMethod/wrapPublication functions might not work correctly. Consider adding initialization checks within the wrapper functions or documenting this requirement clearly.

**Arquivo(s) alterado(s):**
- `packages/ddp-server/livedata_server.js` — bloco `Meteor.publish` (~linhas 1473-1488) e `Meteor.methods` (~linhas 1574-1592)

**O que foi feito:**
Em ambos os caminhos (publish e methods), a verificação agora é `otelPackage && typeof otelPackage.wrapPublication === 'function'` (idem para `wrapMethod`), que confirma que o pacote exportou os símbolos esperados. Envolvi a aplicação do wrapper num `try/catch`: se falhar (por exemplo, otel não inicializou ainda), logamos via `Meteor._debug` e retornamos o handler/func original — falha em telemetry nunca pode quebrar a publicação/método em si.

**Antes:**
```js
if (options.otel) {
  if (Package['meteor-otel']) {
    handler = Package['meteor-otel'].wrapPublication(name, handler);
  } else {
    Meteor._debug("[ddp-server] otel option requires meteor-otel package. Ignoring otel option for publish '" + name + "'");
  }
}
```

**Depois:**
```js
if (options.otel) {
  var otelPackage = Package['meteor-otel'];
  if (otelPackage && typeof otelPackage.wrapPublication === 'function') {
    try {
      handler = otelPackage.wrapPublication(name, handler);
    } catch (e) {
      Meteor._debug("[ddp-server] Failed to apply otel wrapping for publish '" + name + "'. Proceeding without otel tracing. Error: " + (e && e.message));
    }
  } else {
    Meteor._debug("[ddp-server] otel option requires meteor-otel package to be installed and initialized. Ignoring otel option for publish '" + name + "'");
  }
}
```

(Mesma estrutura aplicada no caminho de `Meteor.methods` para `wrapMethod`.)

---

## Commit: fix(review): resolve comment #2705921193 - support async publication handlers in wrapPublication

**Comentário original:**
> The wrapPublication function is not marked as async but calls fn.apply() which could return a promise. The span is ended synchronously after the call, which means for async publication handlers, the span will end before the publication completes. This could lead to inaccurate timing data. Consider handling both sync and async publication functions properly, similar to how wrapMethod uses async/await.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/server/ddp-instrumentation.js` — função `wrapPublication`

**O que foi feito:**
Acrescentei detecção de thenable no resultado de `fn.apply(this, args)`. Se for promise, encadeio `.then` para fechar o span só quando ela resolver/rejeitar (mantendo o timing real); senão, mantenho o caminho síncrono fechando o span imediatamente. Não converti a função para `async` para preservar o tipo de retorno esperado por handlers síncronos do Meteor (cursor/arr de cursores). Extraí `onError` para evitar duplicação entre o catch síncrono e o catch da promise.

**Antes:**
```js
return function (...args) {
  const span = tracer.startSpan(`publish:${pubName}`, {...});
  const spanContext = trace.setSpan(context.active(), span);

  try {
    const result = context.with(spanContext, () => fn.apply(this, args));
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message || 'Publication failed' });
    span.end();
    throw error;
  }
};
```

**Depois:**
```js
return function (...args) {
  const span = tracer.startSpan(`publish:${pubName}`, {...});
  const spanContext = trace.setSpan(context.active(), span);

  const onError = (error) => {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message || 'Publication failed' });
    span.end();
  };

  try {
    const result = context.with(spanContext, () => fn.apply(this, args));

    if (result && typeof result.then === 'function') {
      return result.then(
        (value) => { span.setStatus({ code: SpanStatusCode.OK }); span.end(); return value; },
        (error) => { onError(error); throw error; }
      );
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    return result;
  } catch (error) {
    onError(error);
    throw error;
  }
};
```

---

## Commit: fix(review): resolve comment #2705921172 - cap pendingSpans size to prevent leaks

**Comentário original:**
> The pendingSpans Map could grow unbounded if documents are tracked but the DDP 'added' message never arrives (e.g., due to publication errors, client disconnections, or bugs). While there's a timeout mechanism per span, a memory leak could occur if many documents fail to complete. Consider adding periodic cleanup of stale entries or a maximum size limit for the pendingSpans map with appropriate warnings when the limit is reached.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/server/ddp-instrumentation.js` — linhas 12-26, 217-237
- `packages/meteor-otel/server/config.js` — header doc bloco

**O que foi feito:**
Adicionei um teto duro `MAX_PENDING_SPANS` (default 10000, override via `OTEL_DDP_MAX_PENDING_SPANS`) verificado no início de `trackDocument`. Quando o mapa atinge o limite, novos spans são finalizados imediatamente como ERROR com a mensagem `pendingSpans capacity exceeded` e um único warning é logado. Isso previne o leak descrito sem precisar de varredura periódica e mantém a contabilidade dos spans corretos.

**Antes:**
```js
const pendingSpans = new Map();
// ...
trackDocument(collection, docId) {
  if (!docId) return;
  trackedKey = `${collection}:${docId}`;
  // ...
  pendingSpans.set(trackedKey, spanInfo);
  // ...
}
```

**Depois:**
```js
const MAX_PENDING_SPANS = Number(process.env.OTEL_DDP_MAX_PENDING_SPANS) > 0
  ? Number(process.env.OTEL_DDP_MAX_PENDING_SPANS)
  : 10000;
let pendingSpansOverflowWarned = false;
// ...
trackDocument(collection, docId) {
  if (!docId) return;

  if (pendingSpans.size >= MAX_PENDING_SPANS) {
    if (!pendingSpansOverflowWarned) {
      pendingSpansOverflowWarned = true;
      console.warn(`[meteor-otel] pendingSpans reached MAX_PENDING_SPANS=${MAX_PENDING_SPANS}; new roundtrip spans will be ended as ERROR. Override via OTEL_DDP_MAX_PENDING_SPANS.`);
    }
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'pendingSpans capacity exceeded' });
    span.end();
    return;
  }

  trackedKey = `${collection}:${docId}`;
  // ...
}
```

---

## Commit: fix(review): resolve comment #2705921158 - make captured DDP headers configurable

**Comentário original:**
> The extractConnectionAttributes function may include header values that contain sensitive information. While SAFE_HEADER_KEYS filters to specific headers, user-agent and forwarded-for headers could potentially contain PII or sensitive data in some environments. Consider adding documentation about what headers are captured and providing configuration options to exclude specific headers if needed.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/server/ddp-instrumentation.js` — linhas 17-42
- `packages/meteor-otel/server/config.js` — header doc bloco (linhas ~16-20)
- `packages/meteor-otel/README.md` — tabela de variáveis de ambiente

**O que foi feito:**
A lista de headers capturados (`SAFE_HEADER_KEYS`) agora é resolvida em runtime a partir da variável `OTEL_DDP_CAPTURED_HEADERS` (CSV, case-insensitive). Não definir mantém o default histórico; definir a string vazia desabilita totalmente a captura de headers; qualquer outro valor substitui a lista. Essa alavanca cobre o caso PII/GDPR sem alterar comportamento default. Também documentei a variável no header do `config.js` e na tabela de env vars do README.

**Antes:**
```js
const SAFE_HEADER_KEYS = [
  'user-agent',
  'x-forwarded-for',
  'x-real-ip',
  'accept-language',
  'host',
];
```

**Depois:**
```js
const DEFAULT_SAFE_HEADER_KEYS = [
  'user-agent',
  'x-forwarded-for',
  'x-real-ip',
  'accept-language',
  'host',
];

function resolveSafeHeaderKeys() {
  const raw = process.env.OTEL_DDP_CAPTURED_HEADERS;
  if (raw === undefined) return DEFAULT_SAFE_HEADER_KEYS;
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

const SAFE_HEADER_KEYS = resolveSafeHeaderKeys();
```

---

## Commit: fix(review): resolve comment #2705921138 - clarify auto-instrumentation status in README

**Comentário original:**
> The comment on line 86 in the README mentions importing otel before HTTP to enable auto-instrumentation, but this is marked as TODO. However, the comment contradicts the description in the PR which states this feature is still missing. This creates confusion about the current state of auto-instrumentation. Consider clarifying whether this is a future feature or if there's a workaround users should follow now.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/README.md` — linhas 57-65

**O que foi feito:**
O TODO problemático já havia sido removido em commits posteriores, mas a seção "Automatic Instrumentation" não esclarecia o que **não** vem incluído. Adicionei uma nota explicando explicitamente que módulos core do Node (como `http`) e drivers (MongoDB, etc.) não têm auto-instrumentação out of the box neste pacote, apontando o usuário para a seção de "Custom Instrumentations" e reforçando que a inicialização precisa ocorrer antes do import dos módulos a serem instrumentados.

**Antes:**
```markdown
### 1. Automatic Instrumentation

Out of the box, the package provides:
- **Host metrics**: CPU, memory, network, disk
- **Node.js runtime metrics**: Event loop, GC, heap usage
```

**Depois:**
```markdown
### 1. Automatic Instrumentation

Out of the box, the package provides:
- **Host metrics**: CPU, memory, network, disk
- **Node.js runtime metrics**: Event loop, GC, heap usage

> Note: Automatic instrumentation of core Node.js modules (such as `http`) and common drivers (MongoDB, etc.) is **not** yet provided out of the box by this package. For now, you must configure any desired instrumentations manually (see [Custom Instrumentations](#custom-instrumentations) below) and ensure you initialize OpenTelemetry **before** importing the modules you want instrumented.
```

---

## Commit: fix(review): resolve comment #2705921120 - document randomSeed enumerability rationale

**Comentário original:**
> The new internal properties _session and _messageId are added to MethodInvocation, but the randomSeed property already exists in options without being wrapped in a non-enumerable property. For consistency, consider whether randomSeed should also be non-enumerable, or document why some internal properties are enumerable while others are not.

**Arquivo(s) alterado(s):**
- `packages/ddp-common/method_invocation.js` — linhas 75-99

**O que foi feito:**
Optei pela interpretação conservadora: documentar o porquê. `randomSeed` faz parte do public surface histórico de `MethodInvocation` (consumido pelo `RandomStream` e potencialmente por código de usuário via spread/`Object.keys`); torná-lo non-enumerable seria breaking change. Já `_session`/`_messageId` são adições novas, marcadas como internas (prefixo `_`), então faz sentido escondê-las da enumeração para não inflar a API pública. Acrescentei comentários explicando essa distinção em ambos os blocos.

**Antes:**
```js
// The seed for randomStream value generation
this.randomSeed = options.randomSeed;

// ...

// Internal references used for tracing/instrumentation.
// Stored as non-enumerable properties to avoid changing the public API
// surface of MethodInvocation while still exposing the data when needed.
Object.defineProperty(this, '_session', { ... });
Object.defineProperty(this, '_messageId', { ... });
```

**Depois:**
```js
// The seed for randomStream value generation. Kept enumerable because
// `randomSeed` is part of the long-standing public surface of
// MethodInvocation and is consumed by user code (e.g., RandomStream
// helpers); changing its enumerability would be a breaking change.
this.randomSeed = options.randomSeed;

// ...

// Internal references used for tracing/instrumentation. These are new
// additions and are intentionally non-enumerable so they don't appear in
// Object.keys / spreads / serialization of the public MethodInvocation
// surface, while still being readable by instrumentation code.
Object.defineProperty(this, '_session', { ... });
Object.defineProperty(this, '_messageId', { ... });
```

---

## Commit: fix(review): resolve comment #2705921111 - expose BatchSpanProcessor tuning

**Comentário original:**
> The tracer provider's span processors array is initialized with a BatchSpanProcessor, but there's no configuration exposed for batch size, timeout, or other parameters. Consider exposing these as configuration options to allow users to tune batching behavior for their specific workloads. For example, high-traffic applications might benefit from larger batch sizes, while low-latency requirements might need smaller export delays.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/server/config.js` — linhas 1-65
- `packages/meteor-otel/server/providers.js` — linhas 30-99

**O que foi feito:**
Expôs as opções de tuning do `BatchSpanProcessor` (maxQueueSize, maxExportBatchSize, scheduledDelayMillis, exportTimeoutMillis) tanto via variáveis de ambiente (`OTEL_BSP_*`) quanto programaticamente via `initOtel({ spanProcessor: {...} })`. Valores `undefined` simplesmente caem nos defaults do SDK do OpenTelemetry — ou seja, é seguro para quem não tem necessidade de tuning. Também adicionei `parseOptionalPositiveInt` para validar e descartar valores inválidos das env vars.

**Antes:**
```js
spanProcessors: [
  new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: config.tracesEndpoint,
    })
  ),
],
```

**Depois:**
```js
const bspOptionsFromConfig = config.spanProcessor || {};
const bspOptionsFromCaller = options.spanProcessor || {};
const bspOptions = {
  maxQueueSize: bspOptionsFromCaller.maxQueueSize ?? bspOptionsFromConfig.maxQueueSize,
  maxExportBatchSize:
    bspOptionsFromCaller.maxExportBatchSize ?? bspOptionsFromConfig.maxExportBatchSize,
  scheduledDelayMillis:
    bspOptionsFromCaller.scheduledDelayMillis ?? bspOptionsFromConfig.scheduledDelayMillis,
  exportTimeoutMillis:
    bspOptionsFromCaller.exportTimeoutMillis ?? bspOptionsFromConfig.exportTimeoutMillis,
};

_tracerProvider = new NodeTracerProvider({
  resource,
  spanProcessors: [
    new BatchSpanProcessor(
      new OTLPTraceExporter({ url: config.tracesEndpoint }),
      bspOptions
    ),
  ],
});
```

---

## Commit: fix(review): resolve comment #2705921089 - cap method/publication param types cardinality

**Comentário original:**
> The ddp.method.params.types attribute captures the types of all parameters passed to a method. This could lead to high cardinality if methods receive arrays or objects with varying structures. For example, a method that accepts an array of items would generate different type signatures based on array length. Consider limiting type information to a fixed number of parameters or providing a summary instead of detailed type information for each parameter.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/server/ddp-instrumentation.js` — linhas 13-37, 65, 88

**O que foi feito:**
Adicionei uma função `summarizeArgTypes` que limita o array de tipos a `MAX_PARAM_TYPES = 10` elementos, anexando `'...'` quando truncado. Isso mantém a cardinalidade do atributo `ddp.method.params.types` / `ddp.subscription.params.types` limitada (no máximo 11 valores possíveis por slot), evitando explosão de cardinalidade no backend de armazenamento. O comentário italojs no PR confirmou que isso era um problema real ("a high will cause a bad performance at storage provider").

**Antes:**
```js
function buildMethodAttributes(context, methodName, args = []) {
  const session = context?._session || null;
  const argTypes = Array.isArray(args) ? args.map((arg) => typeof arg) : [];
  // ...
}

function buildPublicationAttributes(subscription, pubName, args = []) {
  const session = subscription?._session || null;
  const argTypes = Array.isArray(args) ? args.map((arg) => typeof arg) : [];
  // ...
}
```

**Depois:**
```js
const MAX_PARAM_TYPES = 10;

function summarizeArgTypes(args) {
  if (!Array.isArray(args)) return [];
  if (args.length <= MAX_PARAM_TYPES) {
    return args.map((arg) => typeof arg);
  }
  const truncated = args.slice(0, MAX_PARAM_TYPES).map((arg) => typeof arg);
  truncated.push('...');
  return truncated;
}

function buildMethodAttributes(context, methodName, args = []) {
  const session = context?._session || null;
  const argTypes = summarizeArgTypes(args);
  // ...
}

function buildPublicationAttributes(subscription, pubName, args = []) {
  const session = subscription?._session || null;
  const argTypes = summarizeArgTypes(args);
  // ...
}
```

---

## Commit: fix(review): resolve comment #2705921077 - O(1) HeaderCarrier lookups

**Comentário original:**
> The HeaderCarrier.get() method performs case-insensitive lookups by iterating through all headers on each call. For operations that inject or extract multiple headers (traceparent, tracestate), this results in O(n*m) complexity where n is the number of headers and m is the number of lookups. Consider normalizing header keys to lowercase in the constructor to enable O(1) lookups, or maintaining a lowercase key map.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/server/tracing.js` — linhas 191-216

**O que foi feito:**
Adicionei um mapa `_headersLower` no `HeaderCarrier` que mantém as chaves normalizadas em lowercase para lookups em O(1). O objeto `headers` original continua preservando o casing das chaves (importante para consumidores downstream — `injectTraceContext` retorna esse objeto), enquanto `get(key)` agora resolve em tempo constante. `set(key, value)` atualiza ambos os mapas.

**Antes:**
```js
class HeaderCarrier {
  constructor(headers = {}) {
    this.headers = { ...headers };
  }

  get(key) {
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(this.headers)) {
      if (k.toLowerCase() === lowerKey) {
        return v;
      }
    }
    return undefined;
  }

  set(key, value) {
    this.headers[key] = value;
  }
  // ...
}
```

**Depois:**
```js
class HeaderCarrier {
  constructor(headers = {}) {
    this.headers = { ...headers };
    this._headersLower = {};
    for (const [k, v] of Object.entries(this.headers)) {
      this._headersLower[k.toLowerCase()] = v;
    }
  }

  get(key) {
    return this._headersLower[key.toLowerCase()];
  }

  set(key, value) {
    this.headers[key] = value;
    this._headersLower[key.toLowerCase()] = value;
  }
  // ...
}
```

---

## Commit: fix(review): resolve comment #2705921026 - guard trackDocument timeout against stale spanInfo

**Comentário original:**
> The timeout mechanism in trackDocument uses setTimeout without clearing it if the span completes successfully via the DDP hook. Looking at line 124-126, the timer is cleared when the span completes, but if the timeout fires first, the span is ended and removed from pendingSpans. However, there's a potential race condition: if the timeout callback is executing while the DDP hook tries to access the same span, the timer reference in spanInfo might be stale. Consider using a more robust cancellation mechanism or adding guards against this race condition.

**Arquivo(s) alterado(s):**
- `packages/meteor-otel/server/ddp-instrumentation.js` — linhas 207-225

**O que foi feito:**
Acrescentei guarda dupla na callback do `setTimeout` em `trackDocument`: além de comparar a `span` armazenada, agora também verifico se a referência `timer` ainda é a mesma. Isso protege contra cenários em que uma nova chamada de `trackDocument` (ou a conclusão pelo hook DDP `added`) substituiu/limpou o entry no `pendingSpans` antes do callback agendado disparar. Também marco `currentInfo.timer = null` antes de remover o entry, para deixar explícito que o timer não está mais ativo.

**Antes:**
```js
clearTimer();
timer = setTimeout(() => {
  if (pendingSpans.get(trackedKey)?.span === span) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: 'Timeout waiting for DDP added message',
    });
    span.end();
    pendingSpans.delete(trackedKey);
  }
}, timeoutMs);

spanInfo.timer = timer;
```

**Depois:**
```js
clearTimer();
timer = setTimeout(() => {
  const currentInfo = pendingSpans.get(trackedKey);
  // Ensure this timeout still owns the entry: another trackDocument
  // call (or a successful ddp 'added' completion) may have replaced
  // or cleared it before this fired.
  if (!currentInfo || currentInfo.span !== span || currentInfo.timer !== timer) {
    return;
  }

  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: 'Timeout waiting for DDP added message',
  });
  span.end();
  currentInfo.timer = null;
  pendingSpans.delete(trackedKey);
}, timeoutMs);

spanInfo.timer = timer;
```

---
