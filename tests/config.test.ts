import { describe, expect, it } from 'vitest';
import { validarEnv } from '../src/config';

const ambiente = { GEMINI_API_KEY: 'fixture-sem-credencial-real' };

describe('configuracao PR-01', () => {
  it('mantem simulacao e live desabilitado por padrao', () => {
    const config = validarEnv(ambiente);
    expect(config.dryRun).toBe(true);
    expect(config.liveSubmissionEnabled).toBe(false);
    expect(config.executionMode).toBe('SUPERVISED_AUTONOMOUS');
  });

  it.each([
    ['DRY_RUN', 'false'], ['DRY_RUN', 'TRUE'], ['LIVE_SUBMISSION_ENABLED', 'true'],
    ['LIMITE_DIARIO', 'NaN'], ['MAX_POR_EXECUCAO', '-1'], ['DELAY_MIN', '1.5'],
    ['DELAY_MAX', '1'], ['CUSTO_MAX_USD', 'Infinity'], ['DASHBOARD_PORT', '65536'],
    ['SCORE_MINIMO', '11'], ['SMTP_PORT', ''], ['CRON_ATIVO', 'yes'],
    ['CRON_HORARIO', '25:00'], ['CDP_ENDPOINT', 'file:///tmp/test'],
    ['OPENAI_BASE_URL', 'https://usuario:segredo@example.invalid'],
    ['LLM_AUX_PROVIDER', 'invalido'], ['EXECUTION_MODE', 'invalido'],
  ])('rejeita %s invalido sem reproduzir o valor', (nome, valor) => {
    expect(() => validarEnv({ ...ambiente, [nome]: valor })).toThrow();
  });

  it('simula sem chave e rejeita custo invalido sem expor valores', () => {
    expect(validarEnv({}).geminiApiKey).toBe('');
    expect(() => validarEnv({ ...ambiente, CUSTO_MAX_USD: '-1' })).toThrow(/CUSTO_MAX_USD/);
  });
});
