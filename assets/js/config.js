// Configuração pública do Supabase.
// A chave publicável pode ficar no front-end: o acesso aos dados é bloqueado por RLS
// e só o e-mail autorizado (tabela private.usuarios_autorizados) consegue ler ou alterar.
export const SUPABASE_URL = 'https://nybunyklscwptdghzwjj.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_p39UY2mvTutX4XcZihqPGw_ThFDJMLo';

// Janela (em dias) para considerar um documento "próximo ao vencimento".
export const JANELA_PROXIMO = 60;
