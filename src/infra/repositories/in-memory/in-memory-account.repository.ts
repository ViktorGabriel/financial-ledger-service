import { Account } from "../../../core/domain/entities/account.entity.js";
import { ConcurrencyConflictException } from "../../../core/domain/exceptions/domain.exception.js";
import { AccountRepository } from "../../../core/domain/repositories/account.repository.interface.js";

export class InMemoryAccountRepository implements AccountRepository {
  private accounts: Map<string, Account> = new Map();

  async findById(id: string): Promise<Account | null> {
    const account = this.accounts.get(id);
    if (!account) return null;
    return account.clone();
  }

  async findByAccountNumber(accountNumber: string): Promise<Account | null> {
    for (const account of this.accounts.values()) {
      if (account.accountNumber === accountNumber) {
        return account.clone();
      }
    }
    return null;
  }

  async create(account: Account): Promise<void> {
    this.accounts.set(account.id, account.clone());
  }

  async update(account: Account): Promise<void> {
    const existing = this.accounts.get(account.id);
    if (!existing) {
      this.accounts.set(account.id, account.clone());
      return;
    }

    // Optimistic Concurrency Check:
    // If the account in the repository has changed since it was read (existing.version !== account.baseVersion),
    // then another transaction committed an update in the meantime!
    if (existing.version !== account.baseVersion) {
      throw new ConcurrencyConflictException(account.id, account.baseVersion, existing.version);
    }

    this.accounts.set(account.id, account.clone());
  }

  public clear(): void {
    this.accounts.clear();
  }
}
