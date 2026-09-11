# Contrato de importação 1.0

A importação interpreta e valida um lote antes de gravá-lo. `parseImport` não executa operações no banco. A prévia mantém os registros inválidos com seu número, erros e avisos; somente os válidos podem seguir para a confirmação. O servidor repete as verificações de integridade e identidade na gravação, evitando corrida entre a prévia e a confirmação.

## JSON canônico

```json
{
  "schema_version": "1.0",
  "questions": [
    {
      "external_id": "000123",
      "source": "Meu material",
      "type": "multiple_choice",
      "statement": "<p>Qual alternativa está correta?</p>",
      "alternatives": [
        { "key": "A", "text": "Primeira", "explanation": "Correta." },
        { "key": "B", "text": "Segunda", "explanation": "Incorreta." }
      ],
      "correct_answer": "A",
      "general_explanation": "Comentário geral.",
      "visual_explanation_html": "<style>body{font-family:Arial}</style><section><h1>Gabarito visual</h1><p>Conteúdo complementar.</p></section>",
      "visual_explanation_height": 720,
      "subject": "Português",
      "tags": ["revisar"]
    }
  ]
}
```

O objeto externo e a versão são obrigatórios. Arrays isolados, versões desconhecidas e propriedades desconhecidas são rejeitados. Um erro na estrutura externa invalida o arquivo; um erro dentro de `questions` afeta apenas aquele registro. A interpretação aceita no máximo 50.000 questões e 25 milhões de caracteres, mas **a confirmação no servidor recebe até 1.000 registros válidos por lote**. Arquivos maiores podem ser conferidos na prévia e devem ser divididos manualmente antes de confirmar. A interface também limita arquivos selecionados a 20 MB.

Não há divisão silenciosa de uma confirmação em várias transações: isso poderia gravar parte do arquivo antes de descobrir uma duplicata em outro trecho sob a política cancelar. A fronteira de até 1.000 mantém a política e o relatório do lote consistentes. Evoluir para lotes maiores exige uma sessão de importação persistida, com validação global e retomada explícita.

Campos obrigatórios: `source`, `type`, `statement`, `alternatives`, `correct_answer`, `general_explanation`. Cada alternativa exige `key`, `text` e `explanation`. Explicações podem ser strings vazias; enunciado e texto de alternativas precisam conter texto visível após sanitização.

Campos opcionais: `external_id`, `year`, `level`, `difficulty`, `source_url`, `notes`, `board`, `organization`, `position`, `subject`, `topic`, `subtopic`, `tags`, `projects`, `notebooks`, `catalog_ids`, `visual_explanation_html`, `visual_explanation_height`. `external_id`, `year`, `level`, `difficulty` e `source_url` também aceitam `null`. `catalog_ids` contém UUIDs já existentes do próprio usuário; os outros campos de classificação usam nomes. IDs externos são **strings**, preservando zeros à esquerda. URLs aceitam somente HTTP ou HTTPS absolutos. Ano é inteiro entre 1900 e 2200. Coleções de classificações têm no máximo 160 elementos.

`visual_explanation_html` é um HTML/CSS autocontido de até 200.000 caracteres, mostrado somente no verso, depois de a resposta ser enviada. O sistema o abre em um `iframe` isolado, sem scripts, acesso à aplicação, formulários ou incorporações. Por isso, não use `script`, `iframe`, `img`, `form`, `link`, `meta`, atributos `on...`, `@import` nem `url(...)`. `visual_explanation_height` é opcional e define a altura entre 240 e 2.000 px; o padrão é 720. O texto do visual também entra na pesquisa da questão.

`multiple_choice` aceita de 2 a 26 alternativas, com chaves únicas de 1–16 caracteres ASCII entre letras, números, `_` e `-`. A–E é uma convenção de interface, sem obrigatoriedade de quantidade. `correct_answer` é sempre a string **exatamente igual**, inclusive maiúsculas/minúsculas, à chave da alternativa correta.

Para `true_false`, são obrigatórias exatamente duas alternativas: uma com `key: "TRUE"` e outra com `key: "FALSE"`. Os rótulos visíveis podem ser `Certo` e `Errado`. O gabarito aceita exclusivamente a string `"TRUE"` ou `"FALSE"`; booleanos, `C`, `E`, `1`, `true` e frases não são convertidos. Não há interpretação por posição da alternativa.

O [JSON Schema](../schemas/import-v1.schema.json) é gerado de `ImportDocumentSchema` por `importJsonSchema()`, usando Zod. O teste compara o arquivo publicado ao schema gerado, impedindo divergência estrutural. Regras relacionais que JSON Schema padrão não expressa — chave única, gabarito presente na coleção e conteúdo visível após sanitização — são aplicadas por `validateQuestion`; usar somente um validador genérico de JSON Schema não substitui essa etapa. A aplicação e a importação compartilham essa função.

Após uma alteração intencional de contrato, regenere o arquivo com `UPDATE_IMPORT_SCHEMA=1 npm test -- tests/import.test.ts` (em PowerShell: `$env:UPDATE_IMPORT_SCHEMA='1'; npm test -- tests/import.test.ts`; depois remova a variável com `Remove-Item Env:UPDATE_IMPORT_SCHEMA`). Rode novamente sem a variável para verificar o arquivo publicado. Alterações incompatíveis exigem uma nova versão, em vez de modificar silenciosamente `1.0`.

## CSV e mapeamento

UTF-8, com ou sem BOM. Vírgula, ponto e vírgula e tabulação são detectados pelo PapaParse. Aspas, quebras de linha dentro de células e aspas duplicadas seguem CSV convencional. Não abrir e salvar IDs numéricos como números em planilhas: isso pode eliminar zeros antes de o arquivo chegar ao importador.

Use os campos canônicos como cabeçalhos. Alternativas podem ser uma célula `alternatives` com JSON, ou colunas `alternative_A`, `alternative_B`, etc.; explicações usam `explanation_A`, `explanation_B`, etc. Não misture essas duas representações no mesmo registro. Coleções de classificações aceitam JSON ou itens separados por `;` dentro da célula. Para o verso visual, use as colunas `visual_explanation_html` e `visual_explanation_height`; os aliases em português são `HTML_VISUAL_VERSO` e `ALTURA_HTML_VISUAL`. O gabarito mantém o contrato canônico do JSON.

A etapa de mapeamento aceita `{ "cabeçalho de origem": "campo canônico" }`. `ignore` ou string vazia ignora uma coluna. Cabeçalhos comuns em português são reconhecidos automaticamente (`enunciado`, `banca`, `órgão`, `matéria`, `gabarito`); a prévia informa colunas ignoradas. Colunas duplicadas ou mapeadas para o mesmo campo são erro. O número exibido é o registro CSV, contando o cabeçalho como 1; células multilinha podem fazer esse número diferir da linha física no editor.

## Texto estruturado

Uma questão por bloco; separe questões com uma linha contendo `---`. Rótulos seguidos de dois pontos iniciam campos e o conteúdo pode ocupar várias linhas. São aceitas variações de caixa, espaços e acentos nos rótulos. Use `FONTE`, `ID`, `TIPO`, `ENUNCIADO`, `A`, `B`, `GABARITO`, `EXPLICAÇÃO A`, `EXPLICAÇÃO B`, `EXPLICAÇÃO GERAL` e os campos de classificação. `TIPO` aceita os nomes canônicos ou `múltipla escolha` / `certo ou errado`.

Se o tipo não for informado, chaves `TRUE` e `FALSE` isoladas permitem inferir Certo/Errado; demais conjuntos com pelo menos duas alternativas inferem múltipla escolha e produzem aviso na prévia. Fonte, enunciado, alternativas e gabarito continuam obrigatórios. O parser não adivinha gabaritos. Campos repetidos e rótulos desconhecidos em maiúsculas causam erro; isso evita sobrescrita silenciosa. Para um conteúdo que inclua linhas parecidas com rótulos estruturais ou `---`, prefira JSON.

## HTML estruturado

HTML como conteúdo rico funciona em todos os formatos. Para um arquivo `.html` completo, use a estrutura de [valid.html](../public/examples/valid.html): cada questão é um `<article data-question>`, metadados em `data-source`, `data-external-id`, `data-type`, `data-correct-answer`; filhos diretos usam `data-field="statement"` e `data-field="general_explanation"`. Alternativas são filhos diretos `data-alternative="A"` com filhos `data-field="text"` e, opcionalmente, `data-field="explanation"`.

Para importar o visual do verso, inclua também um filho direto `data-field="visual_explanation_html"`; o conteúdo interno é preservado como HTML/CSS. Use um fragmento, por exemplo `<div data-field="visual_explanation_html"><style>...</style><section>...</section></div>`, e não um segundo documento completo. A altura pode ser informada com `data-field="visual_explanation_height"`.

Este é um contrato de HTML controlado, não um extrator universal de páginas de terceiros. Artigos aninhados, campos repetidos ou estrutura sem identificação são rejeitados. A importação não executa scripts nem busca recursos remotos.

## Conteúdo seguro e pesquisa

`sanitizeHtml` usa DOMPurify e uma lista permitida: parágrafos, quebras, negrito, itálico, sublinhado, tachado, marcação, títulos h1–h4, listas, citação, código, links, tabelas simples, sub/sobrescrito. Scripts, eventos JavaScript, SVG/MathML, imagens, formulários e conteúdo incorporado são removidos. Links são HTTP(S), `mailto:` ou âncoras; estilos ficam restritos a cores, alinhamento e recuo. `plainText` decodifica entidades e separa blocos para pesquisa. `searchableText` reúne enunciado, todas as alternativas e explicações, visual do verso, notas e metadados. O servidor aplica sua própria fronteira de conteúdo seguro e o visual do verso é renderizado em um `iframe` sem permissões.

## Duplicatas e gravação

A identidade forte é usuário + fonte sem distinção de caixa e espaços externos + ID externo textual sem espaços externos. Fontes diferentes podem usar o mesmo ID. O número externo não é convertido para inteiro. A prévia avisa duplicatas dentro do arquivo; a consulta ao servidor identifica as já existentes. As políticas de gravação são ignorar, atualizar ou cancelar diante de duplicatas. A constraint do banco é a garantia final. A atualização preserva histórico de tentativas.

O fingerprint SHA-256 do importador usa tipo, texto normalizado do enunciado e pares chave/texto das alternativas ordenados por chave. HTML, caixa e espaços redundantes são ignorados; acentos são preservados. Fonte, ID, gabarito, explicações e metadados não entram nesse hash. A semelhança gera **somente aviso**: questões sem ID não são apagadas, bloqueadas nem atualizadas automaticamente por hash de conteúdo. Um hash separado identifica cada lote confirmado: repetir exatamente esse lote retorna seu resultado anterior, inclusive quando há questões sem ID. Um arquivo alterado contendo as mesmas questões sem ID exige revisão consciente dos avisos; o hash de semelhança não estabelece identidade entre arquivos diferentes.

Cada confirmação registra arquivo, data, recebidas, inseridas, atualizadas, ignoradas, duplicadas e erros. Nenhum arquivo é salvo silenciosamente na fase de interpretação. XLSX não é aceito nesta versão: exporte para CSV UTF-8. Desfazer lotes e importação completa de backups são evoluções explícitas, sem prometer reversão insegura de questões já estudadas.

## Exemplos e testes

- [JSON válido](../public/examples/valid.json): três questões, alternativas variáveis, Certo/Errado e HTML.
- [JSON parcialmente inválido](../public/examples/invalid.json): duplicata, fonte ausente, gabarito inexistente, alternativa repetida, booleano e HTML sem texto.
- [CSV](../public/examples/valid.csv), [texto](../public/examples/valid.txt) e [HTML](../public/examples/valid.html): acentos, quebras e formatação.

Execute `npm test -- tests/import.test.ts tests/content.test.ts`. Os testes verificam os arquivos públicos, formato, lote parcial, mapeamento, duplicidade, gabaritos e sanitização. A gravação e o isolamento pertencem aos testes de integração do banco.
