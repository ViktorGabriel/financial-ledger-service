import { describe, it, expect } from "vitest";
import { Account } from "../../../src/core/domain/entities/account.entity.js";
import { Entry } from "../../../src/core/domain/entities/entry.entity.js";
import { Transaction } from "../../../src/core/domain/entities/transaction.entity.js";
import {
  InvalidDoubleEntryException,
  InvalidEntryAmountException,
  InactiveAccountException,
  MinimumEntriesViolationException,
} from "../../../src/core/domain/exceptions/domain.exception.js";

describe("Domain Entities - Double-Entry Bookkeeping", () => {
  describe("Entry Entity", () => {
    it("should create a valid debit entry", () => {
      const entry = Entry.create({
        id: "entry-1",
        transactionId: "tx-1",
        accountId: "acc-1",
        type: "DEBIT",
        amount: 10000n, // R$ 100,00 in cents
      });

      expect(entry.id).toBe("entry-1");
      expect(entry.isDebit()).toBe(true);
      expect(entry.isCredit()).toBe(false);
      expect(entry.amount).toBe(10000n);
    });

    it("should throw InvalidEntryAmountException when amount is zero or negative", () => {
      expect(() => {
        Entry.create({
          id: "entry-1",
          transactionId: "tx-1",
          accountId: "acc-1",
          type: "DEBIT",
          amount: 0n,
        });
      }).toThrow(InvalidEntryAmountException);

      expect(() => {
        Entry.create({
          id: "entry-2",
          transactionId: "tx-1",
          accountId: "acc-1",
          type: "CREDIT",
          amount: -50n,
        });
      }).toThrow(InvalidEntryAmountException);
    });
  });

  describe("Transaction Entity", () => {
    it("should create a balanced double-entry transaction (Debits === Credits)", () => {
      const debitEntry = Entry.create({
        id: "e-1",
        transactionId: "tx-1",
        accountId: "acc-asset",
        type: "DEBIT",
        amount: 5000n,
      });

      const creditEntry = Entry.create({
        id: "e-2",
        transactionId: "tx-1",
        accountId: "acc-liability",
        type: "CREDIT",
        amount: 5000n,
      });

      const tx = Transaction.create({
        id: "tx-1",
        idempotencyKey: "idem-key-1",
        description: "Customer deposit",
        entries: [debitEntry, creditEntry],
      });

      expect(tx.status).toBe("PENDING");
      expect(tx.entries).toHaveLength(2);

      tx.post();
      expect(tx.status).toBe("POSTED");
      expect(tx.postedAt).toBeInstanceOf(Date);
    });

    it("should support multi-leg balanced transactions", () => {
      // 1 Debit of 10000n balanced by 2 Credits of 7000n and 3000n
      const debit = Entry.create({
        id: "e-1",
        transactionId: "tx-split",
        accountId: "acc-cash",
        type: "DEBIT",
        amount: 10000n,
      });

      const credit1 = Entry.create({
        id: "e-2",
        transactionId: "tx-split",
        accountId: "acc-revenue",
        type: "CREDIT",
        amount: 7000n,
      });

      const credit2 = Entry.create({
        id: "e-3",
        transactionId: "tx-split",
        accountId: "acc-tax-payable",
        type: "CREDIT",
        amount: 3000n,
      });

      const tx = Transaction.create({
        id: "tx-split",
        idempotencyKey: "idem-split",
        description: "Split revenue and tax",
        entries: [debit, credit1, credit2],
      });

      expect(tx.entries).toHaveLength(3);
    });

    it("should throw InvalidDoubleEntryException when Debits do not balance Credits", () => {
      const debitEntry = Entry.create({
        id: "e-1",
        transactionId: "tx-unbalanced",
        accountId: "acc-1",
        type: "DEBIT",
        amount: 5000n,
      });

      const creditEntry = Entry.create({
        id: "e-2",
        transactionId: "tx-unbalanced",
        accountId: "acc-2",
        type: "CREDIT",
        amount: 4999n,
      });

      expect(() => {
        Transaction.create({
          id: "tx-unbalanced",
          idempotencyKey: "idem-unbalanced",
          description: "Unbalanced transfer",
          entries: [debitEntry, creditEntry],
        });
      }).toThrow(InvalidDoubleEntryException);
    });

    it("should throw MinimumEntriesViolationException when less than 2 entries provided", () => {
      const debitEntry = Entry.create({
        id: "e-1",
        transactionId: "tx-single",
        accountId: "acc-1",
        type: "DEBIT",
        amount: 5000n,
      });

      expect(() => {
        Transaction.create({
          id: "tx-single",
          idempotencyKey: "idem-single",
          description: "Single entry violation",
          entries: [debitEntry],
        });
      }).toThrow(MinimumEntriesViolationException);
    });
  });

  describe("Account Entity", () => {
    it("should update ASSET balance properly (Debit increases, Credit decreases)", () => {
      const account = Account.create({
        id: "acc-asset-1",
        accountNumber: "1.1.01",
        type: "ASSET",
        currency: "BRL",
        balance: 1000n,
      });

      const debit = Entry.create({
        id: "e-1",
        transactionId: "tx-1",
        accountId: account.id,
        type: "DEBIT",
        amount: 500n,
      });

      account.applyEntry(debit);
      expect(account.balance).toBe(1500n);

      const credit = Entry.create({
        id: "e-2",
        transactionId: "tx-2",
        accountId: account.id,
        type: "CREDIT",
        amount: 300n,
      });

      account.applyEntry(credit);
      expect(account.balance).toBe(1200n);
    });

    it("should update LIABILITY balance properly (Credit increases, Debit decreases)", () => {
      const account = Account.create({
        id: "acc-liab-1",
        accountNumber: "2.1.01",
        type: "LIABILITY",
        currency: "BRL",
        balance: 2000n,
      });

      const credit = Entry.create({
        id: "e-1",
        transactionId: "tx-1",
        accountId: account.id,
        type: "CREDIT",
        amount: 800n,
      });

      account.applyEntry(credit);
      expect(account.balance).toBe(2800n);

      const debit = Entry.create({
        id: "e-2",
        transactionId: "tx-2",
        accountId: account.id,
        type: "DEBIT",
        amount: 500n,
      });

      account.applyEntry(debit);
      expect(account.balance).toBe(2300n);
    });

    it("should reject entry application if account is FROZEN or CLOSED", () => {
      const account = Account.create({
        id: "acc-frozen",
        accountNumber: "1.1.99",
        type: "ASSET",
        currency: "BRL",
      });

      account.freeze();

      const debit = Entry.create({
        id: "e-1",
        transactionId: "tx-1",
        accountId: account.id,
        type: "DEBIT",
        amount: 100n,
      });

      expect(() => account.applyEntry(debit)).toThrow(InactiveAccountException);
    });
  });
});
