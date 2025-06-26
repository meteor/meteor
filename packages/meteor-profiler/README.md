# Meteor Profiler

Pacote simples para profiling CPU no Meteor usando o Node.js Inspector.

## Instalação

```bash
meteor add meteor-profiler
```

## Funcionalidades

- **Profiling Hierárquico**: Rastreie o tempo gasto em diferentes partes do código com estrutura hierárquica
- **Profiling de CPU**: Gere arquivos `.cpuprofile` para análise detalhada no Chrome DevTools
- **Suporte a Async/Await**: Funciona com funções síncronas e assíncronas
- **Relatórios Detalhados**: Visualize onde o tempo está sendo gasto em sua aplicação
- **Configuração por Variáveis de Ambiente**: Controle total através de variáveis de ambiente

## Uso Básico

### Profiling Simples

```javascript
import { Profile } from 'meteor/meteor-profiler';

// Envolva uma função para profiling
const myFunction = Profile('myFunction', function(data) {
  // sua lógica aqui
  return processData(data);
});

// Ou use Profile.time para profiling inline
function myMethod() {
  return Profile.time('myMethod', () => {
    // código a ser perfilado
    return doSomething();
  });
}
```

### Profiling com Sessão

```javascript
import { Profile } from 'meteor/meteor-profiler';

// Execute uma sessão completa de profiling
Profile.run('myOperation', () => {
  // Todo código aqui será perfilado
  const result1 = Profile.time('step1', () => step1());
  const result2 = Profile.time('step2', () => step2());
  return combineResults(result1, result2);
});
```

### Nomes Dinâmicos de Bucket

```javascript
const processUser = Profile(function(userId) {
  return `processUser:${userId}`;
}, function(userId) {
  // processa usuário específico
  return Users.findOne(userId);
});
```

## Configuração

### Profiling Básico

Ative o profiling básico definindo a variável de ambiente:

```bash
METEOR_PROFILE=1 meteor
```

### Profiling Avançado com Inspector

Para gerar arquivos `.cpuprofile` para análise no Chrome DevTools:

```bash
METEOR_INSPECT=methodName,otherMethod meteor
```

### Variáveis de Ambiente Completas

```bash
# Ativa profiling básico (tempo mínimo em ms para aparecer nos relatórios)
METEOR_PROFILE=100

# Ativa inspector profiling para métodos específicos
METEOR_INSPECT=bundler.bundle,compile.js

# Define contexto para identificação dos arquivos
METEOR_INSPECT_CONTEXT=development

# Define diretório de saída (padrão: .meteor/profiling)
METEOR_INSPECT_OUTPUT=/path/to/profiles

# Intervalo de amostragem em ms (menor = mais detalhes, mais memória)
METEOR_INSPECT_INTERVAL=1000

# Tamanho máximo do profile em MB
METEOR_INSPECT_MAX_SIZE=2000
```

## Analisando Resultados

### Relatório Hierárquico

O profiler gera um relatório hierárquico mostrando onde o tempo foi gasto:

```
| myOperation: 1,234 ms (1)
| ├─ step1: 800 ms (1)
| │  ├─ database.query: 600 ms (3)
| │  └─ other step1: 200 ms
| ├─ step2: 300 ms (1)
| └─ other myOperation: 134 ms
```

### Relatório de Folhas

Mostra o tempo total gasto em operações específicas:

```
| Top leaves:
| database.query...........................600 ms (3)
| template.render..........................350 ms (12)
| network.request..........................280 ms (5)
```

### Arquivos .cpuprofile

Os arquivos gerados podem ser abertos no Chrome DevTools:

1. Abra o Chrome DevTools
2. Vá para a aba "Performance" ou "Profiler"
3. Clique em "Load Profile"
4. Selecione o arquivo `.cpuprofile`

## Exemplos de Uso

### Em Métodos Meteor

```javascript
import { Meteor } from 'meteor/meteor';
import { Profile } from 'meteor/meteor-profiler';

Meteor.methods({
  'users.process': Profile('users.process', function(userId) {
    const user = Profile.time('users.fetch', () => {
      return Meteor.users.findOne(userId);
    });
    
    const result = Profile.time('users.calculate', () => {
      return calculateUserStats(user);
    });
    
    Profile.time('users.save', () => {
      Meteor.users.update(userId, { $set: { stats: result } });
    });
    
    return result;
  })
});
```

### Em Publications

```javascript
import { Meteor } from 'meteor/meteor';
import { Profile } from 'meteor/meteor-profiler';

Meteor.publish('userData', Profile('pub.userData', function(userId) {
  return Profile.time('userData.query', () => {
    return Meteor.users.find({ _id: userId });
  });
}));
```

### Com Async/Await

```javascript
import { Profile } from 'meteor/meteor-profiler';

const fetchExternalData = Profile('fetchExternal', async function(url) {
  const response = await Profile.time('http.request', async () => {
    return fetch(url);
  });
  
  return await Profile.time('response.json', async () => {
    return response.json();
  });
});
```

## Dicas de Performance

1. **Use filtros apropriados**: Configure `METEOR_PROFILE` com um valor mínimo adequado (ex: 100ms) para evitar ruído
2. **Limite o inspector profiling**: Use `METEOR_INSPECT` apenas para métodos específicos que você quer analisar em detalhes
3. **Ajuste o intervalo**: Para análises de longa duração, aumente `METEOR_INSPECT_INTERVAL` para reduzir uso de memória
4. **Monitore o tamanho**: Profiles muito grandes podem causar problemas de memória; ajuste `METEOR_INSPECT_MAX_SIZE`

## Limitações

- O profiling com Inspector (`.cpuprofile`) só funciona no servidor
- Profiles muito grandes podem consumir muita memória
- O overhead do profiling pode afetar a performance em loops muito apertados

## Desenvolvimento

Para contribuir com o pacote:

```bash
# Clone o repositório Meteor
git clone https://github.com/meteor/meteor.git

# O pacote está em packages/meteor-profiler
cd meteor/packages/meteor-profiler

# Execute os testes
meteor test-packages ./
```

## Licença

Este pacote é parte do projeto Meteor e está licenciado sob a mesma licença MIT.
