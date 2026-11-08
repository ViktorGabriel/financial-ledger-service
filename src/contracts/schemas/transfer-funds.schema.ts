import { z } from "zod";

export const TransferFundsSchema = z.object({
  idempotencyKey: z
    .string()
    .min(1, { message: "idempotencyKey is required" })
    .max(128),
  sourceAccountId: z.string().uuid({ message: "sourceAccountId must be a valid UUID" }),
  destinationAccountId: z.string().uuid({ message: "destinationAccountId must be a valid UUID" }),
  amount: z
    .union([
      z.bigint().positive({ message: "amount must be positive" }),
      z
        .number()
        .int()
        .positive({ message: "amount must be a positive integer" })
        .transform((val) => BigInt(val)),
      z
        .string()
        .regex(/^[1-9]\d*$/, { message: "amount must be a positive integer string" })
        .transform((val) => BigInt(val)),
    ]),
  description: z.string().min(1).max(255),
});

export type TransferFundsInput = z.infer<typeof TransferFundsSchema>;
