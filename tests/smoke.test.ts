import { afterAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { converterHTMLParaPDF, detectarChrome } from '../src/chrome';
import { inicializarBanco, fecharBanco, registrarCandidatura, verificarJaAplicou } from '../src/database';
import { conectarPlaywrightMCP, desconectarMCP } from '../src/mcp-client';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const temporario = mkdtempSync(path.join(tmpdir(), 'auto-apply-smoke-'));
afterAll(() => rmSync(temporario, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

describe('smoke local sem LLM, credenciais ou portais reais', () => {
  it('abre SQLite nativo, persiste simulacao e detecta duplicidade', () => {
    inicializarBanco(path.join(temporario, 'data', 'smoke.db'));
    try {
      const vaga = { plataforma: 'fixture', titulo_vaga: 'Java Pleno', empresa: 'Fixture',
        url: 'http://127.0.0.1/fixture', mensagem_enviada: 0, status: 'dry-run', score: 8 };
      expect(registrarCandidatura(vaga)).toBe(true);
      expect(registrarCandidatura(vaga)).toBe(false);
      expect(verificarJaAplicou(vaga.url)).toBe(true);
    } finally { fecharBanco(); }
  });

  it('inicia MCP local e lista capacidades sem abrir navegador', async () => {
    try {
      const client = await conectarPlaywrightMCP('http://127.0.0.1:1', false);
      const { tools } = await client.listTools();
      expect(tools.some(tool => tool.name === 'browser_snapshot')).toBe(true);
      expect(tools.some(tool => tool.name === 'browser_click')).toBe(true);
    } finally { await desconectarMCP(); }
  }, 20000);

  it('le portal ficticio em loopback sem POST de candidatura', async () => {
    let envios = 0;
    const server = createServer((req, res) => {
      if (req.method === 'POST') { envios++; res.writeHead(405); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(path.join(fixtures, 'portal-local.html')));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Servidor local sem porta.');
      const response = await fetch(`http://127.0.0.1:${address.port}`);
      expect(await response.text()).toContain('Backend Java Pleno');
      expect(envios).toBe(0);
      // Apenas baseline HTTP: nao comprova o isolamento do agente exigido no PR-04.
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it('gera PDF real com Chrome em caminho com espacos, acentos e #', async () => {
    expect(detectarChrome()).toBeTruthy();
    const html = path.join(temporario, 'currículo local #1.html');
    const pdf = path.join(temporario, 'currículo local #1.pdf');
    copyFileSync(path.join(fixtures, 'curriculo-local.html'), html);
    await converterHTMLParaPDF(html, pdf);
    const bytes = readFileSync(pdf);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.toString('latin1')).toContain('%%EOF');
  }, 40000);
});
