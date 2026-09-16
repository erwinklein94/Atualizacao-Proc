// Utilitários compartilhados: escape, datas, números, regras de negócio dos documentos.
import { JANELA_PROXIMO } from './config.js';

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Só aceita links http(s); qualquer outra coisa (javascript:, data:...) vira vazio.
export function urlSegura(u) {
  if (!u) return '';
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? u : '';
  } catch {
    return '';
  }
}

export const normTexto = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const fmtNum = (n) => Number(n || 0).toLocaleString('pt-BR');
export const fmtPct = (v, casas = 0) =>
  `${(Number.isFinite(v) ? v * 100 : 0).toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Datas "YYYY-MM-DD" sempre como data local (sem deslocamento de fuso).
export function dataLocal(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function hoje() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

export const diasEntre = (a, b) => Math.round((b - a) / 864e5);
export const fmtData = (d) => (d ? d.toLocaleDateString('pt-BR') : '—');
export const pad2 = (n) => String(n).padStart(2, '0');
export const isoDe = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function textoDias(dias) {
  if (dias == null) return '';
  if (dias === 0) return 'vence hoje';
  if (dias > 0) return dias === 1 ? 'em 1 dia' : `em ${fmtNum(dias)} dias`;
  const a = -dias;
  return a === 1 ? 'há 1 dia' : `há ${fmtNum(a)} dias`;
}

export function contar(lista, chaveFn) {
  const m = new Map();
  for (const item of lista) {
    const k = chaveFn(item);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function armazenamento(chave, valor) {
  try {
    if (valor === undefined) return localStorage.getItem(chave);
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch {
    /* navegação privada ou armazenamento bloqueado */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Regras dos documentos
// ---------------------------------------------------------------------------
export const SITUACOES = [
  { chave: 'Vencido', rotulo: 'Vencido', classe: 'crit', cor: 'var(--st-crit)', icone: 'x' },
  { chave: 'Próximo ao vencimento', rotulo: `Vence em até ${JANELA_PROXIMO} dias`, classe: 'warn', cor: 'var(--st-warn)', icone: 'alerta' },
  { chave: 'Sem data', rotulo: 'Sem data de vencimento', classe: 'none', cor: 'var(--st-none)', icone: 'interroga' },
  { chave: 'Válido', rotulo: 'Válido', classe: 'ok', cor: 'var(--st-ok)', icone: 'check' },
  { chave: 'Sem vencimento', rotulo: 'Não controla vencimento', classe: 'none', cor: 'var(--st-none)', icone: 'traco' },
];
export const SITUACAO = Object.fromEntries(SITUACOES.map((s) => [s.chave, s]));

export const FLUXO_ORDEM = [
  'Em Criação-Especs.',
  'Em Revisão-Especs.',
  'Em Retificação-Especs.',
  'Em Validação-Gestor',
  'Em Validação VP',
  'Primeira Verificação',
];

export const SEM_DISCIPLINA = 'Não classificada';

export function situacaoDe(doc) {
  if (!doc._controla) return 'Sem vencimento';
  if (!doc._venc) return 'Sem data';
  if (doc._dias < 0) return 'Vencido';
  if (doc._dias <= JANELA_PROXIMO) return 'Próximo ao vencimento';
  return 'Válido';
}

// Acrescenta campos calculados usados pela interface (prefixo "_").
export function enriquecer(doc, tiposMap, ref = hoje()) {
  const tipo = tiposMap.get(doc.tipo);
  doc._tipo = tipo;
  doc._tipoNome = tipo ? tipo.nome : doc.tipo || 'Outros';
  doc._controla = Boolean(tipo && tipo.controla_vencimento);
  doc._venc = dataLocal(doc.data_vencimento);
  doc._atual = dataLocal(doc.data_atualizacao);
  doc._dias = doc._venc ? diasEntre(ref, doc._venc) : null;
  doc._sit = situacaoDe(doc);
  doc._disc = doc.disciplina || SEM_DISCIPLINA;
  doc._busca = normTexto(`${doc.codigo || ''} ${doc.titulo || ''} ${doc._tipoNome} ${doc._disc} ${doc.status_normativo || ''}`);
  return doc;
}

// "PO-SPE-010-R6 - Título" -> partes do código.
export function analisarNome(nome) {
  const s = String(nome ?? '').replace(/ /g, ' ').trim();
  const m = s.match(/^([A-Z]*)-SPE-(\d+)-(R[0-9A-Za-z]*)\s*-\s*(.*)$/);
  if (!m) return { codigo: null, prefixo: null, numero: null, revisao: null, titulo: s.replace(/\s+/g, ' ') };
  return {
    codigo: `${m[1]}-SPE-${m[2]}-${m[3]}`,
    prefixo: m[1] || null,
    numero: m[2],
    revisao: m[3],
    titulo: m[4].replace(/\s+/g, ' ').trim(),
  };
}

export function analisarCodigo(codigo) {
  const m = String(codigo ?? '').trim().match(/^([A-Z]*)-SPE-(\d+)-(R[0-9A-Za-z]*)$/);
  if (!m) return null;
  return { prefixo: m[1] || null, numero: m[2], revisao: m[3] };
}

const DISC_CODIGOS = {
  AC: 'Acidente', DM: 'Dormente', ES: 'Especial', FE: 'Ferramentas', FX: 'Fixação', GE: 'Geometria',
  GR: 'Geral', HM: 'Homologação', LT: 'Lastro', MV: 'AMV', MZ: 'Mecanização', QL: 'Qualidade', SO: 'Solda', TR: 'Trilhos',
};

// Deduz a disciplina pela pasta do SharePoint ou pela nomenclatura antiga do arquivo.
export function disciplinaDoLink(link) {
  if (!link) return null;
  let p = link;
  try { p = decodeURIComponent(link); } catch { /* mantém como veio */ }
  let m = p.match(/02-SUPERESTRUTURA\/\d+\.\s*([^/&?]+)/i);
  if (m) return m[1].replace(/^%20/, '').trim() || null;
  m = p.match(/[A-Z]{3}-[A-Z]{2}-[A-Z]-(?:ALR|ETM|ETS|FRM|INF|MTE|PGP|PRO|RTE)-([A-Z]{2})-/);
  if (m) return DISC_CODIGOS[m[1]] || null;
  return null;
}

// ---------------------------------------------------------------------------
// Ícones (SVG inline, traço geométrico)
// ---------------------------------------------------------------------------
const PATHS = {
  check: '<circle cx="12" cy="12" r="10" fill="currentColor" opacity=".18"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  alerta: '<path d="M12 3l10 18H2z" fill="currentColor" opacity=".18"/><path d="M12 9v5M12 17.5v.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  x: '<circle cx="12" cy="12" r="10" fill="currentColor" opacity=".18"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  interroga: '<circle cx="12" cy="12" r="10" fill="currentColor" opacity=".18"/><path d="M9.5 9.3a2.6 2.6 0 115 1c0 1.7-2.5 2-2.5 3.7M12 17.3v.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  traco: '<circle cx="12" cy="12" r="10" fill="currentColor" opacity=".18"/><path d="M8 12h8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  pdf: '<path d="M6 2h8l5 5v15H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 2v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="2"/>',
  lua: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  sol: '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  mais: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  seta: '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  baixar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  subir: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
};

export const icone = (nome, extra = '') =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" ${extra}>${PATHS[nome] || ''}</svg>`;

export function badgeSituacao(chave) {
  const s = SITUACAO[chave] || SITUACAO['Sem vencimento'];
  return `<span class="badge ${s.classe}">${icone(s.icone)}${esc(s.rotulo)}</span>`;
}

export function toast(msg, erro = false) {
  const el = document.createElement('div');
  el.className = `toast${erro ? ' erro' : ''}`;
  el.setAttribute('role', erro ? 'alert' : 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), erro ? 6000 : 3500);
}
