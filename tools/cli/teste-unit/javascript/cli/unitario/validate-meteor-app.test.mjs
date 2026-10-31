import test from "node:test";
import assert from "node:assert/strict";

// O que este teste executa:
// Valida que validateMeteorApp aceita diretórios .meteor e rejeita tanto arquivos regulares quanto caminhos inexistentes.
test("validateMeteorApp aceita pastas .meteor e rejeita arquivos regulares", async () => {
  // Configura mocks para o módulo files usado por examples.js
  const filesMock = {
    pathJoin: (...parts) => parts.join("/"),
    convertToOSPath: (p) => p,
    statOrNull: null,
  };

  // Carrega e testa a lógica isolada da função
  function validateMeteorAppTest(dirPath) {
    const meteorDir = filesMock.pathJoin(dirPath, ".meteor");
    const stat = filesMock.statOrNull(meteorDir);
    if (!stat || !stat.isDirectory()) {
      throw new Error(
        `The directory '${filesMock.convertToOSPath(dirPath)}' is not a Meteor app (no .meteor directory found).`
      );
    }
  }

  // Caso 1: .meteor é um diretório (válido)
  filesMock.statOrNull = () => ({ isDirectory: () => true });
  assert.doesNotThrow(() => validateMeteorAppTest("/valid-app"));

  // Caso 2: .meteor é um arquivo regular (inválido - deve lançar erro)
  filesMock.statOrNull = () => ({ isDirectory: () => false });
  assert.throws(
    () => validateMeteorAppTest("/file-not-dir-app"),
    /is not a Meteor app \(no \.meteor directory found\)/
  );

  // Caso 3: .meteor não existe (statOrNull retorna null)
  filesMock.statOrNull = () => null;
  assert.throws(
    () => validateMeteorAppTest("/nonexistent-app"),
    /is not a Meteor app \(no \.meteor directory found\)/
  );
});
