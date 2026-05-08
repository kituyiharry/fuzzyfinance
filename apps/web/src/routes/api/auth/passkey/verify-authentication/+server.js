import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { rpID, expectedOrigins, signSessionCookie, sessionCookieHeader } from '$lib/server/passkey';
import { eq, and, gt } from 'drizzle-orm';

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request }) {
	const body = await request.json();
	const { challengeId, credential } = body;

	if (!challengeId || !credential) throw error(400, 'Missing challengeId or credential');

	const identifier = `passkey-auth:${challengeId}`;
	const [stored] = await db
		.select()
		.from(schema.verification)
		.where(
			and(
				eq(schema.verification.identifier, identifier),
				gt(schema.verification.expiresAt, new Date())
			)
		);

	if (!stored) throw error(400, 'Challenge expired or not found');

	const [storedPasskey] = await db
		.select()
		.from(schema.passkey)
		.where(eq(schema.passkey.id, credential.id));

	if (!storedPasskey) throw error(400, 'Passkey not found');

	const credentialPublicKey = isoBase64URL.toBuffer(storedPasskey.publicKey);
	const credentialID = isoBase64URL.toBuffer(storedPasskey.id);

	const transports = /** @type {import('@simplewebauthn/types').AuthenticatorTransportFuture[] | undefined} */ (
		storedPasskey.transports ? storedPasskey.transports.split(',') : undefined
	);

	let result;
	try {
		result = await verifyAuthenticationResponse({
			response: credential,
			expectedChallenge: stored.value,
			expectedOrigin: expectedOrigins(),
			expectedRPID: rpID(),
			authenticator: {
				credentialPublicKey,
				credentialID,
				counter: storedPasskey.counter,
				transports,
			},
		});
	} catch (e) {
		throw error(400, `Verification failed: ${e instanceof Error ? e.message : String(e)}`);
	}

	if (!result.verified) throw error(400, 'Authentication not verified');

	await db
		.update(schema.passkey)
		.set({ counter: result.authenticationInfo.newCounter })
		.where(eq(schema.passkey.id, storedPasskey.id));

	await db.delete(schema.verification).where(eq(schema.verification.identifier, identifier));

	const [user] = await db
		.select()
		.from(schema.user)
		.where(eq(schema.user.id, storedPasskey.userId));

	if (!user) throw error(500, 'User not found');

	const sessionToken = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

	await db.insert(schema.session).values({
		id: crypto.randomUUID(),
		token: sessionToken,
		expiresAt,
		userId: user.id,
		ipAddress: request.headers.get('x-forwarded-for') ?? null,
		userAgent: request.headers.get('user-agent') ?? null,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	const signed = await signSessionCookie(sessionToken);

	return json(
		{ success: true, email: user.email },
		{ headers: { 'Set-Cookie': sessionCookieHeader(signed) } }
	);
}
