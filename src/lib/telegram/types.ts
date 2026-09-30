import { z } from "zod";

const telegramMessageSchema = z.object({
  message_id: z.number().int(),
  chat: z.object({ id: z.number().int() }),
  from: z.object({ id: z.number().int() }).optional(),
  text: z.string().max(4096).optional(),
});

const callbackQuerySchema = z.object({
  id: z.string().max(200),
  from: z.object({ id: z.number().int() }),
  message: telegramMessageSchema.optional(),
  data: z.string().max(100).optional(),
});

export const telegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: telegramMessageSchema.optional(),
  edited_message: telegramMessageSchema.optional(),
  callback_query: callbackQuerySchema.optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
