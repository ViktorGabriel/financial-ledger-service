import { PrismaClient } from "@prisma/client";
import { Account, AccountStatus, AccountType } from "../../../core/domain/entities/account.entity.js";
import { ConcurrencyConflictException } from "../../../core/domain/exceptions/domain.exception.js";
import { AccountRepository } from "../../../core/domain/repositories/account.repository.interface.js";

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Account | null> {
    const raw = await this.prisma.account.findUnique({
      where: { id },
    });

    if (!raw) return null;

    return Account.create({
      id: raw.id,
      accountNumber: raw.accountNumber,
      type: raw.type as AccountType,
      currency: raw.currency,
      status: raw.status as AccountStatus,
      balance: raw.balance,
      version: raw.version,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  async findByAccountNumber(accountNumber: string): Promise<Account | null> {
    const raw = await this.prisma.account.findUnique({
      where: { accountNumber },
    });

    if (!raw) return null;

    return Account.create({
      id: raw.id,
      accountNumber: raw.accountNumber,
      type: raw.type as AccountType,
      currency: raw.currency,
      status: raw.status as AccountStatus,
      balance: raw.balance,
      version: raw.version,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  async create(account: Account): Promise<void> {
    await this.prisma.account.create({
      data: {
        id: account.id,
        accountNumber: account.accountNumber,
        type: account.type,
        currency: account.currency,
        status: account.status,
        balance: account.balance,
        version: account.version,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
    });
  }

  async update(account: Account): Promise<void> {
    // Optimistic Concurrency Control using updateMany where version equals baseVersion
    const result = await this.prisma.account.updateMany({
      where: {
        id: account.id,
        version: account.baseVersion,
      },
      data: {
        balance: account.balance,
        status: account.status,
        version: account.version,
      },
    });

    if (result.count === 0) {
      const current = await this.prisma.account.findUnique({
        where: { id: account.id },
        select: { version: true },
      });

      throw new ConcurrencyConflictException(
        account.id,
        account.baseVersion,
        current?.version ?? -1
      );
    }
  }
}
