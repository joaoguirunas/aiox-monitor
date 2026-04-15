/**
 * db-path.test.ts — JOB-049
 *
 * Testa o override de path via TEST_DB_PATH em src/lib/db.ts.
 *
 * Cobertura:
 *   resolveDbPath()
 *     ✓ Retorna default quando TEST_DB_PATH não está definido
 *     ✓ Retorna o path customizado quando TEST_DB_PATH está setado
 *     ✓ Resolve paths relativos para absolutos via path.resolve()
 *     ✓ Lança erro descritivo quando TEST_DB_PATH é string vazia
 *     ✓ Lança erro descritivo quando TEST_DB_PATH é só espaços
 *
 *   openDbAt(path)
 *     ✓ Cria o arquivo SQLite no path indicado
 *     ✓ O DB aberto tem o schema inicializado (tabela projects existe)
 *     ✓ Cria diretórios intermediários se não existirem
 *
 *   Integração TEST_DB_PATH → openDbAt
 *     ✓ resolveDbPath() + openDbAt() resultam em DB no path esperado
 *
 * Notas de design:
 *   - Importamos `resolveDbPath` e `openDbAt` sem importar `db` (singleton),
 *     evitando o side-effect de criação do singleton durante os testes.
 *   - Cada teste de openDbAt usa um diretório temporário único (os.tmpdir()).
 *   - O env var TEST_DB_PATH é salvo antes e restaurado após cada teste
 *     que o manipula para não vazar estado entre testes.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Importar APENAS as funções utilitárias — NÃO o `db` singleton —
// para evitar o side-effect de abertura do DB de produção/dev.
import { resolveDbPath, openDbAt } from '../src/lib/db';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Cria um diretório temporário único para cada teste. */
function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aiox-db-path-test-'));
}

/** Salva e restaura TEST_DB_PATH ao redor de um bloco de código. */
function withEnv(value: string | undefined, fn: () => void): void {
  const saved = process.env['TEST_DB_PATH'];
  if (value === undefined) {
    delete process.env['TEST_DB_PATH'];
  } else {
    process.env['TEST_DB_PATH'] = value;
  }
  try {
    fn();
  } finally {
    if (saved === undefined) {
      delete process.env['TEST_DB_PATH'];
    } else {
      process.env['TEST_DB_PATH'] = saved;
    }
  }
}

// ─── resolveDbPath() ─────────────────────────────────────────────────────────

describe('resolveDbPath()', () => {
  it('retorna path default (data/monitor.db) quando TEST_DB_PATH não está definido', () => {
    withEnv(undefined, () => {
      const p = resolveDbPath();
      assert.ok(
        p.endsWith(path.join('data', 'monitor.db')),
        `Esperado suffix 'data/monitor.db', recebeu: ${p}`,
      );
    });
  });

  it('retorna o path customizado quando TEST_DB_PATH está setado', () => {
    const custom = '/tmp/my-test.db';
    withEnv(custom, () => {
      assert.equal(resolveDbPath(), path.resolve(custom));
    });
  });

  it('resolve path relativo para absoluto via path.resolve()', () => {
    withEnv('relative/test.db', () => {
      const resolved = resolveDbPath();
      assert.ok(path.isAbsolute(resolved), `Deve ser absoluto, recebeu: ${resolved}`);
      assert.ok(resolved.endsWith(path.join('relative', 'test.db')));
    });
  });

  it('lança erro descritivo quando TEST_DB_PATH é string vazia', () => {
    withEnv('', () => {
      assert.throws(
        () => resolveDbPath(),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(
            err.message.includes('TEST_DB_PATH is set but empty'),
            `Mensagem inesperada: ${err.message}`,
          );
          return true;
        },
      );
    });
  });

  it('lança erro descritivo quando TEST_DB_PATH contém apenas espaços', () => {
    withEnv('   ', () => {
      assert.throws(
        () => resolveDbPath(),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('TEST_DB_PATH is set but empty'));
          return true;
        },
      );
    });
  });
});

// ─── openDbAt() ──────────────────────────────────────────────────────────────

describe('openDbAt()', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    // Limpa diretórios temporários criados pelos testes
    for (const dir of tempDirs.splice(0)) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('cria o arquivo SQLite no path indicado', () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    const dbPath = path.join(dir, 'test.db');

    const instance = openDbAt(dbPath);
    instance.close();

    assert.ok(fs.existsSync(dbPath), `DB não foi criado em: ${dbPath}`);
  });

  it('o DB aberto tem o schema inicializado (tabela projects existe)', () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    const dbPath = path.join(dir, 'schema-check.db');

    const instance = openDbAt(dbPath);

    const row = instance
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`,
      )
      .get() as { name: string } | undefined;

    instance.close();

    assert.ok(row !== undefined, 'Tabela projects não encontrada após initSchema');
    assert.equal(row.name, 'projects');
  });

  it('cria diretórios intermediários se não existirem', () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    const nested = path.join(dir, 'a', 'b', 'c', 'deep.db');

    assert.ok(!fs.existsSync(path.dirname(nested)), 'Diretório não devia existir antes');

    const instance = openDbAt(nested);
    instance.close();

    assert.ok(fs.existsSync(nested), `DB aninhado não foi criado em: ${nested}`);
  });

  it('retorna uma instância DatabaseSync funcional', () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    const dbPath = path.join(dir, 'functional.db');

    const instance = openDbAt(dbPath);

    // Verifica que conseguimos executar SQL básico
    const result = instance
      .prepare('SELECT 42 AS answer')
      .get() as { answer: number };

    instance.close();

    assert.equal(result.answer, 42);
  });
});

// ─── Integração: TEST_DB_PATH → openDbAt ─────────────────────────────────────

describe('Integração TEST_DB_PATH → openDbAt', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('resolveDbPath() + openDbAt() resultam em DB no path esperado', () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    const expectedPath = path.join(dir, 'e2e-fixtures.db');

    withEnv(expectedPath, () => {
      const resolvedPath = resolveDbPath();
      assert.equal(resolvedPath, path.resolve(expectedPath));

      const instance = openDbAt(resolvedPath);
      instance.close();

      assert.ok(
        fs.existsSync(resolvedPath),
        `DB não existe no path resolvido: ${resolvedPath}`,
      );
    });
  });

  it('TEST_DB_PATH absoluto é usado literalmente (sem modificação de cwd)', () => {
    const dir = tmpDir();
    tempDirs.push(dir);
    const absolutePath = path.join(dir, 'absolute.db');

    withEnv(absolutePath, () => {
      const resolved = resolveDbPath();
      // path.resolve() de um path já absoluto não muda nada
      assert.equal(resolved, absolutePath);
    });
  });
});
