import { z } from 'zod';

export const idSchema = z.string().min(1).max(200).regex(/^[\w:-]+$/);
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const dateSchema = z.string().datetime({ offset: true });
export const platformSchema = z.enum(['LINKEDIN', 'GUPY', 'INDEED', 'CORPORATE_ATS', 'OTHER']);
export const stateSchema = z.enum(['DISCOVERED', 'EVALUATED', 'PREPARED', 'PENDING_REVIEW',
  'AUTHORIZED', 'SUBMITTING', 'SUBMITTED', 'UNKNOWN_RESULT', 'BLOCKED', 'SKIPPED', 'FAILED']);
export const policyActionSchema = z.enum(['ALLOW', 'REVIEW_ONLY', 'DENY']);
export const evidenceSchema = z.object({
  kind: z.enum(['PROFILE', 'JOB_DESCRIPTION', 'APPROVED_ANSWER', 'PORTAL_CONFIRMATION']),
  reference: z.string().min(1).max(2000), contentHash: hashSchema.optional(),
}).strict();
export const jobSchema = z.object({
  id: idSchema, platform: platformSchema, externalId: idSchema.optional(),
  canonicalUrl: z.string().url().max(4000).refine(valor => {
    const url = new URL(valor);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  }),
  company: z.string().min(1).max(300), title: z.string().min(1).max(500),
  description: z.string().min(1).max(100000), descriptionHash: hashSchema,
  location: z.string().max(500).optional(),
  workMode: z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN']),
  salaryMin: z.number().finite().nonnegative().optional(),
  salaryMax: z.number().finite().nonnegative().optional(), currency: z.string().length(3).optional(),
  discoveredAt: dateSchema,
}).strict().refine(vaga => vaga.salaryMin === undefined || vaga.salaryMax === undefined || vaga.salaryMin <= vaga.salaryMax);
export const matchSchema = z.object({
  jobId: idSchema, score: z.number().int().min(1).max(10), algorithmVersion: z.string().min(1).max(100),
  breakdown: z.record(z.string(), z.number().finite()), reasons: z.array(z.string()).max(100),
  disqualifiers: z.array(z.string()).max(100), unknowns: z.array(z.string()).max(100),
  evidence: z.array(evidenceSchema).max(200),
}).strict();
export const preparedSchema = z.object({
  id: idSchema, jobId: idSchema, candidateProfileVersion: hashSchema,
  resumeSha256: hashSchema, answersSha256: hashSchema, formFingerprint: hashSchema,
  documentPath: z.string().min(1).max(4000),
  answerEvidence: z.record(z.string(), z.array(evidenceSchema).min(1)),
}).strict();
export const policySchema = z.object({
  platform: platformSchema, action: policyActionSchema, adapterVersion: z.string().min(1).max(100),
  reviewedAt: dateSchema, rationale: z.string().min(1).max(4000), allowsAutomatedSubmit: z.boolean(),
}).strict().refine(politica => !politica.allowsAutomatedSubmit || politica.action === 'ALLOW');
export const authorizationSchema = z.object({
  id: idSchema, applicationId: idSchema, jobId: idSchema, policyVersion: hashSchema,
  formFingerprint: hashSchema, resumeSha256: hashSchema, answersSha256: hashSchema,
  scope: z.literal('SINGLE_SUBMISSION'), expiresAt: dateSchema,
  grantedBy: z.enum(['POLICY_ENGINE', 'HUMAN']), grantedAt: dateSchema, consumedAt: dateSchema.optional(),
}).strict().refine(autorizacao => Date.parse(autorizacao.expiresAt) > Date.parse(autorizacao.grantedAt));
export const submissionSchema = z.object({
  applicationId: idSchema, authorizationId: idSchema, idempotencyKey: idSchema, expectedFormFingerprint: hashSchema,
}).strict();
export const reviewSchema = z.object({
  id: idSchema, applicationId: idSchema, reasonCodes: z.array(z.string().min(1).max(200)).min(1),
  createdAt: dateSchema, expiresAt: dateSchema.optional(),
  decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES']).optional(),
  decidedBy: z.string().min(1).max(200).optional(), decidedAt: dateSchema.optional(),
}).strict();

export type Platform = z.infer<typeof platformSchema>;
export type ExecutionMode = 'ASSISTED' | 'SUPERVISED_AUTONOMOUS';
export type PolicyAction = z.infer<typeof policyActionSchema>;
export type ApplicationState = z.infer<typeof stateSchema>;
export type ReviewDecision = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';
export type Job = z.infer<typeof jobSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type MatchResult = z.infer<typeof matchSchema>;
export type PreparedApplication = z.infer<typeof preparedSchema>;
export type PlatformPolicy = z.infer<typeof policySchema>;
export type Authorization = z.infer<typeof authorizationSchema>;
export type SubmissionRequest = z.infer<typeof submissionSchema>;
export type ReviewItem = z.infer<typeof reviewSchema>;
export type SubmissionResult =
  | { status: 'CONFIRMED'; receipt: string; evidence: Evidence[] }
  | { status: 'UNKNOWN'; reason: string; evidence: Evidence[] }
  | { status: 'BLOCKED'; reason: string };
export interface SubmissionGateway { submit(request: SubmissionRequest): Promise<SubmissionResult> }
export interface PolicyEngine {
  evaluate(job: Job, match: MatchResult, prepared: PreparedApplication): Promise<{
    action: PolicyAction; reasonCodes: string[]; policyVersion: string;
  }>;
}
