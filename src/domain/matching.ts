import type { Job, MatchResult } from './contracts.js';
import { normalizarTexto, sha256 } from './jobs.js';

const TECHS = ['java', 'kotlin', 'spring boot', 'aws', 'postgresql'] as const;
const ALIASES: Record<string, string[]> = { java: ['java'], kotlin: ['kotlin'], 'spring boot': ['spring boot', 'springboot'], aws: ['aws', 'amazon web services'], postgresql: ['postgresql', 'postgres'] };
export function calcularMatch(job: Job, opts: { minSalary?: number; today?: string } = {}): MatchResult {
  const description = normalizarTexto(`${job.title} ${job.description}`);
  const seen = (term: string) => ALIASES[term]!.some(alias => new RegExp(`(^|[^a-z0-9])${alias.replace(/[+]/g, '\\+')}(?=$|[^a-z0-9])`).test(description));
  const hits = TECHS.filter(seen);
  const unknowns: string[] = [];
  const disqualifiers: string[] = [];
  const reasons: string[] = [];
  const senior = /\b(pleno|mid[ -]?level|intermediario)\b/.test(description);
  const junior = /\b(junior|estagio|intern)\b/.test(description);
  const seniority = junior ? 0 : senior ? 1 : (unknowns.push('SENIORITY_UNKNOWN'), 0.5);
  if (job.workMode === 'UNKNOWN') unknowns.push('WORK_MODE_UNKNOWN');
  const location = normalizarTexto(job.location ?? '');
  const workLocation = job.workMode === 'REMOTE' && /brasil|brazil|remoto/.test(location) ? 1
    : job.workMode === 'HYBRID' && /brasilia|distrito federal|\bdf\b/.test(location) ? 1
    : job.workMode === 'ONSITE' ? 0 : job.workMode === 'UNKNOWN' ? 0.5 : 0.5;
  if (job.workMode === 'ONSITE' || (job.workMode === 'HYBRID' && !/brasilia|distrito federal|\bdf\b/.test(location))) disqualifiers.push('LOCATION_INCOMPATIBLE');
  if (opts.minSalary !== undefined) {
    if (job.salaryMin === undefined && job.salaryMax === undefined) unknowns.push('SALARY_UNKNOWN');
    else if ((job.salaryMax ?? job.salaryMin!) < opts.minSalary) disqualifiers.push('SALARY_BELOW_MINIMUM');
  }
  if (/\b(obrigatorio|required|must have|requisito obrigatorio)\b/.test(description)) unknowns.push('REQUIRED_FACTS_NEED_PROFILE_VERIFICATION');
  const techScore = hits.length / TECHS.length;
  const score = Math.max(1, Math.min(10, Math.round(1 + 9 * (0.4 * techScore + 0.25 * seniority + 0.2 * workLocation + 0.15 * (hits.length ? 1 : 0)))));
  reasons.push(`TECH_MATCH:${hits.join('|') || 'NONE'}`, `SENIORITY:${senior ? 'PLENO' : junior ? 'JUNIOR' : 'UNKNOWN'}`, `LOCATION:${job.workMode}`);
  if (opts.today && job.discoveredAt.slice(0, 10) < opts.today) reasons.push('DISCOVERY_DATE_RECORDED');
  return { jobId: job.id, score, algorithmVersion: 'java-backend-v1', breakdown: { technology: techScore, seniority, location: workLocation, complementary: hits.length ? 1 : 0 },
    reasons, disqualifiers, unknowns: [...new Set(unknowns)], evidence: [{ kind: 'JOB_DESCRIPTION', reference: 'job.description', contentHash: sha256(job.description) }] };
}
