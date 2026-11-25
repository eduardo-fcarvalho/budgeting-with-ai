# Piloto

A PoC foi avaliada em 23/11/2026 com Java 25. Sem banco, o teste de contexto falhou ao inicializar o Hibernate.
A PoC e as alterações que estavam em andamento foram preservadas em `poc/`.

A PWA inclui login por sessão, gastos e categorias por titular e histórico offline. O PostgreSQL usa migrações
Flyway. O Dockerfile empacota o frontend e a API na mesma origem. O ensaio com chamadas pagas fica fora do CI.

O teste de contrato da voz usa um provedor HTTP local. A seleção definitiva do modelo aguarda a medição
paga em português. O backup externo e a aceitação nos dois celulares dependem da hospedagem escolhida.

## Verificação local

- API com PostgreSQL 18 e simulação do provedor de voz. Os testes cobrem sessão, CSRF,
  isolamento, confirmação repetida, contrato de ambos os modelos e reserva do orçamento.
- Chromium em janela de celular com a API da imagem Docker. Duas contas ficaram isoladas.
  Um gasto de R$ 42,90 continuou disponível após reiniciar, abriu offline e saiu da cópia local
  após logout.
- Backup e restauração em PostgreSQL vazio. O gasto restaurado manteve 4.290 centavos,
  data e categoria. Nenhuma sessão foi restaurada.

A recuperação esgota o orçamento de IA do mês UTC em curso para cobrir chamadas feitas
depois do último backup. O lançamento manual continua disponível.
