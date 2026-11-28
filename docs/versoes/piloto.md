# Piloto

Em 24 de novembro de 2026, os PRs de preparação e implementação foram mesclados.
Eduardo aprovou o visual do [redesenho do diário](https://github.com/eduardo-fcarvalho/budgeting-with-ai/issues/7)
na avaliação local. O uso da PWA nos dois celulares ainda precisa ser validado.
[Preparação #2](https://github.com/eduardo-fcarvalho/budgeting-with-ai/pull/2) · [Piloto #4](https://github.com/eduardo-fcarvalho/budgeting-with-ai/pull/4) · [Card #3](https://github.com/eduardo-fcarvalho/budgeting-with-ai/issues/3)

## Entregue

- Instruções para agentes, fluxo de revisão, guardrails, glossário, briefing e decisão sobre o isolamento
  dos históricos. A [PoC](../../poc/README.md) preserva o backend anterior, o Compose com MySQL e os materiais dos testes.
- PWA React com login por sessão e dados separados por titular. O diário permite criar, editar e excluir
  gastos em reais, consultar por mês e somar por categoria. O histórico sincronizado abre offline e o logout
  limpa a cópia local.
- Rascunho por voz para conferência. Ao confirmar, o gasto e a categoria nova sugerida são gravados juntos.
  O teto de IA é de US$ 5 por mês UTC para o conjunto das contas e dos experimentos.
- API Spring com PostgreSQL e migrações Flyway. A imagem Docker serve a PWA e a API na mesma origem.
  O roteiro de recuperação tem scripts de backup e restauração.

## Validado

- A PoC foi avaliada com Java 25. O teste de contexto falhou sem MySQL. Na entrega do piloto,
  os jobs de guardrails, API e PWA passaram no CI. O teste da API usou PostgreSQL real e um
  provedor HTTP simulado para validar os dois caminhos de voz e a reserva do orçamento.
  [CI do piloto](https://github.com/eduardo-fcarvalho/budgeting-with-ai/actions/runs/45303774695)
- Na imagem Docker, o Chromium com viewport de celular confirmou o isolamento entre duas contas,
  a consulta offline, a limpeza da cópia local no logout e a persistência após reinício.
- A restauração em um PostgreSQL vazio recuperou valor, data e categoria de um gasto. As sessões antigas
  ficaram fora do backup. Após a recuperação, a voz fica indisponível até o mês UTC seguinte para evitar
  liberar orçamento já gasto. O lançamento manual continua disponível.
- O benchmark pré-merge comparou as operações equivalentes das duas APIs e mediu a PWA no Chromium
  com banco local. As amostras, os resultados e o script de repetição ficam no histórico privado do clone.
- A prévia em [localhost:8080](http://localhost:8080) foi iniciada no projeto Docker `budgeting-preview`, com
  dados fictícios de dois meses. Login e navegação entre os meses foram confirmados. A voz está desativada
  nesta instância.

## Antes da publicação

1. Eduardo revisa o PR do redesenho e decide se a interface está pronta para ser publicada.
   O [README](../../README.md#rodar-o-piloto) registra como iniciar a aplicação localmente.
2. Com a interface aprovada, escolher a hospedagem com endereço HTTPS incluído e configurar o PostgreSQL
   e o backup externo. Na publicação, confirmar a instalação e o uso da PWA nos dois celulares.
   [Pesquisa de hospedagem](../pesquisa-piloto.md)
3. A escolha definitiva do modelo de voz depende do ensaio com a chave da OpenAI. Medir acerto em
   português, latência e custo por rascunho correto dentro do teto compartilhado.
   [Ensaio de voz](../../README.md#voz-e-experimento-pago)

## Cobertura e CI

| Verificação | O que cobre |
| --- | --- |
| Guardrails | Regras dos hooks e proteção das migrações Flyway existentes na base do PR. |
| API | Sessões e isolamento, limites de gastos em centavos, repetição e rollback, contrato de voz com provedor simulado e reserva concorrente no PostgreSQL. |
| PWA | Valores e períodos, edição e rascunhos, cache offline, logout e revogação de sessão na reconexão ou com falha na limpeza local. |
| Imagem | Login, gasto e categoria pessoal persistidos, consulta offline e troca de conta no mesmo navegador com a aplicação empacotada. |
| Recuperação sob demanda | Backup de dados fictícios, restauração em banco vazio, exclusão das sessões e teto de voz esgotado no mês UTC. |

Os quatro checks de PR devem estar verdes antes do merge. A recuperação sob demanda
usa a mesma imagem com um banco de origem e outro de restauração, ambos descartáveis.
A instalação, o microfone e a consulta offline nos dois celulares fazem parte do aceite
antes da publicação. O ensaio pago de voz continua manual.

## Interface e análise por categoria

- O botão central no celular oferece registro manual e por voz. O editor permite reutilizar
  uma categoria pessoal ou digitar uma nova.
  [Sistema visual do BG-07](../../design-system/budgeting-with-ai/MASTER.md)
- O resumo começa no mês corrente. Os períodos diário, semanal, mensal e anual controlam os totais
  por categoria e o histórico. A semana começa na segunda-feira. Selecionar uma categoria no painel
  filtra o histórico.
- O tema segue a preferência do sistema até que a pessoa escolha claro ou escuro. A escolha fica
  salva no aparelho.
- Nas instalações que exibem atalhos no ícone da PWA, **Gravar gasto** abre a tela de voz.
  A captura começa ao tocar em **Gravar gasto**, inclusive quando a permissão já está
  concedida. É possível cancelar a gravação antes do envio. O rascunho segue para
  conferência antes da confirmação.
