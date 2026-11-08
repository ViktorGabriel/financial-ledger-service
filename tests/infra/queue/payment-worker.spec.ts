import { describe, it, expect, vi } from "vitest";
import { UnrecoverableError } from "bullmq";
import {
  InactiveAccountException,
  InsufficientFundsException,
  ConcurrencyConflictException,
} from "../../../src/core/domain/exceptions/domain.exception.js";
import {
  defaultJobOptions,
  PaymentJobPayloadSchema,
} from "../../../src/infra/queue/payment.queue.js";
import { PaymentWorker } from "../../../src/infra/queue/payment.worker.js";

// Mock IORedis and BullMQ Worker to prevent opening real network sockets in unit tests
vi.mock("../../../src/infra/queue/redis.connection.js", () => ({
  createRedisConnection: vi.fn().mockReturnValue({
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue("OK"),
    disconnect: vi.fn(),
  }),
}));

vi.mock("bullmq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bullmq")>();
  return {
    ...actual,
    Worker: class MockWorker {
      public processor: any;
      public options: any;
      private listeners: Record<string, Function[]> = {};

      constructor(_queueName: string, processor: any, options: any) {
        this.processor = processor;
        this.options = options;
      }

      on(event: string, callback: Function) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event]?.push(callback);
      }

      async close() {}
    },
  };
});

describe("Payment Queue & Worker", () => {
  describe("Queue Configuration & Exponential Backoff", () => {
    it("should configure exponential backoff with 5 attempts", () => {
      expect(defaultJobOptions.attempts).toBe(5);
      expect(defaultJobOptions.backoff).toEqual({
        type: "exponential",
        delay: 2000,
      });
    });

    it("should validate and parse a valid PaymentJobPayload", () => {
      const valid = {
        idempotencyKey: "idem-job-123",
        sourceAccountId: "11111111-1111-4111-8111-111111111111",
        destinationAccountId: "22222222-2222-4222-8222-222222222222",
        amount: "15000",
        description: "Vendor invoice payout",
      };

      const result = PaymentJobPayloadSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("should reject non-positive integer amount strings in payload", () => {
      const invalid = {
        idempotencyKey: "idem-job-123",
        sourceAccountId: "11111111-1111-4111-8111-111111111111",
        destinationAccountId: "22222222-2222-4222-8222-222222222222",
        amount: "-500",
        description: "Negative amount",
      };

      const result = PaymentJobPayloadSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("PaymentWorker Job Execution", () => {
    it("should successfully execute transfer and return result", async () => {
      const mockExecutor = {
        execute: vi.fn().mockResolvedValue({
          transactionId: "tx-generated-uuid",
          status: "POSTED",
          isDuplicate: false,
          sourceBalance: 5000n,
          destinationBalance: 5000n,
          transferredAmount: 2000n,
        }),
      };

      const worker = new PaymentWorker(mockExecutor);
      const mockJob = {
        id: "job-1",
        attemptsMade: 0,
        data: {
          idempotencyKey: "idem-1",
          sourceAccountId: "11111111-1111-4111-8111-111111111111",
          destinationAccountId: "22222222-2222-4222-8222-222222222222",
          amount: "2000",
          description: "Test payment",
        },
      };

      const processor = (worker.underlyingWorker as any).processor;
      const result = await processor(mockJob);

      expect(mockExecutor.execute).toHaveBeenCalledWith({
        idempotencyKey: "idem-1",
        sourceAccountId: "11111111-1111-4111-8111-111111111111",
        destinationAccountId: "22222222-2222-4222-8222-222222222222",
        amount: 2000n,
        description: "Test payment",
      });
      expect(result.status).toBe("POSTED");
    });

    it("should throw UnrecoverableError on domain business rule violations", async () => {
      const mockExecutor = {
        execute: vi.fn().mockRejectedValue(
          new InsufficientFundsException("acc-1", 1000n, 5000n)
        ),
      };

      const worker = new PaymentWorker(mockExecutor);
      const mockJob = {
        id: "job-fail-domain",
        attemptsMade: 0,
        data: {
          idempotencyKey: "idem-2",
          sourceAccountId: "11111111-1111-4111-8111-111111111111",
          destinationAccountId: "22222222-2222-4222-8222-222222222222",
          amount: "5000",
          description: "Overdraft payment",
        },
      };

      const processor = (worker.underlyingWorker as any).processor;
      await expect(processor(mockJob)).rejects.toThrow(UnrecoverableError);
    });

    it("should re-throw transient concurrency conflicts to trigger exponential backoff", async () => {
      const mockExecutor = {
        execute: vi.fn().mockRejectedValue(
          new ConcurrencyConflictException("acc-1", 1, 2)
        ),
      };

      const worker = new PaymentWorker(mockExecutor);
      const mockJob = {
        id: "job-transient",
        attemptsMade: 1,
        data: {
          idempotencyKey: "idem-retry",
          sourceAccountId: "11111111-1111-4111-8111-111111111111",
          destinationAccountId: "22222222-2222-4222-8222-222222222222",
          amount: "1000",
          description: "Transient error",
        },
      };

      const processor = (worker.underlyingWorker as any).processor;
      await expect(processor(mockJob)).rejects.toThrow(ConcurrencyConflictException);
    });
  });
});
