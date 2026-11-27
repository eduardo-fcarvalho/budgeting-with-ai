# Sistema visual do Diário de gastos

## Auditoria e pesquisa

A interface anterior reunia login, painel, histórico, gravação e editor em
`main.tsx`. No celular, a barra inferior oferecia atalhos para três ações,
e o histórico completo aparecia abaixo do resumo e das barras de categoria.
No desktop, o conteúdo continuava em uma única página. O editor usava
`dialog` nativo, com formulário e gravação simultaneamente visíveis. O
estado da sessão e a cópia offline já tinham módulos próprios.

O UI UX Pro Max executou a consulta proposta `personal finance expense tracker
vibrant fintech mobile` e retornou Glassmorphism com Caveat e Quicksand. A
consulta `expense tracking budgeting app`, persistida via `--design-system
--persist`, retornou Minimalism com Inter, verde para finanças e atalhos
rápidos. Os parâmetros foram variação 7, movimento 7 e densidade 5. A categoria
inferida na segunda busca foi divisão de contas. Aplicamos os resultados
pertinentes à leitura de gastos e adaptamos cores, hierarquia e navegação à
PWA existente.

| Consulta complementar | Aplicação |
| --- | --- |
| `financial dashboard organic bento` (style) | Total em destaque, composição responsiva e formatação local. |
| `expense category proportion donut comparison` (chart) | Rosca até cinco categorias, barras acima disso, lista ordenada com nome, valor e percentual. |
| `expense timeline daily spending` (chart) | Histórico por data. O total e a comparação mensal têm prioridade sobre um gráfico diário neste piloto. |
| `safe area bottom tab bar` (web) | Cinco destinos ou ações na barra inferior, com área segura. |
| `voice ai confirmation cancel` (ux) | Identificação do rascunho criado por IA e confirmação humana. A busca específica por permissão do microfone não trouxe resultados aplicáveis. Os estados de microfone seguem a captura existente e o briefing. |
| `focus not obscured` e `error summary validation` (ux) | Foco visível, resumo focável com links e erros ao lado dos campos. |
| `reduced motion interruptible state transitions` (ux) | Interações imediatas e animações canceláveis, com preferência do sistema respeitada. |
| `derived state composition stable keys` (stack react) | Totais calculados durante a renderização em React 19, com identificadores estáveis para gastos. |
| `Manrope Inter` (google-fonts) | Manrope local para títulos e Inter local para leitura. Ambos usam a fonte do sistema como fallback sem rede ou arquivo adicional. |

## Tokens

`frontend/src/style.css` define os tokens semânticos usados pelos módulos.

| Papel | Claro | Escuro |
| --- | --- | --- |
| Fundo | `#F7F7F0` | `#141E1A` |
| Superfície | `#FFFFFF` | `#1C2B24` |
| Texto | `#182E26` | `#EFF5E8` |
| Texto secundário | `#4E6257` | `#B2C3B7` |
| Identidade | `#173E36` e `#DCF39B` | `#173E36` e `#DCF39B` |
| Foco | `#216E84` | `#A0DCEC` |

Os pares de texto normal têm meta de 4,5:1. Controles têm pelo menos 44 px
para o toque. Valores e cronômetros usam números tabulares. Os espaçamentos
comuns são 4, 8, 12, 16, 24 e 32 px. Os raios de controle e superfície são
0,85 e 1,65 rem. Sombras mais fortes ficam nos diálogos. Transições de 140 ms
respondem ao toque, e entradas de 260 ms usam desaceleração. Os estados
ativos da gravação e do processamento usam animações CSS. O modo de
movimento reduzido mantém as mesmas ações e os mesmos anúncios.

## Componentes

- **Navegação.** A barra inferior dá acesso a Início, Histórico, Novo, Análises
  e Ajustes. A partir de 1024 px, os mesmos controles aparecem na lateral.
  URLs usam fragmentos internos para permitir recarregar e voltar. A troca de
  tela leva o foco ao conteúdo.
- **Início.** Painel verde-floresta com total, contagem e período. O cartão
  claro leva ao gravador. Com o diário vazio, também oferece entrada manual
  direta. Categoria e gastos recentes completam a
  composição em uma coluna no celular e duas quando há espaço. A comparação
  mensal aparece quando há gastos no mês anterior e o período não é futuro.
  No mês em curso, compara o mesmo número de dias nos dois meses. O rodapé
  indica a última sincronização e oferece atualização.
- **Análises.** As cores são determinadas pelo nome de cada categoria pessoal.
  Os valores em BRL e as participações permanecem disponíveis em texto. A
  seleção da categoria abre o Histórico filtrado. No Início, a seleção
  filtra os gastos recentes e sinaliza o resultado na própria categoria.
- **Histórico.** Gastos agrupados por data, busca local por descrição ou
  categoria, ícones junto às categorias e confirmação explícita de exclusão.
- **Novo gasto.** A escolha central abre o registro manual ou por voz.
  Diálogos nativos usam formato de folha no celular. O editor deixa o valor,
  a data, a descrição e a categoria visíveis, com erros ligados aos campos.
  Fechar um editor alterado ou descartar um rascunho revisado pede
  confirmação. Antes de substituir o preenchimento por voz, o editor
  mostra os valores atuais e os do rascunho para comparação.
- **Voz.** O microfone começa após toque explícito, inclusive pelo atalho
  instalado. O cronômetro mostra 30 segundos, e a pulsação funciona como
  decoração. O rascunho editável recebe foco para revisão. Confirmar e
  descartar são ações distintas.
- **Ajustes e login.** A preferência de tema fica no aparelho. Botões de
  saída e tema mantêm rótulo acessível. Login conserva preenchimento
  automático, colagem, validação e sessão existentes.

A implementação usa React e CSS nativo, ícones vetoriais locais e composição
gráfica em CSS. Os componentes de apresentação consomem dados do diário com
valores inteiros em centavos. A troca de sessão desmonta o diário inteiro.
