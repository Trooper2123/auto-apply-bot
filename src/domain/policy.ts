import { createHash } from 'node:crypto';
import { policySchema, type Job, type MatchResult, type PlatformPolicy, type PreparedApplication, type PolicyAction } from './contracts.js';

const ACTIONS: Record<Job['platform'], PolicyAction> = {
  LINKEDIN: 'DENY', GUPY: 'REVIEW_ONLY', INDEED: 'REVIEW_ONLY', CORPORATE_ATS: 'DENY', OTHER: 'DENY',
};
export function avaliarPolitica(job: Job, match: MatchResult, prepared: PreparedApplication): {
  action: PolicyAction; reasonCodes: string[]; policyVersion: string;
} {
  const reasons: string[] = [];
  let action = ACTIONS[job.platform];
  if (match.jobId !== job.id || prepared.jobId !== job.id || match.disqualifiers.length || match.score < 6) {
    action = 'DENY'; reasons.push('JOB_NOT_ELIGIBLE');
  } else if (match.unknowns.length || match.score < 8) {
    action = action === 'DENY' ? 'DENY' : 'REVIEW_ONLY'; reasons.push(...match.unknowns.map(code => `REVIEW:${code}`));
  }
  if (ACTIONS[job.platform] === 'REVIEW_ONLY') reasons.push('PLATFORM_REVIEW_ONLY');
  if (action === 'DENY' && !reasons.length) reasons.push('PLATFORM_NOT_ALLOWED');
  const reviewedAt = new Date(0).toISOString();
  const rationale = reasons.join(',') || 'Validated corporate adapter and eligible job.';
  const policy: PlatformPolicy = { platform: job.platform, action, adapterVersion: 'none', reviewedAt,
    rationale, allowsAutomatedSubmit: false };
  policySchema.parse(policy);
  const policyVersion = createHash('sha256').update(JSON.stringify({ ...policy, reviewedAt: 'policy-static-v1' })).digest('hex');
  return { action, reasonCodes: reasons, policyVersion };
}
