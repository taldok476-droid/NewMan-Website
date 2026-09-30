import { z } from "zod";

const telegramMessageSchema = z.object({
  message_id: z.number().int(),
  chat: z.object({ id: z.number().int() }),
  text: z.string().max(4096).optional(),
});

export const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: telegramMessageSchema.optional(),
  edited_message: telegramMessageSchema.optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
