import { submissionSchema, type SubmissionGateway, type SubmissionResult } from './contracts.js';
import { RepositorioSupervisionado } from './repository.js';

// This release exposes an authenticated, fail-closed gateway boundary only. No browser adapter is connected.
export class GatewayBloqueado implements SubmissionGateway {
  constructor(private readonly repo: RepositorioSupervisionado, private readonly options: { dryRun: boolean; liveEnabled: boolean; capabilityToken?: string }) {}
  async submit(input: unknown, callerToken?: string): Promise<SubmissionResult> {
    const request = submissionSchema.parse(input);
    if (!this.options.capabilityToken || callerToken !== this.options.capabilityToken) return { status: 'BLOCKED', reason: 'CALLER_NOT_AUTHENTICATED' };
    if (this.options.dryRun || !this.options.liveEnabled || this.repo.controle('EMERGENCY_STOP')) return { status: 'BLOCKED', reason: 'SUBMISSION_DISABLED' };
    const app = this.repo.obterCandidatura(request.applicationId);
    if (app.state !== 'AUTHORIZED' || !app.form_fingerprint || app.form_fingerprint !== request.expectedFormFingerprint) return { status: 'BLOCKED', reason: 'AUTHORIZATION_OR_FORM_MISMATCH' };
    // No adapter is connected, so a network side effect is impossible in this implementation.
    this.repo.transitionApplication(app.id, 'AUTHORIZED', 'BLOCKED', { reasonCode: 'NO_VALIDATED_ADAPTER', actor: 'GATEWAY' });
    return { status: 'BLOCKED', reason: 'NO_VALIDATED_ADAPTER' };
  }
}
