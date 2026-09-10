# Banco de dados

PostgreSQL 17, com `pg_trgm`, full-text search em português e autenticação Supabase. As migrations são a fonte de verdade; `supabase/schema.sql` registra a base inicial para consulta, sem substituir a sequência das migrations.

## Migrations aplicadas

- `20260910051956_initial_platform.sql`: modelo, funções, RLS, permissões, busca e índices iniciais.
- `20260910102054_index_foreign_keys.sql`: índices de apoio aos relacionamentos recomendados pelo advisor de performance.

As versões locais correspondem ao histórico aplicado no projeto EstudosLP. Novas alterações devem entrar em migrations incrementais. O banco hospedado de outro sistema não foi alterado.

## Entidades

| Tabela                    | Responsabilidade                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `auth.users`              | Identidade gerenciada pelo Supabase Auth                                           |
| `catalogs`                | Projetos, cadernos, matérias, assuntos, subassuntos, tags, bancas, órgãos e cargos |
| `questions`               | Conteúdo principal, origem, ID externo, gabarito atual, estado e campos de busca   |
| `question_alternatives`   | Alternativas ordenadas, chaves e explicações                                       |
| `question_catalogs`       | Relações muitos-para-muitos sem duplicar conteúdo                                  |
| `review_policies`         | Escopo global/projeto/caderno/questão                                              |
| `review_policy_intervals` | Botões configuráveis, valor/unidade, posição e ativação                            |
| `attempts`                | Resposta, resultado, data, contexto e snapshot completo do conteúdo                |
| `question_statistics`     | Contadores e último resultado atualizados na transação da tentativa                |
| `review_schedules`        | Agenda atual por questão/usuário, estado e versão de concorrência                  |
| `review_events`           | Eventos imutáveis de seleção e gestão manual da revisão                            |
| `imports`                 | Identificação idempotente e contadores de cada confirmação                         |
| `import_items`            | Resultado individual de cada registro enviado ao servidor                          |

O catálogo tem tipos fixos com semântica, mas os registros são cadastráveis. Caderno pode vincular-se a projeto; assunto a matéria; subassunto a assunto. Não são permitidos ciclos ou pais com tipos incompatíveis. Nomes são únicos por usuário/tipo/pai após normalização de caixa e espaços externos. Arquivar preserva relações; excluir itens referenciados é recusado.

Cada tabela de domínio inclui `user_id`. Chaves estrangeiras compostas por `(user_id, id)` impedem associações entre usuários. Uma questão tem uma agenda por usuário, ainda que pertença a vários cadernos.

## Identidade e busca

Questão única por `(user_id, lower(trim(source)), external_id)`, quando há ID externo. IDs são texto e preservam zeros. Fontes diferentes podem repetir números. Sem ID, não há bloqueio por fingerprint: esse SHA-256 é uma pista para revisão humana.

`search_text` reúne texto visível do enunciado, alternativas, explicações, notas e identificação. `search_vector` usa o dicionário português; os índices GIN full-text e trigram atendem termos e trechos. A pesquisa também encontra nomes das classificações relacionadas. Tentativas preservam uma projeção textual pesquisável do conteúdo respondido.

Listagens retornam `{items,total}` e limitam `page_size` a 100 (padrão 20). A fila considera apenas agendas ativas e vencidas. Importações aceitam até 1.000 registros por confirmação; exports retornam até 1.000 por página. O cliente solicita exportação em páginas de 500.

## API transacional

Todas as chamadas públicas usam o contexto autenticado. O cliente não envia o proprietário.

| RPC                                                                 | Operação                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `catalog_list`, `catalog_save`, `catalog_archive`, `catalog_delete` | Organização e hierarquia                                      |
| `question_list`, `question_get`, `question_save`, `question_patch`  | Conteúdo e filtros                                            |
| `policy_list`, `policy_save`, `policy_delete`, `policy_resolve`     | Configuração e herança                                        |
| `answer_question`                                                   | Valida alternativa, registra snapshot e atualiza estatísticas |
| `schedule_attempt`                                                  | Valida política/botão, preserva intervalo e atualiza agenda   |
| `review_manage`                                                     | Reagenda, suspende, reativa ou remove da repetição            |
| `history_list`                                                      | Tentativas paginadas, data local, resultado e contexto        |
| `dashboard`                                                         | Agregações diárias, fila e matérias com menor acerto          |
| `import_duplicates`, `import_commit`, `import_list`                 | Prévia de identidade e gravação auditada                      |
| `export_page`                                                       | Exportação por tabela permitida, isolada por usuário          |

Parâmetros e tipos de retorno do cliente estão em `src/lib/api.ts` e `src/domain/types.ts`.

## Concorrência e histórico

Resposta e agendamento são operações separadas. A tentativa é persistida antes da escolha de intervalo. O intervalo é calculado sobre `answered_at` do servidor, não sobre um horário arbitrário enviado pelo navegador. Um dia representa 86.400 segundos; o histórico guarda o valor, unidade, duração e identificação usados.

Agendas usam versão incremental e bloqueio transacional. Uma tentativa de outra aba não pode sobrescrever silenciosamente a agenda atual. `request_id` identifica retries; repetir o UUID com conteúdo diferente é erro. O frontend conserva a mesma resposta e tempo ao repetir uma operação cuja resposta pode ter se perdido na rede.

As tentativas e os eventos não têm grants de update/delete para o cliente. Conteúdo e configuração podem mudar; seus snapshots anteriores permanecem. A exclusão de questão com histórico é restringida; a interface usa arquivamento.

Cada importação trava a operação por usuário, valida novamente e trata erros de item em subtransações. A política cancelar verifica duplicatas antes de inserir o lote. O hash do arquivo identifica replay; o hash do payload impede reutilizar o mesmo UUID com outro conteúdo. Resultado já concluído é devolvido novamente sem regravar.

## Autorização e conteúdo seguro

As 12 tabelas públicas têm RLS com leitura pelo proprietário. `anon` não possui leitura nem execução da API; `authenticated` não possui mutações diretas nas tabelas. As funções públicas são invoker; implementações internas que escrevem no histórico protegido são definer, em schema não exposto, com `search_path` vazio, `auth.uid()` obrigatório e predicados de proprietário. Helpers têm execução somente para o papel autenticado e não constituem uma API PostgREST exposta.

HTML passa pelo DOMPurify no navegador e por um serializador restritivo no servidor. O servidor reconstrói tags e atributos conhecidos, em vez de persistir tags arbitrárias. Atributos JavaScript, scripts, embeds, SVG e recursos ativos não são preservados. A renderização volta a sanitizar. Nenhuma chave administrativa pertence ao frontend.

## Evidências

- `tests/database.test.ts` executa as migrations reais em PGlite com dois usuários e papel anônimo.
- `tests/supabase-smoke.sql` foi executado no Supabase: resposta, retry, intervalo, snapshot, histórico protegido e isolamento passaram. Todos os usuários/registros sintéticos foram revertidos pela transação.
- Advisor de segurança após as migrations: sem avisos. Advisor de performance: sem FKs sem índice; avisos de índices ainda não usados são esperados num banco sem acervo.

Esses testes SQL não testam emissão de JWT, entrega de email ou recuperação de senha pelo GoTrue. O fluxo completo com a conta do usuário e o endereço publicado ainda precisa da validação operacional descrita em `validation.md`.
