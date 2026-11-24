# Budgeting

Diário pessoal de gastos em reais, com conferência de lançamentos ditados e consulta offline no celular.

O piloto está em desenvolvimento. Consulte [briefing](docs/briefing.md), [status](docs/versoes/piloto.md)
e [pesquisa de voz e hospedagem](docs/pesquisa-piloto.md).

## Rodar o piloto

Use Docker Compose e defina `POSTGRES_PASSWORD` no ambiente ou em uma cópia local de
`.env.example`. Para testar no computador, execute
`COOKIE_SECURE=false docker compose up --build -d` e abra http://localhost:8080.
A primeira inicialização cria as tabelas com Flyway. O volume PostgreSQL é exclusivo do piloto.
A PoC e seu Compose MySQL estão preservados em `poc/`.

Para criar cada conta, execute no terminal
`docker compose exec app java -jar /app/app.jar --spring.main.web-application-type=none --budget.account=create`.
O comando solicita e-mail e senha com entrada de senha oculta. Use `--budget.account=reset`
para redefinir a senha e revogar as sessões no servidor. Em um celular desconectado, a cópia já sincronizada
permanece acessível até o logout local ou a próxima verificação da sessão.

## Verificar

- Com Java 25 e PostgreSQL **descartável**, defina `DATABASE_URL` (URL JDBC),
  `POSTGRES_USER` e `POSTGRES_PASSWORD` e execute `./mvnw -B clean verify`.
  Os testes criam contas fictícias. O servidor HTTP simulado verifica os modelos
  realmente enviados pelo Spring AI e a cobrança registrada. O contrato OpenAPI é servido em
  `/v3/api-docs` com a sessão autenticada.
- Em `frontend/`, use Node 24 e rode `npm ci`, `npm test`, `npm run build`,
  `npx playwright install --with-deps chromium` e `npm run test:browser`.
- Execute `python3 -m unittest discover -s scripts/guardrails` para os hooks.

## Voz e experimento pago

Sem `OPENAI_API_KEY`, o diário manual continua disponível. Com a chave no servidor,
a configuração inicial usa `gpt-transcribe` e `gpt-6-luna`. A transcrição usa
detecção automática de idioma e resposta JSON. A extração instrui o modelo em português.
O próprio servidor valida o cabeçalho PCM e o limite de 30 segundos.
`VOICE_PATH=direct` seleciona o candidato de áudio direto para comparação.

Os valores são registrados em milionésimos de dólar por mês UTC. A reserva é atômica
no PostgreSQL e compartilhada pelas contas e pelo experimento. Uma falha de custo desconhecido
mantém a reserva. O candidato direto reserva até US$ 4,10112 por tentativa e devolve o excedente
após receber a contagem de tokens. Com pouco saldo ele pode ficar indisponível antes do caminho em duas etapas.
A tabela de preços e os limites de entrada/saída usados no código devem ser revistos juntos quando o modelo mudar.

Para o ensaio, use Java 25, Python 3 e FFmpeg. Aponte `DATABASE_URL`, usuário e senha **para o mesmo banco que
controla o orçamento de IA**. Prepare os nove clipes com `python3 scripts/prepare-benchmark.py`.
Execute apenas `RUN_PAID_BENCHMARK=yes ./mvnw -Dtest=VoiceBenchmarkIT test` com a chave no ambiente.
Cada tentativa informa o caso, o método e a latência. A comparação registra acerto por campo,
incluindo termos esperados na descrição, e calcula o custo por rascunho correto quando o consumo de todas as
tentativas é conhecido. Falhas são registradas por código, e cada método continua enquanto couber no saldo. Os três WAVs adicionais são falas sintéticas
sobre centavos e data relativa, categoria nova e valor ambíguo. O caso recording-2 fica fora da pontuação de valor,
pois os dois gabaritos históricos discordam. A seleção definitiva do modelo depende dos resultados.
Consulte a [comparação de preços e o protocolo](docs/pesquisa-piloto.md).

## Deploy e recuperação

A imagem Docker serve PWA e API na mesma origem, usa a porta de `PORT` (8080 por padrão)
e inicia como usuário sem privilégios. Na plataforma escolhida, publique o Dockerfile com
HTTPS do endereço fornecido, defina a conexão privada do PostgreSQL e mantenha
`COOKIE_SECURE=true`. O nome de usuário usa `POSTGRES_USER` (padrão budgeting).
Para um PostgreSQL gerenciado, use a URL JDBC e o modo TLS exigido pelo provedor.
O Compose local expõe apenas a aplicação no loopback. Para uma VPS, encaminhe o HTTPS
para essa porta. A publicação e o teste nos dois celulares aguardam a escolha do host.

Para backup, use os utilitários cliente da versão do PostgreSQL do servidor. Exporte
`PGHOST`, `PGUSER`, `PGDATABASE` e configure a autenticação do cliente.
Rode `scripts/backup.sh /caminho/novo/piloto.dump`. Agende diariamente na hospedagem
escolhida e envie a cópia criptografada ao armazenamento externo; a chave de recuperação
deve ficar disponível fora do servidor. Para testar a recuperação, crie um banco vazio,
aponte as variáveis para esse banco e execute `scripts/restore.sh /caminho/piloto.dump`.
Confira contas, categorias e gastos antes de trocar a conexão da aplicação. Sessões antigas ficam fora do dump.

A restauração encerra o orçamento de voz do mês UTC em curso, pois o dump pode anteceder
chamadas já cobradas. O diário manual continua disponível e o orçamento volta no primeiro dia do mês seguinte.
