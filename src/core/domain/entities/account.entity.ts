import { InactiveAccountException } from "../exceptions/domain.exception.js";
import { Entry } from "./entry.entity.js";

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type AccountStatus = "ACTIVE" | "FROZEN" | "CLOSED";

export interface AccountProps {
  id: string;
  accountNumber: string;
  type: AccountType;
  currency: string;
  status?: AccountStatus;
  balance?: bigint;
  version?: number;
  baseVersion?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Account {
  readonly id: string;
  readonly accountNumber: string;
  readonly type: AccountType;
  readonly currency: string;
  private _status: AccountStatus;
  private _balance: bigint;
  private _version: number;
  private _baseVersion: number;
  readonly createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: AccountProps) {
    this.id = props.id;
    this.accountNumber = props.accountNumber;
    this.type = props.type;
    this.currency = props.currency.toUpperCase();
    this._status = props.status ?? "ACTIVE";
    this._balance = props.balance ?? 0n;
    this._version = props.version ?? 0;
    this._baseVersion = props.baseVersion ?? this._version;
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? this.createdAt;
  }

  public static create(props: AccountProps): Account {
    return new Account(props);
  }

  public get status(): AccountStatus {
    return this._status;
  }

  public get balance(): bigint {
    return this._balance;
  }

  public get version(): number {
    return this._version;
  }

  public get baseVersion(): number {
    return this._baseVersion;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public isActive(): boolean {
    return this._status === "ACTIVE";
  }

  public hasSufficientFunds(amount: bigint): boolean {
    return this._balance >= amount;
  }

  public clone(): Account {
    return new Account({
      id: this.id,
      accountNumber: this.accountNumber,
      type: this.type,
      currency: this.currency,
      status: this._status,
      balance: this._balance,
      version: this._version,
      baseVersion: this._version,
      createdAt: new Date(this.createdAt.getTime()),
      updatedAt: new Date(this._updatedAt.getTime()),
    });
  }

  public freeze(): void {
    this._status = "FROZEN";
    this._updatedAt = new Date();
  }

  public activate(): void {
    this._status = "ACTIVE";
    this._updatedAt = new Date();
  }

  public close(): void {
    this._status = "CLOSED";
    this._updatedAt = new Date();
  }

  /**
   * Applies an entry to the running account balance in accordance with Double-Entry Bookkeeping:
   * - ASSET / EXPENSE: Normal balance is Debit. Debit increases (+), Credit decreases (-).
   * - LIABILITY / EQUITY / REVENUE: Normal balance is Credit. Credit increases (+), Debit decreases (-).
   */
  public applyEntry(entry: Entry): void {
    if (!this.isActive()) {
      throw new InactiveAccountException(this.id, this._status);
    }

    const isNormalDebit = this.type === "ASSET" || this.type === "EXPENSE";

    if (entry.isDebit()) {
      this._balance = isNormalDebit
        ? this._balance + entry.amount
        : this._balance - entry.amount;
    } else {
      this._balance = isNormalDebit
        ? this._balance - entry.amount
        : this._balance + entry.amount;
    }

    this._version += 1;
    this._updatedAt = new Date();
  }
}
