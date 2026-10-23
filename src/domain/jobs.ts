import { createHash } from 'node:crypto';
import { jobSchema, type Job, type Platform } from './contracts.js';

export function sha256(valor: string | Buffer): string {
  return createHash('sha256').update(valor).digest('hex');
}
export function normalizarTexto(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
export function canonicalizarUrl(valor: string): string {
  const url = new URL(valor);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('URL de vaga invalida.');
  url.hash = '';
  for (const chave of [...url.searchParams.keys()]) {
    if (/^(utm_.+|trk|trackingId|ref|refId|source|fbclid|gclid)$/i.test(chave)) url.searchParams.delete(chave);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.href;
}
export function identificarPlataforma(valor: string): Platform {
  const host = new URL(canonicalizarUrl(valor)).hostname;
  const pertence = (dominio: string) => host === dominio || host.endsWith(`.${dominio}`);
  if (pertence('linkedin.com')) return 'LINKEDIN';
  if (pertence('gupy.io')) return 'GUPY';
  if (pertence('indeed.com') || pertence('indeed.com.br')) return 'INDEED';
  return 'OTHER';
}
export function normalizarVaga(entrada: Omit<Job, 'id' | 'descriptionHash' | 'canonicalUrl' | 'platform'> & {
  canonicalUrl: string; platform?: Platform;
}): Job {
  const canonicalUrl = canonicalizarUrl(entrada.canonicalUrl);
  const detectada = identificarPlataforma(canonicalUrl);
  // Declarar CORPORATE_ATS nao pode transformar LinkedIn/Gupy/Indeed em outra plataforma.
  const platform = detectada !== 'OTHER' ? detectada : entrada.platform ?? 'OTHER';
  return jobSchema.parse({ ...entrada, canonicalUrl, platform,
    id: sha256(`${platform}:${entrada.externalId ?? canonicalUrl}`), descriptionHash: sha256(entrada.description) });
}
