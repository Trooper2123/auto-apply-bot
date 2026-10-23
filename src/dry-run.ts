import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { pontuarVaga, type DadosVaga, type PerfilFit } from './scoring.js';
import type { NivelIngles } from './types.js';

export interface CenarioDryRun {
  perfil: PerfilFit;
  vagas: Array<DadosVaga & { id: string; titulo: string; empresa: string }>;
  acoes: Array<{ nome: string; args: Record<string, unknown> }>;
}

function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Cenario dry-run invalido.');
  return valor as Record<string, unknown>;
}

function texto(valor: unknown): string {
  if (typeof valor !== 'string' || valor.length > 20000) throw new Error('Texto do cenario dry-run invalido.');
  return valor;
}

function listaTexto(valor: unknown): string[] {
  if (!Array.isArray(valor) || valor.length > 100) throw new Error('Lista do cenario dry-run invalida.');
  return valor.map(texto);
}

function dadosVaga(valor: unknown): DadosVaga {
  const dados = objeto(valor);
  return Object.fromEntries(['tecnologias_pedidas', 'senioridade', 'localizacao', 'modelo_trabalho', 'idioma_exigido']
    .filter(chave => dados[chave] !== undefined).map(chave => [chave, texto(dados[chave])]));
}

export function validarCenarioDryRun(valor: unknown): CenarioDryRun {
  const dados = objeto(valor);
  const perfil = objeto(dados.perfil);
  const nivelIngles = perfil.nivelIngles === undefined ? undefined : texto(perfil.nivelIngles);
  if (nivelIngles !== undefined && !['nenhum', 'basico', 'intermediario', 'avancado', 'fluente'].includes(nivelIngles)) {
    throw new Error('Nivel de ingles do cenario dry-run invalido.');
  }
  if (!Array.isArray(dados.vagas) || dados.vagas.length > 100 || !Array.isArray(dados.acoes) || dados.acoes.length > 100) {
    throw new Error('Cenario dry-run deve ter no maximo 100 vagas e 100 acoes.');
  }
  return {
    perfil: {
      stackPrincipal: listaTexto(perfil.stackPrincipal), cidade: texto(perfil.cidade),
      modelosAceitos: listaTexto(perfil.modelosAceitos),
      nivelIngles: nivelIngles as NivelIngles | undefined,
    },
    vagas: dados.vagas.map(valor => {
      const vaga = objeto(valor);
      return { ...dadosVaga(vaga), id: texto(vaga.id), titulo: texto(vaga.titulo), empresa: texto(vaga.empresa) };
    }),
    acoes: dados.acoes.map(valor => {
      const acao = objeto(valor);
      return { nome: texto(acao.nome), args: objeto(acao.args) };
    }),
  };
}

// Allowlist fechada: nenhum cliente browser, fetch, LLM ou executor generico nesta rota.
export function executarAcaoDryRun(cenario: CenarioDryRun, nome: string, args: Record<string, unknown>, scoreMinimo: number) {
  if (nome === 'pontuar_vaga') return pontuarVaga(dadosVaga(args), cenario.perfil, scoreMinimo);
  return {
    permitido: false,
    codigo: nome === 'confirmar_envio' ? 'DRY_RUN_ENVIO_BLOQUEADO' : 'DRY_RUN_CAPACIDADE_INDISPONIVEL',
  };
}

export async function executarDryRunIsolado(scoreMinimo: number): Promise<string> {
  const emTypeScript = import.meta.url.endsWith('.ts');
  const worker = fileURLToPath(new URL(`./dry-run-worker.${emTypeScript ? 'ts' : 'js'}`, import.meta.url));
  const entrada = fileURLToPath(new URL('../config/dry-run.example.json', import.meta.url));
  const banco = path.resolve('data', 'simulacoes.db');
  // Nao herda chaves, NODE_OPTIONS, perfis de browser nem configuracao de notificacoes.
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'TEMP', 'TMP', 'USERNAME', 'USERDOMAIN', 'USERPROFILE'].flatMap(nome =>
    process.env[nome] === undefined ? [] : [[nome, process.env[nome]!]]));
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [
      ...(emTypeScript ? ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href] : []),
      worker, entrada, banco, String(scoreMinimo),
    ], { env, timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true }, (erro, stdout) => {
      if (erro) reject(new Error('Simulacao local falhou; nenhum envio foi autorizado.'));
      else resolve(stdout.trim());
    });
  });
}
