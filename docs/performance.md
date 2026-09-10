# Verificação local de volume

Execute na raiz do repositório, depois de `npm ci`:

```sh
node tests/performance.mjs
```

O programa aplica todas as migrações reais, em ordem, a um PostgreSQL 17.5 em WebAssembly por PGlite 0.3.15. Usa o mesmo mock de `auth.uid()` e os mesmos papéis dos testes de banco. A carga é gerada por SQL `generate_series`, em lotes de 2.500 questões, dentro de um banco descartável em memória. As consultas medidas executam como `authenticated`, com as políticas RLS reais. Não usa credenciais, rede, banco hospedado ou arquivos persistentes de dados.

Cada questão possui quatro alternativas, um vínculo com matéria e um com caderno. São 15 catálogos, com 10 matérias e 5 cadernos. Há 10.000 tentativas distribuídas em 30 dias, com 75% de acertos, e revisões vencidas para 20% das questões. A carga começa em 10.000 questões e cresce no mesmo banco para 50.000. Os snapshots do histórico contêm os campos usados nos filtros e indicadores; não representam o tamanho integral de todas as possíveis questões importadas.

Asserções verificam totais de questões, alternativas, vínculos, tentativas e revisões; resultados esperados das buscas no enunciado e no comentário de alternativa; limites de página; páginas consecutivas sem repetição; quatro alternativas e dois catálogos no retorno; e totais/agregações do painel. A busca `restos a pagar` encontra 1% da base; `obrigação financeira`, 0,8%. O pedido de 1.000 itens é limitado pelo servidor a 100.

## Medição de 10/09/2026

Ambiente: Windows x64, AMD Ryzen 7 5700G, Node 24.14.1. Migrações: `20260910051956_initial_platform.sql` e `20260910102054_index_foreign_keys.sql`. Uma chamada de aquecimento por cenário precede cinco amostras sequenciais. Os tempos incluem a chamada ao PGlite, execução SQL e conversão do JSON de resposta. `ANALYZE` é executado após cada etapa de carga. A saída JSON em stdout permite registrar todas as amostras de uma nova execução.

| RPC/cenário | 10 mil: mediana / máximo (ms) | 50 mil: mediana / máximo (ms) |
| --- | ---: | ---: |
| Questões: primeira página, 20 itens | 230,72 / 235,75 | 1.211,31 / 1.225,77 |
| Questões: última página, 20 itens | 231,54 / 232,60 | 1.201,42 / 1.229,00 |
| Busca no enunciado | 154,91 / 163,01 | 738,33 / 752,61 |
| Busca no comentário de alternativa | 327,66 / 343,30 | 715,80 / 725,61 |
| Revisões vencidas, ordenadas por data | 188,46 / 192,20 | 929,09 / 947,98 |
| Histórico, 10 mil tentativas, 25 itens | 118,67 / 122,98 | 117,82 / 120,04 |
| Painel, período de 30 dias | 303,33 / 305,32 | 1.071,75 / 1.127,47 |

Resultado: `PASS` para os 14 cenários medidos e suas asserções adicionais. A preparação inicial de 10 mil questões mais 10 mil tentativas levou 5.052,36 ms; a expansão de mais 40 mil questões levou 11.366,68 ms. São tempos da preparação sintética, incluindo índices e `ANALYZE`, sem equivalência com o importador do produto.

A maior memória residente amostrada foi 602,3 MiB na etapa de 10 mil e 1.128,3 MiB na etapa de 50 mil. O heap JavaScript ficou abaixo de 18 MiB nas amostras registradas; o restante inclui o PostgreSQL/WASM e o banco em memória. O script usa lotes de SQL sem materializar a base inteira em objetos JavaScript, e fecha o banco ao terminar. Reserve memória para cerca de 1,2 GiB de processo nesta carga; as amostras não são uma medição contínua do pico.

## Limites da evidência

Este é um teste sintético de correção sob volume e um registro de latência local, não um SLA de produção. Não mede rede, PostgREST, navegador, múltiplas conexões, contenção entre usuários, armazenamento persistente, cache frio ou velocidade de importação pela interface/RPC. A carga por SQL administrativo existe exclusivamente para preparar o banco local; não representa permissões de escrita do usuário nem o caminho de importação real. Não há limiar de tempo que torne o resultado dependente da velocidade da máquina.

O retorno paginado limita o conteúdo transferido, mas os RPCs calculam o total exato e ordenam os resultados no servidor. Nesta execução, a primeira página passou de 231 ms para 1.211 ms quando a base cresceu cinco vezes; a fila de revisões e o painel também se aproximaram de um segundo. Portanto, a paginação correta não demonstra latência constante com o volume. É um ponto de atenção concreto para crescimento da base, embora estes tempos WASM não prevejam o servidor hospedado. Confirme capacidade e planos de execução no PostgreSQL hospedado com conteúdo e concorrência representativos antes de estabelecer metas de latência. As 5 amostras não permitem inferir percentis de produção.
