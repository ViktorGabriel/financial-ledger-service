export abstract class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class InvalidDoubleEntryException extends DomainException {
  constructor(totalDebit: bigint, totalCredit: bigint) {
    super(
      `Double-entry balance mismatch: Total debits (${totalDebit.toString()}) must strictly equal total credits (${totalCredit.toString()}). Net difference: ${(totalDebit - totalCredit).toString()}`
    );
  }
}

export class InvalidEntryAmountException extends DomainException {
  constructor(amount: bigint) {
    super(`Entry amount must be a positive integer greater than zero. Received: ${amount.toString()}`);
  }
}

export class InactiveAccountException extends DomainException {
  constructor(accountId: string, status: string) {
    super(`Account ${accountId} cannot participate in transactions because its status is ${status}.`);
  }
}

export class MinimumEntriesViolationException extends DomainException {
  constructor(count: number) {
    super(`A double-entry transaction must contain at least 2 entries (at least 1 debit and 1 credit). Received: ${count}`);
  }
}

export class EmptyTransactionException extends DomainException {
  constructor() {
    super("A transaction cannot be created without entries.");
  }
}

export class InsufficientFundsException extends DomainException {
  constructor(accountId: string, currentBalance: bigint, requiredAmount: bigint) {
    super(
      `Account ${accountId} has insufficient funds. Current balance: ${currentBalance.toString()}, required: ${requiredAmount.toString()}`
    );
  }
}

export class AccountNotFoundException extends DomainException {
  constructor(accountId: string) {
    super(`Account not found with ID: ${accountId}`);
  }
}

export class SameAccountTransferException extends DomainException {
  constructor(accountId: string) {
    super(`Cannot transfer funds to the same account: ${accountId}`);
  }
}

export class ConcurrencyConflictException extends DomainException {
  constructor(accountId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Concurrency conflict on account ${accountId}. Expected version: ${expectedVersion}, actual version: ${actualVersion}. Retry the operation.`
    );
  }
}


