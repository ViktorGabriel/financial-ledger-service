import {
  EmptyTransactionException,
  InvalidDoubleEntryException,
  MinimumEntriesViolationException,
} from "../exceptions/domain.exception.js";
import { Entry } from "./entry.entity.js";

export type TransactionStatus = "PENDING" | "POSTED" | "REJECTED" | "CANCELED";

export interface TransactionProps {
  id: string;
  idempotencyKey: string;
  description: string;
  entries: Entry[];
  status?: TransactionStatus;
  createdAt?: Date;
  postedAt?: Date | null;
}

export class Transaction {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly description: string;
  private readonly _entries: Entry[];
  private _status: TransactionStatus;
  readonly createdAt: Date;
  private _postedAt: Date | null;

  private constructor(props: TransactionProps) {
    if (!props.entries || props.entries.length === 0) {
      throw new EmptyTransactionException();
    }

    if (props.entries.length < 2) {
      throw new MinimumEntriesViolationException(props.entries.length);
    }

    this.validateDoubleEntry(props.entries);

    this.id = props.id;
    this.idempotencyKey = props.idempotencyKey;
    this.description = props.description;
    this._entries = [...props.entries];
    this._status = props.status ?? "PENDING";
    this.createdAt = props.createdAt ?? new Date();
    this._postedAt = props.postedAt ?? null;
  }

  public static create(props: TransactionProps): Transaction {
    return new Transaction(props);
  }

  public get entries(): readonly Entry[] {
    return Object.freeze([...this._entries]);
  }

  public get status(): TransactionStatus {
    return this._status;
  }

  public get postedAt(): Date | null {
    return this._postedAt;
  }

  public post(): void {
    if (this._status === "POSTED") {
      return;
    }
    this._status = "POSTED";
    this._postedAt = new Date();
  }

  public reject(): void {
    this._status = "REJECTED";
  }

  public cancel(): void {
    this._status = "CANCELED";
  }

  /**
   * Double-Entry Bookkeeping Invariant:
   * Total Debits must exactly equal Total Credits.
   * Net balance (Debits - Credits) must equal 0.
   */
  private validateDoubleEntry(entries: Entry[]): void {
    let totalDebit = 0n;
    let totalCredit = 0n;
    let hasDebit = false;
    let hasCredit = false;

    for (const entry of entries) {
      if (entry.isDebit()) {
        totalDebit += entry.amount;
        hasDebit = true;
      } else if (entry.isCredit()) {
        totalCredit += entry.amount;
        hasCredit = true;
      }
    }

    if (!hasDebit || !hasCredit || totalDebit !== totalCredit) {
      throw new InvalidDoubleEntryException(totalDebit, totalCredit);
    }
  }
}
