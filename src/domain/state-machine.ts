import type { ApplicationState } from './contracts.js';

export const transicoes: Record<ApplicationState, readonly ApplicationState[]> = {
  DISCOVERED: ['EVALUATED', 'SKIPPED', 'BLOCKED', 'FAILED'],
  EVALUATED: ['PREPARED', 'PENDING_REVIEW', 'SKIPPED', 'BLOCKED', 'FAILED'],
  PREPARED: ['AUTHORIZED', 'PENDING_REVIEW', 'BLOCKED', 'FAILED'],
  PENDING_REVIEW: ['PREPARED', 'AUTHORIZED', 'SKIPPED', 'BLOCKED', 'FAILED'],
  AUTHORIZED: ['SUBMITTING', 'PENDING_REVIEW', 'BLOCKED'],
  SUBMITTING: ['SUBMITTED', 'UNKNOWN_RESULT', 'BLOCKED'],
  UNKNOWN_RESULT: ['SUBMITTED', 'PENDING_REVIEW'],
  BLOCKED: ['PENDING_REVIEW'],
  SKIPPED: [], FAILED: [], SUBMITTED: [],
};
export function podeTransicionar(de: ApplicationState, para: ApplicationState): boolean {
  return transicoes[de]?.includes(para) ?? false;
}
