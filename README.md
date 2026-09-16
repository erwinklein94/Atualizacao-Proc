# Atualização de Procedimentos — Rumo

Expositor e painel de vencimentos dos procedimentos da Engenharia de Via Permanente (Op. Norte).

- **Front-end:** HTML, CSS e JavaScript puros, publicado no GitHub Pages (sem etapa de build).
- **Dados e login:** Supabase (projeto `nybunyklscwptdghzwjj`). **Nenhum procedimento fica neste repositório.**
- **Origem dos dados:** Power BI “Controle de Documentos” → página “Base de documentos” (625 documentos na carga inicial de 16/09/2026).

## Funcionalidades

| Página | O que mostra |
|---|---|
| **Painel** | % de documentos em dia, vencidos, vencem em até 60 dias, sem data, atualizados nos últimos 12 meses; situação por tipo; agenda dos próximos 12 meses; atualizações por ano; idade da última atualização; documentos por disciplina e em fluxo normativo. Os gráficos são clicáveis e levam à lista filtrada. |
| **Documentos** | Catálogo com busca, filtros (tipo, situação, disciplina, fluxo normativo, links), ordenação, links para o documento publicado e a versão editável, detalhes com histórico, edição, cadastro e exportação CSV. |
| **Vencimentos** | Agenda agrupada: vencidos, sem data e mês a mês (24 meses). |
| **Gestão** | Importação da planilha exportada do Power BI com prévia das diferenças; edição dos tipos de documento; exportação completa. |

### Regras de situação

- **Vencido:** data de vencimento anterior a hoje.
- **Vence em até 60 dias:** configurável em `assets/js/config.js` (`JANELA_PROXIMO`).
- **Sem data:** o tipo controla vencimento, mas o documento não tem data (em geral, em elaboração).
- **Não controla vencimento:** tipos RTE, IN, PT, IT e Outros (as datas de 2049–2053 do Power BI não são prazos reais). Ajustável na página Gestão.

## Segurança

- RLS ativo em todas as tabelas. Leitura e escrita só para usuários autenticados cujo e-mail está em `private.usuarios_autorizados`. Hoje é só `erwin.klein@ext.rumolog.com`.
- Um gatilho em `auth.users` impede criar contas com qualquer outro e-mail.
- A chave publicável do Supabase em `assets/js/config.js` é pública por natureza; ela não dá acesso aos dados sem login autorizado.
- Toda alteração feita pelo site fica registrada em `documentos_historico`.

### Configuração que precisa ser feita no painel do Supabase

1. **Authentication → Users → Add user → Create new user**: e-mail `erwin.klein@ext.rumolog.com`, senha escolhida, marcar *Auto Confirm User*.
2. **Authentication → Sign In / Providers**: desativar *Allow new users to sign up* (proteção extra; o gatilho já bloqueia outros e-mails).
3. **Authentication → URL Configuration**: *Site URL* = `https://erwinklein94.github.io/Atualizacao-Proc/` e o mesmo endereço em *Redirect URLs* (necessário para o “Esqueci minha senha”).

Para autorizar outra pessoa no futuro:

```sql
insert into private.usuarios_autorizados (email) values ('nome@rumolog.com');
```

## Estrutura

```
index.html                 telas de login e aplicação
assets/css/styles.css      tokens da marca Rumo, tema claro/escuro, layout responsivo
assets/js/config.js        URL e chave publicável do Supabase, janela de "próximo ao vencimento"
assets/js/app.js           autenticação, rotas e páginas
assets/js/charts.js        gráficos em HTML/CSS com tooltip e tabela equivalente
assets/js/importer.js      importação da planilha do Power BI
assets/js/util.js          utilidades e regras dos documentos
assets/favicon.svg         ícone da aba (emblema neutro, sem logotipo)
supabase/migrations/       esquema do banco, RLS e gatilhos (sem dados)
```

## Atualizar os dados

1. No Power BI, abra **Controle de Documentos → Base de documentos**.
2. No menu **…** da tabela, use **Exportar dados** (.xlsx ou .csv).
3. No site, vá em **Gestão → Atualizar a partir do Power BI**, envie o arquivo, confira a prévia e aplique.
