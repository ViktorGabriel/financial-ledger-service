import { z } from "zod";
import { EntrySchema } from "./entry.schema.js";

export const TransactionStatusEnum = z.enum([
  "PENDING",
  "POSTED",
  "REJECTED",
  "CANCELED",
]);

export const CreateTransactionSchema = z
  .object({
    idempotencyKey: z
      .string()
      .min(1, { message: "idempotencyKey is required" })
      .max(128),
    description: z.string().min(1).max(255),
    entries: z
      .array(EntrySchema)
      .min(2, { message: "Double-entry transaction must have at least 2 entries" }),
  })
  .superRefine((data, ctx) => {
    let totalDebit = 0n;
    let totalCredit = 0n;
    let hasDebit = false;
    let hasCredit = false;

    data.entries.forEach((entry, index) => {
      if (entry.type === "DEBIT") {
        totalDebit += entry.amount;
        hasDebit = true;
      } else if (entry.type === "CREDIT") {
        totalCredit += entry.amount;
        hasCredit = true;
      } else {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid entry type at index ${index}`,
          path: ["entries", index, "type"],
        });
      }
    });

    if (!hasDebit || !hasCredit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Transaction must include at least one DEBIT and one CREDIT entry.",
        path: ["entries"],
      });
      return;
    }

    if (totalDebit !== totalCredit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Double-entry violation: Sum of Debits (${totalDebit.toString()}) must equal sum of Credits (${totalCredit.toString()}). Discrepancy: ${(totalDebit - totalCredit).toString()}`,
        path: ["entries"],
      });
    }
  });

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;
export type TransactionStatusSchema = z.infer<typeof TransactionStatusEnum>;
