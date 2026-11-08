import { describe, it, expect, beforeEach } from "vitest";
import { Account } from "../../../src/core/domain/entities/account.entity.js";
import {
  AccountNotFoundException,
  ConcurrencyConflictException,
  InactiveAccountException,
  InsufficientFundsException,
  InvalidEntryAmountException,
  SameAccountTransferException,
} from "../../../src/core/domain/exceptions/domain.exception.js";
import { TransferFundsUseCase } from "../../../src/core/use-cases/transfer-funds.use-case.js";
import { InMemoryAccountRepository } from "../../../src/infra/repositories/in-memory/in-memory-account.repository.js";
import { InMemoryTransactionRepository } from "../../../src/infra/repositories/in-memory/in-memory-transaction.repository.js";

describe("TransferFundsUseCase", () => {
  let accountRepository: InMemoryAccountRepository;
  let transactionRepository: InMemoryTransactionRepository;
  let sut: TransferFundsUseCase;

  const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
  const DEST_ID = "22222222-2222-4222-8222-222222222222";

  beforeEach(async () => {
    accountRepository = new InMemoryAccountRepository();
    transactionRepository = new InMemoryTransactionRepository();
    sut = new TransferFundsUseCase(accountRepository, transactionRepository);

    // Seed test accounts (ASSET type, 10_000 cents = R$ 100,00)
    await accountRepository.create(
      Account.create({
        id: SOURCE_ID,
        accountNumber: "SRC-001",
        type: "ASSET",
        currency: "BRL",
        balance: 10_000n,
      })
    );

    await accountRepository.create(
      Account.create({
        id: DEST_ID,
        accountNumber: "DST-002",
        type: "ASSET",
        currency: "BRL",
        balance: 2_000n,
      })
    );
  });

  describe("Happy Path", () => {
    it("should successfully transfer funds between two active ASSET accounts", async () => {
      const result = await sut.execute({
        idempotencyKey: "tx-happy-1",
        sourceAccountId: SOURCE_ID,
        destinationAccountId: DEST_ID,
        amount: 3_500n,
        description: "Payment for consulting services",
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.status).toBe("POSTED");
      expect(result.transferredAmount).toBe(3_500n);
      expect(result.sourceBalance).toBe(6_500n);
      expect(result.destinationBalance).toBe(5_500n);

      // Verify persisted state in repositories
      const sourceAccount = await accountRepository.findById(SOURCE_ID);
      const destAccount = await accountRepository.findById(DEST_ID);
      expect(sourceAccount?.balance).toBe(6_500n);
      expect(destAccount?.balance).toBe(5_500n);

      const savedTx = await transactionRepository.findById(result.transactionId);
      expect(savedTx).toBeDefined();
      expect(savedTx?.status).toBe("POSTED");
      expect(savedTx?.entries).toHaveLength(2);

      // Verify double-entry balance: Credit on source == Debit on dest
      const creditEntry = savedTx?.entries.find((e) => e.accountId === SOURCE_ID);
      const debitEntry = savedTx?.entries.find((e) => e.accountId === DEST_ID);

      expect(creditEntry?.type).toBe("CREDIT");
      expect(creditEntry?.amount).toBe(3_500n);
      expect(debitEntry?.type).toBe("DEBIT");
      expect(debitEntry?.amount).toBe(3_500n);
    });
  });

  describe("Idempotency", () => {
    it("should not double-debit when called multiple times with the same idempotency key", async () => {
      const command = {
        idempotencyKey: "tx-idempotent-key-99",
        sourceAccountId: SOURCE_ID,
        destinationAccountId: DEST_ID,
        amount: 4_000n,
        description: "Monthly subscription fee",
      };

      const firstCall = await sut.execute(command);
      expect(firstCall.isDuplicate).toBe(false);
      expect(firstCall.sourceBalance).toBe(6_000n);
      expect(firstCall.destinationBalance).toBe(6_000n);

      // Second call with identical key
      const secondCall = await sut.execute(command);
      expect(secondCall.isDuplicate).toBe(true);
      expect(secondCall.transactionId).toBe(firstCall.transactionId);
      expect(secondCall.sourceBalance).toBe(6_000n);
      expect(secondCall.destinationBalance).toBe(6_000n);

      // Check repository balances were not deducted a second time
      const sourceAccount = await accountRepository.findById(SOURCE_ID);
      const destAccount = await accountRepository.findById(DEST_ID);
      expect(sourceAccount?.balance).toBe(6_000n);
      expect(destAccount?.balance).toBe(6_000n);
    });
  });

  describe("Sufficient Funds Validation", () => {
    it("should throw InsufficientFundsException when source balance is lower than amount", async () => {
      const command = {
        idempotencyKey: "tx-insufficient-1",
        sourceAccountId: SOURCE_ID,
        destinationAccountId: DEST_ID,
        amount: 15_000n, // Exceeds balance of 10_000n
        description: "Large transfer",
      };

      await expect(sut.execute(command)).rejects.toThrow(InsufficientFundsException);

      // Ensure state untouched
      const source = await accountRepository.findById(SOURCE_ID);
      const dest = await accountRepository.findById(DEST_ID);
      expect(source?.balance).toBe(10_000n);
      expect(dest?.balance).toBe(2_000n);
    });

    it("should allow transferring exact available balance", async () => {
      const command = {
        idempotencyKey: "tx-exact-balance",
        sourceAccountId: SOURCE_ID,
        destinationAccountId: DEST_ID,
        amount: 10_000n,
        description: "Transfer all funds",
      };

      const result = await sut.execute(command);
      expect(result.sourceBalance).toBe(0n);
      expect(result.destinationBalance).toBe(12_000n);
    });
  });

  describe("Inactive / Frozen Account Blocking", () => {
    it("should throw InactiveAccountException if source account is FROZEN", async () => {
      const source = await accountRepository.findById(SOURCE_ID);
      source?.freeze();
      if (source) await accountRepository.update(source);

      const command = {
        idempotencyKey: "tx-frozen-source",
        sourceAccountId: SOURCE_ID,
        destinationAccountId: DEST_ID,
        amount: 1_000n,
        description: "Transfer from frozen",
      };

      await expect(sut.execute(command)).rejects.toThrow(InactiveAccountException);
    });

    it("should throw InactiveAccountException if destination account is FROZEN", async () => {
      const dest = await accountRepository.findById(DEST_ID);
      dest?.freeze();
      if (dest) await accountRepository.update(dest);

      const command = {
        idempotencyKey: "tx-frozen-dest",
        sourceAccountId: SOURCE_ID,
        destinationAccountId: DEST_ID,
        amount: 1_000n,
        description: "Transfer to frozen",
      };

      await expect(sut.execute(command)).rejects.toThrow(InactiveAccountException);
    });

    it("should throw InactiveAccountException if source account is CLOSED", async () => {
      const source = await accountRepository.findById(SOURCE_ID);
      source?.close();
      if (source) await accountRepository.update(source);

      const command = {
        idempotencyKey: "tx-closed-source",
        sourceAccountId: SOURCE_ID,
        destinationAccountId: DEST_ID,
        amount: 500n,
        description: "Transfer from closed",
      };

      await expect(sut.execute(command)).rejects.toThrow(InactiveAccountException);
    });
  });

  describe("Account Existence & Identity Validation", () => {
    it("should throw AccountNotFoundException if source account does not exist", async () => {
      const command = {
        idempotencyKey: "tx-not-found-src",
        sourceAccountId: "33333333-3333-4333-8333-333333333333",
        destinationAccountId: DEST_ID,
        amount: 500n,
        description: "Invalid source",
      };

      await expect(sut.execute(command)).rejects.toThrow(AccountNotFoundException);
    });

    it("should throw AccountNotFoundException if destination account does not exist", async () => {
      const command = {
        idempotencyKey: "tx-not-found-dst",
        sourceAccountId: SOURCE_ID,
        destinationAccountId: "33333333-3333-4333-8333-333333333333",
        amount: 500n,
        description: "Invalid dest",
      };

      await expect(sut.execute(command)).rejects.toThrow(AccountNotFoundException);
    });

    it("should throw SameAccountTransferException if source and destination are the same", async () => {
      const command = {
        idempotencyKey: "tx-same-acc",
        sourceAccountId: SOURCE_ID,
        destinationAccountId: SOURCE_ID,
        amount: 500n,
        description: "Self transfer",
      };

      await expect(sut.execute(command)).rejects.toThrow(SameAccountTransferException);
    });
  });

  describe("Amount Validation", () => {
    it("should throw InvalidEntryAmountException when amount is zero", async () => {
      const command = {
        idempotencyKey: "tx-zero-amount",
        sourceAccountId: SOURCE_ID,
        destinationAccountId: DEST_ID,
        amount: 0n,
        description: "Zero amount transfer",
      };

      await expect(sut.execute(command)).rejects.toThrow(InvalidEntryAmountException);
    });

    it("should throw InvalidEntryAmountException when amount is negative", async () => {
      const command = {
        idempotencyKey: "tx-neg-amount",
        sourceAccountId: SOURCE_ID,
        destinationAccountId: DEST_ID,
        amount: -500n,
        description: "Negative amount transfer",
      };

      await expect(sut.execute(command)).rejects.toThrow(InvalidEntryAmountException);
    });
  });

  describe("Concurrency Control (Race Conditions)", () => {
    it("should prevent double-spending when two concurrent transfers compete for funds", async () => {
      // Source account has 10_000n.
      // Two simultaneous transfers of 7_000n each are dispatched concurrently.
      // Total requested = 14_000n, exceeding the 10_000n balance.
      const transfer1 = sut.execute({
        idempotencyKey: "concurrent-tx-1",
        sourceAccountId: SOURCE_ID,
        destinationAccountId: DEST_ID,
        amount: 7_000n,
        description: "Concurrent attempt 1",
      });

      const transfer2 = sut.execute({
        idempotencyKey: "concurrent-tx-2",
        sourceAccountId: SOURCE_ID,
        destinationAccountId: DEST_ID,
        amount: 7_000n,
        description: "Concurrent attempt 2",
      });

      const results = await Promise.allSettled([transfer1, transfer2]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly one must succeed and one must be rejected (due to OCC conflict or InsufficientFunds)
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Verify reason is ConcurrencyConflictException or InsufficientFundsException
      const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(
        rejectionReason instanceof ConcurrencyConflictException ||
        rejectionReason instanceof InsufficientFundsException
      ).toBe(true);

      // Final source balance must be exactly 3_000n (10_000 - 7_000), NEVER negative!
      const finalSource = await accountRepository.findById(SOURCE_ID);
      expect(finalSource?.balance).toBe(3_000n);
    });
  });
});
