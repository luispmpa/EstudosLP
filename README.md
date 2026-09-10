# EstudosLP

Plataforma pessoal de questões para concursos: **resolver → compreender → registrar → agendar → revisar → medir**.

React + TypeScript + Vite, Supabase Auth e PostgreSQL. Repetição manual configurável, sem algoritmo adaptativo. O código é desenvolvido em `astra/initial-platform` e submetido por PR; merge na `main` exige revisão.

## Executar

Requisitos: Node.js 22.12+ (ou 24 LTS), npm e um projeto Supabase dedicado. Docker é necessário apenas para executar a pilha completa local do Supabase; os testes SQL com PGlite não exigem Docker.

```sh
npm ci
cp .env.example .env.local
```

No PowerShell, use `Copy-Item .env.example .env.local`. Configure:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA-CHAVE-PUBLICAVEL
```

Essas duas configurações são públicas. **Nunca use chave secreta/service-role no frontend.** Arquivos `.env*` reais estão ignorados pelo Git. Sem configuração, a interface mostra instruções de conexão e não simula persistência.

### Banco hospedado

Crie ou selecione uma instância exclusiva do EstudosLP. Não aplique migrations em bancos de outros sistemas. Use o CLI fixado no projeto:

```sh
npx supabase login
npx supabase link --project-ref SEU-PROJECT-REF
npx supabase db push --dry-run
npx supabase db push
```

Revise as migrations antes do push. O schema inclui tabelas, funções RPC, índices, grants e policies RLS. Não é necessário colocar senhas de banco no código. As credenciais de administração são utilizadas somente pelas ferramentas de administração no ambiente seguro.

No painel Auth do Supabase, configure Site URL e os Redirect URLs para `http://localhost:5173` e para o domínio publicado. Confirmação por email depende da configuração do projeto; use SMTP próprio para operação regular e valide cadastro/recuperação. A aplicação usa email e senha e não habilita login anônimo.

```sh
npm run dev
```

### Pilha local completa (opcional)

Com Docker em execução:

```sh
npx supabase start
npx supabase db reset
```

`db reset` apaga e recria **o banco local de desenvolvimento**. Não o use em dados que precise preservar. Copie a URL e a chave publicável local para `.env.local` e execute o aplicativo. Para testar isolamento, crie dois usuários e verifique os acessos em sessões distintas.

## Testes e build

```sh
npm test
npm run typecheck
npm run build
npm audit
```

Os testes cobrem domínio de importação, datas, sanitização e integração com o SQL real. O schema `auth` é simulado nos testes PGlite: isso verifica RLS e autorização SQL, mas não equivale a testar emissão/renovação de JWT, email ou o gateway do Supabase. A validação hospedada deve ser feita antes de declarar o fluxo diário aprovado.

## Primeiros estudos

1. Entre com sua conta e crie um projeto, um caderno e uma matéria em Configurações.
2. Cadastre uma questão ou abra Importação e use os [exemplos](public/examples/).
3. Revise a prévia, erros e duplicatas; confirme os registros válidos.
4. Localize a questão no banco e responda.
5. Leia a correção e escolha um dos seus intervalos.
6. A questão volta à fila quando o horário agendado chegar. Histórico e dashboard usam os dados persistidos.

Os botões de revisão são registros editáveis. Uma escolha de 10 dias corresponde a 864.000 segundos após a tentativa. A edição futura do botão não modifica a agenda existente. Uma questão em vários cadernos compartilha a mesma agenda; a política depende do contexto de estudo ativo.

## Publicação

O frontend gera arquivos estáticos em `dist/`:

```sh
npm run build
npm run preview
```

Configure um host estático com Node 22.12+, comando `npm ci && npm run build` e diretório de saída `dist`. Defina as duas variáveis `VITE_SUPABASE_*` no ambiente de build. Habilite HTTPS e fallback de navegação para `index.html`, e cadastre o domínio em Auth/Redirect URLs. Não copie `.env.local` para o diretório público.

O projeto inclui política de segurança em `public/_headers` para hosts compatíveis. Em outros hosts, configure os mesmos cabeçalhos no provedor. A PWA oferece instalação e aviso quando não há conexão; dados de estudo continuam no servidor, sem escrita offline.

## Documentação

- [Arquitetura, modelo conceitual, páginas, riscos e fases](docs/architecture.md)
- [Modelo físico, RPCs e autorização](docs/database.md)
- [Contrato e exemplos de importação](docs/import-format.md)
- [Motor de repetição e semântica das datas](docs/spaced-repetition.md)
- [Validação e pendências de operação](docs/validation.md)

## Backup e portabilidade

A exportação JSON inclui conteúdo, classificações, políticas, tentativas, revisões e logs. Ela não exporta senhas, tokens ou usuários do Supabase Auth. Faça também backup do PostgreSQL pelo provedor para recuperação completa de desastre. O JSON possui versão; um restaurador com remapeamento de identidade e transações é uma etapa posterior e deve ser validado antes de substituir os backups do banco.

## Escopo do incremento

O foco é o núcleo de estudo persistente. XLSX, importação de HTML arbitrário de terceiros, restauração completa de exportação, desfazer importação com dependências, cópia de formatação, sincronização offline e algoritmos adaptativos não são promessas deste incremento. Consulte o relatório de validação para distinguir implementação, testes locais e verificações que dependem do ambiente hospedado.
