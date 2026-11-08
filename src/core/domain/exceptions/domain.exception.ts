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
