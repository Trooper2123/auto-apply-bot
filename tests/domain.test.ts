import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RepositorioSupervisionado } from '../src/domain/repository.js';
import { normalizarVaga, sha256 } from '../src/domain/jobs.js';
import { calcularMatch } from '../src/domain/matching.js';
import { avaliarPolitica } from '../src/domain/policy.js';
import { gerarDocumentoComProveniencia } from '../src/domain/provenance.js';
import { GatewayBloqueado } from '../src/domain/gateway.js';

function setup() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'supervised-'));
  const repo = RepositorioSupervisionado.abrir(path.join(dir, 'state.db'));
  const job = normalizarVaga({ platform: 'CORPORATE_ATS', externalId: '42', canonicalUrl: 'https://careers.example/jobs/42?utm_source=fixture', company: 'Acme', title: 'Backend Java Pleno', description: 'Java Kotlin Spring Boot AWS PostgreSQL vaga pleno backend', location: 'Brasil', workMode: 'REMOTE', discoveredAt: new Date().toISOString() });
  const close = () => { repo.fechar(); rmSync(dir, { recursive: true, force: true }); };
  return { repo, job, close };
}
describe('domain supervised flow', () => {
  it('normalizes URL, explains Java stack match and denies unvalidated adapters', () => {
    const { job, repo, close } = setup();
    try {
      expect(job.canonicalUrl).toBe('https://careers.example/jobs/42');
      const match = calcularMatch(job);
      expect(match.breakdown.technology).toBe(1);
      expect(match.algorithmVersion).toBe('java-backend-v1');
      const prepared = { id: 'prep-1', jobId: job.id, candidateProfileVersion: sha256('profile'), resumeSha256: sha256('resume'), answersSha256: sha256('answers'), formFingerprint: sha256('form'), documentPath: 'local/cv.pdf', answerEvidence: {} };
      expect(avaliarPolitica(job, match, prepared).action).toBe('DENY');
      expect(avaliarPolitica(job, match, prepared).action).toBe('DENY');
      const linkedin = { ...job, id: 'li-1', platform: 'LINKEDIN' as const };
      expect(avaliarPolitica(linkedin, { ...match, jobId: 'li-1' }, { ...prepared, jobId: 'li-1' }).action).toBe('DENY');
      const gupy = { ...job, id: 'gupy-1', platform: 'GUPY' as const };
      expect(avaliarPolitica(gupy, { ...match, jobId: gupy.id, score: 7, unknowns: ['SALARY_UNKNOWN'] }, { ...prepared, jobId: gupy.id }).action).toBe('REVIEW_ONLY');
      expect(repo.registrarVaga(job).duplicate).toBe(false);
      expect(repo.registrarVaga(job).duplicate).toBe(true);
    } finally { close(); }
  });
  it('persists state transitions, approves exact content and invalidates approval on edits', () => {
    const { repo, job, close } = setup();
    try {
      repo.registrarVaga(job);
      const app = repo.criarCandidatura(job.id);
      const match = calcularMatch(job);
      repo.salvarMatching(app.id, match);
      const prepared = { id: 'prep-1', jobId: job.id, candidateProfileVersion: sha256('profile'), resumeSha256: sha256('resume'), answersSha256: sha256('answers'), formFingerprint: sha256('form'), documentPath: 'local/cv.pdf', answerEvidence: {} };
      repo.salvarPreparacao(app.id, prepared);
      const review = repo.enfileirarRevisao(app.id, ['HUMAN_APPROVAL_REQUIRED']);
      repo.decidirRevisao(review, 'APPROVE', 'reviewer-1');
      const changed = { ...prepared, resumeSha256: sha256('changed') };
      repo.salvarPreparacao(app.id, changed);
      expect(() => repo.registrarAutorizacao({ id: 'auth-1', applicationId: app.id, jobId: job.id, policyVersion: sha256('policy'), formFingerprint: changed.formFingerprint, resumeSha256: changed.resumeSha256, answersSha256: changed.answersSha256, scope: 'SINGLE_SUBMISSION', expiresAt: new Date(Date.now() + 60_000).toISOString(), grantedBy: 'HUMAN', grantedAt: new Date().toISOString() })).toThrow('AUTHORIZATION_REQUIRES_CURRENT_HUMAN_APPROVAL');
      expect(repo.obterCandidatura(app.id).state).toBe('PREPARED');
    } finally { close(); }
  });
  it('renders only approved factual fields and blocks gateway requests without a validated adapter', async () => {
    const doc = gerarDocumentoComProveniencia([{ key: 'skills', value: '<script>Java</script>', sourceId: 'resume:skills', approved: true }, { key: 'metrics', value: '200%', sourceId: 'model', approved: false }], ['skills', 'metrics']);
    expect(doc.html).not.toContain('<script>');
    expect(doc.unknowns).toEqual(['metrics']);
    const { repo, job, close } = setup();
    try {
      repo.registrarVaga(job);
      const app = repo.criarCandidatura(job.id);
      repo.transitionApplication(app.id, 'DISCOVERED', 'SKIPPED', { reasonCode: 'TEST_REDACTION', actor: 'reviewer@example.com', evidence: [{ kind: 'PROFILE', reference: 'https://private.example/cv?email=reviewer@example.com' }] });
      const event = repo.listarEventos(app.id)[1]!;
      expect(event.actor).not.toContain('reviewer@example.com');
      expect(event.metadata_json).not.toContain('reviewer@example.com');
      const gateway = new GatewayBloqueado(repo, { dryRun: false, liveEnabled: true, capabilityToken: 'local-token' });
      expect(await gateway.submit({ applicationId: app.id, authorizationId: 'auth-x', idempotencyKey: 'request-1', expectedFormFingerprint: sha256('form') }, 'wrong'))
        .toEqual({ status: 'BLOCKED', reason: 'CALLER_NOT_AUTHENTICATED' });
    } finally { close(); }
  });
});
