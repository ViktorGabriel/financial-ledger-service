import { PrismaClient, Prisma } from "@prisma/client";
import { Account, AccountStatus, AccountType } from "../../core/domain/entities/account.entity.js";
import { Entry } from "../../core/domain/entities/entry.entity.js";
import { Transaction } from "../../core/domain/entities/transaction.entity.js";
import {
  AccountNotFoundException,
  InactiveAccountException,
  InsufficientFundsException,
  InvalidEntryAmountException,
  SameAccountTransferException,
} from "../../core/domain/exceptions/domain.exception.js";
import {
  TransferFundsCommand,
  TransferFundsResult,
} from "../../core/use-cases/transfer-funds.use-case.js";

interface RawAccountRow {
  id: string;
  accountNumber: string;
  type: string;
  currency: string;
  status: string;
  balance: bigint;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export class PostgresLedgerTransaction {
  constructor(private readonly prisma: PrismaClient) {}

  public async executeTransfer(command: TransferFundsCommand): Promise<TransferFundsResult> {
    if (command.amount <= 0n) {
      throw new InvalidEntryAmountException(command.amount);
    }

    if (command.sourceAccountId === command.destinationAccountId) {
      throw new SameAccountTransferException(command.sourceAccountId);
    }

    // Execute within Prisma interactive transaction with isolation level ReadCommitted + SELECT ... FOR UPDATE
    return await this.prisma.$transaction(
      async (tx) => {
        // 1. Idempotency check inside transaction
        const existingTx = await tx.transaction.findUnique({
          where: { idempotencyKey: command.idempotencyKey },
          include: { entries: true },
        });

        if (existingTx) {
          const src = await tx.account.findUnique({ where: { id: command.sourceAccountId } });
          const dst = await tx.account.findUnique({ where: { id: command.destinationAccountId } });

          return {
            transactionId: existingTx.id,
            status: existingTx.status,
            isDuplicate: true,
            sourceBalance: src?.balance ?? 0n,
            destinationBalance: dst?.balance ?? 0n,
            transferredAmount: command.amount,
          };
        }

        // 2. Deadlock prevention: sort account IDs alphabetically before locking
        const [firstId, secondId] = [
          command.sourceAccountId,
          command.destinationAccountId,
        ].sort();

        // 3. Pessimistic Lock (SELECT ... FOR UPDATE) on both accounts in deterministic order
        const lockedRows = await tx.$queryRaw<RawAccountRow[]>(
          Prisma.sql`
            SELECT id, "accountNumber", type, currency, status, balance, version, created_at, updated_at
            FROM accounts
            WHERE id IN (${firstId}::uuid, ${secondId}::uuid)
            ORDER BY id ASC
            FOR UPDATE;
          `
        );

        if (lockedRows.length < 2) {
          const foundIds = new Set(lockedRows.map((r) => r.id));
          if (!foundIds.has(command.sourceAccountId)) {
            throw new AccountNotFoundException(command.sourceAccountId);
          }
          throw new AccountNotFoundException(command.destinationAccountId);
        }

        const rawSource = lockedRows.find((r) => r.id === command.sourceAccountId)!;
        const rawDest = lockedRows.find((r) => r.id === command.destinationAccountId)!;

        // 4. Reconstruct Domain Entities from locked database state
        const sourceAccount = Account.create({
          id: rawSource.id,
          accountNumber: rawSource.accountNumber,
          type: rawSource.type as AccountType,
          currency: rawSource.currency,
          status: rawSource.status as AccountStatus,
          balance: rawSource.balance,
          version: rawSource.version,
          createdAt: rawSource.created_at,
          updatedAt: rawSource.updated_at,
        });

        const destAccount = Account.create({
          id: rawDest.id,
          accountNumber: rawDest.accountNumber,
          type: rawDest.type as AccountType,
          currency: rawDest.currency,
          status: rawDest.status as AccountStatus,
          balance: rawDest.balance,
          version: rawDest.version,
          createdAt: rawDest.created_at,
          updatedAt: rawDest.updated_at,
        });

        // 5. Invariant validations
        if (!sourceAccount.isActive()) {
          throw new InactiveAccountException(sourceAccount.id, sourceAccount.status);
        }
        if (!destAccount.isActive()) {
          throw new InactiveAccountException(destAccount.id, destAccount.status);
        }

        if (!sourceAccount.hasSufficientFunds(command.amount)) {
          throw new InsufficientFundsException(
            sourceAccount.id,
            sourceAccount.balance,
            command.amount
          );
        }

        // 6. Generate Double-Entry legs
        const transactionId = crypto.randomUUID();

        const creditLeg = Entry.create({
          id: crypto.randomUUID(),
          transactionId,
          accountId: sourceAccount.id,
          type: "CREDIT",
          amount: command.amount,
        });

        const debitLeg = Entry.create({
          id: crypto.randomUUID(),
          transactionId,
          accountId: destAccount.id,
          type: "DEBIT",
          amount: command.amount,
        });

        // 7. Domain Transaction Aggregate validates double-entry zero-sum
        const domainTx = Transaction.create({
          id: transactionId,
          idempotencyKey: command.idempotencyKey,
          description: command.description,
          entries: [creditLeg, debitLeg],
        });

        // 8. Apply entries to account balances
        sourceAccount.applyEntry(creditLeg);
        destAccount.applyEntry(debitLeg);

        // 9. Persist updated balances & version
        await tx.account.update({
          where: { id: sourceAccount.id },
          data: {
            balance: sourceAccount.balance,
            version: { increment: 1 },
          },
        });

        await tx.account.update({
          where: { id: destAccount.id },
          data: {
            balance: destAccount.balance,
            version: { increment: 1 },
          },
        });

        // 10. Persist Transaction and Entries atomically
        domainTx.post();

        await tx.transaction.create({
          data: {
            id: domainTx.id,
            idempotencyKey: domainTx.idempotencyKey,
            description: domainTx.description,
            status: "POSTED",
            postedAt: domainTx.postedAt,
            entries: {
              create: [
                {
                  id: creditLeg.id,
                  accountId: creditLeg.accountId,
                  type: "CREDIT",
                  amount: creditLeg.amount,
                },
                {
                  id: debitLeg.id,
                  accountId: debitLeg.accountId,
                  type: "DEBIT",
                  amount: debitLeg.amount,
                },
              ],
            },
          },
        });

        return {
          transactionId: domainTx.id,
          status: domainTx.status,
          isDuplicate: false,
          sourceBalance: sourceAccount.balance,
          destinationBalance: destAccount.balance,
          transferredAmount: command.amount,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 10000, // 10s timeout per rule 4
      }
    );
  }
}
