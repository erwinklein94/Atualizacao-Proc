-- Ativa o registro de histórico de inclusões, alterações e exclusões feitas pelo site.
-- (Criado depois da carga inicial vinda do Power BI, para que a carga não gere histórico.)
create trigger documentos_historico
  after insert or update or delete on public.documentos
  for each row execute function private.registrar_historico_documento();
