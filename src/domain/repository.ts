import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { authorizationSchema, evidenceSchema, idSchema, jobSchema, matchSchema, preparedSchema, stateSchema,
  type ApplicationState, type Authorization, type Job, type MatchResult, type PreparedApplication, type ReviewDecision } from './contracts.js';
import { transicoes, podeTransicionar } from './state-machine.js';
import { sha256, normalizarTexto } from './jobs.js';

const contextoSchema = z.object({
  reasonCode: z.string().regex(/^[A-Z0-9_:-]{1,200}$/), actor: z.string().min(1).max(200),
  confirmationRef: z.string().min(1).max(2000).optional(), evidence: z.array(evidenceSchema).max(100).optional(),
}).strict();
type Contexto = z.infer<typeof contextoSchema>;
export interface Application {
  id: string; job_id: string; state: ApplicationState; score: number | null;
  match_json: string | null; prepared_json: string | null; policy_version: string | null;
  resume_sha256: string | null; answers_sha256: string | null; form_fingerprint: string | null;
  candidate_profile_version: string | null; confirmation_ref: string | null;
}

const schema = `
CREATE TABLE jobs (
 id TEXT PRIMARY KEY, platform TEXT NOT NULL, external_id TEXT,
 canonical_url TEXT NOT NULL, company TEXT NOT NULL, title TEXT NOT NULL,
 description_hash TEXT NOT NULL, payload_json TEXT NOT NULL, discovered_at TEXT NOT NULL,
 mirror_key TEXT NOT NULL, UNIQUE(platform,canonical_url)
);
CREATE UNIQUE INDEX job_external_id ON jobs(platform,external_id) WHERE external_id IS NOT NULL;
CREATE INDEX job_mirror_key ON jobs(mirror_key);
CREATE TABLE applications (
 id TEXT PRIMARY KEY, job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id),
 state TEXT NOT NULL CHECK(state IN (${Object.keys(transicoes).map(s => `'${s}'`).join(',')})),
 score INTEGER CHECK(score BETWEEN 1 AND 10), match_json TEXT, prepared_json TEXT,
 candidate_profile_version TEXT, resume_sha256 TEXT, answers_sha256 TEXT,
 form_fingerprint TEXT, policy_version TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 submitted_at TEXT, confirmation_ref TEXT
);
CREATE TABLE allowed_transitions (from_state TEXT NOT NULL,to_state TEXT NOT NULL,PRIMARY KEY(from_state,to_state));
CREATE TRIGGER validate_application_transition BEFORE UPDATE OF state ON applications
 WHEN NEW.state != OLD.state AND NOT EXISTS(SELECT 1 FROM allowed_transitions WHERE from_state=OLD.state AND to_state=NEW.state)
 BEGIN SELECT RAISE(ABORT,'INVALID_TRANSITION'); END;
CREATE TABLE application_events (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 from_state TEXT, to_state TEXT NOT NULL, reason_code TEXT NOT NULL, actor TEXT NOT NULL,
 metadata_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TRIGGER immutable_events_update BEFORE UPDATE ON application_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_EVENT'); END;
CREATE TRIGGER immutable_events_delete BEFORE DELETE ON application_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_EVENT'); END;
CREATE TABLE authorizations (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id), job_id TEXT NOT NULL REFERENCES jobs(id),
 policy_version TEXT NOT NULL, form_fingerprint TEXT NOT NULL, resume_sha256 TEXT NOT NULL, answers_sha256 TEXT NOT NULL,
 granted_by TEXT NOT NULL CHECK(granted_by IN ('HUMAN','POLICY_ENGINE')), granted_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 consumed_at TEXT, revoked_at TEXT, UNIQUE(id,application_id)
);
CREATE TABLE execution_runs (
 id TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK(mode IN ('ASSISTED','SUPERVISED_AUTONOMOUS')),
 dry_run INTEGER NOT NULL CHECK(dry_run IN (0,1)), started_at TEXT NOT NULL, finished_at TEXT,
 status TEXT NOT NULL CHECK(status IN ('RUNNING','COMPLETED','FAILED','RECOVERED')),
 submissions_count INTEGER NOT NULL DEFAULT 0, estimated_cost_usd REAL NOT NULL DEFAULT 0,
 actual_cost_usd REAL NOT NULL DEFAULT 0
);
CREATE TABLE submission_attempts (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 authorization_id TEXT REFERENCES authorizations(id), idempotency_key TEXT NOT NULL UNIQUE,
 run_id TEXT NOT NULL REFERENCES execution_runs(id), state TEXT NOT NULL
 CHECK(state IN ('SIMULATED','RESERVED','IN_FLIGHT','UNKNOWN','CONFIRMED','BLOCKED')),
 quota_day TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT, confirmation_ref TEXT, evidence_json TEXT
);
CREATE UNIQUE INDEX one_active_submission ON submission_attempts(application_id)
 WHERE state IN ('RESERVED','IN_FLIGHT','UNKNOWN','CONFIRMED');
CREATE TABLE review_queue (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 reason_codes_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('PENDING','DECIDED')),
 requested_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT,
 decision TEXT CHECK(decision IN ('APPROVE','REJECT','REQUEST_CHANGES')), comment TEXT
);
CREATE UNIQUE INDEX one_pending_review ON review_queue(application_id) WHERE status='PENDING';
CREATE TABLE review_approvals (
 review_id TEXT PRIMARY KEY REFERENCES review_queue(id), application_id TEXT NOT NULL REFERENCES applications(id),
 candidate_profile_version TEXT NOT NULL, resume_sha256 TEXT NOT NULL, answers_sha256 TEXT NOT NULL,
 form_fingerprint TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE system_controls (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE execution_leases (name TEXT PRIMARY KEY,owner TEXT NOT NULL,expires_at TEXT NOT NULL,heartbeat_at TEXT NOT NULL);
CREATE TABLE llm_costs (
 id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES execution_runs(id),model TEXT NOT NULL,
 estimated_usd REAL NOT NULL CHECK(estimated_usd>=0),actual_usd REAL CHECK(actual_usd>=0),created_at TEXT NOT NULL
);
CREATE INDEX idx_application_events_app ON application_events(application_id,created_at);
CREATE INDEX idx_applications_state ON applications(state);
CREATE INDEX idx_review_queue_status ON review_queue(status);
`;

export class RepositorioSupervisionado {
  constructor(private readonly db: Database.Database) {
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.exec('CREATE TABLE IF NOT EXISTS supervised_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)');
    db.transaction(() => {
      const checksum = sha256(schema + JSON.stringify(transicoes));
      const existente = db.prepare('SELECT checksum FROM supervised_migrations WHERE version=1').get() as { checksum: string } | undefined;
      if (existente) {
        if (existente.checksum !== checksum) throw new Error('MIGRATION_CHECKSUM_MISMATCH');
        return;
      }
      db.exec(schema);
      const inserir = db.prepare('INSERT INTO allowed_transitions VALUES (?,?)');
      for (const [de, destinos] of Object.entries(transicoes)) for (const para of destinos) inserir.run(de, para);
      db.prepare('INSERT INTO supervised_migrations VALUES (1,?,?)').run(checksum, new Date().toISOString());
    }).immediate();
  }

  static abrir(caminho: string): RepositorioSupervisionado {
    mkdirSync(path.dirname(caminho), { recursive: true });
    const db = new Database(caminho);
    try { return new RepositorioSupervisionado(db); } catch (erro) { db.close(); throw erro; }
  }
  fechar(): void { this.db.close(); }

  registrarVaga(entrada: Job): { job: Job; duplicate: boolean; mirrorCollision: boolean } {
    const job = jobSchema.parse(entrada);
    if (job.descriptionHash !== sha256(job.description)) throw new Error('DESCRIPTION_HASH_MISMATCH');
    return this.db.transaction(() => {
      const existente = this.db.prepare('SELECT payload_json FROM jobs WHERE id=? OR (platform=? AND canonical_url=?) OR (platform=? AND external_id=?)')
        .get(job.id, job.platform, job.canonicalUrl, job.platform, job.externalId ?? null) as { payload_json: string } | undefined;
      if (existente) return { job: jobSchema.parse(JSON.parse(existente.payload_json)), duplicate: true, mirrorCollision: false };
      const mirrorKey = sha256([job.company, job.title, job.location ?? ''].map(normalizarTexto).join('|'));
      const mirrorCollision = !!this.db.prepare('SELECT 1 FROM jobs WHERE mirror_key=?').get(mirrorKey);
      this.db.prepare('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?,?)').run(job.id, job.platform, job.externalId ?? null,
        job.canonicalUrl, job.company, job.title, job.descriptionHash, JSON.stringify(job), job.discoveredAt, mirrorKey);
      return { job, duplicate: false, mirrorCollision };
    }).immediate();
  }

  criarCandidatura(jobId: string): Application {
    idSchema.parse(jobId);
    return this.db.transaction(() => {
      const id = randomUUID(); const agora = new Date().toISOString();
      const resultado = this.db.prepare("INSERT OR IGNORE INTO applications(id,job_id,state,created_at,updated_at) VALUES (?,?,'DISCOVERED',?,?)")
        .run(id, jobId, agora, agora);
      const app = this.db.prepare('SELECT * FROM applications WHERE job_id=?').get(jobId) as Application;
      if (!app) throw new Error('JOB_NOT_FOUND');
      if (resultado.changes) this.evento(app, null, { reasonCode: 'DISCOVERED', actor: 'SYSTEM' });
      return app;
    }).immediate();
  }
  obterCandidatura(id: string): Application {
    idSchema.parse(id);
    const app = this.db.prepare('SELECT * FROM applications WHERE id=?').get(id) as Application | undefined;
    if (!app) throw new Error('APPLICATION_NOT_FOUND');
    stateSchema.parse(app.state);
    return app;
  }
  listarCandidaturas(): Application[] {
    return this.db.prepare('SELECT * FROM applications ORDER BY created_at DESC LIMIT 1000').all() as Application[];
  }
  listarEventos(id: string): Array<{ from_state: string | null; to_state: string; reason_code: string; actor: string; metadata_json: string }> {
    idSchema.parse(id);
    return this.db.prepare('SELECT from_state,to_state,reason_code,actor,metadata_json FROM application_events WHERE application_id=? ORDER BY created_at LIMIT 1000')
      .all(id) as Array<{ from_state: string | null; to_state: string; reason_code: string; actor: string; metadata_json: string }>;
  }
  obterVaga(id: string): Job {
    const row = this.db.prepare('SELECT payload_json FROM jobs WHERE id=?').get(id) as { payload_json: string } | undefined;
    if (!row) throw new Error('JOB_NOT_FOUND');
    return jobSchema.parse(JSON.parse(row.payload_json));
  }
  private evento(app: Application, de: ApplicationState | null, contexto: Contexto): void {
    this.db.prepare('INSERT INTO application_events VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(), app.id, de, app.state,
      contexto.reasonCode, sha256(contexto.actor), JSON.stringify({ evidence: (contexto.evidence ?? []).map(item => ({
        kind: item.kind, referenceHash: sha256(item.reference), ...(item.contentHash ? { contentHash: item.contentHash } : {}),
      })) }), new Date().toISOString());
  }
  transitionApplication(id: string, expected: ApplicationState, next: ApplicationState, entrada: Contexto): Application {
    const contexto = contextoSchema.parse(entrada); stateSchema.parse(expected); stateSchema.parse(next);
    if (!podeTransicionar(expected, next)) throw new Error('INVALID_TRANSITION');
    if (next === 'SUBMITTED' && (!contexto.confirmationRef || !contexto.evidence?.some(item => item.kind === 'PORTAL_CONFIRMATION'))) {
      throw new Error('CONFIRMATION_REQUIRED');
    }
    return this.db.transaction(() => {
      const agora = new Date().toISOString();
      const updated = this.db.prepare(`UPDATE applications SET state=?,updated_at=?,
        confirmation_ref=COALESCE(?,confirmation_ref),submitted_at=CASE WHEN ?='SUBMITTED' THEN ? ELSE submitted_at END
        WHERE id=? AND state=?`).run(next, agora, contexto.confirmationRef ?? null, next, agora, id, expected);
      if (updated.changes !== 1) throw new Error('STATE_CONFLICT');
      const app = this.obterCandidatura(id); this.evento(app, expected, contexto); return app;
    }).immediate();
  }

  salvarMatching(id: string, entrada: MatchResult): Application {
    const match = matchSchema.parse(entrada);
    return this.db.transaction(() => {
      const app = this.obterCandidatura(id);
      if (app.job_id !== match.jobId || app.state !== 'DISCOVERED') throw new Error('MATCH_STATE_CONFLICT');
      this.db.prepare('UPDATE applications SET score=?,match_json=? WHERE id=?').run(match.score, JSON.stringify(match), id);
      return this.transitionApplication(id, 'DISCOVERED', 'EVALUATED', { reasonCode: 'MATCH_EVALUATED', actor: 'MATCHING' });
    }).immediate();
  }
  salvarPreparacao(id: string, entrada: PreparedApplication): Application {
    const prepared = preparedSchema.parse(entrada);
    return this.db.transaction(() => {
      const app = this.obterCandidatura(id);
      if (app.job_id !== prepared.jobId || !['EVALUATED', 'PREPARED', 'PENDING_REVIEW', 'AUTHORIZED'].includes(app.state)) {
        throw new Error('PREPARATION_STATE_CONFLICT');
      }
      this.db.prepare('UPDATE authorizations SET revoked_at=? WHERE application_id=? AND consumed_at IS NULL').run(new Date().toISOString(), id);
      this.db.prepare(`UPDATE applications SET prepared_json=?,candidate_profile_version=?,resume_sha256=?,answers_sha256=?,form_fingerprint=?,policy_version=NULL WHERE id=?`)
        .run(JSON.stringify(prepared), prepared.candidateProfileVersion, prepared.resumeSha256, prepared.answersSha256, prepared.formFingerprint, id);
      if (app.state === 'AUTHORIZED') this.transitionApplication(id, 'AUTHORIZED', 'PENDING_REVIEW', { reasonCode: 'CONTENT_CHANGED', actor: 'PREPARER' });
      if (app.state === 'EVALUATED' || app.state === 'PENDING_REVIEW') {
        const result = this.transitionApplication(id, app.state, 'PREPARED', { reasonCode: 'CONTENT_PREPARED', actor: 'PREPARER' });
        this.db.prepare("UPDATE review_queue SET status='DECIDED',decision='REQUEST_CHANGES',decided_at=?,decided_by='SYSTEM' WHERE application_id=? AND status='PENDING'")
          .run(new Date().toISOString(), id);
        return result;
      }
      this.db.prepare("UPDATE review_queue SET status='DECIDED',decision='REQUEST_CHANGES',decided_at=?,decided_by='SYSTEM' WHERE application_id=? AND status='PENDING'")
        .run(new Date().toISOString(), id);
      this.evento(this.obterCandidatura(id), app.state, { reasonCode: 'CONTENT_CHANGED', actor: 'PREPARER' });
      return this.obterCandidatura(id);
    }).immediate();
  }
  enfileirarRevisao(id: string, motivos: string[], limite = 30): string {
    z.array(z.string().regex(/^[A-Z0-9_:-]{1,200}$/)).min(1).parse(motivos); z.number().int().min(1).parse(limite);
    return this.db.transaction(() => {
      const anterior = this.db.prepare("SELECT id FROM review_queue WHERE application_id=? AND status='PENDING'").get(id) as { id: string } | undefined;
      if (anterior) return anterior.id;
      const pendentes = this.db.prepare("SELECT COUNT(*) AS n FROM review_queue WHERE status='PENDING'").get() as { n: number };
      if (pendentes.n >= limite) throw new Error('REVIEW_QUEUE_FULL');
      const app = this.obterCandidatura(id);
      if (app.state !== 'PENDING_REVIEW') this.transitionApplication(id, app.state, 'PENDING_REVIEW', { reasonCode: 'REVIEW_REQUIRED', actor: 'POLICY' });
      const reviewId = randomUUID();
      this.db.prepare("INSERT INTO review_queue(id,application_id,reason_codes_json,status,requested_at) VALUES (?,?,?,'PENDING',?)")
        .run(reviewId, id, JSON.stringify(motivos), new Date().toISOString());
      return reviewId;
    }).immediate();
  }
  listarRevisoes(): Array<{ id: string; application_id: string; reason_codes_json: string; status: string }> {
    return this.db.prepare("SELECT id,application_id,reason_codes_json,status FROM review_queue WHERE status='PENDING' ORDER BY requested_at LIMIT 1000").all() as ReturnType<RepositorioSupervisionado['listarRevisoes']>;
  }
  decidirRevisao(reviewId: string, decisao: ReviewDecision, ator: string): void {
    z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES']).parse(decisao); z.string().min(1).max(200).parse(ator);
    this.db.transaction(() => {
      const review = this.db.prepare("SELECT application_id FROM review_queue WHERE id=? AND status='PENDING'").get(reviewId) as { application_id: string } | undefined;
      if (!review) throw new Error('REVIEW_ALREADY_DECIDED');
      const app = this.obterCandidatura(review.application_id);
      if (app.state !== 'PENDING_REVIEW') throw new Error('REVIEW_STATE_CONFLICT');
      this.db.prepare("UPDATE review_queue SET status='DECIDED',decision=?,decided_at=?,decided_by=? WHERE id=?")
        .run(decisao, new Date().toISOString(), sha256(ator), reviewId);
      if (decisao === 'APPROVE') {
        const current = this.obterCandidatura(app.id);
        if (!current.candidate_profile_version || !current.resume_sha256 || !current.answers_sha256 || !current.form_fingerprint) throw new Error('PREPARATION_REQUIRED');
        this.db.prepare('INSERT INTO review_approvals VALUES (?,?,?,?,?,?,?)').run(reviewId, app.id, current.candidate_profile_version,
          current.resume_sha256, current.answers_sha256, current.form_fingerprint, new Date().toISOString());
      }
      if (decisao === 'REJECT') {
        this.db.prepare('UPDATE authorizations SET revoked_at=? WHERE application_id=? AND consumed_at IS NULL').run(new Date().toISOString(), app.id);
        this.transitionApplication(app.id, app.state, 'SKIPPED', { reasonCode: 'HUMAN_REJECTED', actor: ator });
      }
      else this.evento(app, app.state, { reasonCode: `HUMAN_${decisao}`, actor: ator });
    }).immediate();
  }
  registrarAutorizacao(entrada: Authorization): void {
    const auth = authorizationSchema.parse(entrada);
    this.db.transaction(() => {
      const app = this.obterCandidatura(auth.applicationId);
      const aprovada = this.db.prepare(`SELECT 1 FROM review_queue r JOIN review_approvals a ON a.review_id=r.id
        WHERE r.id=(SELECT id FROM review_queue WHERE application_id=? AND status='DECIDED' ORDER BY decided_at DESC LIMIT 1)
        AND r.decision='APPROVE' AND a.application_id=? AND a.candidate_profile_version=?
        AND a.resume_sha256=? AND a.answers_sha256=? AND a.form_fingerprint=?`)
        .get(app.id, app.id, app.candidate_profile_version, app.resume_sha256, app.answers_sha256, app.form_fingerprint);
      if (auth.grantedBy !== 'HUMAN' || !aprovada || !app.prepared_json || app.state !== 'PENDING_REVIEW' ||
        auth.jobId !== app.job_id || auth.formFingerprint !== app.form_fingerprint || auth.resumeSha256 !== app.resume_sha256 || auth.answersSha256 !== app.answers_sha256 || auth.consumedAt) {
        throw new Error('AUTHORIZATION_REQUIRES_CURRENT_HUMAN_APPROVAL');
      }
      if (Date.parse(auth.expiresAt) <= Date.now()) throw new Error('AUTHORIZATION_EXPIRED');
      this.db.prepare('INSERT INTO authorizations VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL)').run(auth.id, auth.applicationId,
        auth.jobId, auth.policyVersion, auth.formFingerprint, auth.resumeSha256, auth.answersSha256, auth.grantedBy, auth.grantedAt, auth.expiresAt);
      this.db.prepare('UPDATE applications SET policy_version=? WHERE id=?').run(auth.policyVersion, app.id);
      this.transitionApplication(app.id, app.state, 'AUTHORIZED', { reasonCode: 'HUMAN_AUTHORIZED', actor: 'HUMAN' });
    }).immediate();
  }
  registrarSimulacao(appId: string, runId: string): void {
    this.db.prepare("INSERT INTO submission_attempts VALUES (?,?,NULL,?,?,'SIMULATED',?,?,?,NULL,'[]')")
      .run(randomUUID(), appId, randomUUID(), runId, new Date().toISOString().slice(0, 10), new Date().toISOString(), new Date().toISOString());
  }
  iniciarExecucao(mode: 'ASSISTED' | 'SUPERVISED_AUTONOMOUS', dryRun: boolean): string {
    z.enum(['ASSISTED', 'SUPERVISED_AUTONOMOUS']).parse(mode); z.boolean().parse(dryRun);
    const id = randomUUID();
    this.db.prepare("INSERT INTO execution_runs(id,mode,dry_run,started_at,status) VALUES (?,?,?,?,'RUNNING')")
      .run(id, mode, dryRun ? 1 : 0, new Date().toISOString());
    return id;
  }
  finalizarExecucao(id: string, status: 'COMPLETED' | 'FAILED'): void {
    this.db.prepare("UPDATE execution_runs SET status=?,finished_at=? WHERE id=? AND status='RUNNING'").run(status, new Date().toISOString(), id);
  }
  controle(nome: 'PAUSE' | 'EMERGENCY_STOP'): boolean {
    const row = this.db.prepare('SELECT value FROM system_controls WHERE key=?').get(nome) as { value: string } | undefined;
    return row?.value === 'true';
  }
  definirControle(nome: 'PAUSE' | 'EMERGENCY_STOP', ativo: boolean, ator: string): void {
    z.enum(['PAUSE', 'EMERGENCY_STOP']).parse(nome); z.boolean().parse(ativo); z.string().min(1).parse(ator);
    this.db.prepare('INSERT INTO system_controls VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
      .run(nome, String(ativo), new Date().toISOString());
  }
}
