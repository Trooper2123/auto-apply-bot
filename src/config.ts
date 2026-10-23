import type { AgenteConfig } from './types.js';

export interface ConfigExecucao extends AgenteConfig {
  executionMode: 'ASSISTED' | 'SUPERVISED_AUTONOMOUS';
  liveSubmissionEnabled: false;
}

export function validarEnv(env: NodeJS.ProcessEnv = process.env): ConfigExecucao {
  function booleano(nome: string, padrao: boolean): boolean {
    const valor = env[nome] ?? String(padrao);
    if (valor !== 'true' && valor !== 'false') throw new Error(`${nome} deve ser true ou false.`);
    return valor === 'true';
  }
  function numero(nome: string, padrao: number, min: number, max = Number.MAX_SAFE_INTEGER, inteiro = true): number {
    const texto = env[nome] ?? String(padrao);
    const valor = texto.trim() === '' ? NaN : Number(texto);
    if (!Number.isFinite(valor) || valor < min || valor > max || (inteiro && !Number.isInteger(valor))) {
      throw new Error(`${nome} deve ser ${inteiro ? 'inteiro' : 'numero'} entre ${min} e ${max}.`);
    }
    return valor;
  }
  function url(nome: string, padrao: string): string {
    const valor = env[nome] || padrao;
    let parsed: URL;
    try { parsed = new URL(valor); } catch { throw new Error(`${nome} deve ser uma URL HTTP(S).`); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error(`${nome} deve ser uma URL HTTP(S) sem credenciais.`);
    }
    return valor;
  }

  const dryRun = booleano('DRY_RUN', true);
  if (booleano('LIVE_SUBMISSION_ENABLED', false) || !dryRun) {
    throw new Error('PR-01 permite somente DRY_RUN=true e LIVE_SUBMISSION_ENABLED=false; gateway de submissao pendente.');
  }
  const executionMode = env.EXECUTION_MODE ?? 'SUPERVISED_AUTONOMOUS';
  if (executionMode !== 'ASSISTED' && executionMode !== 'SUPERVISED_AUTONOMOUS') {
    throw new Error('EXECUTION_MODE deve ser ASSISTED ou SUPERVISED_AUTONOMOUS.');
  }
  const delayMin = numero('DELAY_MIN', 2000, 0);
  const delayMax = numero('DELAY_MAX', 5000, delayMin);
  const cronHorario = env.CRON_HORARIO ?? '09:00';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cronHorario)) throw new Error('CRON_HORARIO deve usar HH:MM.');
  const llmAuxProvider = env.LLM_AUX_PROVIDER || 'gemini';
  if (!['gemini', 'ollama', 'openai'].includes(llmAuxProvider)) throw new Error('LLM_AUX_PROVIDER invalido.');

  return {
    executionMode, liveSubmissionEnabled: false, dryRun,
    geminiApiKey: env.GEMINI_API_KEY || '',
    geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
    cdpEndpoint: url('CDP_ENDPOINT', 'http://127.0.0.1:9222'),
    limiteDiario: numero('LIMITE_DIARIO', 10, 1),
    maxPorExecucao: numero('MAX_POR_EXECUCAO', 5, 1),
    delayMin, delayMax,
    scoreMinimo: numero('SCORE_MINIMO', 6, 1, 10),
    custoMaxUsd: numero('CUSTO_MAX_USD', 0, 0, Number.MAX_SAFE_INTEGER, false),
    dashboardPort: numero('DASHBOARD_PORT', 3000, 1, 65535),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: env.TELEGRAM_CHAT_ID || '',
    smtpHost: env.SMTP_HOST || '',
    smtpPort: numero('SMTP_PORT', 587, 1, 65535),
    smtpUser: env.SMTP_USER || '', smtpPass: env.SMTP_PASS || '',
    emailDestinatario: env.EMAIL_DESTINATARIO || '',
    cronAtivo: booleano('CRON_ATIVO', false), cronHorario,
    llmAuxProvider,
    llmAuxModel: env.LLM_AUX_MODEL || env.GEMINI_MODEL || 'gemini-2.5-flash',
    ollamaUrl: url('OLLAMA_URL', 'http://localhost:11434'),
    openaiApiKey: env.OPENAI_API_KEY || '',
    openaiBaseUrl: url('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
  };
}
