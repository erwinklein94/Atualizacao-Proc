// Gráficos leves em HTML/CSS: barras horizontais, barras empilhadas e colunas.
// Cada gráfico tem tooltip (mouse e teclado), clique opcional e uma tabela equivalente.
import { esc, fmtNum, fmtPct } from './util.js';

const tip = () => document.getElementById('tooltip');

function posicionar(el, x, y) {
  const pad = 12;
  const r = el.getBoundingClientRect();
  let left = x + 14;
  let top = y + 14;
  if (left + r.width + pad > window.innerWidth) left = x - r.width - 14;
  if (top + r.height + pad > window.innerHeight) top = y - r.height - 14;
  el.style.left = `${Math.max(pad, left)}px`;
  el.style.top = `${Math.max(pad, top)}px`;
}

export function mostrarTip(evento, html) {
  const el = tip();
  if (!el) return;
  el.innerHTML = html;
  el.hidden = false;
  if (evento.type === 'focus' || evento.clientX === undefined) {
    const r = evento.currentTarget.getBoundingClientRect();
    posicionar(el, r.left + r.width / 2, r.top);
  } else {
    posicionar(el, evento.clientX, evento.clientY);
  }
}

export function esconderTip() {
  const el = tip();
  if (el) el.hidden = true;
}

function ligarTip(alvo, htmlFn) {
  const mostrar = (e) => mostrarTip(e, htmlFn());
  alvo.addEventListener('pointermove', mostrar);
  alvo.addEventListener('focus', mostrar);
  alvo.addEventListener('pointerleave', esconderTip);
  alvo.addEventListener('blur', esconderTip);
}

function ligarClique(alvo, fn) {
  if (!fn) return;
  alvo.addEventListener('click', fn);
  alvo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn(e);
    }
  });
}

function tabela(cabecalhos, linhas) {
  return `<details class="viz-tabela"><summary>Ver tabela</summary><table>
    <thead><tr>${cabecalhos.map((c, i) => `<th${i ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${linhas.map((l) => `<tr>${l.map((c, i) => `<td${i ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></details>`;
}

/**
 * Barras horizontais de uma série.
 * linhas: [{ rotulo, valor, cor? }]
 */
export function barrasH(el, linhas, { cor = 'var(--series-1)', onClick, unidade = 'documentos', total } = {}) {
  if (!linhas.length) {
    el.innerHTML = '<p class="muted">Sem dados para os filtros selecionados.</p>';
    return;
  }
  const max = Math.max(1, ...linhas.map((l) => l.valor));
  const soma = total ?? linhas.reduce((s, l) => s + l.valor, 0);
  el.innerHTML = `<div class="bh" role="list">${linhas
    .map(
      (l, i) => `<div class="bh-row${onClick ? ' is-click' : ''}" data-i="${i}" role="${onClick ? 'button' : 'listitem'}" tabindex="0"
        aria-label="${esc(l.rotulo)}: ${fmtNum(l.valor)} ${esc(unidade)}">
        <span class="bh-label" title="${esc(l.rotulo)}">${esc(l.rotulo)}</span>
        <span class="bh-track"><span class="bh-bar" style="width:${((l.valor / max) * 100).toFixed(2)}%;background:${l.cor || cor}"></span></span>
        <span class="bh-val">${fmtNum(l.valor)}</span>
      </div>`
    )
    .join('')}</div>${tabela(['Categoria', 'Quantidade'], linhas.map((l) => [l.rotulo, fmtNum(l.valor)]))}`;

  el.querySelectorAll('.bh-row').forEach((row) => {
    const l = linhas[Number(row.dataset.i)];
    ligarTip(row, () => `<strong>${fmtNum(l.valor)}</strong>${esc(l.rotulo)}<br><span class="muted">${fmtPct(l.valor / (soma || 1), 1)} do total</span>`);
    ligarClique(row, onClick && (() => onClick(l)));
  });
}

/**
 * Barras horizontais empilhadas.
 * linhas: [{ rotulo, chave, partes: { [serie.chave]: n } }]
 * series: [{ chave, rotulo, cor }]
 */
export function empilhadoH(el, linhas, series, { onClick } = {}) {
  if (!linhas.length) {
    el.innerHTML = '<p class="muted">Sem dados para os filtros selecionados.</p>';
    return;
  }
  const totais = linhas.map((l) => series.reduce((s, sr) => s + (l.partes[sr.chave] || 0), 0));
  const max = Math.max(1, ...totais);
  const legenda = `<ul class="legenda">${series.map((s) => `<li><i style="background:${s.cor}"></i>${esc(s.rotulo)}</li>`).join('')}</ul>`;
  const corpo = linhas
    .map((l, i) => {
      const total = totais[i];
      const segs = series
        .filter((s) => l.partes[s.chave])
        .map(
          (s) => `<span class="bh-seg${onClick ? ' is-click' : ''}" data-i="${i}" data-s="${esc(s.chave)}" tabindex="0" role="${onClick ? 'button' : 'img'}"
            aria-label="${esc(l.rotulo)} — ${esc(s.rotulo)}: ${fmtNum(l.partes[s.chave])}"
            style="flex:0 0 max(2px, calc(${((l.partes[s.chave] / max) * 100).toFixed(3)}% - 2px));background:${s.cor};${onClick ? 'cursor:pointer' : ''}"></span>`
        )
        .join('');
      return `<div class="bh-row" data-i="${i}">
        <span class="bh-label" title="${esc(l.rotulo)}">${esc(l.rotulo)}</span>
        <span class="bh-track">${segs}</span>
        <span class="bh-val">${fmtNum(total)}</span>
      </div>`;
    })
    .join('');
  const tab = tabela(
    ['Categoria', ...series.map((s) => s.rotulo), 'Total'],
    linhas.map((l, i) => [l.rotulo, ...series.map((s) => fmtNum(l.partes[s.chave] || 0)), fmtNum(totais[i])])
  );
  el.innerHTML = `${legenda}<div class="bh">${corpo}</div>${tab}`;

  el.querySelectorAll('.bh-seg').forEach((seg) => {
    const i = Number(seg.dataset.i);
    const l = linhas[i];
    const s = series.find((x) => x.chave === seg.dataset.s);
    ligarTip(
      seg,
      () => `<strong>${fmtNum(l.partes[s.chave])}</strong><span class="tt-linha"><i style="background:${s.cor}"></i>${esc(s.rotulo)}</span>
        ${esc(l.rotulo)} · ${fmtPct(l.partes[s.chave] / (totais[i] || 1), 1)}`
    );
    ligarClique(seg, onClick && (() => onClick(l, s)));
  });
}

/**
 * Colunas verticais.
 * colunas: [{ rotulo, rotuloLongo?, valor, cor? }]
 */
export function colunas(el, cols, { cor = 'var(--series-1)', onClick, altura = 200, unidade = 'documentos' } = {}) {
  if (!cols.length) {
    el.innerHTML = '<p class="muted">Sem dados para os filtros selecionados.</p>';
    return;
  }
  const max = Math.max(1, ...cols.map((c) => c.valor));
  el.innerHTML = `<div class="col-chart">
      <div class="col-plot" style="height:${altura}px">${cols
        .map(
          (c, i) => `<div class="col-item${onClick && c.valor ? ' is-click' : ''}" data-i="${i}" tabindex="0" role="${onClick ? 'button' : 'img'}"
            aria-label="${esc(c.rotuloLongo || c.rotulo)}: ${fmtNum(c.valor)} ${esc(unidade)}">
            <span class="col-val">${c.valor ? fmtNum(c.valor) : ''}</span>
            <span class="col-bar" style="height:${((c.valor / max) * (altura - 22)).toFixed(1)}px;background:${c.cor || cor}"></span>
          </div>`
        )
        .join('')}</div>
      <div class="col-eixo" aria-hidden="true">${cols
        .map(
          (c) => `<span title="${esc(c.rotuloLongo || c.rotulo)}"><span class="longo">${esc(c.rotulo)}</span><span class="curto">${esc(c.rotuloCurto || c.rotulo)}</span></span>`
        )
        .join('')}</div>
    </div>${tabela(['Período', 'Quantidade'], cols.map((c) => [c.rotuloLongo || c.rotulo, fmtNum(c.valor)]))}`;

  el.querySelectorAll('.col-item').forEach((item) => {
    const c = cols[Number(item.dataset.i)];
    ligarTip(item, () => `<strong>${fmtNum(c.valor)}</strong>${esc(c.rotuloLongo || c.rotulo)}`);
    if (c.valor) ligarClique(item, onClick && (() => onClick(c)));
  });
}
