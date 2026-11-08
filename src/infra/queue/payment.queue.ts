import { Queue, QueueOptions, JobsOptions } from "bullmq";
import { z } from "zod";
import { createRedisConnection } from "./redis.connection.js";

export const PAYMENT_QUEUE_NAME = "payment-transfers";

export const PaymentJobPayloadSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  sourceAccountId: z.string().uuid(),
  destinationAccountId: z.string().uuid(),
  amount: z.string().regex(/^[1-9]\d*$/, "Amount must be a positive integer string"),
  description: z.string().min(1).max(255),
});

export type PaymentJobPayload = z.infer<typeof PaymentJobPayloadSchema>;

export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 2000, // 2s initial delay -> 4s -> 8s -> 16s -> 32s
  },
  removeOnComplete: {
    count: 5000,
    age: 24 * 3600, // 24 hours
  },
  removeOnFail: {
    count: 10000,
  },
};

export class PaymentQueue {
  private queue: Queue<PaymentJobPayload>;

  constructor(options?: Partial<QueueOptions>) {
    const connection = createRedisConnection();
    this.queue = new Queue<PaymentJobPayload>(PAYMENT_QUEUE_NAME, {
      connection,
      defaultJobOptions,
      ...options,
    });
  }

  public async addPaymentJob(
    payload: PaymentJobPayload,
    customJobOptions?: Partial<JobsOptions>
  ) {
    const validated = PaymentJobPayloadSchema.parse(payload);

    return await this.queue.add("process-payment", validated, {
      jobId: validated.idempotencyKey, // Enforces queue-level deduplication
      ...customJobOptions,
    });
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }

  public get underlyingQueue(): Queue<PaymentJobPayload> {
    return this.queue;
  }
}
