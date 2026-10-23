import { z } from 'zod';
import { sha256 } from './jobs.js';

const factSchema = z.object({ key: z.string().min(1).max(100), value: z.string().max(2000), sourceId: z.string().min(1).max(200), approved: z.boolean() }).strict();
export function gerarDocumentoComProveniencia(fatosEntrada: unknown, ordemEntrada: unknown) {
  const facts = z.array(factSchema).max(500).parse(fatosEntrada);
  const ordem = z.array(z.string().min(1).max(100)).max(500).parse(ordemEntrada);
  const approved = new Map(facts.filter(f => f.approved).map(f => [f.key, f]));
  const desconhecidos = ordem.filter(key => !approved.has(key));
  const secoes = ordem.flatMap(key => {
    const fact = approved.get(key);
    return fact ? [`<section><h2>${escapeHtml(fact.key)}</h2><p>${escapeHtml(fact.value)}</p></section>`] : [];
  });
  const html = `<!doctype html><meta charset="utf-8"><main>${secoes.join('')}</main>`;
  return { html, sha256: sha256(html), unknowns: desconhecidos, sourceIds: ordem.flatMap(key => { const fact = approved.get(key); return fact ? [fact.sourceId] : []; }) };
}
function escapeHtml(text: string): string { return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }
