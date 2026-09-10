# Validação do incremento inicial

Registro de 10/09/2026. O núcleo foi implementado sobre Supabase real. O aceite integral de uso diário ainda depende de cadastro, confirmação por email, recuperação e uma sessão completa no ambiente publicado.

## Evidência concluída

| Verificação | Resultado |
| --- | --- |
| Build de produção e TypeScript | Passou (`npm run build`) |
| Domínio, SQL real, componentes e autenticação simulada | 62 testes passaram em 6 suítes (`npm test`) |
| Dependências | `npm audit`: nenhuma vulnerabilidade conhecida na última verificação |
| Volume local | 14 cenários passaram com 10 mil e 50 mil questões; [medidas e limites](performance.md) |
| Banco dedicado EstudosLP | Duas migrations aplicadas, 12 tabelas com RLS e mutações por RPC |
| Smoke SQL hospedado | Passou: resposta, retry, agenda, edição, histórico, dois usuários e acesso anônimo; dados sintéticos revertidos por ROLLBACK |
| Auditoria de segurança Supabase | Nenhum aviso após as migrations |
| Gateway HTTP hospedado | Configurações de Auth disponíveis; RPC anônima recusada (401); credenciais inválidas recusadas (400) |

As migrations aplicadas são `20260910051956_initial_platform.sql` e `20260910102054_index_foreign_keys.sql`, no projeto `ctkyjekfuzcicpzrugfi`. Não houve alteração em projetos Supabase de outros sistemas. O teste hospedado está em `tests/supabase-smoke.sql`; não cria contas permanentes ou envia emails.

Os testes de banco aplicam os mesmos arquivos de migration em PostgreSQL via PGlite. Cobrem isolamento, autorização, constraints, importação parcial, duplicatas, idempotência, intervalo fixo, snapshots, versão da agenda e filtros. Não simulam concorrência de conexões reais. Os testes de interface verificam resposta explícita, retry com payload estável, sessão limitada, edição, duplicatas e troca de conta; o fluxo de recuperação com link inválido retorna ao login.

## Configuração de acesso hospedado

Frontend publicado com acesso privado: `https://estudoslp.luispaulo93.chatgpt.site`. Publicação confirmada em 10/09/2026; acesso HTTP sem autenticação retorna 401.

No [painel de URLs do Supabase](https://supabase.com/dashboard/project/ctkyjekfuzcicpzrugfi/auth/url-configuration), configure:

- Site URL: `https://estudoslp.luispaulo93.chatgpt.site`
- Redirect URLs: `https://estudoslp.luispaulo93.chatgpt.site/` e `https://estudoslp.luispaulo93.chatgpt.site/?recovery=1`
- Para desenvolvimento: `http://localhost:5173`, `http://localhost:5173/?recovery=1`, `http://127.0.0.1:5173` e `http://127.0.0.1:5173/?recovery=1`.

Essa configuração do painel ainda não foi verificada. `supabase/config.toml` configura somente o ambiente local. A chave publicável está no ambiente local ignorado pelo Git; nenhum segredo administrativo pertence ao frontend ou ao repositório.

## Aceite operacional pendente

1. Criar conta, receber e confirmar email; entrar, sair, recarregar e recuperar senha. Testar link expirado e sessão em outro dispositivo.
2. Criar projeto/caderno/matéria; importar exemplos; repetir o lote e conferir que não duplica.
3. Buscar trecho, responder, ler explicações e selecionar intervalo curto (por exemplo, 1 minuto).
4. Fechar e reabrir; após vencer, responder pela fila, escolher outro intervalo e conferir histórico/dashboard.
5. Conferir em celular real, instalar a PWA e verificar o aviso sem conexão. Não há gravação offline.
6. Testar duas sessões concorrentes contra o gateway e conteúdo representativo antes de afirmar metas de latência.

## Limites explícitos

- Cada confirmação de importação aceita até 1.000 questões válidas. Arquivos maiores devem ser divididos; não são fragmentados automaticamente. O parser aceita até 50 mil registros para uso programático, mas a interface exige o limite antes de abrir a prévia de confirmação.
- Sessões têm até 50 questões; iniciar uma nova sessão carrega a próxima fila. O tempo medido decorre da abertura da questão até a resposta, sem pausar automaticamente em aba oculta.
- A exportação JSON lê páginas e reúne o resultado na memória do navegador. Restaurar backup completo e importações assíncronas são etapas posteriores.
- XLSX, HTML arbitrário de terceiros, desfazer importação, cópia de formatação e sincronização offline não foram implementados.
- A ordenação de catálogos persiste itens sequencialmente; uma falha de rede pode exigir repetir a ação. Histórico e agenda usam transações no servidor.
- Cabeçalhos em `public/_headers` exigem suporte do host; devem ser verificados no ambiente de publicação. As execuções de CI do push e do PR #1 passaram em 10/09/2026.

O incremento fornece o código e a base persistente do fluxo de estudo. Não declarar aceite final apenas a partir de testes locais ou da disponibilidade da página de login.
