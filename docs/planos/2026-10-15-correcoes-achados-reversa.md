# Correções dos achados do Reversa (2026-10-15)

Origem: a escavação do Reversa nos módulos de armazenamento, backup, SaaS e senha
(`_reversa_sdd/code-analysis.md`). O usuário pediu para corrigir todos os achados
listados. Os de segurança mais graves já saíram antes, nesta mesma data:
`5eba615`, `4c52520`, `9b6277d`, `fb73c46`, `08fbbe0`.

## Decisões

- **Situação da empresa com duas fontes** (`plataforma` × `assinaturas`):
  a assinatura só propaga a **situação** às empresas quando a própria situação
  é alterada (ou na criação do contrato), e o **limite de usuários** só quando o
  plano muda (ou na criação). Mudar o dia de vencimento ou o valor não desfaz
  mais uma suspensão feita em Plataforma > Empresas, nem um limite ajustado à
  mão. Escolha do Claude, por ser a menor mudança que acaba com a sobrescrita
  silenciosa sem tirar nenhuma das duas telas.
- **Empresa nova num grupo com contrato**: entra com a situação e o limite de
  usuários do contrato do grupo, e respeitando o limite de empresas do plano.
- **Chave de parâmetro**: não pode mais ser renomeada pelo `PATCH` (o código
  procura a chave pelo nome). Recriar uma chave excluída **reativa** a linha.
- **"Esqueci minha senha"**: além do limite por IP, no máximo 3 links por conta
  por hora; os pedidos além disso respondem igual e não mandam e-mail.

## Etapas

- [x] 1. Limpeza da base de demonstração: classificar as tabelas com
      `empresaId` que ficaram de fora (`demo-limpeza.spec.ts`)
- [ ] 2. Mídia órfã do WhatsApp: trava por empresa, não só pelo total
- [ ] 3. Empresa nova em grupo existente: limite de empresas do plano e
      situação/limite do contrato
- [ ] 4. Planos: validar o corpo com o Zod do contrato
- [ ] 5. Assinatura: propagar situação e limite só quando mudam
- [ ] 6. Desvincular administrador: só quem é administrador
- [ ] 7. Revogar administrador da plataforma: serializado, sem zerar a lista
- [ ] 8. Parâmetros: chave não renomeável; recriar a excluída reativa
- [ ] 9. "Esqueci minha senha": limite por conta
- [ ] 10. Recompilar o `contracts` e conferir o `tsc`
- [ ] 11. Validar a cifragem dos parâmetros no dev (recriar o container da API)
