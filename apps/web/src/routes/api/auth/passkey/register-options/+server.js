import { json, error } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { rpID } from '$lib/server/passkey';
import { eq } from 'drizzle-orm';

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request }) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) throw error(401, 'Unauthorized');

	const { user } = session;
	const id = rpID();

	const options = await generateRegistrationOptions({
		rpName: 'Fuzzies',
		rpID: id,
		userID: user.id,
		userName: user.email,
		userDisplayName: user.name || user.email,
		attestationType: 'none',
		authenticatorSelection: {
			residentKey: 'required',
			userVerification: 'preferred',
			authenticatorAttachment: 'platform',
		},
		timeout: 60000,
	});

	const identifier = `passkey-reg:${user.id}`;
	await db.delete(schema.verification).where(eq(schema.verification.identifier, identifier));
	await db.insert(schema.verification).values({
		id: crypto.randomUUID(),
		identifier,
		value: options.challenge,
		expiresAt: new Date(Date.now() + 5 * 60 * 1000),
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	return json(options);
}
