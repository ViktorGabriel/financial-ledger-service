import { describe, it, expect } from "vitest";
import { CreateAccountSchema } from "../../src/contracts/schemas/account.schema.js";
import { CreateTransactionSchema } from "../../src/contracts/schemas/transaction.schema.js";

describe("Contract Zod Schemas", () => {
  describe("CreateAccountSchema", () => {
    it("should accept valid account input", () => {
      const valid = {
        accountNumber: "ACC-10023",
        type: "ASSET",
        currency: "BRL",
        status: "ACTIVE",
      };

      const result = CreateAccountSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.initialBalance).toBe(0n);
      }
    });

    it("should reject invalid currency format", () => {
      const invalid = {
        accountNumber: "ACC-10023",
        type: "ASSET",
        currency: "real",
      };

      const result = CreateAccountSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("CreateTransactionSchema", () => {
    it("should validate a balanced transaction", () => {
      const validTx = {
        idempotencyKey: "tx-idem-12345",
        description: "Payment to vendor",
        entries: [
          {
            accountId: "11111111-1111-4111-8111-111111111111",
            type: "DEBIT",
            amount: 25000,
          },
          {
            accountId: "22222222-2222-4222-8222-222222222222",
            type: "CREDIT",
            amount: "25000",
          },
        ],
      };

      const result = CreateTransactionSchema.safeParse(validTx);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries[0]?.amount).toBe(25000n);
        expect(result.data.entries[1]?.amount).toBe(25000n);
      }
    });

    it("should reject unbalanced entries", () => {
      const unbalancedTx = {
        idempotencyKey: "tx-unbalanced",
        description: "Unbalanced entries",
        entries: [
          {
            accountId: "11111111-1111-4111-8111-111111111111",
            type: "DEBIT",
            amount: 1000,
          },
          {
            accountId: "22222222-2222-4222-8222-222222222222",
            type: "CREDIT",
            amount: 900,
          },
        ],
      };

      const result = CreateTransactionSchema.safeParse(unbalancedTx);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Double-entry violation");
      }
    });

    it("should reject transaction with only debits", () => {
      const noCreditsTx = {
        idempotencyKey: "tx-no-credits",
        description: "Missing credits",
        entries: [
          {
            accountId: "11111111-1111-4111-8111-111111111111",
            type: "DEBIT",
            amount: 1000,
          },
          {
            accountId: "22222222-2222-4222-8222-222222222222",
            type: "DEBIT",
            amount: 1000,
          },
        ],
      };

      const result = CreateTransactionSchema.safeParse(noCreditsTx);
      expect(result.success).toBe(false);
    });
  });
});
