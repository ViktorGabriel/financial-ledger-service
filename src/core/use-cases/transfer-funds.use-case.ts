import { Entry } from "../domain/entities/entry.entity.js";
import { Transaction, TransactionStatus } from "../domain/entities/transaction.entity.js";
import {
  AccountNotFoundException,
  InactiveAccountException,
  InsufficientFundsException,
  InvalidEntryAmountException,
  SameAccountTransferException,
} from "../domain/exceptions/domain.exception.js";
import { AccountRepository } from "../domain/repositories/account.repository.interface.js";
import { TransactionRepository } from "../domain/repositories/transaction.repository.interface.js";

export interface TransferFundsCommand {
  idempotencyKey: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: bigint;
  description: string;
}

export interface TransferFundsResult {
  transactionId: string;
  status: TransactionStatus;
  isDuplicate: boolean;
  sourceBalance: bigint;
  destinationBalance: bigint;
  transferredAmount: bigint;
}

export class TransferFundsUseCase {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly transactionRepository: TransactionRepository
  ) {}

  public async execute(command: TransferFundsCommand): Promise<TransferFundsResult> {
    // 1. Idempotency Check
    const existingTransaction = await this.transactionRepository.findByIdempotencyKey(
      command.idempotencyKey
    );

    if (existingTransaction) {
      const sourceAccount = await this.accountRepository.findById(command.sourceAccountId);
      const destinationAccount = await this.accountRepository.findById(
        command.destinationAccountId
      );

      return {
        transactionId: existingTransaction.id,
        status: existingTransaction.status,
        isDuplicate: true,
        sourceBalance: sourceAccount?.balance ?? 0n,
        destinationBalance: destinationAccount?.balance ?? 0n,
        transferredAmount: command.amount,
      };
    }

    // 2. Amount Validation
    if (command.amount <= 0n) {
      throw new InvalidEntryAmountException(command.amount);
    }

    // 3. Same Account Check
    if (command.sourceAccountId === command.destinationAccountId) {
      throw new SameAccountTransferException(command.sourceAccountId);
    }

    // 4. Load Accounts
    const sourceAccount = await this.accountRepository.findById(command.sourceAccountId);
    if (!sourceAccount) {
      throw new AccountNotFoundException(command.sourceAccountId);
    }

    const destinationAccount = await this.accountRepository.findById(
      command.destinationAccountId
    );
    if (!destinationAccount) {
      throw new AccountNotFoundException(command.destinationAccountId);
    }

    // 5. Account Status Validation (Frozen/Closed)
    if (!sourceAccount.isActive()) {
      throw new InactiveAccountException(sourceAccount.id, sourceAccount.status);
    }

    if (!destinationAccount.isActive()) {
      throw new InactiveAccountException(destinationAccount.id, destinationAccount.status);
    }

    // 6. Balance Verification (Sufficient Funds)
    if (!sourceAccount.hasSufficientFunds(command.amount)) {
      throw new InsufficientFundsException(
        sourceAccount.id,
        sourceAccount.balance,
        command.amount
      );
    }

    // 7. Double-Entry Legs Construction
    const transactionId = crypto.randomUUID();

    // In double-entry bookkeeping for ASSET accounts:
    // - Credit reduces source account balance
    // - Debit increases destination account balance
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
      accountId: destinationAccount.id,
      type: "DEBIT",
      amount: command.amount,
    });

    // 8. Create Transaction Aggregate (Validates Zero-Sum Debit === Credit)
    const transaction = Transaction.create({
      id: transactionId,
      idempotencyKey: command.idempotencyKey,
      description: command.description,
      entries: [creditLeg, debitLeg],
    });

    // 9. Apply Entries to Accounts
    sourceAccount.applyEntry(creditLeg);
    destinationAccount.applyEntry(debitLeg);

    // 10. Persist Updates and Post Transaction
    await this.accountRepository.update(sourceAccount);
    await this.accountRepository.update(destinationAccount);

    transaction.post();
    await this.transactionRepository.create(transaction);

    return {
      transactionId: transaction.id,
      status: transaction.status,
      isDuplicate: false,
      sourceBalance: sourceAccount.balance,
      destinationBalance: destinationAccount.balance,
      transferredAmount: command.amount,
    };
  }
}
