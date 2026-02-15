import { z } from "zod";

import { ValidationError } from "@/server/errors";

const pushSubscriptionSchema = z.object({
	endpoint: z.string().url(),
	expirationTime: z.number().nullable().optional(),
	keys: z.object({
		p256dh: z.string().min(1),
		auth: z.string().min(1),
	}),
});

export type PushSubscription = z.infer<typeof pushSubscriptionSchema>;
export type PushSubscriptionInput = z.input<typeof pushSubscriptionSchema>;

const buildFromZod = <Output>(result: z.ZodSafeParseResult<Output>): Output => {
	if (result.success) return result.data;
	throw new ValidationError(result.error.message);
};

export const PushSubscription = Object.assign(
	(input: PushSubscriptionInput): PushSubscription =>
		buildFromZod(pushSubscriptionSchema.safeParse(input)),
	{
		schema: pushSubscriptionSchema,
		unsafe: (input: PushSubscriptionInput): PushSubscription =>
			pushSubscriptionSchema.parse(input),
	},
);
