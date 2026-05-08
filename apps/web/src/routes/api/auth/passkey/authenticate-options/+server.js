import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { rpID } from '$lib/server/passkey';
import { eq } from 'drizzle-orm';

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST() {
	const options = await generateAuthenticationOptions({
		rpID: rpID(),
		userVerification: 'preferred',
		allowCredentials: [],
		timeout: 60000,
	});

	const challengeId = crypto.randomUUID();
	const identifier = `passkey-auth:${challengeId}`;

	await db.delete(schema.verification).where(eq(schema.verification.identifier, identifier));
	await db.insert(schema.verification).values({
		id: crypto.randomUUID(),
		identifier,
		value: options.challenge,
		expiresAt: new Date(Date.now() + 5 * 60 * 1000),
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	return json({ challengeId, options });
}
