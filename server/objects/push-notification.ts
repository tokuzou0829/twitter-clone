import { z } from "zod";

import { ValidationError } from "@/server/errors";

const pushNotificationSchema = z
	.object({
		title: z.string().min(1),
		body: z.string().min(1),
		url: z.string().url(),
	})
	.passthrough();

export type PushNotification = z.infer<typeof pushNotificationSchema>;
export type PushNotificationInput = z.input<typeof pushNotificationSchema>;

const buildFromZod = <Output>(result: z.ZodSafeParseResult<Output>): Output => {
	if (result.success) return result.data;
	throw new ValidationError(result.error.message);
};

export const PushNotification = Object.assign(
	(input: PushNotificationInput): PushNotification =>
		buildFromZod(pushNotificationSchema.safeParse(input)),
	{
		schema: pushNotificationSchema,
		unsafe: (input: PushNotificationInput): PushNotification =>
			pushNotificationSchema.parse(input),
	},
);
