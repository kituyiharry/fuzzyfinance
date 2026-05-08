import { json, error } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { schema } from '@fuzzyfinance/db';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { rpID, expectedOrigins } from '$lib/server/passkey';
import { eq, and, gt } from 'drizzle-orm';

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request }) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) throw error(401, 'Unauthorized');

	const { user } = session;
	const body = await request.json();

	const identifier = `passkey-reg:${user.id}`;
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

	let result;
	try {
		result = await verifyRegistrationResponse({
			response: body,
			expectedChallenge: stored.value,
			expectedOrigin: expectedOrigins(),
			expectedRPID: rpID(),
		});
	} catch (e) {
		throw error(400, `Verification failed: ${e instanceof Error ? e.message : String(e)}`);
	}

	if (!result.verified || !result.registrationInfo) {
		throw error(400, 'Registration not verified');
	}

	const {
		credentialID,
		credentialPublicKey,
		credentialDeviceType,
		credentialBackedUp,
		counter,
		aaguid,
	} = result.registrationInfo;

	const credentialIdB64url = isoBase64URL.fromBuffer(credentialID);
	const publicKeyB64 = isoBase64URL.fromBuffer(credentialPublicKey);

	await db.delete(schema.verification).where(eq(schema.verification.identifier, identifier));

	await db.insert(schema.passkey).values({
		id: credentialIdB64url,
		publicKey: publicKeyB64,
		userId: user.id,
		webauthnUserID: user.id,
		counter,
		deviceType: credentialDeviceType,
		backedUp: credentialBackedUp,
		transports: body.response?.transports?.join(',') ?? null,
		aaguid: aaguid ?? null,
		createdAt: new Date(),
	});

	return json({ success: true });
}
