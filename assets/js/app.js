// Procedimentos Rumo — aplicação (GitHub Pages + Supabase)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, JANELA_PROXIMO } from './config.js';
import {
  $, $$, esc, urlSegura, normTexto, fmtNum, fmtPct, MESES, MESES_LONGOS, hoje, fmtData, textoDias,
  contar, debounce, armazenamento, SITUACOES, SITUACAO, FLUXO_ORDEM, SEM_DISCIPLINA, enriquecer,
  analisarCodigo, icone, badgeSituacao, toast, pad2,
} from './util.js';
import { barrasH, empilhadoH, colunas, esconderTip } from './charts.js';

// O link de recuperação de senha chega com "type=recovery" no endereço; capturamos antes do cliente limpar a URL.
const veioDeRecuperacao = /type=recovery/.test(location.hash) || /type=recovery/.test(location.search);

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const FILTRO_DOCS_PADRAO = { q: '', tipo: '', situacao: '', disciplina: '', fluxo: '', links: '', ano: '', vigentes: true, ordem: 'codigo' };

const state = {
  user: null,
  docs: [],
  tipos: [],
  tiposMap: new Map(),
  carregadoEm: null,
  painel: { tipo: '', disciplina: '' },
  docsFiltro: { ...FILTRO_DOCS_PADRAO },
  limite: 50,
  venc: { tipo: '' },
  rotaAtual: null,
  recuperandoSenha: veioDeRecuperacao,
};

// ===========================================================================
// Telas, tema e menu
// ===========================================================================
function mostrarTela(id) {
  for (const t of ['tela-inicial', 'tela-login', 'tela-app']) $(`#${t}`).hidden = t !== id;
}

function temaEscuro() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function desenharBotaoTema() {
  const btn = $('#btn-tema');
  const escuro = temaEscuro();
  btn.innerHTML = icone(escuro ? 'sol' : 'lua');
  btn.setAttribute('aria-label', escuro ? 'Usar tema claro' : 'Usar tema escuro');
  btn.title = btn.getAttribute('aria-label');
}

function alternarTema() {
  const novo = temaEscuro() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', novo);
  armazenamento('proc-tema', novo);
  desenharBotaoTema();
}

function mostrarLogin(msg, tipo) {
  mostrarTela('tela-login');
  $('#form-login').hidden = false;
  $('#form-nova-senha').hidden = true;
  if (msg) avisoLogin(msg, tipo);
}

function avisoLogin(msg, tipo = '') {
  const el = $('#login-msg');
  el.className = `alerta ${tipo}`;
  el.textContent = msg;
  el.hidden = !msg;
}

function mostrarNovaSenha() {
  mostrarTela('tela-login');
  $('#form-login').hidden = true;
  $('#form-nova-senha').hidden = false;
}

// ===========================================================================
// Autenticação
// ===========================================================================
async function entrar(user) {
  state.user = user;
  mostrarTela('tela-app');
  $('#usuario-email').textContent = user.email || '';
  $('#avatar').textContent = (user.email || '?').charAt(0).toUpperCase();
  $('#view').innerHTML = carregandoHTML('Carregando documentos…');
  try {
    await carregarDados();
  } catch (err) {
    $('#view').innerHTML = `<div class="vazio">Não foi possível carregar os dados: ${esc(err.message)}</div>`;
    return;
  }
  if (!state.tipos.length) {
    $('#view').innerHTML = `<div class="vazio">
      <h2>Acesso não autorizado</h2>
      <p>O usuário <strong>${esc(user.email)}</strong> entrou, mas não tem permissão para ver os procedimentos.</p>
      <button class="btn" type="button" data-acao="sair">Sair</button></div>`;
    return;
  }
  if (!location.hash.startsWith('#/')) history.replaceState(null, '', `${location.pathname}#/painel`);
  rotear();
}

async function carregarDados() {
  const tiposResp = await sb.from('tipos_documento').select('*').order('ordem');
  if (tiposResp.error) throw tiposResp.error;
  state.tipos = tiposResp.data || [];
  state.tiposMap = new Map(state.tipos.map((t) => [t.sigla, t]));

  const docs = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('documentos').select('*').order('id').range(de, de + 999);
    if (error) throw error;
    docs.push(...data);
    if (data.length < 1000) break;
  }
  const ref = hoje();
  state.docs = docs.map((d) => enriquecer(d, state.tiposMap, ref));
  state.carregadoEm = new Date();
  $('#rodape-info').textContent = `${fmtNum(state.docs.length)} documentos carregados às ${state.carregadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

async function recarregar() {
  await carregarDados();
  rotear();
}

// ===========================================================================
// Rotas
// ===========================================================================
const ROTAS = {
  '/painel': { titulo: 'Painel', view: viewPainel },
  '/documentos': { titulo: 'Documentos', view: viewDocumentos },
  '/vencimentos': { titulo: 'Vencimentos', view: viewVencimentos },
  '/gestao': { titulo: 'Gestão', view: viewGestao },
};

function rotear() {
  if (!state.user || !state.tipos.length) return;
  esconderTip();
  const [caminho, qs] = (location.hash.slice(1) || '/painel').split('?');
  const rota = ROTAS[caminho] ? caminho : '/painel';
  $$('.nav a').forEach((a) => {
    if (a.dataset.rota === rota) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = `${ROTAS[rota].titulo} · Procedimentos Rumo`;
  if (rota !== state.rotaAtual) window.scrollTo({ top: 0 });
  state.rotaAtual = rota;
  ROTAS[rota].view(new URLSearchParams(qs || ''));
}

function href(rota, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== false)).toString();
  return `#${rota}${qs ? `?${qs}` : ''}`;
}

const irPara = (rota, params) => {
  location.hash = href(rota, params);
  window.scrollTo({ top: 0 });
};

// ===========================================================================
// Auxiliares de interface
// ===========================================================================
const vigentes = () => state.docs.filter((d) => d.vigente);
const carregandoHTML = (txt) => `<div class="carregando"><span class="spinner" aria-hidden="true"></span>${esc(txt)}</div>`;

function opcoes(lista, atual, rotuloTodos) {
  const itens = lista
    .map((o) => {
      const [v, r] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}"${String(v) === String(atual) ? ' selected' : ''}>${esc(r)}</option>`;
    })
    .join('');
  return rotuloTodos == null ? itens : `<option value="">${esc(rotuloTodos)}</option>${itens}`;
}

function opcoesTipos(atual, rotuloTodos = 'Todos') {
  const presentes = new Set(state.docs.map((d) => d.tipo));
  const lista = state.tipos.filter((t) => presentes.has(t.sigla)).map((t) => [t.sigla, `${t.sigla} — ${t.nome}`]);
  return opcoes(lista, atual, rotuloTodos);
}

function disciplinas() {
  const s = [...new Set(state.docs.map((d) => d._disc))].filter((d) => d !== SEM_DISCIPLINA).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (state.docs.some((d) => d._disc === SEM_DISCIPLINA)) s.push(SEM_DISCIPLINA);
  return s;
}

function fluxos() {
  const presentes = new Set(state.docs.map((d) => d.status_normativo).filter(Boolean));
  const ordenados = FLUXO_ORDEM.filter((f) => presentes.has(f));
  for (const f of presentes) if (!ordenados.includes(f)) ordenados.push(f);
  return ordenados;
}

function linksHTML(d) {
  const pdf = urlSegura(d.link_pdf);
  const ed = urlSegura(d.link_editavel);
  if (!pdf && !ed) return '<span class="sem-link">Sem link disponível</span>';
  return `<div class="links">${
    pdf ? `<a class="link-doc pdf" href="${esc(pdf)}" target="_blank" rel="noopener noreferrer" title="Abrir documento publicado">${icone('pdf')}Documento</a>` : ''
  }${ed ? `<a class="link-doc" href="${esc(ed)}" target="_blank" rel="noopener noreferrer" title="Abrir versão editável">${icone('editar')}Editável</a>` : ''}</div>`;
}

function vencHTML(d) {
  if (!d._controla) return '<span class="muted">Não se aplica</span>';
  if (!d._venc) return '<span class="muted">Sem data</span>';
  return `<span class="nowrap">${fmtData(d._venc)}</span><div class="meta">${textoDias(d._dias)}</div>`;
}

function itemCompacto(d, { mostrarLinks = false } = {}) {
  const data = d._controla && d._venc ? `<strong>${fmtData(d._venc)}</strong>${esc(textoDias(d._dias))}` : '<strong>Sem data</strong>';
  return `<li>
    <div class="t">
      <span class="chip-cod">${esc(d.codigo || '—')}</span>
      <button class="titulo-doc" type="button" data-abrir="${d.id}" title="${esc(d.titulo)}">${esc(d.titulo)}</button>
      <div class="meta muted" style="font-size:12px">${esc(d._tipoNome)} · ${esc(d._disc)}${d.status_normativo ? ` · ${esc(d.status_normativo)}` : ''}</div>
      ${mostrarLinks ? `<div style="margin-top:6px">${linksHTML(d)}</div>` : ''}
    </div>
    <div class="d">${data}</div>
  </li>`;
}

function exportarCSV(lista, nomeArquivo) {
  const cols = [
    ['Código', (d) => d.codigo],
    ['Tipo', (d) => d._tipoNome],
    ['Título', (d) => d.titulo],
    ['Revisão', (d) => d.revisao],
    ['Disciplina', (d) => d._disc],
    ['Última atualização', (d) => (d._atual ? fmtData(d._atual) : '')],
    ['Vencimento', (d) => (d._controla && d._venc ? fmtData(d._venc) : '')],
    ['Situação', (d) => SITUACAO[d._sit].rotulo],
    ['Fluxo normativo', (d) => d.status_normativo],
    ['Vigente', (d) => (d.vigente ? 'Sim' : 'Não')],
    ['Link do documento', (d) => d.link_pdf],
    ['Link editável', (d) => d.link_editavel],
  ];
  const cel = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // evita que o Excel interprete como fórmula
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = `﻿${[cols.map((c) => c[0]).join(';'), ...lista.map((d) => cols.map((c) => cel(c[1](d))).join(';'))].join('\r\n')}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ===========================================================================
// Painel
// ===========================================================================
function viewPainel() {
  const f = state.painel;
  const base = vigentes().filter((d) => (!f.tipo || d.tipo === f.tipo) && (!f.disciplina || d._disc === f.disciplina));
  const ctrl = base.filter((d) => d._controla);
  const cs = contar(ctrl, (d) => d._sit);
  const n = (k) => cs.get(k) || 0;
  const vencidos = n('Vencido');
  const proximos = n('Próximo ao vencimento');
  const semData = n('Sem data');
  const validos = n('Válido');
  const emDia = validos + proximos;
  const pctEmDia = ctrl.length ? emDia / ctrl.length : 0;
  const ref = hoje();
  const umAnoAtras = new Date(ref.getFullYear() - 1, ref.getMonth(), ref.getDate());
  const atualizados12 = base.filter((d) => d._atual && d._atual >= umAnoAtras).length;
  const filtroBase = { tipo: f.tipo, disciplina: f.disciplina };
  const pctCtrl = (v) => (ctrl.length ? fmtPct(v / ctrl.length, 1) : '0%');
  const seg = (v, cor, rot) => (v ? `<span style="width:${((v / ctrl.length) * 100).toFixed(2)}%;background:${cor}" title="${esc(rot)}: ${fmtNum(v)}"></span>` : '');

  $('#view').innerHTML = `
    <div class="cabecalho-pagina">
      <div>
        <h1>Painel de procedimentos</h1>
        <p>Vencimentos e ritmo de atualização dos documentos vigentes. Referência: ${fmtData(ref)}.</p>
      </div>
    </div>

    <form class="barra-filtros" id="filtros-painel" onsubmit="return false">
      <label class="campo"><span>Tipo de documento</span><select class="input" name="tipo">${opcoesTipos(f.tipo)}</select></label>
      <label class="campo"><span>Disciplina</span><select class="input" name="disciplina">${opcoes(disciplinas(), f.disciplina, 'Todas')}</select></label>
      ${f.tipo || f.disciplina ? '<button class="btn btn-sec" type="button" id="limpar-painel">Limpar filtros</button>' : ''}
    </form>

    <section class="kpis" aria-label="Indicadores">
      <div class="kpi kpi-hero" style="--kpi-cor:var(--st-ok)">
        <span class="kpi-rotulo">Documentos em dia</span>
        <span class="kpi-valor">${fmtPct(pctEmDia)}</span>
        <div class="medidor" role="img" aria-label="${fmtNum(validos)} válidos, ${fmtNum(proximos)} vencem em até ${JANELA_PROXIMO} dias, ${fmtNum(semData)} sem data, ${fmtNum(vencidos)} vencidos">
          ${seg(validos, 'var(--st-ok)', 'Válidos')}${seg(proximos, 'var(--st-warn)', 'Vencem em breve')}${seg(semData, 'var(--st-none)', 'Sem data')}${seg(vencidos, 'var(--st-crit)', 'Vencidos')}
        </div>
        <span class="kpi-sub">${fmtNum(emDia)} de ${fmtNum(ctrl.length)} documentos com vencimento controlado</span>
      </div>
      <a class="kpi" href="${href('/documentos', filtroBase)}" style="--kpi-cor:var(--series-1)">
        <span class="kpi-rotulo">Documentos vigentes</span>
        <span class="kpi-valor">${fmtNum(base.length)}</span>
        <span class="kpi-sub">${fmtNum(ctrl.length)} controlam vencimento</span>
      </a>
      <a class="kpi" href="${href('/documentos', { ...filtroBase, situacao: 'Vencido', ordem: 'vencimento' })}" style="--kpi-cor:var(--st-crit)">
        <span class="kpi-rotulo" style="color:var(--st-crit-ink)">${icone('x')}Vencidos</span>
        <span class="kpi-valor">${fmtNum(vencidos)}</span>
        <span class="kpi-sub">${pctCtrl(vencidos)} dos controlados</span>
      </a>
      <a class="kpi" href="${href('/documentos', { ...filtroBase, situacao: 'Próximo ao vencimento', ordem: 'vencimento' })}" style="--kpi-cor:var(--st-warn)">
        <span class="kpi-rotulo" style="color:var(--st-warn-ink)">${icone('alerta')}Vencem em até ${JANELA_PROXIMO} dias</span>
        <span class="kpi-valor">${fmtNum(proximos)}</span>
        <span class="kpi-sub">${pctCtrl(proximos)} dos controlados</span>
      </a>
      <a class="kpi" href="${href('/documentos', { ...filtroBase, situacao: 'Sem data' })}" style="--kpi-cor:var(--st-none)">
        <span class="kpi-rotulo">${icone('interroga')}Sem data de vencimento</span>
        <span class="kpi-valor">${fmtNum(semData)}</span>
        <span class="kpi-sub">em elaboração ou sem cadastro</span>
      </a>
      <a class="kpi" href="${href('/documentos', { ...filtroBase, ordem: 'atualizacao' })}" style="--kpi-cor:var(--rumo-verde)">
        <span class="kpi-rotulo">Atualizados nos últimos 12 meses</span>
        <span class="kpi-valor">${fmtNum(atualizados12)}</span>
        <span class="kpi-sub">${base.length ? fmtPct(atualizados12 / base.length, 1) : '0%'} do acervo</span>
      </a>
    </section>

    <section class="grade-painel">
      <article class="card span-7">
        <div class="card-cab"><div><h2>Situação por tipo de documento</h2><p>Tipos que controlam vencimento. Clique em um trecho para abrir a lista.</p></div></div>
        <div id="g-situacao"></div>
      </article>
      <article class="card span-5">
        <div class="card-cab"><div><h2>Vencimentos nos próximos 12 meses</h2><p>Documentos que vencem em cada mês. Clique para ver a agenda.</p></div></div>
        <div id="g-agenda"></div>
      </article>

      <article class="card span-6">
        <div class="card-cab">
          <div><h2>Vencidos há mais tempo</h2><p>Prioridade de revisão.</p></div>
          <a class="btn btn-sec btn-sm" href="${href('/documentos', { ...filtroBase, situacao: 'Vencido', ordem: 'vencimento' })}">Ver todos</a>
        </div>
        <ul class="lista-compacta" id="l-vencidos"></ul>
      </article>
      <article class="card span-6">
        <div class="card-cab">
          <div><h2>Próximos a vencer</h2><p>Os próximos prazos da agenda.</p></div>
          <a class="btn btn-sec btn-sm" href="${href('/vencimentos', { tipo: f.tipo })}">Abrir agenda</a>
        </div>
        <ul class="lista-compacta" id="l-proximos"></ul>
      </article>

      <article class="card span-7">
        <div class="card-cab"><div><h2>Atualizações por ano</h2><p>Ano da última atualização registrada de cada documento vigente.</p></div></div>
        <div id="g-anos"></div>
      </article>
      <article class="card span-5">
        <div class="card-cab"><div><h2>Tempo desde a última atualização</h2><p id="idade-sub">Idade da versão vigente.</p></div></div>
        <div id="g-idade"></div>
      </article>

      <article class="card span-6">
        <div class="card-cab"><div><h2>Documentos por disciplina</h2><p>Pasta de origem no SharePoint. Clique para filtrar.</p></div></div>
        <div id="g-disc"></div>
      </article>
      <article class="card span-6">
        <div class="card-cab"><div><h2>Em fluxo normativo</h2><p>Documentos em criação, revisão ou validação.</p></div></div>
        <div id="g-fluxo"></div>
      </article>
    </section>`;

  // Filtros
  const form = $('#filtros-painel');
  form.addEventListener('change', () => {
    state.painel = { tipo: form.elements.tipo.value, disciplina: form.elements.disciplina.value };
    viewPainel();
  });
  $('#limpar-painel')?.addEventListener('click', () => {
    state.painel = { tipo: '', disciplina: '' };
    viewPainel();
  });

  // Situação por tipo
  const seriesSit = ['Vencido', 'Próximo ao vencimento', 'Sem data', 'Válido'].map((k) => ({ chave: k, rotulo: SITUACAO[k].rotulo, cor: SITUACAO[k].cor }));
  const linhasSit = state.tipos
    .filter((t) => t.controla_vencimento)
    .map((t) => {
      const docs = ctrl.filter((d) => d.tipo === t.sigla);
      const c = contar(docs, (d) => d._sit);
      return { rotulo: `${t.sigla} · ${t.nome}`, chave: t.sigla, partes: Object.fromEntries(seriesSit.map((s) => [s.chave, c.get(s.chave) || 0])), total: docs.length };
    })
    .filter((l) => l.total > 0);
  empilhadoH($('#g-situacao'), linhasSit, seriesSit, {
    onClick: (l, s) => irPara('/documentos', { tipo: l.chave, situacao: s.chave, disciplina: f.disciplina, ordem: 'vencimento' }),
  });

  // Agenda 12 meses
  const meses = [];
  for (let i = 0; i < 12; i++) {
    const dt = new Date(ref.getFullYear(), ref.getMonth() + i, 1);
    const docsMes = ctrl.filter((d) => d._venc && d._dias >= 0 && d._venc.getFullYear() === dt.getFullYear() && d._venc.getMonth() === dt.getMonth());
    meses.push({
      rotulo: `${MESES[dt.getMonth()]}/${String(dt.getFullYear()).slice(2)}`,
      rotuloCurto: MESES[dt.getMonth()].charAt(0).toUpperCase(),
      rotuloLongo: `${MESES_LONGOS[dt.getMonth()]} de ${dt.getFullYear()}`,
      valor: docsMes.length,
      mes: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`,
    });
  }
  colunas($('#g-agenda'), meses, { onClick: (c) => irPara('/vencimentos', { mes: c.mes, tipo: f.tipo }) });

  // Listas
  const listaVencidos = ctrl.filter((d) => d._sit === 'Vencido' && d._venc).sort((a, b) => a._dias - b._dias).slice(0, 6);
  $('#l-vencidos').innerHTML = listaVencidos.length
    ? listaVencidos.map((d) => itemCompacto(d)).join('')
    : '<li class="muted">Nenhum documento vencido.</li>';
  const listaProximos = ctrl.filter((d) => d._venc && d._dias >= 0).sort((a, b) => a._dias - b._dias).slice(0, 6);
  $('#l-proximos').innerHTML = listaProximos.length ? listaProximos.map((d) => itemCompacto(d)).join('') : '<li class="muted">Nenhum vencimento futuro cadastrado.</li>';

  // Atualizações por ano
  const anos = contar(base.filter((d) => d._atual), (d) => d._atual.getFullYear());
  const anoMin = Math.min(ref.getFullYear() - 9, ...anos.keys());
  const colsAnos = [];
  for (let a = anoMin; a <= ref.getFullYear(); a++) colsAnos.push({ rotulo: String(a), rotuloCurto: `'${String(a).slice(2)}`, valor: anos.get(a) || 0, ano: a });
  colunas($('#g-anos'), colsAnos, { onClick: (c) => irPara('/documentos', { ...filtroBase, ano: c.ano, ordem: 'atualizacao' }) });

  // Idade da última atualização (rampa ordinal de um só tom)
  const faixas = [
    { rotulo: '< 1 ano', curto: '<1', max: 365, cor: 'var(--ord-1)' },
    { rotulo: '1–2 anos', curto: '1–2', max: 730, cor: 'var(--ord-2)' },
    { rotulo: '2–3 anos', curto: '2–3', max: 1095, cor: 'var(--ord-3)' },
    { rotulo: '3–5 anos', curto: '3–5', max: 1826, cor: 'var(--ord-4)' },
    { rotulo: '> 5 anos', curto: '>5', max: Infinity, cor: 'var(--ord-5)' },
  ];
  const comData = base.filter((d) => d._atual);
  const colsIdade = faixas.map((fx, i) => ({
    rotulo: fx.rotulo,
    rotuloCurto: fx.curto,
    rotuloLongo: `Atualizados há ${fx.rotulo}`,
    cor: fx.cor,
    valor: comData.filter((d) => {
      const idade = Math.round((ref - d._atual) / 864e5);
      return idade < fx.max && (i === 0 || idade >= faixas[i - 1].max);
    }).length,
  }));
  colunas($('#g-idade'), colsIdade);
  const semAtual = base.length - comData.length;
  if (semAtual) $('#idade-sub').textContent = `Idade da versão vigente. ${fmtNum(semAtual)} documento(s) sem data de atualização.`;

  // Disciplinas
  const cd = contar(base, (d) => d._disc);
  const linhasDisc = [...cd.entries()]
    .map(([rotulo, valor]) => ({ rotulo, valor, cor: rotulo === SEM_DISCIPLINA ? 'var(--st-none)' : undefined }))
    .sort((a, b) => (a.rotulo === SEM_DISCIPLINA) - (b.rotulo === SEM_DISCIPLINA) || b.valor - a.valor);
  barrasH($('#g-disc'), linhasDisc, { onClick: (l) => irPara('/documentos', { tipo: f.tipo, disciplina: l.rotulo }) });

  // Fluxo normativo
  const cf = contar(base.filter((d) => d.status_normativo), (d) => d.status_normativo);
  const linhasFluxo = fluxos().filter((k) => cf.get(k)).map((k) => ({ rotulo: k, valor: cf.get(k) }));
  barrasH($('#g-fluxo'), linhasFluxo, { cor: 'var(--rumo-azul-claro)', onClick: (l) => irPara('/documentos', { ...filtroBase, fluxo: l.rotulo }) });
}

// ===========================================================================
// Documentos
// ===========================================================================
function viewDocumentos(params) {
  const f = state.docsFiltro;
  if ([...params.keys()].length) {
    Object.assign(f, FILTRO_DOCS_PADRAO);
    for (const k of Object.keys(FILTRO_DOCS_PADRAO)) {
      if (k !== 'vigentes' && params.has(k)) f[k] = params.get(k);
    }
    if (params.get('vigentes') === '0') f.vigentes = false;
  }
  state.limite = 50;

  const sits = SITUACOES.map((s) => [s.chave, s.rotulo]);
  $('#view').innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Documentos</h1><p>Catálogo completo com links para o documento publicado e a versão editável.</p></div>
      <div class="acoes"><button class="btn" type="button" id="novo-doc">${icone('mais')}Novo documento</button></div>
    </div>
    <form class="barra-filtros" id="filtros-docs" onsubmit="return false">
      <label class="campo busca"><span>Buscar</span>
        <input class="input" type="search" name="q" value="${esc(f.q)}" placeholder="Código, título, disciplina…" autocomplete="off"></label>
      <label class="campo"><span>Tipo</span><select class="input" name="tipo">${opcoesTipos(f.tipo)}</select></label>
      <label class="campo"><span>Situação</span><select class="input" name="situacao">${opcoes(sits, f.situacao, 'Todas')}</select></label>
      <label class="campo"><span>Disciplina</span><select class="input" name="disciplina">${opcoes(disciplinas(), f.disciplina, 'Todas')}</select></label>
      <label class="campo"><span>Fluxo normativo</span><select class="input" name="fluxo">${opcoes([...fluxos(), ['__sem', 'Fora do fluxo']], f.fluxo, 'Todos')}</select></label>
      <label class="campo"><span>Links</span><select class="input" name="links">${opcoes([['pdf', 'Com documento publicado'], ['editavel', 'Com versão editável'], ['nenhum', 'Sem nenhum link']], f.links, 'Todos')}</select></label>
      <label class="campo"><span>Ordenar por</span><select class="input" name="ordem">${opcoes([['codigo', 'Tipo e código'], ['vencimento', 'Vencimento mais próximo'], ['atualizacao', 'Atualização mais recente'], ['titulo', 'Título (A–Z)']], f.ordem)}</select></label>
      <label class="check" style="min-height:38px"><input type="checkbox" name="vigentes"${f.vigentes ? ' checked' : ''}> Somente vigentes</label>
      <button class="btn btn-sec" type="button" id="limpar-docs">Limpar</button>
    </form>
    <div id="docs-resultado"></div>`;

  const form = $('#filtros-docs');
  const ler = () => {
    Object.assign(f, {
      q: form.elements.q.value,
      tipo: form.elements.tipo.value,
      situacao: form.elements.situacao.value,
      disciplina: form.elements.disciplina.value,
      fluxo: form.elements.fluxo.value,
      links: form.elements.links.value,
      ordem: form.elements.ordem.value,
      vigentes: form.elements.vigentes.checked,
    });
    state.limite = 50;
    renderListaDocs();
  };
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'q') ler();
  });
  form.elements.q.addEventListener('input', debounce(ler, 220));
  $('#limpar-docs').addEventListener('click', () => {
    Object.assign(f, FILTRO_DOCS_PADRAO);
    history.replaceState(null, '', `${location.pathname}#/documentos`);
    viewDocumentos(new URLSearchParams());
  });
  $('#novo-doc').addEventListener('click', () => abrirFormulario(null));
  renderListaDocs();
}

function filtrarDocs() {
  const f = state.docsFiltro;
  const termos = normTexto(f.q).split(' ').filter(Boolean);
  const lista = state.docs.filter((d) => {
    if (f.vigentes && !d.vigente) return false;
    if (f.tipo && d.tipo !== f.tipo) return false;
    if (f.situacao && d._sit !== f.situacao) return false;
    if (f.disciplina && d._disc !== f.disciplina) return false;
    if (f.fluxo && (f.fluxo === '__sem' ? d.status_normativo : d.status_normativo !== f.fluxo)) return false;
    if (f.ano && !(d._atual && String(d._atual.getFullYear()) === String(f.ano))) return false;
    if (f.links) {
      const pdf = Boolean(urlSegura(d.link_pdf));
      const ed = Boolean(urlSegura(d.link_editavel));
      if (f.links === 'pdf' && !pdf) return false;
      if (f.links === 'editavel' && !ed) return false;
      if (f.links === 'nenhum' && (pdf || ed)) return false;
    }
    return termos.every((t) => d._busca.includes(t));
  });
  const ordemTipo = (d) => (d._tipo ? d._tipo.ordem : 999);
  const porCodigo = (a, b) => ordemTipo(a) - ordemTipo(b) || String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt-BR', { numeric: true });
  const ordens = {
    codigo: porCodigo,
    titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'),
    vencimento: (a, b) => {
      const va = a._controla && a._venc ? a._venc.getTime() : Infinity;
      const vb = b._controla && b._venc ? b._venc.getTime() : Infinity;
      return va - vb || porCodigo(a, b);
    },
    atualizacao: (a, b) => (b._atual ? b._atual.getTime() : -Infinity) - (a._atual ? a._atual.getTime() : -Infinity) || porCodigo(a, b),
  };
  return lista.sort(ordens[f.ordem] || porCodigo);
}

function linhaDoc(d) {
  return `<tr>
    <td><span class="chip-cod">${esc(d.codigo || '—')}</span></td>
    <td>
      <button class="titulo-doc" type="button" data-abrir="${d.id}">${esc(d.titulo)}</button>
      <div class="meta">${esc(d._tipoNome)} · ${esc(d._disc)}${d.revisao ? ` · Rev. ${esc(d.revisao.replace(/^R/, ''))}` : ''}${d.status_normativo ? ` · ${esc(d.status_normativo)}` : ''}${d.vigente ? '' : ' · <strong>Não vigente</strong>'}</div>
    </td>
    <td data-rotulo="Atualização" class="nowrap">${fmtData(d._atual)}</td>
    <td data-rotulo="Vencimento">${vencHTML(d)}</td>
    <td>${badgeSituacao(d._sit)}</td>
    <td class="cel-links">${linksHTML(d)}</td>
  </tr>`;
}

function renderListaDocs() {
  const el = $('#docs-resultado');
  if (!el) return;
  const f = state.docsFiltro;
  const lista = filtrarDocs();
  const visiveis = lista.slice(0, state.limite);

  const params = { ...f, vigentes: f.vigentes ? '' : '0', ordem: f.ordem === 'codigo' ? '' : f.ordem };
  history.replaceState(null, '', `${location.pathname}${href('/documentos', params)}`);

  const chipAno = f.ano
    ? `<button class="btn btn-sec btn-sm" type="button" id="tirar-ano">Atualizados em ${esc(f.ano)} ${icone('fechar')}</button>`
    : '';
  el.innerHTML = `
    <div class="resultado-info">
      <span><strong>${fmtNum(lista.length)}</strong> ${lista.length === 1 ? 'documento' : 'documentos'} ${chipAno}</span>
      ${lista.length ? `<button class="btn btn-sec btn-sm" type="button" id="exportar-lista">${icone('baixar')}Exportar CSV</button>` : ''}
    </div>
    ${
      lista.length
        ? `<div class="tabela-wrap"><table class="tabela-docs">
            <thead><tr><th>Código</th><th>Documento</th><th>Atualização</th><th>Vencimento</th><th>Situação</th><th>Links</th></tr></thead>
            <tbody>${visiveis.map(linhaDoc).join('')}</tbody>
          </table></div>
          ${lista.length > visiveis.length ? `<div class="mais"><button class="btn btn-sec" type="button" id="mais-docs">Mostrar mais ${fmtNum(Math.min(50, lista.length - visiveis.length))} (restam ${fmtNum(lista.length - visiveis.length)})</button></div>` : ''}`
        : '<div class="vazio">Nenhum documento encontrado com esses filtros.</div>'
    }`;

  $('#mais-docs')?.addEventListener('click', () => {
    state.limite += 50;
    renderListaDocs();
  });
  $('#exportar-lista')?.addEventListener('click', () => exportarCSV(lista, `procedimentos-${new Date().toISOString().slice(0, 10)}.csv`));
  $('#tirar-ano')?.addEventListener('click', () => {
    f.ano = '';
    renderListaDocs();
  });
}

// ===========================================================================
// Vencimentos (agenda)
// ===========================================================================
function viewVencimentos(params) {
  if (params.has('tipo')) state.venc.tipo = params.get('tipo');
  const mesAlvo = params.get('mes');
  const ref = hoje();
  const base = vigentes().filter((d) => d._controla && (!state.venc.tipo || d.tipo === state.venc.tipo));
  const vencidos = base.filter((d) => d._sit === 'Vencido').sort((a, b) => (a._dias ?? 0) - (b._dias ?? 0));
  const semData = base.filter((d) => d._sit === 'Sem data');
  const futuros = base.filter((d) => d._venc && d._dias >= 0).sort((a, b) => a._dias - b._dias);

  const grupos = [
    { id: 'vencidos', titulo: 'Vencidos', itens: vencidos, icone: ['x', 'crit'], aberto: !mesAlvo },
    { id: 'sem-data', titulo: 'Sem data de vencimento', itens: semData, icone: ['interroga', 'none'], aberto: false },
  ];
  const porMes = new Map();
  for (const d of futuros) {
    const k = `${d._venc.getFullYear()}-${pad2(d._venc.getMonth() + 1)}`;
    if (!porMes.has(k)) porMes.set(k, []);
    porMes.get(k).push(d);
  }
  const limite24 = new Date(ref.getFullYear(), ref.getMonth() + 24, 1);
  const depois = [];
  for (const [k, itens] of porMes) {
    const [y, m] = k.split('-').map(Number);
    const inicio = new Date(y, m - 1, 1);
    if (inicio >= limite24) {
      depois.push(...itens);
      continue;
    }
    const mesesAte = (y - ref.getFullYear()) * 12 + (m - 1 - ref.getMonth());
    grupos.push({
      id: `mes-${k}`,
      titulo: `${MESES_LONGOS[m - 1].charAt(0).toUpperCase()}${MESES_LONGOS[m - 1].slice(1)} de ${y}`,
      itens,
      badge: mesesAte <= 1 ? 'Próximo ao vencimento' : null,
      aberto: mesAlvo ? mesAlvo === k : mesesAte <= 2,
    });
  }
  if (depois.length) {
    grupos.push({ id: 'depois', titulo: `A partir de ${MESES_LONGOS[limite24.getMonth()]} de ${limite24.getFullYear()}`, itens: depois, aberto: false });
  }

  $('#view').innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Agenda de vencimentos</h1><p>Documentos vigentes que controlam vencimento, agrupados por prazo.</p></div>
    </div>
    <form class="barra-filtros" id="filtros-venc" onsubmit="return false">
      <label class="campo"><span>Tipo de documento</span><select class="input" name="tipo">${opcoesTipos(state.venc.tipo)}</select></label>
    </form>
    <div class="agenda">
      ${grupos
        .filter((g) => g.itens.length || g.id === 'vencidos')
        .map(
          (g) => `<details class="card agenda-grupo" id="${g.id}"${g.aberto ? ' open' : ''}>
            <summary>
              <h2>${g.icone ? `<span class="ico-sit ${g.icone[1]}">${icone(g.icone[0])}</span>` : ''}${esc(g.titulo)}${g.badge ? badgeSituacao(g.badge) : ''}</h2>
              <span style="display:flex;align-items:center;gap:10px"><span class="contagem">${fmtNum(g.itens.length)}</span><span class="seta">${icone('seta', 'width="18" height="18"')}</span></span>
            </summary>
            ${g.itens.length ? `<ul class="lista-compacta">${g.itens.map((d) => itemCompacto(d, { mostrarLinks: true })).join('')}</ul>` : '<p class="muted" style="margin:12px 0 0">Nenhum documento vencido.</p>'}
          </details>`
        )
        .join('')}
    </div>`;

  $('#filtros-venc').addEventListener('change', (e) => {
    state.venc.tipo = e.target.value;
    history.replaceState(null, '', `${location.pathname}${href('/vencimentos', { tipo: state.venc.tipo })}`);
    viewVencimentos(new URLSearchParams());
  });
  if (mesAlvo) $(`#mes-${mesAlvo}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===========================================================================
// Gestão
// ===========================================================================
function viewGestao() {
  const total = state.docs.length;
  const vig = state.docs.filter((d) => d.vigente).length;
  const origem = contar(state.docs, (d) => d.origem);
  const ultima = state.docs.reduce((m, d) => (d.atualizado_em > m ? d.atualizado_em : m), '');
  const semDisc = state.docs.filter((d) => !d.disciplina).length;

  $('#view').innerHTML = `
    <div class="cabecalho-pagina">
      <div><h1>Gestão dos dados</h1><p>Atualize a base a partir do Power BI, ajuste os tipos de documento e exporte os dados.</p></div>
      <div class="acoes">
        <button class="btn btn-sec" type="button" id="g-exportar">${icone('baixar')}Exportar tudo (CSV)</button>
        <button class="btn" type="button" id="g-novo">${icone('mais')}Novo documento</button>
      </div>
    </div>

    <section class="grade-painel">
      <article class="card span-12">
        <div class="card-cab"><div>
          <h2>Atualizar a partir do Power BI</h2>
          <p>Compare uma exportação da tabela “Base de documentos” com o que está no Supabase e aplique somente as diferenças.</p>
        </div></div>
        <ol class="passos">
          <li>No Power BI, abra <strong>Controle de Documentos → Base de documentos</strong>.</li>
          <li>No menu <strong>“…”</strong> da tabela, escolha <strong>Exportar dados</strong> (.xlsx ou .csv).</li>
          <li>Envie o arquivo aqui, confira a prévia e clique em <strong>Aplicar alterações</strong>.</li>
        </ol>
        <label class="drop" id="drop">
          <input type="file" id="arquivo-import" accept=".xlsx,.xls,.csv" class="sr-only">
          ${icone('subir', 'width="28" height="28" style="color:var(--accent)"')}
          <div><strong>Clique para escolher o arquivo</strong> ou arraste e solte aqui</div>
          <div class="muted" style="font-size:12px">Nada é gravado antes da sua confirmação.</div>
        </label>
        <div id="import-previa"></div>
      </article>

      <article class="card span-7">
        <div class="card-cab"><div><h2>Tipos de documento</h2><p>Defina o nome exibido e se o tipo controla vencimento.</p></div></div>
        <div class="tabela-wrap" style="box-shadow:none">
          <table>
            <thead><tr><th>Sigla</th><th>Nome</th><th>Controla vencimento</th><th>Ordem</th><th></th></tr></thead>
            <tbody>${state.tipos
              .map(
                (t) => `<tr data-sigla="${esc(t.sigla)}">
                  <td><span class="chip-cod">${esc(t.sigla)}</span></td>
                  <td><input class="input" name="nome" value="${esc(t.nome)}" aria-label="Nome do tipo ${esc(t.sigla)}"></td>
                  <td><label class="check"><input type="checkbox" name="controla"${t.controla_vencimento ? ' checked' : ''}> Sim</label></td>
                  <td style="width:90px"><input class="input" name="ordem" type="number" value="${esc(t.ordem)}" aria-label="Ordem do tipo ${esc(t.sigla)}"></td>
                  <td><button class="btn btn-sec btn-sm" type="button" data-salvar-tipo>Salvar</button></td>
                </tr>`
              )
              .join('')}</tbody>
          </table>
        </div>
      </article>

      <article class="card span-5">
        <div class="card-cab"><div><h2>Resumo da base</h2><p>Dados guardados no Supabase.</p></div></div>
        <dl class="dados">
          <div><dt>Documentos</dt><dd>${fmtNum(total)}</dd></div>
          <div><dt>Vigentes</dt><dd>${fmtNum(vig)}</dd></div>
          <div><dt>Vindos do Power BI</dt><dd>${fmtNum(origem.get('powerbi') || 0)}</dd></div>
          <div><dt>Cadastro manual</dt><dd>${fmtNum(origem.get('manual') || 0)}</dd></div>
          <div><dt>Sem disciplina</dt><dd><a href="${href('/documentos', { disciplina: SEM_DISCIPLINA })}">${fmtNum(semDisc)}</a></dd></div>
          <div><dt>Última alteração</dt><dd>${ultima ? new Date(ultima).toLocaleString('pt-BR') : '—'}</dd></div>
          <div class="largo"><dt>Regra de situação</dt><dd style="font-size:13px;color:var(--text-2)">Vencido: data de vencimento anterior a hoje. Próximo ao vencimento: vence em até ${JANELA_PROXIMO} dias. Tipos que não controlam vencimento aparecem como “Não controla vencimento”.</dd></div>
        </dl>
      </article>
    </section>`;

  $('#g-exportar').addEventListener('click', () => exportarCSV(state.docs, `procedimentos-completo-${new Date().toISOString().slice(0, 10)}.csv`));
  $('#g-novo').addEventListener('click', () => abrirFormulario(null));

  $$('[data-salvar-tipo]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const tr = btn.closest('tr');
      const nome = tr.querySelector('[name=nome]').value.trim();
      if (!nome) return toast('Informe o nome do tipo.', true);
      btn.disabled = true;
      const { error } = await sb
        .from('tipos_documento')
        .update({ nome, controla_vencimento: tr.querySelector('[name=controla]').checked, ordem: Number(tr.querySelector('[name=ordem]').value) || 0 })
        .eq('sigla', tr.dataset.sigla);
      btn.disabled = false;
      if (error) return toast(`Erro ao salvar: ${error.message}`, true);
      toast('Tipo atualizado.');
      await carregarDados();
    })
  );

  // Importação
  const drop = $('#drop');
  const input = $('#arquivo-import');
  input.addEventListener('change', () => input.files[0] && prepararImportacao(input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('ativo');
    })
  );
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('ativo')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const arq = e.dataTransfer.files[0];
    if (arq) prepararImportacao(arq);
  });
}

async function prepararImportacao(arquivo) {
  const alvo = $('#import-previa');
  alvo.innerHTML = carregandoHTML(`Lendo “${arquivo.name}”…`);
  let imp;
  try {
    imp = await import('./importer.js');
    const lido = await imp.lerPlanilha(arquivo, state.tiposMap);
    const plano = imp.planejar(lido.linhas, state.docs, new Set(lido.colunasFaltando));
    renderPrevia(alvo, arquivo, lido, plano, imp);
  } catch (err) {
    alvo.innerHTML = `<div class="alerta" style="margin-top:16px">${esc(err.message || String(err))}</div>`;
  }
}

const ROTULO_CAMPO = {
  codigo: 'Código', tipo: 'Tipo', numero: 'Número', revisao: 'Revisão', titulo: 'Título', disciplina: 'Disciplina',
  data_atualizacao: 'Atualização', data_vencimento: 'Vencimento', status_normativo: 'Fluxo normativo', vigente: 'Vigente',
  link_pdf: 'Link do documento', link_editavel: 'Link editável',
};

function renderPrevia(alvo, arquivo, lido, plano, imp) {
  const faltando = lido.colunasFaltando.length
    ? `<div class="alerta info" style="margin-top:12px">Colunas não encontradas (serão mantidas como estão): ${esc(lido.colunasFaltando.join(', '))}.</div>`
    : '';
  const valor = (c, v) => {
    if (v == null || v === '') return '—';
    if (c === 'link_pdf' || c === 'link_editavel') return 'link';
    return String(v);
  };
  const exemplos = plano.alterados.slice(0, 40).map(({ alvo: a, mudancas }) => `<tr>
      <td><span class="chip-cod">${esc(a.codigo || '—')}</span><div class="meta">${esc(a.titulo)}</div></td>
      <td class="diff">${Object.entries(mudancas)
        .map(([c, v]) => `<div><strong>${esc(ROTULO_CAMPO[c] || c)}:</strong> <del>${esc(valor(c, a[c]))}</del> → <ins>${esc(valor(c, v))}</ins></div>`)
        .join('')}</td>
    </tr>`);
  const novos = plano.novos.slice(0, 40).map((n) => `<tr><td><span class="chip-cod">${esc(n.codigo || '—')}</span></td><td>${esc(n.titulo)}</td></tr>`);

  alvo.innerHTML = `
    <div style="margin-top:16px">
      <p>Arquivo <strong>${esc(arquivo.name)}</strong> · aba “${esc(lido.aba)}” · ${fmtNum(lido.linhas.length)} linhas lidas.</p>
      ${faltando}
      <div class="resumo-import">
        <div><strong>${fmtNum(plano.novos.length)}</strong>novos</div>
        <div><strong>${fmtNum(plano.alterados.length)}</strong>com alterações</div>
        <div><strong>${fmtNum(plano.iguais.length)}</strong>sem mudança</div>
        <div><strong>${fmtNum(plano.ausentes.length)}</strong>vigentes fora da planilha</div>
      </div>
      ${plano.alterados.length ? `<details class="viz-tabela" open><summary>Alterações (${fmtNum(plano.alterados.length)}${plano.alterados.length > 40 ? ', mostrando 40' : ''})</summary><div class="tabela-wrap" style="box-shadow:none;margin-top:8px"><table><thead><tr><th>Documento</th><th>O que muda</th></tr></thead><tbody>${exemplos.join('')}</tbody></table></div></details>` : ''}
      ${plano.novos.length ? `<details class="viz-tabela"><summary>Novos documentos (${fmtNum(plano.novos.length)}${plano.novos.length > 40 ? ', mostrando 40' : ''})</summary><div class="tabela-wrap" style="box-shadow:none;margin-top:8px"><table><thead><tr><th>Código</th><th>Título</th></tr></thead><tbody>${novos.join('')}</tbody></table></div></details>` : ''}
      ${plano.ausentes.length ? `<label class="check" style="margin-top:14px"><input type="checkbox" id="desativar-ausentes"> Marcar os ${fmtNum(plano.ausentes.length)} documentos vigentes que não estão na planilha como <strong>não vigentes</strong></label>` : ''}
      <div id="import-status" style="margin-top:12px"></div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="btn" type="button" id="aplicar-import"${plano.novos.length + plano.alterados.length + plano.ausentes.length ? '' : ' disabled'}>Aplicar alterações</button>
        <button class="btn btn-sec" type="button" id="cancelar-import">Cancelar</button>
      </div>
    </div>`;

  $('#cancelar-import').addEventListener('click', () => {
    alvo.innerHTML = '';
    $('#arquivo-import').value = '';
  });
  $('#aplicar-import').addEventListener('click', async (e) => {
    const desativar = Boolean($('#desativar-ausentes')?.checked);
    const btn = e.currentTarget;
    btn.disabled = true;
    const status = $('#import-status');
    try {
      await imp.aplicar(sb, plano, { desativarAusentes: desativar }, (feitos, total) => {
        status.innerHTML = `<div class="alerta info">Gravando… ${fmtNum(feitos)} de ${fmtNum(total)}</div>`;
      });
      await carregarDados();
      toast('Base atualizada com sucesso.');
      viewGestao();
    } catch (err) {
      status.innerHTML = `<div class="alerta">Erro ao gravar: ${esc(err.message || String(err))}. Parte das alterações pode ter sido aplicada; recarregue e importe novamente.</div>`;
      btn.disabled = false;
    }
  });
}

// ===========================================================================
// Diálogos: detalhes, formulário, senha
// ===========================================================================
function abrirDialogo(html) {
  const dlg = $('#dlg');
  dlg.innerHTML = html;
  if (!dlg.open) dlg.showModal();
  dlg.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  return dlg;
}

async function abrirDetalhes(id) {
  const d = state.docs.find((x) => x.id === id);
  if (!d) return;
  const vencTxt = d._controla
    ? d._venc
      ? `${fmtData(d._venc)} (${esc(textoDias(d._dias))})`
      : 'Sem data'
    : `Não se aplica${d._venc ? ` <span class="muted">(data registrada: ${fmtData(d._venc)})</span>` : ''}`;
  const dlg = abrirDialogo(`<div class="dlg">
    <div class="dlg-cab">
      <div style="min-width:0">
        <span class="chip-cod">${esc(d.codigo || '—')}</span>
        <h2 style="margin-top:8px">${esc(d.titulo)}</h2>
      </div>
      <button class="fechar" type="button" data-fechar aria-label="Fechar">${icone('fechar')}</button>
    </div>
    <div class="dlg-corpo">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:16px">${badgeSituacao(d._sit)}${linksHTML(d)}</div>
      <dl class="dados">
        <div><dt>Tipo</dt><dd>${esc(d._tipoNome)} (${esc(d.tipo)})</dd></div>
        <div><dt>Revisão</dt><dd>${esc(d.revisao || '—')}</dd></div>
        <div><dt>Disciplina</dt><dd>${esc(d._disc)}</dd></div>
        <div><dt>Fluxo normativo</dt><dd>${esc(d.status_normativo || '—')}</dd></div>
        <div><dt>Última atualização</dt><dd>${fmtData(d._atual)}</dd></div>
        <div><dt>Vencimento</dt><dd>${vencTxt}</dd></div>
        <div><dt>Vigente</dt><dd>${d.vigente ? 'Sim' : 'Não'}</dd></div>
        <div><dt>Origem</dt><dd>${d.origem === 'powerbi' ? 'Power BI' : 'Cadastro manual'}</dd></div>
        ${d.observacoes ? `<div class="largo"><dt>Observações</dt><dd style="white-space:pre-wrap">${esc(d.observacoes)}</dd></div>` : ''}
      </dl>
      <h3 style="margin-top:22px">Histórico de alterações</h3>
      <ul class="historico" id="hist"><li class="muted">Carregando…</li></ul>
    </div>
    <div class="dlg-rodape">
      <button class="btn btn-sec esq" type="button" id="det-excluir">Excluir</button>
      <button class="btn btn-sec" type="button" data-fechar>Fechar</button>
      <button class="btn" type="button" id="det-editar">${icone('editar')}Editar</button>
    </div>
  </div>`);

  $('#det-editar', dlg).addEventListener('click', () => abrirFormulario(d));
  $('#det-excluir', dlg).addEventListener('click', async () => {
    if (!window.confirm(`Excluir definitivamente "${d.codigo || ''} ${d.titulo}"?\n\nSe o documento só deixou de valer, prefira editar e desmarcar "Vigente".`)) return;
    const { error } = await sb.from('documentos').delete().eq('id', d.id);
    if (error) return toast(`Erro ao excluir: ${error.message}`, true);
    dlg.close();
    toast('Documento excluído.');
    await recarregar();
  });

  const { data, error } = await sb.from('documentos_historico').select('*').eq('documento_id', id).order('alterado_em', { ascending: false }).limit(30);
  const ul = $('#hist', dlg);
  if (!ul) return;
  if (error) {
    ul.innerHTML = `<li class="muted">Não foi possível carregar o histórico.</li>`;
    return;
  }
  if (!data.length) {
    ul.innerHTML = `<li class="muted">Sem alterações registradas pelo site${d.origem === 'powerbi' ? ' (carga inicial do Power BI)' : ''}.</li>`;
    return;
  }
  const acoes = { insert: 'Criado', update: 'Alterado', delete: 'Excluído' };
  ul.innerHTML = data
    .map((h) => {
      const antes = h.dados_anteriores || {};
      const depois = h.dados_novos || {};
      const campos = Object.keys(ROTULO_CAMPO).filter((c) => JSON.stringify(antes[c] ?? null) !== JSON.stringify(depois[c] ?? null));
      return `<li><strong>${esc(acoes[h.acao] || h.acao)}</strong> em ${new Date(h.alterado_em).toLocaleString('pt-BR')}${h.alterado_por ? ` por ${esc(h.alterado_por)}` : ''}
        ${h.acao === 'update' && campos.length ? `<div class="muted">${esc(campos.map((c) => ROTULO_CAMPO[c]).join(', '))}</div>` : ''}</li>`;
    })
    .join('');
}

function abrirFormulario(d) {
  const novo = !d;
  const v = (campo) => esc(d?.[campo] ?? '');
  const dlg = abrirDialogo(`<form class="dlg" id="form-doc" novalidate>
    <div class="dlg-cab">
      <h2>${novo ? 'Novo documento' : 'Editar documento'}</h2>
      <button class="fechar" type="button" data-fechar aria-label="Fechar">${icone('fechar')}</button>
    </div>
    <div class="dlg-corpo">
      <div class="form-grade">
        <label class="campo"><span>Código</span><input class="input" name="codigo" value="${v('codigo')}" placeholder="PO-SPE-010-R6" autocomplete="off"></label>
        <label class="campo"><span>Tipo</span><select class="input" name="tipo">${opcoes(state.tipos.map((t) => [t.sigla, `${t.sigla} — ${t.nome}`]), d?.tipo || 'PO')}</select></label>
        <label class="campo largo"><span>Título *</span><input class="input" name="titulo" value="${v('titulo')}" required></label>
        <label class="campo"><span>Revisão</span><input class="input" name="revisao" value="${v('revisao')}" placeholder="R0"></label>
        <label class="campo"><span>Disciplina</span><input class="input" name="disciplina" value="${v('disciplina')}" list="lista-disc" autocomplete="off">
          <datalist id="lista-disc">${disciplinas().filter((x) => x !== SEM_DISCIPLINA).map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label>
        <label class="campo"><span>Última atualização</span><input class="input" type="date" name="data_atualizacao" value="${v('data_atualizacao')}"></label>
        <label class="campo"><span>Vencimento</span><input class="input" type="date" name="data_vencimento" value="${v('data_vencimento')}"></label>
        <label class="campo"><span>Fluxo normativo</span><input class="input" name="status_normativo" value="${v('status_normativo')}" list="lista-fluxo" autocomplete="off" placeholder="Vazio = fora do fluxo">
          <datalist id="lista-fluxo">${FLUXO_ORDEM.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label>
        <label class="check" style="align-self:end;min-height:38px"><input type="checkbox" name="vigente"${novo || d.vigente ? ' checked' : ''}> Documento vigente</label>
        <label class="campo largo"><span>Link do documento publicado</span><input class="input" type="url" name="link_pdf" value="${v('link_pdf')}" placeholder="https://rumolog.sharepoint.com/…"></label>
        <label class="campo largo"><span>Link da versão editável</span><input class="input" type="url" name="link_editavel" value="${v('link_editavel')}" placeholder="https://rumolog.sharepoint.com/…"></label>
        <label class="campo largo"><span>Observações</span><textarea class="input" name="observacoes">${v('observacoes')}</textarea></label>
      </div>
      <p class="dica" style="margin-top:12px">Dica: ao digitar um código no padrão <strong>XX-SPE-000-R0</strong>, o tipo e a revisão são preenchidos automaticamente.</p>
      <div class="alerta" id="form-doc-msg" hidden style="margin-top:12px"></div>
    </div>
    <div class="dlg-rodape">
      <button class="btn btn-sec" type="button" data-fechar>Cancelar</button>
      <button class="btn" type="submit">Salvar</button>
    </div>
  </form>`);

  const form = $('#form-doc', dlg);
  const el = form.elements;
  el.codigo.addEventListener('input', () => {
    const p = analisarCodigo(el.codigo.value.toUpperCase());
    if (!p) return;
    if (p.prefixo && state.tiposMap.has(p.prefixo)) el.tipo.value = p.prefixo;
    el.revisao.value = p.revisao;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#form-doc-msg', dlg);
    const erro = (t) => {
      msg.textContent = t;
      msg.hidden = false;
    };
    const titulo = el.titulo.value.replace(/\s+/g, ' ').trim();
    if (!titulo) return erro('Informe o título do documento.');
    for (const campo of ['link_pdf', 'link_editavel']) {
      const u = el[campo].value.trim();
      if (u && !urlSegura(u)) return erro('Os links precisam começar com https://');
    }
    const codigo = el.codigo.value.trim().toUpperCase() || null;
    const partes = analisarCodigo(codigo);
    const payload = {
      codigo,
      tipo: el.tipo.value,
      numero: partes ? partes.numero : d?.numero ?? null,
      revisao: el.revisao.value.trim() || null,
      titulo,
      disciplina: el.disciplina.value.trim() || null,
      data_atualizacao: el.data_atualizacao.value || null,
      data_vencimento: el.data_vencimento.value || null,
      status_normativo: el.status_normativo.value.trim() || null,
      vigente: el.vigente.checked,
      link_pdf: el.link_pdf.value.trim() || null,
      link_editavel: el.link_editavel.value.trim() || null,
      observacoes: el.observacoes.value.trim() || null,
    };
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const resp = novo
      ? await sb.from('documentos').insert({ ...payload, origem: 'manual' }).select('id').single()
      : await sb.from('documentos').update(payload).eq('id', d.id).select('id').single();
    btn.disabled = false;
    if (resp.error) return erro(`Não foi possível salvar: ${resp.error.message}`);
    dlg.close();
    toast(novo ? 'Documento criado.' : 'Documento atualizado.');
    await recarregar();
  });
}

function abrirAlterarSenha() {
  const dlg = abrirDialogo(`<form class="dlg" id="form-senha" novalidate style="max-width:460px">
    <div class="dlg-cab"><h2>Alterar senha</h2><button class="fechar" type="button" data-fechar aria-label="Fechar">${icone('fechar')}</button></div>
    <div class="dlg-corpo" style="display:flex;flex-direction:column;gap:14px">
      <label class="campo"><span>Nova senha</span><input class="input" type="password" name="senha" autocomplete="new-password" minlength="8" required></label>
      <label class="campo"><span>Confirmar nova senha</span><input class="input" type="password" name="confirmacao" autocomplete="new-password" minlength="8" required></label>
      <div class="alerta" id="senha-msg" hidden></div>
    </div>
    <div class="dlg-rodape"><button class="btn btn-sec" type="button" data-fechar>Cancelar</button><button class="btn" type="submit">Salvar senha</button></div>
  </form>`);
  $('#form-senha', dlg).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget.elements;
    const msg = $('#senha-msg', dlg);
    const problema = validarSenha(f.senha.value, f.confirmacao.value);
    if (problema) {
      msg.textContent = problema;
      msg.hidden = false;
      return;
    }
    const { error } = await sb.auth.updateUser({ password: f.senha.value });
    if (error) {
      msg.textContent = `Não foi possível alterar: ${error.message}`;
      msg.hidden = false;
      return;
    }
    dlg.close();
    toast('Senha alterada.');
  });
}

function validarSenha(senha, confirmacao) {
  if (senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (senha !== confirmacao) return 'As senhas não conferem.';
  return '';
}

// ===========================================================================
// Eventos globais e início
// ===========================================================================
function ligarEventos() {
  $('#btn-tema').addEventListener('click', alternarTema);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', desenharBotaoTema);

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget.elements;
    const email = f.email.value.trim();
    const senha = f.senha.value;
    if (!email || !senha) return avisoLogin('Informe e-mail e senha.');
    const btn = e.currentTarget.querySelector('button[type=submit]');
    btn.disabled = true;
    avisoLogin('');
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    btn.disabled = false;
    if (error) {
      return avisoLogin(/invalid login/i.test(error.message) ? 'E-mail ou senha inválidos.' : `Não foi possível entrar: ${error.message}`);
    }
    f.senha.value = '';
    await entrar(data.user);
  });

  $('#btn-esqueci').addEventListener('click', async () => {
    const email = $('#form-login').elements.email.value.trim();
    if (!email) return avisoLogin('Digite seu e-mail no campo acima e clique novamente em “Esqueci minha senha”.', 'info');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${location.pathname}` });
    avisoLogin(
      error ? `Não foi possível enviar o e-mail: ${error.message}` : 'Se o e-mail estiver autorizado, você receberá um link para definir uma nova senha.',
      error ? '' : 'ok'
    );
  });

  $('#form-nova-senha').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget.elements;
    const msg = $('#nova-senha-msg');
    const problema = validarSenha(f.senha.value, f.confirmacao.value);
    if (problema) {
      msg.textContent = problema;
      msg.hidden = false;
      return;
    }
    const { data, error } = await sb.auth.updateUser({ password: f.senha.value });
    if (error) {
      msg.textContent = `Não foi possível salvar: ${error.message}`;
      msg.hidden = false;
      return;
    }
    state.recuperandoSenha = false;
    history.replaceState(null, '', `${location.pathname}#/painel`);
    toast('Senha definida.');
    await entrar(data.user);
  });

  const menuBtn = $('#btn-usuario');
  const menu = $('#menu-usuario');
  const fecharMenu = () => {
    menu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
  };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) fecharMenu();
  });
  $('#btn-sair').addEventListener('click', async () => {
    fecharMenu();
    await sb.auth.signOut();
  });
  $('#btn-alterar-senha').addEventListener('click', () => {
    fecharMenu();
    abrirAlterarSenha();
  });
  $('#btn-recarregar').addEventListener('click', async () => {
    fecharMenu();
    $('#view').innerHTML = carregandoHTML('Recarregando…');
    await recarregar();
    toast('Dados atualizados.');
  });

  $('#view').addEventListener('click', (e) => {
    const abrir = e.target.closest('[data-abrir]');
    if (abrir) abrirDetalhes(Number(abrir.dataset.abrir));
    if (e.target.closest('[data-acao="sair"]')) sb.auth.signOut();
  });
  $('#dlg').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.close();
  });
  $('#dlg').addEventListener('close', () => {
    $('#dlg').innerHTML = '';
  });
  window.addEventListener('hashchange', rotear);
  window.addEventListener('scroll', esconderTip, { passive: true });
}

async function iniciar() {
  desenharBotaoTema();
  ligarEventos();

  sb.auth.onAuthStateChange((evento) => {
    if (evento === 'PASSWORD_RECOVERY') {
      state.recuperandoSenha = true;
      mostrarNovaSenha();
    } else if (evento === 'SIGNED_OUT') {
      state.user = null;
      state.docs = [];
      state.tipos = [];
      mostrarLogin();
    }
  });

  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session && state.recuperandoSenha) return mostrarNovaSenha();
  if (session) return entrar(session.user);
  mostrarLogin();
}

// Acesso para diagnóstico no console do navegador.
window.ProcApp = { state, rotear, enriquecer };

iniciar().catch((err) => {
  mostrarLogin(`Erro ao iniciar: ${err.message}`);
});
