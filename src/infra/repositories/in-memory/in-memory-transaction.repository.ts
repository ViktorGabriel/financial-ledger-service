import { Transaction, TransactionStatus } from "../../../core/domain/entities/transaction.entity.js";
import { TransactionRepository } from "../../../core/domain/repositories/transaction.repository.interface.js";

export class InMemoryTransactionRepository implements TransactionRepository {
  private transactions: Map<string, Transaction> = new Map();
  private idempotencyIndex: Map<string, string> = new Map(); // idempotencyKey -> transactionId

  async findById(id: string): Promise<Transaction | null> {
    const tx = this.transactions.get(id);
    if (!tx) return null;
    return tx;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Transaction | null> {
    const id = this.idempotencyIndex.get(idempotencyKey);
    if (!id) return null;
    return this.findById(id);
  }

  async create(transaction: Transaction): Promise<void> {
    this.transactions.set(transaction.id, transaction);
    this.idempotencyIndex.set(transaction.idempotencyKey, transaction.id);
  }

  async updateStatus(id: string, status: TransactionStatus): Promise<void> {
    const tx = this.transactions.get(id);
    if (!tx) return;

    if (status === "POSTED") {
      tx.post();
    } else if (status === "REJECTED") {
      tx.reject();
    } else if (status === "CANCELED") {
      tx.cancel();
    }
  }

  public clear(): void {
    this.transactions.clear();
    this.idempotencyIndex.clear();
  }
}
