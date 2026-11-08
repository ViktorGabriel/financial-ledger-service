import { z } from "zod";

export const EntryTypeEnum = z.enum(["DEBIT", "CREDIT"]);

export const EntrySchema = z.object({
  id: z.string().uuid().optional(),
  accountId: z.string().uuid({ message: "accountId must be a valid UUID" }),
  type: EntryTypeEnum,
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
});

export type EntryInput = z.infer<typeof EntrySchema>;
