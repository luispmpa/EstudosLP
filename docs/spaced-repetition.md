# Repetição com intervalos manuais

O comportamento é determinístico: `next_review_at = answered_at + selected_interval`. Não há FSRS, SM-2, previsão de dificuldade ou ajuste automático por acerto/erro. Uma resposta errada pode receber qualquer intervalo ativo que o usuário escolher.

## Conteúdo, resposta e agendamento

Questão é conteúdo reutilizável. Tentativa é uma resposta imutável com data/hora, resposta marcada, gabarito e enunciado no momento, acerto/erro, tempo gasto e contexto. O agendamento atual é uma projeção operacional para a fila. Eventos de revisão registram mudanças nesse agendamento, preservando os acontecimentos anteriores.

Ao responder, a tentativa é registrada. Ao escolher um botão, a operação de agendamento usa a **data/hora daquela resposta**, não uma nova data baseada no tempo gasto lendo a correção. Ela armazena um snapshot do botão — ID, nome, valor, unidade, posição e estado naquele momento — e a próxima revisão calculada. O backend associa a escolha à tentativa do próprio usuário e valida o contexto.

Editar, desativar, reordenar ou excluir um botão altera apenas escolhas futuras. Não se recalculam revisões já agendadas em consequência de um CRUD de configuração. Reagendamento explícito grava um novo evento; a tentativa e os eventos anteriores continuam preservados. Suspender retira da fila sem destruir histórico; remover desativa o agendamento; reativar e reinserir são ações explícitas.

## Unidades e timezone

As unidades desta versão são `minute`, `hour` e `day`. O valor é inteiro positivo. Dez minutos significam 600 segundos; um dia significa **24 horas decorridas**. A política evita dependência do timezone de servidor e comportamento ambíguo em transições de horário de verão. Se o relógio local mudar por DST, a hora local da próxima revisão poderá ser diferente; o tempo decorrido continuará exato.

Datas são instantes UTC (`timestamptz` no PostgreSQL; ISO 8601 nas APIs). A apresentação usa `Intl.DateTimeFormat` no timezone do dispositivo. `formatLocalDateTime` permite informar um timezone IANA em testes ou em uma preferência futura. Datas locais digitadas para reagendamento são convertidas para UTC antes da gravação. Não se descarta horário ou segundos ao agendar.

O tempo de resolução é um valor não negativo em milissegundos (`elapsed_ms`), independente do intervalo selecionado. O intervalo de revisão não representa o tempo de estudo.

## Herança e vínculo múltiplo

Ordem: questão → caderno do contexto atual → projeto do contexto atual → global. `resolvePolicy(policies, questionId, context)` usa os IDs do contexto da sessão; não escolhe arbitrariamente um dos vários cadernos aos quais uma questão pertence. Sem contexto específico, uma questão sem override usa a política global.

Uma política específica vazia ou com todos os botões desativados continua prevalecendo. A interface mostra o estado sem botões e orienta a configurar a política; não existe fallback oculto para os intervalos globais. Remover a política específica restaura a herança. Botões ativos são ordenados por posição e podem ser reorganizados na configuração.

## Fila

Uma questão está disponível quando seu agendamento está ativo e `next_review_at <= now()`. A comparação inclui hora, minuto e segundo; "revisões de hoje" não deve liberar antecipadamente uma revisão marcada para mais tarde. "Atrasadas" usa o começo do dia local para diferenciar datas anteriores. Questões novas ainda não têm tentativas. Filtros por projeto/caderno se aplicam sem duplicar o conteúdo da questão.

## Casos de integridade

| Caso | Ação                                          | Resultado                                              |
| ---- | --------------------------------------------- | ------------------------------------------------------ |
| A    | 01/01/2026, escolher 10 dias                  | 11/01/2026, mesma hora UTC                             |
| B    | 11/01/2026, escolher 30 dias                  | 10/02/2026; primeiro snapshot mantém 10 dias           |
| C    | Editar configuração 30 → 60 dias              | Agendamento existente continua em 10/02                |
| D    | Reagendar explicitamente em 12/01 com 60 dias | Novo evento para 13/03; eventos anteriores preservados |

`tests/repetition.test.ts` cobre A–D, minutos/horas, milissegundos, meia-noite, horário de verão, renderização em São Paulo, botão inativo, intervalo inválido e hierarquia completa. Testes de banco verificam persistência dos snapshots, propriedade dos dados e as transições de revisão. Essas responsabilidades não são substituídas por um teste apenas da soma de datas.
