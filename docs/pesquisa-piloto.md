# Hospedagem e ditado para o piloto

Consulta em 23/11/2026. Os valores abaixo são preços públicos recorrentes. Eduardo decide a contratação. A comparação de modelos é documental e o ensaio com áudio ainda precisa ser medido.

## Quanto custa hospedar as duas contas?

Eduardo adiou a escolha do host. As duas cotações usam o endereço HTTPS fornecido pela plataforma, um único contêiner com o aplicativo Java e os arquivos da PWA, um PostgreSQL novo e um backup externo. Valores em dólares, para um mês inteiro, sem tributos, câmbio nem créditos promocionais.

| Item mensal | Render Hobby, Virgínia | DigitalOcean App Platform, Nova York |
| --- | --- | --- |
| Aplicação sempre ligada | US$ 7, 512 MB RAM | US$ 10, 1 GiB RAM, plano fixo |
| PostgreSQL gerenciado | US$ 6, 256 MB RAM, mais US$ 0,30 por 1 GB de disco | US$ 15,15, 1 GiB RAM e 10 GiB de disco |
| Endereço e certificado | US$ 0 em `*.onrender.com` | US$ 0 em `*.ondigitalocean.app` |
| Tarefa diária de backup | US$ 1, mínimo mensal do cron | Até US$ 0,30 reservados para 30 execuções curtas |
| Armazenamento externo B2 | US$ 0 nas condições abaixo | US$ 0 nas mesmas condições |
| **Infraestrutura estimada** | **US$ 14,30/mês** | **US$ 25,45/mês** |
| Planejamento com o teto de US$ 5 de IA | US$ 19,30/mês | US$ 30,45/mês |

**Render.** O workspace Hobby custa US$ 0. O PostgreSQL pago inclui recuperação para um instante dos últimos três dias. A cotação inclui explicitamente 1 GB de armazenamento no preço de US$ 0,30/GB publicado no guia de custos. O cron pode superar seu mínimo mensal conforme o tempo de execução. A transferência de saída deve caber nos 5 GB do workspace. Antes de contratar, medir a memória de inicialização da JVM e a carga das duas pessoas para avaliar o contêiner de 512 MB. [Preços Render](https://render.com/pricing) · [Cálculo do armazenamento](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses) · [Cron](https://render.com/docs/cronjobs) · [Backup e recuperação](https://render.com/docs/postgresql-backups) · [HTTPS e endereço incluídos](https://render.com/docs/tls)

**DigitalOcean.** O contêiner de 1 GiB inclui 100 GiB/mês de saída. O banco tem um único nó. Para o cron no contêiner de US$ 5/mês, a plataforma cobra pelo tempo ativo. A reserva supõe até um centavo por execução diária, com duração de até um minuto. É uma margem de cálculo, e a fatura depende da duração real. [App Platform](https://docs.digitalocean.com/products/app-platform/details/pricing/) · [Nós PostgreSQL](https://www.digitalocean.com/pricing/managed-databases) · [Cron](https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/) · [Endereço do app](https://docs.digitalocean.com/products/app-platform/how-to/manage-domains/) · [HTTPS](https://docs.digitalocean.com/products/app-platform/details/limits/)

Os dois provedores aceitam imagens de contêiner. Nas regiões cotadas, a aplicação e o PostgreSQL ficam nos EUA. Brasil não consta das listas de regiões desses produtos. A latência a partir das redes dos dois celulares ainda precisa ser medida. [Contêineres no Render](https://render.com/hosting/docker) · [Regiões Render](https://render.com/docs/regions) · [Regiões DigitalOcean](https://docs.digitalocean.com/platform/regional-availability/)

Para a cópia externa, 30 dumps diários de até 100 MB comprimidos e criptografados somam cerca de 3 GB. A franquia B2 comporta 10 GB e saída de até três vezes o volume médio armazenado por mês. A estimativa de US$ 0 pressupõe operações dentro das franquias, remoção das versões expiradas e restaurações ocasionais. A região B2 US East fica na Virgínia e é definida na abertura da conta. A chave de restauração deve estar disponível independentemente da hospedagem. O aceite exige recuperar uma cópia externa em PostgreSQL vazio e conferir os dados. [Franquias B2](https://www.backblaze.com/cloud-storage/pricing) · [Regiões B2](https://www.backblaze.com/docs/en/cloud-storage-data-regions)

## Qual caminho avaliar para o ditado em português brasileiro?

O fluxo em duas etapas recebe um arquivo curto, transcreve e usa o texto para propor o rascunho. O texto digitado pode compartilhar a etapa de extração. Um segundo caminho entrega o áudio diretamente a um modelo de chat e pede os mesmos campos. Nos dois casos a pessoa revisa antes de confirmar. O Brasil aparece na lista de países atendidos pela API. [Disponibilidade da API](https://help.openai.com/en/articles/7947663-chatgpt-and-openai-api-supported-countries-and-territories)

| Caminho | Modelo | Preço padrão em US$ | Compatibilidade e prazo |
| --- | --- | --- | --- |
| Transcrição de arquivo | `gpt-transcribe` | 0,0045/min | Recomendação atual da OpenAI para arquivos gravados. Suporta WebM, MP4 e WAV, entre outros. Para indicar português usar o parâmetro plural `languages` com código `pt`. |
| Referências para comparação | `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` | Respectivamente 0,006, cerca de 0,006 e cerca de 0,003/min | A OpenAI anunciou encerramento dos três em 26/02/2027. O modelo mini custa menos por minuto na estimativa publicada. |
| Extração de texto | `gpt-6-luna` | 0,10/M tokens de entrada e 0,50/M de saída | Aceita saída estruturada. O `gpt-4o-mini` de texto usado pela prova de conceito tem encerramento anunciado para 14/01/2027. |
| Áudio direto para rascunho | `gpt-audio-1.5` | 32/M tokens de áudio de entrada, 2,50/M de texto de entrada e 10/M de texto de saída | Chat Completions, entrada de áudio e resposta em texto. Validar o JSON no servidor. O modelo não oferece garantia de esquema por Structured Outputs. |

Fontes das tarifas, formatos e prazos. [Transcrição de arquivos](https://developers.openai.com/api/docs/guides/speech-to-text) · [Preços da API](https://developers.openai.com/api/docs/pricing) · [Whisper](https://developers.openai.com/api/docs/models/whisper-1) · [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) · [GPT-Audio-1.5](https://developers.openai.com/api/docs/models/gpt-audio-1.5) · [Calendário de descontinuação](https://developers.openai.com/api/docs/deprecations)

A prova de conceito usa Spring AI 2.0.0-M5. Nesse adaptador de chat, um `UserMessage` aceita `Media` com áudio. O código escolhe MP3 quando o MIME contém `mp3` e WAV nos demais tipos de áudio. Para comparar os caminhos, use bytes WAV reais nos dois. Em celular que grava WebM/Opus ou MP4/AAC, é preciso converter para o chat direto ou produzir WAV no cliente. O adaptador de transcrição M5 expõe somente a opção singular `language`. Para enviar a dica plural do modelo atual, usar uma chamada multipart compatível ou confirmar em teste de contrato o suporte da versão escolhida. [Spring AI, entrada de áudio](https://docs.spring.io/spring-ai/reference/api/chat/openai-chat.html) · [OpenAiChatModel na versão M5](https://github.com/spring-projects/spring-ai/blob/v2.0.0-M5/models/spring-ai-openai/src/main/java/org/springframework/ai/openai/OpenAiChatModel.java) · [Opções de transcrição M5](https://docs.spring.io/spring-ai/docs/2.0.0-M5/api/org/springframework/ai/openai/OpenAiAudioTranscriptionOptions.Builder.html)

**Cenário de custo, sem chamada paga.** Com 10 segundos de áudio, 500 tokens de entrada textual e 100 de saída, a projeção das duas etapas é US$ 0,00075 de transcrição + US$ 0,00010 de extração = US$ 0,00085 por rascunho. Para áudio direto, 500 tokens de instruções, 100 de resposta e, por hipótese, 100 tokens de áudio custariam US$ 0,00545. A quantidade de tokens de áudio precisa vir da resposta da API. A projeção por minuto e os valores hipotéticos por requisição servem para comparar ordens de grandeza. Para aplicar o teto mensal, reservar pelo tamanho máximo permitido antes da chamada e reconciliar o consumo de todas as tentativas, inclusive as de experimento. [Preços da API](https://developers.openai.com/api/docs/pricing) · [Teto do piloto](briefing.md)

## Ensaio pareado proposto

1. Preparar clipes fictícios em pt-BR, curtos, com gabarito independente. Cobrir centavos, nomes locais, data explícita e relativa, categoria nova e valor ausente. Incluir os dois celulares, com e sem ruído ambiente. Fixar o dia de referência, o fuso e as categorias pessoais disponíveis.
2. Para cada clipe, usar o mesmo WAV nos dois caminhos, com as mesmas instruções de extração. Alternar a ordem para diminuir o efeito da rede. Medir do envio ao rascunho disponível, contando preparação do áudio, respostas inválidas e erros. Fixar modelos e versão das instruções.
3. Comparar centavos e data exatos, adequação da categoria e descrição, abstenção em campo ausente, validade do rascunho, mediana e p95 de latência, custo por tentativa e por rascunho válido. Publicar numerador e denominador por campo. Custo e latência incluem ambas as chamadas do fluxo em duas etapas.
4. Guardar somente identificador do caso, modelos, duração, contagens de tokens, custo, tempos, acertos por campo e códigos de falha. Áudio e texto ditado ficam fora dos logs. Executar o ensaio no mesmo orçamento do piloto, fora do CI. A disponibilidade documentada permite testar os dois caminhos. A escolha por qualidade em pt-BR depende dos resultados nos aparelhos.
