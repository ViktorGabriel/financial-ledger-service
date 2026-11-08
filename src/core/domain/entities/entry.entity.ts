import { InvalidEntryAmountException } from "../exceptions/domain.exception.js";

export type EntryType = "DEBIT" | "CREDIT";

export interface EntryProps {
  id: string;
  transactionId: string;
  accountId: string;
  type: EntryType;
  amount: bigint;
  createdAt?: Date;
}

export class Entry {
  readonly id: string;
  readonly transactionId: string;
  readonly accountId: string;
  readonly type: EntryType;
  readonly amount: bigint;
  readonly createdAt: Date;

  private constructor(props: EntryProps) {
    if (props.amount <= 0n) {
      throw new InvalidEntryAmountException(props.amount);
    }

    this.id = props.id;
    this.transactionId = props.transactionId;
    this.accountId = props.accountId;
    this.type = props.type;
    this.amount = props.amount;
    this.createdAt = props.createdAt ?? new Date();
  }

  public static create(props: EntryProps): Entry {
    return new Entry(props);
  }

  public isDebit(): boolean {
    return this.type === "DEBIT";
  }

  public isCredit(): boolean {
    return this.type === "CREDIT";
  }
}
