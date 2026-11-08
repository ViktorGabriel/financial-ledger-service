import { Account } from "../entities/account.entity.js";

export interface AccountRepository {
  findById(id: string): Promise<Account | null>;
  findByAccountNumber(accountNumber: string): Promise<Account | null>;
  create(account: Account): Promise<void>;
  update(account: Account): Promise<void>;
}
