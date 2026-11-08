import { z } from "zod";

export const AccountTypeEnum = z.enum([
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
]);

export const AccountStatusEnum = z.enum(["ACTIVE", "FROZEN", "CLOSED"]);

export const CreateAccountSchema = z.object({
  id: z.string().uuid().optional(),
  accountNumber: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/, {
    message: "Account number must be alphanumeric and may contain hyphens or underscores",
  }),
  type: AccountTypeEnum,
  currency: z.string().length(3).regex(/^[A-Z]{3}$/, {
    message: "Currency must be a valid 3-letter ISO code (e.g., BRL, USD)",
  }),
  status: AccountStatusEnum.default("ACTIVE"),
  initialBalance: z
    .union([
      z.bigint(),
      z.number().int().transform((val) => BigInt(val)),
      z.string().regex(/^-?\d+$/).transform((val) => BigInt(val)),
    ])
    .default(0n),
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
