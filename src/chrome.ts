import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export function detectarChrome(): string {
  if (process.env.CHROME_PATH) {
    if (!existsSync(process.env.CHROME_PATH) || !statSync(process.env.CHROME_PATH).isFile()) {
      throw new Error('CHROME_PATH nao aponta para um executavel existente.');
    }
    return process.env.CHROME_PATH;
  }
  const candidatos = process.platform === 'win32'
    ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter((base): base is string => !!base)
      .map(base => path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const candidato of candidatos) {
    if (path.isAbsolute(candidato)) {
      if (existsSync(candidato)) return candidato;
    } else {
      try {
        execFileSync(candidato, ['--version'], { stdio: 'ignore', timeout: 5000 });
        return candidato;
      } catch { /* Tenta o proximo executavel. */ }
    }
  }
  throw new Error('Chrome nao encontrado. Instale o Google Chrome ou defina CHROME_PATH.');
}

export async function converterHTMLParaPDF(caminhoHTML: string, caminhoPDF: string): Promise<void> {
  if (!statSync(caminhoHTML).isFile()) throw new Error('HTML de entrada deve ser um arquivo.');
  const chrome = detectarChrome();
  const perfilTemporario = mkdtempSync(path.join(tmpdir(), 'auto-apply-pdf-'));
  // Remove saida anterior para nunca aceitar um PDF antigo depois de uma falha.
  rmSync(caminhoPDF, { force: true });
  try {
    await promisify(execFile)(chrome, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-component-update', '--disable-sync',
      `--user-data-dir=${perfilTemporario}`,
      `--print-to-pdf=${path.resolve(caminhoPDF)}`, '--no-pdf-header-footer',
      pathToFileURL(path.resolve(caminhoHTML)).href,
    ], { timeout: 30000, windowsHide: true });
    if (readFileSync(caminhoPDF).subarray(0, 5).toString() !== '%PDF-') {
      throw new Error('Chrome nao produziu um PDF valido.');
    }
  } catch (error) {
    rmSync(caminhoPDF, { force: true });
    throw new Error('Falha ao converter HTML para PDF. Verifique o Chrome e as permissoes de escrita.', { cause: error });
  } finally {
    rmSync(perfilTemporario, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
