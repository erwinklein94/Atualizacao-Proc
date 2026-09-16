-- O projeto não concede privilégios padrão da Data API às tabelas novas.
-- Concede explicitamente ao papel autenticado; o RLS continua limitando as linhas
-- ao e-mail autorizado (private.is_autorizado()). O papel anon não recebe nada.
grant select, update on public.tipos_documento to authenticated;
grant select, insert, update, delete on public.documentos to authenticated;
grant select on public.documentos_historico to authenticated;
grant select on public.vw_documentos to authenticated;
grant usage on sequence public.documentos_id_seq to authenticated;
