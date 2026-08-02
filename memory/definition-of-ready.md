# Definition of Ready (DoR)

Una historia entra al sprint solo si cumple TODO lo siguiente:

- [ ] Tiene criterios de aceptación en formato Gherkin
      (`Dado / Cuando / Entonces`).
- [ ] Los modelos de Prisma que toca ya existen y están migrados en la
      base de datos de desarrollo.
- [ ] El schema Zod de entrada está definido — es el contrato explícito
      entre cliente y servidor para esa historia.
- [ ] Está estimada por el equipo usando la escala Fibonacci
      (1 trivial · 2 simple · 3 estándar · 5 complejo ·
      8 muy complejo/con incertidumbre · 13 hay que dividirlo).
- [ ] No depende de otra historia que no esté terminada dentro del
      mismo sprint.

Si una historia no cumple todo esto, no entra al Sprint Planning —
se refina primero.