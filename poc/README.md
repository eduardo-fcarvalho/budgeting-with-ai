# Prova de conceito original

Esta árvore preserva o estado local anterior ao piloto, incluindo as gravações e as alterações em andamento.
O Maven da raiz compila somente o piloto. Para conferir a compilação histórica sem executar a aplicação ou
chamar a IA, use na raiz `./mvnw -f poc/pom.xml -DskipTests package`.

Os testes de integração históricos usam serviços pagos e o fluxo limpa a tabela de transações.
O Hibernate da PoC usa create-drop. Qualquer execução histórica requer MySQL descartável
e credenciais isoladas. O piloto usa PostgreSQL e permanece independente desta árvore.
