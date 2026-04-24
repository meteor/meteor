# Plano de Paralelização da Suíte de Testes do Meteor

**Autor:** preparado por Claude em conjunto com italo  
**Data:** 2026-04-24  
**Branch base:** `devel`

> Este documento é um plano de engenharia. Nada foi codado ainda. O objetivo é
> sair de uma suíte **intra-job** serial para uma suíte que explora os núcleos
> disponíveis (workers locais) sem perder a atual paralelização **entre jobs**
> do GitHub Actions. Cada fase é auto-contida, pode ser mergeada sozinha, e
> cada uma reduz risco antes da próxima.

---

## 1. Análise da Infraestrutura Atual

Hoje a suíte é dividida em quatro frentes, todas sequenciais dentro de um
mesmo job de CI:

### 1.1 Self-tests da CLI (`./meteor self-test`)

- Entry point: [tools/cli/commands-packages.js](tools/cli/commands-packages.js)
  → chama [tools/tool-testing/selftest.js](tools/tool-testing/selftest.js).
- `runTests()` em [selftest.js:606](tools/tool-testing/selftest.js#L606) itera
  `testList.filteredTests` em um **loop `for...of` serial** via `Run.runTest`.
- Cada teste cria um `Sandbox`
  ([tools/tool-testing/sandbox.js](tools/tool-testing/sandbox.js)) que:
  - Monta um diretório tmp isolado por teste (`files.mkdtemp()`).
  - Pode criar um _fake warehouse_ próprio (`METEOR_WAREHOUSE_DIR` apontando para
    `this.warehouse`).
  - Tem seu próprio `.meteorsession`, cwd, env.
  - Spawna `./meteor` via `Run` em [tools/tool-testing/run.js](tools/tool-testing/run.js).
- **Ports**:
  - `./meteor run` dentro do sandbox usa **`-p 3000` por default** (o
    runner em [run-all.js:53-54](tools/runners/run-all.js#L53-L54) calcula
    `mongoPort = proxyPort + 1`).
  - Muitos testes não passam `-p` explicitamente ⇒ colidem se rodam em paralelo
    no mesmo host.
  - `fakeMongo` usa `randomPort()` (20000–29999) em
    [utils.js:217](tools/utils/utils.js#L217). Sorteio sem verificar
    disponibilidade ⇒ colisões raras mas possíveis.
- **Estado global compartilhado** entre testes (module-level em
  `sandbox.js:578-580`):
  - `builtPackageTropohouseDir` — tropohouse construído uma vez e reusado.
  - `tropohouseLocalCatalog`, `tropohouseIsopackCache` — catálogos compartilhados.
  - Se paralelizarmos, precisa de mutex para que só o primeiro teste construa,
    os demais aguardam e reusam.
- **Paralelização atual (entre jobs)**: O workflow
  [.github/workflows/test-tools.yml](.github/workflows/test-tools.yml)
  já fatia os testes em **12 grupos por regex** (`test-group-0` até
  `test-group-11`) + um job `isolated-tests`. Cada grupo roda sequencial em
  um container próprio.

### 1.2 Test-packages / test-in-console

- Script: [packages/test-in-console/run.sh](packages/test-in-console/run.sh).
- Sobe **uma** instância de Meteor em `-p 4096` (Mongo em 4097) e uma
  **única** sessão Puppeteer em [puppeteer_runner.js](packages/test-in-console/puppeteer_runner.js).
- Todos os pacotes de core são testados dentro dessa única página via
  `Tinytest._runTestsEverywhere` → [driver.js](packages/test-in-console/driver.js).
- Workflow atual: [.github/workflows/test-packages.yml](.github/workflows/test-packages.yml)
  — **um único job**, sem matriz.

### 1.3 Modern E2E tests (Jest + Playwright)

- Localização: [tools/modern-tests/](tools/modern-tests/).
- `jest.config.js` tem **`maxWorkers: 1`** ⇒ explicitamente serial dentro de
  cada categoria.
- CI ([e2e-tests.yml](.github/workflows/e2e-tests.yml)) shardsa por
  `matrix.category` (React, Vue, Svelte, Solid, Blaze, Babel, Coffeescript,
  Monorepo, Library, Typescript, Angular, R.Router).
- Ports **hardcoded** por teste (3100, 3102, 3202 etc. — veja
  [react.test.js:18](tools/modern-tests/react.test.js#L18)).
- `helpers.js` cria cada app em `os.tmpdir()` com sufixo aleatório ⇒ FS OK.
- `killProcessByPort` é usado em `beforeAll`/`afterAll` para blindar a porta,
  mas isso é incompatível com paralelismo no mesmo host.

### 1.4 Unit tests (Jest)

- [tools/unit-tests/jest.config.js](tools/unit-tests/jest.config.js) — sem
  `maxWorkers`, então usa default (`numCpus - 1`).
- Puramente em-processo, sem subprocesso Meteor; **já paraleliza** e é rápido.
  Pouca margem para ganho aqui.

---

## 2. Identificação dos Bloqueios

Categorizando por tipo e gravidade:

### 2.1 Hardcoded ports (bloqueio A — mais comum)

| Local | Port | Impacto |
|-------|------|---------|
| `tools/tool-testing/sandbox.js:131` | `3000` (default em `testWithAllClients`) | colisão em paralelo |
| `./meteor run` default (commands.js) | `3000` / `3001` (mongo) | colisão em paralelo |
| `packages/test-in-console/run.sh:21,24` | `4096` / `4097` | uma suíte por host |
| `tools/modern-tests/*.test.js` | 31xx, 32xx fixos | múltiplos fixos, podem colidir entre si |
| `tools/tests/command-line.js` | expectativas textuais de `3000` | é teste de parsing da CLI, tolerável |

### 2.2 Paralelismo do orquestrador (bloqueio B)

- `selftest.runTests` é um laço `for` serial.
- `jest.config.js` de `modern-tests` usa `maxWorkers: 1`.
- `test-in-console/run.sh` é single-shot.

### 2.3 Estado compartilhado global (bloqueio C)

- `builtPackageTropohouseDir` em `sandbox.js:578`. Mitigação: construir **uma
  vez** num step de warmup do CI (já acontece parcialmente no job `setup`),
  depois um mutex para quando rodar localmente.
- Cache do `npm install` (`~/.npm`) — o npm >= 7 tem lock interno, mas cargas
  pesadas em paralelo podem falhar ou ser lentas. Mitigação: usar
  `--prefer-offline` e populares o cache no `setup` antes.
- `.babel-cache`, `dev_bundle`, `.meteor/local` — no layout de sandbox cada
  teste copia o app, então tem o seu próprio `.meteor/local`. ✅
- `METEOR_SESSION_FILE` já é por-sandbox. ✅
- `~/.meteortest` (lastPassedHashes) — `writeTestState` é sequencial, precisa
  ficar atrás do final do batch paralelo (ou fazer _reduce_ das listas).

### 2.4 Poluição do filesystem (bloqueio D — pequeno)

- `Sandbox.root = files.mkdtemp()` já isola cada teste. ✅
- `modern-tests/helpers.js` também usa `os.tmpdir()` com sufixo random. ✅
- `METEOR_SAVE_TMPDIRS=1` no CI preserva tmp entre runs para diagnóstico —
  continuar válido no paralelo.

### 2.5 Recursos finitos (bloqueio E)

- CPU/memória: cada `./meteor run` spawna node + mongod + watcher. Testes
  full-app consomem ~500MB-1GB. Em uma máquina oss-vm (~4 vCPU / 16GB), o
  teto prático é 3–4 workers simultâneos.
- Puppeteer / Chromium: cada instância ~250MB. Se rodarmos N sessões por
  worker, a RAM explode. Paralelizar **entre workers**, não **dentro**.
- Docker socket / `lsof` / `pgrep` (usados por `findMongoPids` em
  [run-mongo.js:185](tools/runners/run-mongo.js#L185)): não filtram por
  container/namespace ⇒ podem ver mongos de outros workers irmãos no mesmo
  host. **Precisa filtrar por `dbPath` de forma estrita** (já faz, mas testar
  com rigor).

### 2.6 Testes intrinsicamente não-paralelizáveis

Devem rodar em um bucket "isolated" (já existe no CI):

- `add debugOnly and prodOnly packages` (já na tag isolada).
- Testes com `custom-warehouse` (já agrupados).
- Testes que mexem em `~/.meteortest` global, `~/.meteor/credentials`, etc.
- Testes de `meteor publish`, `meteor login` que falam com um server público.

---

## 3. Arquitetura de Paralelização Proposta

### 3.1 Princípios

1. **Isolar antes de paralelizar.** Cada teste deve receber um _slot_ com:
   `workerId` (0..N-1), `basePort` (ex. `30000 + workerId*100`), `tmpRoot`,
   e um prefixo para `dbPath` de mongo. Isto elimina colisões por
   construção, sem depender de `randomPort()`.
2. **Paralelismo dentro do job, não só entre jobs.** Os 12 grupos atuais
   viram orquestradores multi-worker; cada grupo usa N vCPUs.
3. **Nenhuma rede externa por default.** Usar `fakeMongo` sempre que o teste
   não depende de Mongo real, e contêineres `--network=none` onde couber.
4. **Retries continuam existindo**, mas devem ser a exceção, não o
   band-aid para flakiness introduzida pelo paralelismo.
5. **Observabilidade.** Emitir JUnit + um `worker-report.json` por worker
   com tempo por teste, para identificar regressões.

### 3.2 Modelo de slot

```
┌─────────────────────────────────────────────────────────┐
│ Worker i (0..N-1)                                       │
│   METEOR_TEST_WORKER_ID=i                               │
│   METEOR_TEST_PORT_BASE=30000 + i*100                   │
│   METEOR_TEST_TMP_ROOT=/tmp/meteor-tests/worker-i       │
│   METEOR_TEST_MONGO_DB_PREFIX=meteor-w${i}-             │
│                                                         │
│   → Sandbox / Run herdam essas variáveis                │
│   → default `-p` passa a ser PORT_BASE (substitui 3000) │
│   → randomPort() vira PORT_BASE + N reservados          │
└─────────────────────────────────────────────────────────┘
```

Implementação: introduzir um módulo `tools/tool-testing/slot.js` que exporta
`getSlot()` (lê env vars) e `allocatePort()` (pega do pool do worker).

### 3.3 Estratégias por frente

| Frente | Estratégia |
|--------|-----------|
| **self-tests** | Processo orquestrador distribui testes em filas (`worker_threads` ou subprocessos). Cada worker consome da fila e executa com seu slot. Resultado agregado no final. Trabalho-furto (_work-stealing_) é opcional mas ajuda quando os tempos variam muito. |
| **test-in-console** | Shardar por pacote (N sub-processos, cada um chama `./meteor test-packages --driver-package test-in-console` para um subconjunto dos pacotes, com porta distinta). Alternativa mais leve: usar a matriz de GitHub Actions, similar ao que já existe em `test-tools.yml`. |
| **modern-tests** | Remover `maxWorkers: 1` e passar `maxWorkers` configurável. Refatorar os PORTs hardcoded para virem de um pool derivado de `JEST_WORKER_ID`. |
| **unit-tests** | Já paraleliza. Apenas validar que não grava em arquivos fora do módulo sob teste. |

### 3.4 Orquestrador de self-tests — desenho

```
┌──────────────┐
│ selftest CLI │
└──────┬───────┘
       │ lista testes filtrados
       ▼
┌──────────────────┐
│ WorkerPool       │   N = min(--workers, vCPU-1, 6)
│  queue: [T1..Tm] │
└──┬──┬──┬──┬──────┘
   │  │  │  │
   ▼  ▼  ▼  ▼
 Worker0 Worker1 Worker2 WorkerN-1
  │       │       │
  ▼       ▼       ▼
  Sandbox Sandbox Sandbox   (cada um com slot próprio)
  │       │       │
  ▼       ▼       ▼
  ./meteor subprocess (porta PORT_BASE+offset)
```

- Implementação em `tools/tool-testing/worker-pool.js` usando
  `node:worker_threads` (não `cluster`, para evitar forks caros do tool).
- Handshake: worker carrega `selftest.js`, recebe `{ test }`, executa,
  devolve `{ status, durationMs, failure? }`.
- Teste com tag `serial` (nova tag) volta a rodar no orquestrador. Útil para
  testes que manipulam o próprio processo/variáveis globais.

### 3.5 Para os contêineres do GitHub Actions

- Continuar com a matriz de 12 grupos, mas **cada grupo passa a usar
  `--workers 3`**. A oss-vm tem 4 CPUs → sobra 1 para o orquestrador.
- Adicionar env var `METEOR_TEST_WORKERS` para não ter que mexer no workflow
  a cada ajuste.
- `timeout-minutes` pode **cair** dos atuais 25–40 para ~15, mas manter
  folga enquanto medimos.

### 3.6 Orçamento de recursos (estimativa)

| Recurso | Hoje (por job) | Paralelo (por job) | Observação |
|---------|----------------|---------------------|------------|
| CPU | 1 em uso | 3 em uso | 1 CPU de folga p/ orquestrador |
| RAM | ~3–4 GB pico | ~9–12 GB pico | cabem em 16 GB, com margem |
| Portas TCP | 2–3 | 30 (10 por worker) | isoladas por slot |
| Tempo de self-test | 20–40 min | **8–15 min estimado** | ganho ~2.5× |
| Tempo total do CI | ~40 min (gargalo = grupo mais lento) | **~18 min estimado** | |

---

## 4. Plano de Ação por Fases

Cada fase é mergeável de forma independente. As fases 1–4 **não mudam o
comportamento** da suíte para o usuário (continua rodando serial). A fase 5
liga o paralelismo dentro de um job. As fases 6–7 estendem para
test-in-console e afinam.

### Fase 1 — Higiene e isolamento (sem regressão)

**Objetivo:** tirar qualquer dependência de porta/estado global que hoje só
funciona porque não há concorrência.

**Tarefas**

- [ ] 1.1 Introduzir `tools/tool-testing/slot.js`. Exporta:
  - `getWorkerId()` (default: 0)
  - `getPortBase()` (default: porta antiga 3000)
  - `allocatePort(offset)` (retorna `getPortBase() + offset`)
  - `getTmpRoot()` (respeita `METEOR_TEST_TMP_ROOT`; default atual)
- [ ] 1.2 Fazer `Sandbox.testWithAllClients` usar `allocatePort(0)` em vez do
  literal `3000` ([sandbox.js:131](tools/tool-testing/sandbox.js#L131)).
- [ ] 1.3 Substituir `randomPort()` em `tool-testing/run.js` e em
  `tools/tests/run.js` (linha 196) por `allocatePort(N)` com offsets fixos
  (cada tipo de uso ganha uma faixa reservada do slot).
- [ ] 1.4 Auditar manualmente todos os testes em `tools/tests/**/*.js` que
  dão `s.run()` sem `-p` (hoje caem em 3000). Trocar por `-p ${slot.app}`
  via uma helper nova (`Sandbox.runApp(args)`).
- [ ] 1.5 Criar mutex em `sandbox.js` ao redor do bloco que preenche
  `builtPackageTropohouseDir` (`async-mutex` do dev_bundle ou um
  `Promise` singleton).
- [ ] 1.6 Validar que todos os tmp dirs que os testes criam passam por
  `files.mkdtemp()` (não usar `/tmp/some-fixed-name`).

**Validação:** rodar `./meteor self-test` localmente **ainda em modo serial**
e confirmar zero regressão. CI 100% verde.

**PR esperado:** 1 único, grande em volume de arquivos tocados mas de baixo
risco (substituições mecânicas).

### Fase 2 — Tag `serial` e catalogação de testes não paralelizáveis

**Objetivo:** marcar o que não pode paralelizar antes de tentar paralelizar.

**Tarefas**

- [ ] 2.1 Adicionar tag `serial` em `tools/tool-testing/selftest.js`
  (`tagDescriptions`).
- [ ] 2.2 Varrer `tools/tests/` e marcar com `['serial']` os testes que:
  - Escrevem em `~/.meteor`, `~/.meteortest`, `~/.ssh` ou outros paths do
    `files.getHomeDir()` do processo hospedeiro.
  - Dependem de um `METEOR_PACKAGE_SERVER_URL` real (galaxy, publish, login).
  - Invocam `meteor update` contra um warehouse compartilhado.
  - Suspeitos identificados até agora (confirmar em revisão): `login.js`,
    `galaxy.js`, `organizations.js`, `releases.js`, `wipe-all-packages.js`,
    `update-tests.js`, `tarball.js`, `git-commit-hash.js`.
- [ ] 2.3 Mover os testes de `custom-warehouse` (já em job próprio no CI)
  para também ter tag `serial` interna.

**Validação:** `./meteor self-test --with-tag serial` lista só o esperado.

### Fase 3 — Infra para paralelismo de modern-tests

**Objetivo:** destravar paralelismo do Jest no modern-tests sem ligá-lo de
verdade ainda (continua `maxWorkers: 1` no CI).

**Tarefas**

- [ ] 3.1 Criar `tools/modern-tests/port-allocator.js` que, a partir de
  `JEST_WORKER_ID`, calcula uma faixa de portas distinta (ex.:
  `30000 + (workerId-1)*50`).
- [ ] 3.2 Refatorar helpers (`helpers.js`, `test-helpers.js`) para
  receberem porta via esse allocator em vez de constantes.
- [ ] 3.3 Atualizar cada `.test.js` com `const PORT = allocatePort(X)`.
- [ ] 3.4 Remover `maxWorkers: 1` do `jest.config.js`, mas colocar
  `maxWorkers: process.env.CI ? 1 : '50%'` — mantém CI inalterado até a
  fase 5.

**Validação:** rodar `npm run test:e2e -- -t="React"` local; deve ficar no
comportamento antigo porque `CI` não está setado.

### Fase 4 — Warmup central do tropohouse e caches

**Objetivo:** garantir que, quando múltiplos workers acordarem, nenhum
precisa construir do zero.

**Tarefas**

- [ ] 4.1 Adicionar um step/`script` (`scripts/test-warmup.js`) que
  pré-constrói `builtPackageTropohouseDir` num local compartilhado
  (`METEOR_TEST_TROPOHOUSE_DIR`).
- [ ] 4.2 Expor env var para que `sandbox.js` reuse esse diretório (evita
  reconstruir por-teste).
- [ ] 4.3 Ajustar [test-tools.yml](.github/workflows/test-tools.yml) para
  rodar o warmup no job `setup` e compartilhar via cache.

**Validação:** medir o tempo da primeira execução em cada grupo — deve cair.

### Fase 5 — Paralelismo intra-job do self-test (a mudança que importa)

**Objetivo:** rodar N testes simultâneos em cada um dos 12 grupos.

**Tarefas**

- [ ] 5.1 Implementar `tools/tool-testing/worker-pool.js` (`worker_threads`
  + fila de tarefas).
- [ ] 5.2 Novo flag `--workers <N>` em `selftest` (default: 1 local, env
  var `METEOR_TEST_WORKERS` no CI). Fallback para serial quando N=1.
- [ ] 5.3 Testes com tag `serial` rodam num passe final serial **depois**
  que os workers paralelos terminam.
- [ ] 5.4 Agregação de resultados + JUnit final equivalente ao atual.
- [ ] 5.5 Tratamento de sinais: Ctrl-C mata todos os workers e seus
  subprocessos (`pkill -TERM -P pid` como no `run.sh`).
- [ ] 5.6 Ligar no CI **apenas em 2 grupos primeiro** (ex.: 0 e 11) via
  `METEOR_TEST_WORKERS=3`. Observar por 3–5 dias em `devel`.
- [ ] 5.7 Depois, rollout para os 12 grupos.

**Validação local:** `./meteor self-test --workers 4` deve completar com
mesmo resultado (`exit code`, contagem de pass/fail, JUnit idêntico no
conteúdo semântico) que `./meteor self-test`.

**Critério de sucesso no CI:** queda ≥ 40% no tempo médio dos grupos 0/11,
sem aumento de flakiness acima do ruído pré-mudança. Reverter com uma
variável se der ruim.

### Fase 6 — Paralelização de test-in-console

**Objetivo:** deixar de rodar todos os pacotes em uma sessão única.

**Tarefas**

- [ ] 6.1 Gerar a lista de pacotes do core em
  `scripts/list-test-packages.js`.
- [ ] 6.2 Sharder por hash de nome (determinístico) ou por tempo histórico
  (mais eficiente, exige coletar durações primeiro).
- [ ] 6.3 Adaptar `run.sh` para aceitar `METEOR_TEST_PACKAGES` já como
  lista e `--shard i/N`.
- [ ] 6.4 No `test-packages.yml`, introduzir `strategy.matrix` com 4–6
  shards. Cada shard sobe seu próprio Meteor + Puppeteer em porta
  distinta.
- [ ] 6.5 Agregar artifacts/JUnit no final.

**Validação:** comparar a cobertura: soma dos pacotes testados nos shards
== lista completa original. Nenhum pacote fora/dup.

### Fase 7 — Paralelização de modern-tests

**Objetivo:** ligar os workers em Jest e reduzir a matriz ao que é
essencial.

**Tarefas**

- [ ] 7.1 Remover o gate `process.env.CI ? 1` e usar
  `maxWorkers: process.env.MODERN_TESTS_WORKERS || 2`.
- [ ] 7.2 Validar que um container da matrix com 2 workers cabe em RAM
  (Chromium + 2 Meteor dev mode é pesado).
- [ ] 7.3 Considerar **consolidar** categorias leves (Coffeescript, Babel,
  Library) num único job com maxWorkers — mantendo React/Vue/Angular
  separados por custo de startup.
- [ ] 7.4 **Pré-requisito upstream:** parametrizar portas em
  `@meteorjs/rspack` (dev-server hoje hardcoded em 8080) e no pacote
  `bundle-visualizer` (8081/8082) via env var (ex.
  `METEOR_RSPACK_DEV_PORT`, `METEOR_BUNDLE_VISUALIZER_PORTS`). Só depois
  disso faz sentido remover o `[port, '8080']` literal em
  `test-helpers.js` e usar o `allocateAuxPort` já existente. Documentado
  in-line nos pontos relevantes do `test-helpers.js`.

**Validação:** soma das durações não piora; duração total da matrix cai.

### Fase 8 — Quality gates e observabilidade

**Objetivo:** garantir que regressões de flakiness sejam detectadas e
atribuídas.

**Tarefas**

- [ ] 8.1 Emitir, ao lado do JUnit, um `worker-report.json` com
  `{ testName, workerId, durationMs, retries, status }`.
- [ ] 8.2 Dashboard simples (um `scripts/test-report.js`) que calcula
  flakiness por teste nas últimas N runs. Idealmente publicar no
  `gh-pages` ou no Slack interno.
- [ ] 8.3 Regra: teste com flakiness > 5% ganha tag `serial` automática
  até ser arrumado.

---

## 5. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Flakiness explode com paralelismo (testes que davam OK por sorte) | Média | Alto | Rollout gradual (grupo por grupo), rollback via env var, tag `serial` como válvula de escape |
| Colisão de porta em `randomPort()` de testes esquecidos | Média | Alto | Fase 1.3 substitui todos os usos; teste de grep proativo no CI proíbe `randomPort` novo |
| OOM em CI quando 3+ Meteor sobem juntos | Baixa-Média | Alto | Limitar `--workers` a 3 em oss-vm (4 CPU / 16 GB); monitorar `METEOR_SAVE_TMPDIRS` consumo |
| `findMongoPids` pega processo de worker vizinho | Baixa | Médio | Já filtra por `dbPath`; reforçar que cada worker use `METEOR_TEST_MONGO_DB_PREFIX` único |
| Ordem dos testes afetava comportamento (estado oculto) | Baixa | Alto | Tag `serial` para os problemáticos, revisão de código caso a caso |
| JUnit/relatório fica confuso com workers | Média | Baixo | Agregador no orquestrador (fase 5.4) |
| Quebra em Windows (self-test tem flags `win32`) | Média | Médio | Manter `windows-selftest.yml` em serial inicialmente (é workflow separado) |

---

## 6. Métricas de Sucesso

Colher antes de começar, depois de cada fase, e publicar no PR:

1. **Duração p50 / p95** de cada grupo de CI.
2. **Duração total** do workflow (gargalo = grupo mais lento).
3. **Taxa de flakiness** (falhas em 1º try que passam em retry, por teste,
   últimas 100 runs em `devel`).
4. **Pico de RAM** por container (via `docker stats` no setup).
5. **Custo de minutos GitHub Actions** por PR.

Meta global (fim da Fase 7):

- Duração total do CI de testes: **≤ 50%** da linha de base.
- Flakiness: **sem piora** (±1 ponto percentual).
- Custo: **≤ 60%** da linha de base (ganho líquido porque o tempo cai mais do
  que o número de workers sobe).

---

## 7. Ordem de Execução Sugerida

```
Semana 1:   Fase 1 (higiene/isolamento) ...................... 1 PR grande
Semana 2:   Fase 2 (tag serial + catalogação) ................. 1 PR
Semana 2:   Fase 3 (infra modern-tests, desligada) ............ 1 PR pequeno
Semana 3:   Fase 4 (warmup central) ........................... 1 PR
Semana 4:   Fase 5.1–5.5 (worker-pool, só com flag local) ..... 1 PR
Semana 5:   Fase 5.6–5.7 (canário em 2 grupos, depois rollout). 1 PR no CI
Semana 6:   Fase 6 (test-in-console shards) ................... 1 PR
Semana 7:   Fase 7 (modern-tests workers) ..................... 1 PR
Semana 8+:  Fase 8 (observabilidade contínua) .................. ongoing
```

---

## 8. Pontos de Atenção Importantes

- **Não** remover retries enquanto a fase 5 ainda está ramping up. Retries
  hoje mascaram flakiness latente; só reduzir `METEOR_SELF_TEST_RETRIES`
  depois da fase 8 indicar flakiness sob controle.
- **Preservar** o workflow `windows-selftest.yml` em serial nas primeiras
  fases — Windows tem peculiaridades (taskkill, mongod.exe paths) que
  preferimos resolver depois.
- **Mantê-lo reversível**: toda mudança de comportamento entra atrás de uma
  env var (`METEOR_TEST_WORKERS`, `METEOR_TEST_PARALLEL`, etc.). Rollback
  deve ser um `echo "METEOR_TEST_WORKERS=1" >> $GITHUB_ENV`.
- **Evitar reescrever código core só por estética** neste esforço. Foco é
  paralelização; refatorações paralelas mascaram a causa de qualquer
  regressão.
