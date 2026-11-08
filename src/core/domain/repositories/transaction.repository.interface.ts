import { Transaction, TransactionStatus } from "../entities/transaction.entity.js";

export interface TransactionRepository {
  findById(id: string): Promise<Transaction | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<Transaction | null>;
  create(transaction: Transaction): Promise<void>;
  updateStatus(id: string, status: TransactionStatus): Promise<void>;
}
