import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { converterHTMLParaPDF, detectarChrome } from '../src/chrome';

afterEach(() => vi.unstubAllEnvs());

describe('Chrome e conversao PDF', () => {
  it('falha claramente para CHROME_PATH inexistente', () => {
    vi.stubEnv('CHROME_PATH', path.join(tmpdir(), 'chrome-inexistente-fixture.exe'));
    expect(detectarChrome).toThrow(/CHROME_PATH/);
  });

  it('aceita caminho explicito existente', () => {
    vi.stubEnv('CHROME_PATH', process.execPath);
    expect(detectarChrome()).toBe(process.execPath);
  });

  it('launcher rejeita CDP externo antes de abrir navegador', () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/abrir-chrome.ts'], {
      cwd: root,
      env: { ...process.env, CDP_ENDPOINT: 'https://example.invalid:9222', DOTENV_CONFIG_PATH: path.join(root, 'tests/fixtures/sem-env') },
      encoding: 'utf8', timeout: 10000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('npm run chrome exige CDP_ENDPOINT');
  });

  it('rejeita entrada ausente antes de iniciar o browser', async () => {
    await expect(converterHTMLParaPDF('fixture-ausente.html', 'fixture-ausente.pdf')).rejects.toThrow();
  });

  it('nao retorna PDF antigo quando o conversor falha', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'auto-apply-pdf-falha-'));
    const html = path.join(dir, 'fixture.html');
    const pdf = path.join(dir, 'fixture.pdf');
    writeFileSync(html, '<!doctype html><title>Fixture</title>');
    writeFileSync(pdf, '%PDF-antigo');
    vi.stubEnv('CHROME_PATH', process.execPath);
    try {
      await expect(converterHTMLParaPDF(html, pdf)).rejects.toThrow(/Falha ao converter/);
      expect(existsSync(pdf)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
