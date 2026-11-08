# Financial Ledger Service

> Motor de Ledger Financeiro com contabilidade por **Partidas Dobradas (Double-Entry Bookkeeping)**, processamento assíncrono com **BullMQ & Redis**, transações atômicas no **PostgreSQL (SELECT ... FOR UPDATE)** com **Prisma**, controle de concorrência pessimista e idempotência estrita sob **Clean Architecture**.

---

## 🏛️ Arquitetura & Visão Geral

O **Financial Ledger Service** provê a fundação contábil imutável para transações financeiras distribuídas e microsserviços de pagamento. O design segue rigorosamente a **Clean Architecture**, mantendo entidades e regras de domínio completamente isoladas de dependências de infraestrutura.

### Princípios Fundamentais:
- **Partidas Dobradas (Double-Entry Bookkeeping):** Toda transação contábil requer pelo menos duas pernas (`Entry`), onde a soma estrita dos débitos deve ser exatamente igual à soma dos créditos ($\sum \text{Débitos} = \sum \text{Créditos}$).
- **Prevenção de Race Conditions & Concorrência:**
  - **Pessimistic Locking (`SELECT ... FOR UPDATE`):** No PostgreSQL com ordenação determinística de IDs para eliminar cenários de deadlock e assegurar leitura/atualização atômica de saldos.
  - **Optimistic Concurrency Control (OCC):** Controle por versão (`version` / `baseVersion`) nas entidades e repositórios em memória.
- **Idempotência Nativa:** Transações identificadas unicamente por `idempotencyKey`, prevenindo cobranças duplicadas em quedas de rede ou retentativas.
- **Processamento Assíncrono com Filas:** Worker BullMQ com Redis configurado para retentativa exponencial (*exponential backoff*) e fail-fast para violações de regras de negócio via `UnrecoverableError`.
- **Contratos Defensivos:** Schemas Zod na borda da aplicação garantindo validação em tempo de execução.

---

## 🛠️ Stack Tecnológica

- **Linguagem & Runtime:** Node.js (>=20.0.0) com TypeScript 5.7+
- **ORM & Banco de Dados:** Prisma ORM 6.x com PostgreSQL 16
- **Filas & Cache:** BullMQ 5.x com IORedis 5.x e Redis 7
- **Validação de Schemas:** Zod 3.x
- **Testes & Cobertura:** Vitest 3.x
- **Containerização:** Docker e Docker Compose multi-stage

---

## 📁 Estrutura do Projeto

```text
src/
├── contracts/                        # Schemas Zod e DTOs tipados
│   ├── schemas/                      # account, entry, transaction, transfer-funds
│   └── index.ts
├── core/
│   ├── domain/                       # Camada pura de domínio (Zero external dependencies)
│   │   ├── entities/                 # Account, Transaction, Entry
│   │   ├── exceptions/               # Exceções tipadas de domínio
│   │   └── repositories/             # Contratos das portas de persistência
│   └── use-cases/                    # Casos de uso (TransferFundsUseCase)
└── infra/                            # Adaptadores de infraestrutura e I/O
    ├── database/                     # Prisma Client, migrations e repositórios PostgreSQL
    │   ├── postgres-ledger.transaction.ts # SELECT ... FOR UPDATE atômico
    │   └── repositories/             # PrismaAccountRepository, PrismaTransactionRepository
    ├── queue/                        # BullMQ Queues, Workers e Redis Connection
    │   ├── payment.queue.ts          # Configuração de fila com exponential backoff
    │   ├── payment.worker.ts         # Processador com telemetria e tratamento de erros
    │   └── redis.connection.ts       # Conexão IORedis resiliente
    └── repositories/in-memory/       # Mocks com controle concorrente OCC para testes rápidos
tests/
├── contracts/                        # Testes de validação de schemas Zod
├── core/domain/                      # Testes unitários puros das entidades de domínio
├── core/use-cases/                   # Testes unitários do caso de uso de transferência
└── infra/queue/                      # Testes unitários do Worker e Queue BullMQ
```

---

## 🚀 Como Executar

### 1. Clonar o Repositório e Instalar Dependências
```bash
git clone https://github.com/ViktorGabriel/financial-ledger-service.git
cd financial-ledger-service
npm install
```

### 2. Subir Infraestrutura Local (PostgreSQL & Redis)
```bash
docker compose up -d
```

### 3. Configurar Variáveis de Ambiente e Gerar Cliente Prisma
```bash
cp .env.example .env
npx prisma generate
```

### 4. Compilação / Build
```bash
npm run build
```

### 5. Execução de Testes
```bash
# Executar a suíte de testes unitários com Vitest
npm test

# Modo de observação contínua
npm run test:watch

# Cobertura de testes
npm run test:coverage
```

---

## 🧪 Estratégia de Testes

A suíte de testes cobre integralmente os fluxos críticos de negócio e infraestrutura:
- **Partidas Dobradas:** Rejeição de transações desbalanceadas ou incompletas.
- **Validação de Saldo & Bloqueio:** Bloqueio em contas `FROZEN` ou `CLOSED` e fundos insuficientes.
- **Idempotência:** Chamadas consecutivas não debitam duas vezes.
- **Concorrência Simultânea:** Simulação de disputas de saldo paralelas com OCC e rejeição de double-spending.
- **Worker BullMQ:** Validação de backoff exponencial e emissão de `UnrecoverableError` em falhas definitivas de domínio.

---

## 📄 Licença

Distribuído sob a licença ISC. Desenvolvido por [Viktor Gabriel](https://github.com/ViktorGabriel).
