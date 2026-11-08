import { Worker, Job, UnrecoverableError, WorkerOptions } from "bullmq";
import {
  AccountNotFoundException,
  InactiveAccountException,
  InsufficientFundsException,
  InvalidEntryAmountException,
  SameAccountTransferException,
} from "../../core/domain/exceptions/domain.exception.js";
import {
  TransferFundsCommand,
  TransferFundsResult,
} from "../../core/use-cases/transfer-funds.use-case.js";
import { PAYMENT_QUEUE_NAME, PaymentJobPayload } from "./payment.queue.js";
import { createRedisConnection } from "./redis.connection.js";

export interface TransferExecutor {
  execute(command: TransferFundsCommand): Promise<TransferFundsResult>;
}

export class PaymentWorker {
  private worker: Worker<PaymentJobPayload, TransferFundsResult>;

  constructor(
    private readonly transferExecutor: TransferExecutor,
    options?: Partial<WorkerOptions>
  ) {
    const connection = createRedisConnection();

    this.worker = new Worker<PaymentJobPayload, TransferFundsResult>(
      PAYMENT_QUEUE_NAME,
      async (job: Job<PaymentJobPayload>) => {
        return await this.processJob(job);
      },
      {
        connection,
        concurrency: 5,
        ...options,
      }
    );

    this.setupListeners();
  }

  private async processJob(job: Job<PaymentJobPayload>): Promise<TransferFundsResult> {
    const { idempotencyKey, sourceAccountId, destinationAccountId, amount, description } =
      job.data;

    console.info(
      JSON.stringify({
        level: "INFO",
        component: "PaymentWorker",
        event: "job_started",
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        idempotencyKey,
        timestamp: new Date().toISOString(),
      })
    );

    try {
      const result = await this.transferExecutor.execute({
        idempotencyKey,
        sourceAccountId,
        destinationAccountId,
        amount: BigInt(amount),
        description,
      });

      return result;
    } catch (error) {
      if (
        error instanceof InsufficientFundsException ||
        error instanceof InactiveAccountException ||
        error instanceof InvalidEntryAmountException ||
        error instanceof SameAccountTransferException ||
        error instanceof AccountNotFoundException
      ) {
        // Business / Domain violations are non-recoverable.
        // Fail-Fast: prevent wasteful retries using BullMQ UnrecoverableError.
        console.warn(
          JSON.stringify({
            level: "WARN",
            component: "PaymentWorker",
            event: "unrecoverable_domain_error",
            jobId: job.id,
            error: error.message,
            timestamp: new Date().toISOString(),
          })
        );
        throw new UnrecoverableError(error.message);
      }

      // Transient errors (OCC conflict, DB lock timeout, network) will be retried exponentially
      console.error(
        JSON.stringify({
          level: "ERROR",
          component: "PaymentWorker",
          event: "transient_error_will_retry",
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        })
      );
      throw error;
    }
  }

  private setupListeners(): void {
    this.worker.on("completed", (job: Job, result: TransferFundsResult) => {
      console.info(
        JSON.stringify({
          level: "INFO",
          component: "PaymentWorker",
          event: "job_completed",
          jobId: job.id,
          transactionId: result.transactionId,
          isDuplicate: result.isDuplicate,
          timestamp: new Date().toISOString(),
        })
      );
    });

    this.worker.on("failed", (job: Job | undefined, error: Error) => {
      console.error(
        JSON.stringify({
          level: "ERROR",
          component: "PaymentWorker",
          event: "job_failed",
          jobId: job?.id,
          attemptsMade: job?.attemptsMade,
          error: error.message,
          timestamp: new Date().toISOString(),
        })
      );
    });

    this.worker.on("error", (error: Error) => {
      console.error(
        JSON.stringify({
          level: "ERROR",
          component: "PaymentWorker",
          event: "worker_internal_error",
          error: error.message,
          timestamp: new Date().toISOString(),
        })
      );
    });
  }

  public async close(): Promise<void> {
    await this.worker.close();
  }

  public get underlyingWorker(): Worker<PaymentJobPayload, TransferFundsResult> {
    return this.worker;
  }
}
