# Piloto

Em 24 de novembro de 2026, os PRs de preparação e implementação foram mesclados. A versão
da `main` está em prévia local para Eduardo avaliar o frontend antes de decidir sobre o deploy.
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

1. Eduardo testa a prévia, avalia o frontend e decide se a interface está pronta para ser publicada.
   O [README](../../README.md#rodar-o-piloto) registra como iniciar a aplicação localmente.
2. Com a interface aprovada, escolher a hospedagem com endereço HTTPS incluído e configurar o PostgreSQL
   e o backup externo. Na publicação, confirmar a instalação e o uso da PWA nos dois celulares.
   [Pesquisa de hospedagem](../pesquisa-piloto.md)
3. A escolha definitiva do modelo de voz depende do ensaio com a chave da OpenAI. Medir acerto em
   português, latência e custo por rascunho correto dentro do teto compartilhado.
   [Ensaio de voz](../../README.md#voz-e-experimento-pago)

## Interface e análise por categoria

- O lançamento manual abre pelo botão central no celular. O formulário permite reutilizar uma
  categoria pessoal ou digitar uma nova.
- O resumo começa no mês corrente. Os períodos diário, semanal, mensal e anual também controlam
  o histórico. A semana começa na segunda-feira. A legenda do gráfico filtra o histórico por categoria.
- Nas instalações que exibem atalhos no ícone da PWA, **Gravar gasto** abre a tela de voz.
  A captura automática requer permissão já concedida e suporte do navegador. Quando o navegador
  exige interação, o botão da tela inicia a captura. O rascunho segue para conferência antes da confirmação.
