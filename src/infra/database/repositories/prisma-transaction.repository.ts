import { PrismaClient } from "@prisma/client";
import { Entry } from "../../../core/domain/entities/entry.entity.js";
import { Transaction, TransactionStatus } from "../../../core/domain/entities/transaction.entity.js";
import { TransactionRepository } from "../../../core/domain/repositories/transaction.repository.interface.js";

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Transaction | null> {
    const raw = await this.prisma.transaction.findUnique({
      where: { id },
      include: { entries: true },
    });

    if (!raw) return null;

    const entries = raw.entries.map((e) =>
      Entry.create({
        id: e.id,
        transactionId: e.transactionId,
        accountId: e.accountId,
        type: e.type,
        amount: e.amount,
        createdAt: e.createdAt,
      })
    );

    return Transaction.create({
      id: raw.id,
      idempotencyKey: raw.idempotencyKey,
      description: raw.description,
      status: raw.status as TransactionStatus,
      entries,
      createdAt: raw.createdAt,
      postedAt: raw.postedAt,
    });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Transaction | null> {
    const raw = await this.prisma.transaction.findUnique({
      where: { idempotencyKey },
      include: { entries: true },
    });

    if (!raw) return null;

    const entries = raw.entries.map((e) =>
      Entry.create({
        id: e.id,
        transactionId: e.transactionId,
        accountId: e.accountId,
        type: e.type,
        amount: e.amount,
        createdAt: e.createdAt,
      })
    );

    return Transaction.create({
      id: raw.id,
      idempotencyKey: raw.idempotencyKey,
      description: raw.description,
      status: raw.status as TransactionStatus,
      entries,
      createdAt: raw.createdAt,
      postedAt: raw.postedAt,
    });
  }

  async create(transaction: Transaction): Promise<void> {
    await this.prisma.transaction.create({
      data: {
        id: transaction.id,
        idempotencyKey: transaction.idempotencyKey,
        description: transaction.description,
        status: transaction.status,
        postedAt: transaction.postedAt,
        entries: {
          create: transaction.entries.map((e) => ({
            id: e.id,
            accountId: e.accountId,
            type: e.type,
            amount: e.amount,
          })),
        },
      },
    });
  }

  async updateStatus(id: string, status: TransactionStatus): Promise<void> {
    await this.prisma.transaction.update({
      where: { id },
      data: {
        status,
        postedAt: status === "POSTED" ? new Date() : undefined,
      },
    });
  }
}
