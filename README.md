# Financial Ledger Service

> Motor de Ledger Financeiro com contabilidade por **Partidas Dobradas (Double-Entry Bookkeeping)**, contratos defensivos em Zod, controle de idempotência e arquitetura desacoplada (Clean Architecture).

## 🏛️ Arquitetura & Visão Geral

O **Financial Ledger Service** provê a fundação contábil imutável para transações financeiras distribuídas. O design segue estritamente a **Clean Architecture**, isolando entidades e regras de domínio de frameworks externos ou dependências de banco de dados.

### Princípios Fundamentais:
- **Partidas Dobradas (Double-Entry Bookkeeping):** Toda transação requer ao menos dois lançamentos (`Entry`), onde a soma estrita dos débitos deve ser exatamente igual à soma dos créditos (\(\sum \text{Débitos} = \sum \text{Créditos}\)).
- **Idempotência Nativa:** Transações identificadas unicamente por `idempotencyKey` para prevenir duplicação em cenários de retry de rede ou reprocessamento assíncrono.
- **Fail-Fast & Domain Exceptions:** Violações de regra de negócio disparam exceções tipadas de domínio (`InvalidDoubleEntryException`, `MinimumEntriesViolationException`, etc.).
- **Contratos Defensivos:** Validação rigorosa de esquemas de entrada via **Zod**.

---

## 🛠️ Stack Tecnológica

- **Linguagem & Runtime:** Node.js (>=20.0.0) com TypeScript 5.7+
- **Validação de Schemas:** Zod 3.x
- **Testes & Cobertura:** Vitest 3.x
- **Framework Web (Infraestrutura):** Fastify 5.x

---

## 📁 Estrutura do Projeto

```text
src/
├── contracts/               # Schemas de validação Zod (Entrada, Persistência, DTOs)
│   ├── schemas/             # account.schema.ts, transaction.schema.ts, entry.schema.ts
│   └── index.ts
├── core/
│   ├── domain/              # Entidades puras, Value Objects e Regras de Negócio
│   │   ├── entities/        # Account, Transaction, Entry
│   │   ├── exceptions/      # Exceções tipadas de domínio
│   │   └── repositories/    # Interfaces de persistência (Portas)
│   └── use-cases/           # Casos de uso e orquestrações de Saga
└── infra/                   # Implementações de adaptadores externos (HTTP, Banco, Filas)
tests/
├── contracts/               # Testes de validação de schemas Zod
└── core/domain/             # Testes unitários puros das entidades de domínio
```

---

## 🚀 Como Executar

### Instalação
```bash
npm install
```

### Compilação / Build
```bash
npm run build
```

### Execução de Testes
```bash
# Executar a suíte de testes unitários com Vitest
npm test

# Modo de observação contínua
npm run test:watch

# Cobertura de código
npm run test:coverage
```

---

## 📄 Licença

Distribuído sob a licença ISC. Desenvolvido por [Viktor Gabriel](https://github.com/ViktorGabriel).
