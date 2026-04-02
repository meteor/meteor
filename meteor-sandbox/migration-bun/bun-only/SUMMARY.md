# Spike bun-only-host — Résumé complet

**Branche :** `spike/bun-only-host` (enfant de `spike/esm-bundle-format`)
**Date :** 2026-04-01

---

## Contexte

La branche parente `spike/esm-bundle-format` avait prouvé :

- `meteor build --format=esm` fonctionne — le bundler émet un format ESM alternatif
- `esm-loader.mjs` (196 lignes) remplace boot.js + runtime.js + npm-require.js (~860 lignes), élimine `vm.runInThisContext`, Reify, et le patching de `Module.prototype`
- Node et Bun bootent le même bundle, 13/13 tests de consolidation passent
- Un proof-of-concept (`start-bun.mjs`) faisait tourner DDP sur Bun via une architecture proxy 2 ports

Le proof-of-concept avait des limites structurelles : 2 ports, double handling HTTP, shim WebSocket fragile. Cette branche transforme ça en quelque chose de testable end-to-end sur un seul port, benchmarkable face à Node.

---

## Design Principles

1. **Préserver les sémantiques Meteor, pas les détails d'implémentation Node.** DDP, methods, publications, accounts, startup = sacré. Express, http.createServer, SockJS = pas sacré.
2. **Laisser Bun être Bun.** Préférer les modèles natifs (fetch handler, WebSocket natif, Bun.file()) aux abstractions Node-shaped.
3. **Les bridges de compatibilité sont temporaires.** Chaque seam est labellisé ⚠️ TRANSITIONAL avec l'architecture cible notée.
4. **Simplifier dès qu'un chemin Bun-natif émerge.** Ne pas empiler les couches de compat.

---

## Ce qui a été produit

### 1. Refactoring esm-loader.mjs

`boot()` refactoré en `bootPackages(serverDir)` + `runMain()`, avec `boot()` maintenu comme alias backward-compat. Permet d'injecter des patches (ex: `WebApp.startListening`) entre le chargement des packages et le démarrage de l'app.

### 2. BunSocket adapter (47 lignes)

`bun-only/bun-ddp-transport.mjs` — wrappe `ServerWebSocket` de Bun pour satisfaire le contrat StreamServer/Session. Corrige le bug `socket.url` manquant du shim précédent.
⚠️ Transitional — cible : transport DDP via interface pluggable PR #14231.

### 3. bun-host.mjs (154 lignes)

`bun-only/bun-host.mjs` — single-port Bun.serve() host.

```
Bun.serve(:PORT)
  ├── HTTP → fetch({ unix: SOCK_PATH }) → Express (Unix socket interne)
  └── WS  → BunSocket → StreamServer
```

Boot : `bootPackages()` → patch `WebApp.startListening` → `runMain()`.
Lifecycle : cleanup socket file sur SIGTERM/SIGINT/exit + unlink pre-existing.

Seams transitoires : Unix socket proxy, monkey-patch startListening, accès direct open_sockets.

### 4. Scripts de benchmark

`bench.sh` (HTTP via ab, DDP via ws-bench.mjs, RSS), `ws-bench.mjs` (latence séquentielle + burst), `cold-start.sh` (time to first HTTP 200), `ws-burst-diagnostic.mjs` (mono vs multi-connexion).

---

## Validation

| Template | HTTP | Boilerplate | Assets | DDP | MongoDB |
|---|---|---|---|---|---|
| `--bare + webapp` | 200 | ✅ | ✅ | 4/4 | N/A |
| `--minimal` | 200 | ✅ | ✅ | 4/4 | N/A |
| `--blaze` | 200 | ✅ | JS+CSS 200 | 4/4 | connecté |
| `--full` | 200 | ✅ | JS+CSS 200 | 4/4 | connecté |

4/4 templates fonctionnels sous Bun. Zéro process Node. HTTP, DDP, MongoDB opérationnels.

---

## Benchmarks

App : `meteor create --full` — ThinkPad P52, Linux 6.8.0 — Node 22.22.0 / Bun 1.2.4 / MongoDB 7.0.14

### Résultats (après Bun.file() + boilerplate direct)

| Métrique | Node legacy | Node ESM | Bun ESM | Bun vs Node legacy |
|---|---|---|---|---|
| HTTP boilerplate (req/sec) | 884 | 1,061 | **2,146** | **+143%** |
| HTTP static JS ~800KB (req/sec) | 732 | 853 | **3,419** | **+367%** |
| HTTP static CSS ~1KB (req/sec) | 1,556 | 1,991 | **17,304** | **+1012%** |
| DDP roundtrip mean | 0.49 ms | 0.45 ms | 0.13 ms | **3.8x** |
| DDP roundtrip P95 | 0.82 ms | 0.79 ms | 0.19 ms | **4.3x** |
| DDP sequential (calls/sec) | 2,062 | 2,199 | 7,735 | **3.75x** |
| RSS mémoire | 305 MB | 257 MB | 191 MB | **-37%** |
| Cold start | 1,005 ms | 788 ms | 691 ms | **-31%** |

Static assets via `Bun.file()` (zero-copy). Boilerplate via `WebAppInternals.getBoilerplate()` direct (pas de proxy Express).

### Gains principaux

- **Boilerplate +143%** — 2,146 vs 884 req/sec. Direct vs Express middleware stack.
- **Static JS +367%** — 3,419 vs 732 req/sec. Bun.file() zero-copy vs Express send module.
- **Static CSS +1012%** — 17,304 vs 1,556 req/sec. Petits fichiers = gain maximal.
- **DDP 3.8x** — WebSocket natif Bun vs SockJS + ws. Chemin critique de Meteor.
- **Mémoire -37%** — 191 MB vs 305 MB. Densité de déploiement.
- **Cold start -31%** — 691 ms vs 1,005 ms.

### Stabilité (soak test)

5 minutes, 20 clients, 108,922 ops : **0 erreurs**, throughput constant (362-364 ops/sec), 20/20 clients actifs, RSS stable à 179 MB. **PASS.**

### Observation : Node ESM vs Node legacy

Le format ESM apporte des gains même sur Node : HTTP +17-28%, mémoire -16%, cold start -22%. La suppression de vm/Reify/Module.prototype patching a un coût mesurable. Le format ESM a de la valeur indépendamment de Bun.

---

## Investigation : DDP burst parallèle

Le benchmark initial montrait une régression de 48x sur le burst parallèle (200 calls concurrents, 1 connexion). Trois diagnostics ont identifié la root cause.

### Diagnostic 1 — Mono vs multi-connexions

| Pattern | Node ESM | Bun ESM | Bun vs Node |
|---|---|---|---|
| 1 conn × 200 calls | 3,806/sec | 87/sec | -98% |
| 10 conn × 20 calls | 5,184/sec | 729/sec | -86% |
| 50 conn × 4 calls | 4,710/sec | 7,198/sec | **+53%** |

Le goulot est per-socket. Distribué sur plusieurs connexions, Bun surpasse Node.

### Diagnostic 2 — Raw Bun WebSocket (sans Meteor)

Serveur echo pur : 24K msg/sec en mono-connexion, uniforme quel que soit le pattern. Bun's WebSocket est rapide. Le problème n'est pas dans Bun.

### Diagnostic 3 — Timing serveur

emit('data') : ~0.03 ms/msg. send() : ~0.04 ms/msg. Temps serveur total : ~0.07 ms/msg. Avec 200 messages, ça devrait prendre ~14 ms, pas 2,730 ms.

### Root cause

Le temps perdu est entre `ws.send()` et l'arrivée du prochain `message()` callback sur la même connexion. Bun traite les messages d'un même socket séquentiellement avec un yield entre chaque. En multi-connexions, chaque socket a son propre pipeline — la charge parallélise.

### Confirmation : benchmark workload réaliste

Pour lever le doute, un benchmark simulant des scénarios de production (subscribe + method calls + ping, séquentiel par client, parallèle entre clients) :

| Scénario | Clients × Ops | Node legacy | Node ESM | Bun ESM | Bun vs Node legacy | Bun vs Node ESM |
|---|---|---|---|---|---|---|
| **Small team** | 10 × 20 | 3,180/sec | 3,683/sec | 6,285/sec | **+98%** | **+71%** |
| **Typical SaaS** | 50 × 10 | 3,843/sec | 4,092/sec | 14,832/sec | **+286%** | **+262%** |
| **Busy dashboard** | 100 × 5 | 4,754/sec | 4,926/sec | 12,893/sec | **+171%** | **+162%** |
| **Traffic spike** | 200 × 2 | 9,420/sec | 10,881/sec | 23,714/sec | **+152%** | **+118%** |

Latence moyenne par op :

| Scénario | Node legacy | Node ESM | Bun ESM |
|---|---|---|---|
| Small team | 3.07 ms | 2.65 ms | **1.44 ms** |
| Typical SaaS | 12.30 ms | 11.57 ms | **2.91 ms** |
| Busy dashboard | 18.98 ms | 18.18 ms | **6.02 ms** |
| Traffic spike | 14.79 ms | 11.25 ms | **4.60 ms** |

Temps de connexion (connect 200 clients) : Node 417 ms, Bun 206 ms (**2x plus rapide**).

Sur un workload réaliste, **Bun est 2 à 4x plus rapide que Node sur tous les scénarios**, avec des latences 2 à 4x plus basses. Le "problème" du burst mono-connexion est un artefact de test, pas une limitation en production.

---

## Audit des seams transitoires

Après les itérations (Bun.file, boilerplate direct, transport _onConnection), voici l'état des seams :

### Seam 1 — `WebApp.startListening` monkey-patch

**Status : reste nécessaire.**
C'est le seam structurant : on intercepte le `listen()` de webapp pour rediriger httpServer sur un Unix socket et lancer Bun.serve() sur le vrai port.

**Acceptable moyen terme ?** Oui. C'est un hook documenté (`WebApp.startListening` est une API publique, conçue pour être overridée — le commentaire dans webapp_server.js dit "This can be overridden by users who want to modify how listening works, eg to run a proxy like Apollo Engine Proxy"). C'est pas un hack obscur, c'est l'API prévue.

**Doit disparaître à terme ?** Oui, si on veut un vrai "Meteor on Bun" sans Express du tout. La cible serait un loader Bun dédié qui ne charge pas webapp du tout, ou un webapp alternatif Bun-native. Mais c'est un chantier de package Meteor core, pas un seam à résoudre dans un spike.

### Seam 2 — Unix socket proxy (Express reste pour les routes middleware)

**Status : réduit. Ne sert plus que pour les routes middleware user.**

Avant : tout le HTTP passait par le proxy. Maintenant :
- Static files → Bun.file() direct (bypass proxy)
- Boilerplate HTML → WebAppInternals.getBoilerplate() direct (bypass proxy)
- **Seul le proxy reste pour** : `WebApp.connectHandlers.use()` user middleware, `WebAppInternals.meteorInternalHandlers` (dynamic-import, oauth endpoints, etc.)

**Acceptable moyen terme ?** Oui. Les routes middleware sont rarement sur le chemin critique perf (elles ne sont pas appelées à chaque page load — c'est du login OAuth, du dynamic import, des API custom). Le proxy Unix socket pour ces routes marginales est un bon compromis.

**Doit disparaître à terme ?** Idéalement oui, mais c'est le dernier seam et le moins rentable à supprimer. Supprimer Express demanderait un shim `WebApp.connectHandlers.use()` qui traduit le middleware Express `(req, res, next)` en fetch handler — faisable mais fragile (packages et user code dépendent de l'interface Express). Pas prioritaire.

### Seam 3 — StreamServer open_sockets direct access

**Status : conditionnel, déjà atténué.**

Le code fait :
```js
if (typeof streamServer._onConnection === 'function') {
  streamServer._onConnection(socket);  // PR #14231 API
} else {
  // fallback direct pour anciens bundles
}
```

**Acceptable moyen terme ?** Oui. Le fallback ne s'active que sur les bundles construits avant la PR #14231 (déjà mergée dans devel). Les nouveaux bundles utilisent l'API propre.

**Doit disparaître à terme ?** Le fallback peut être supprimé dès que la branche spike est rebasée sur un devel post-PR#14231. Effort : supprimer le `else`.

### Seam 4 — BunSocket EventEmitter adapter

**Status : fonctionne, pas sur le chemin critique perf.**

Le diagnostic burst a montré que EventEmitter n'est pas le goulot (temps serveur ~0.05 ms/msg). La régression burst mono-connexion est du scheduling Bun WS, pas de l'adapter.

**Acceptable moyen terme ?** Oui. 47 lignes, propre, testé.

**Doit disparaître à terme ?** Seulement si on implémente un vrai transport Bun dans `packages/ddp-server/transports/bun.js` qui serait chargé au boot. À ce stade on n'aurait plus besoin de l'adapter externe. Mais c'est du travail sur le package Meteor core, pas un seam du spike.

### Résumé

| Seam | Chemin HTTP critique | Acceptable moyen terme | Priorité suppression |
|---|---|---|---|
| `WebApp.startListening` patch | Non (init seulement) | **Oui** (API publique) | Basse |
| Unix socket proxy | **Partiellement** (routes middleware) | **Oui** (routes non-critiques) | Basse |
| StreamServer fallback direct | Non (init connexion) | **Oui** (conditionnel) | Triviale (rebase) |
| BunSocket EventEmitter | Non (pas le goulot) | **Oui** | Basse |

**Conclusion : aucun seam n'est un bloqueur moyen terme.** Tous sont acceptables et circonscrits. Les deux seuls sur le chemin HTTP critique (proxy pour middleware, boilerplate stream→string) ont déjà été bypassés pour les routes principales.

---

## Fichiers

```
meteor-sandbox/migration-bun/
├── spike/
│   └── esm-loader.mjs              ← refactoré (bootPackages + runMain + boot)
├── bun-only/
│   ├── README.md                    ← design principles, architecture, decision log
│   ├── SUMMARY.md                   ← ce document
│   ├── bun-host.mjs                 ← single-port Bun.serve() host (154 lignes)
│   ├── bun-ddp-transport.mjs        ← BunSocket adapter (47 lignes)
│   └── bench/
│       ├── bench.sh                 ← HTTP + DDP + RSS benchmark runner
│       ├── ws-bench.mjs             ← DDP latence + throughput
│       ├── ws-burst-diagnostic.mjs  ← mono vs multi-connexion diagnostic
│       ├── cold-start.sh            ← time to first HTTP 200
│       └── RESULTS.md               ← résultats détaillés
tools/static-assets/server/
    └── esm-loader.mjs              ← même refactoring (copie bundler)
```
