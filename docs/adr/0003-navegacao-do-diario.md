# Navegação do diário por fragmentos locais

O diário precisa de destinos distintos no celular e no desktop, com suporte
ao botão de voltar e à reabertura offline. A base do piloto serve uma PWA de
página única. Usamos fragmentos fixos para Início, Histórico, Análises e
Ajustes. A navegação só registra o destino e funciona com o mesmo shell
precacheado. Datas, filtros, buscas, rascunhos e dados da conta ficam na
instância do diário associada à sessão.

O atalho do manifesto conserva a URL de gravação, que abre o modo de voz.
O comando na própria tela inicia a captura, inclusive com permissão já
concedida. O limite, a interpretação e a confirmação continuam no fluxo
existente. [BG-07](https://github.com/eduardo-fcarvalho/budgeting-with-ai/issues/7)
