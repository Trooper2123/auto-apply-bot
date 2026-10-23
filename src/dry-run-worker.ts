import { readFileSync } from 'node:fs';
import { executarAcaoDryRun, validarCenarioDryRun } from './dry-run.js';
import { inicializarBanco, fecharBanco, registrarCandidatura, registrarExecucao } from './database.js';
import { pontuarVaga } from './scoring.js';

const [entrada, banco, scoreTexto] = process.argv.slice(2);
const scoreMinimo = Number(scoreTexto);
if (!entrada || !banco || !Number.isInteger(scoreMinimo) || scoreMinimo < 1 || scoreMinimo > 10) {
  throw new Error('Argumentos da simulacao local invalidos.');
}
const cenario = validarCenarioDryRun(JSON.parse(readFileSync(entrada, 'utf8')));
inicializarBanco(banco);
try {
  const vagas = cenario.vagas.map(vaga => {
    const avaliacao = pontuarVaga(vaga, cenario.perfil, scoreMinimo);
    const registrado = avaliacao.veredicto === 'APLICAR' && registrarCandidatura({
      plataforma: 'fixture-local', titulo_vaga: vaga.titulo, empresa: vaga.empresa,
      url: `urn:dry-run:${encodeURIComponent(vaga.id)}`, mensagem_enviada: 0, status: 'dry-run', score: avaliacao.score,
    });
    return { id: vaga.id, ...avaliacao, registrado };
  });
  const acoes = cenario.acoes.map(acao => ({
    nome: acao.nome, resultado: executarAcaoDryRun(cenario, acao.nome, acao.args, scoreMinimo),
  }));
  registrarExecucao(vagas.filter(vaga => vaga.registrado).length, ['fixture-local'], []);
  process.stdout.write(JSON.stringify({ modo: 'dry-run-local', envios: 0, vagas, acoes }) + '\n');
} finally { fecharBanco(); }
