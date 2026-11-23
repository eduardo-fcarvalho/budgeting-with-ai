# Budgeting

Use o briefing para o escopo do piloto e o GLOSSARY.md para termos do produto.
Registre decisões de arquitetura em docs/adr. Eduardo revisa e mescla os PRs.
Organize os marcos em GitHub Issues. Trabalhe em branch bg-<número>-<assunto>
e escreva commits no formato tipo: descrição.

Para tarefas de interface, delegue a implementação a um agente seguindo
docs/agents/implementador.md. O agente principal implementa os fluxos
sensíveis de identidade, isolamento de dados e cobrança de IA. Antes do PR,
delegue a revisão do card e a revisão das regras aos respectivos agentes
descritos em docs/agents.

Execute o Maven Wrapper na raiz com Java 25. Rode o build do frontend em
frontend/. Os testes da API do piloto exigem PostgreSQL descartável e dispensam credenciais de IA.
Use dados fictícios nos testes. Áudio, texto ditado, senhas, e-mails e tokens
ficam fora dos logs. Ative os hooks com git config core.hooksPath .githooks.
