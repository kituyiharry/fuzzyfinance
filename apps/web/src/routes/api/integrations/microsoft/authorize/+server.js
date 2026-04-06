import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Files.ReadWrite covers both OneDrive files and Excel workbooks via Graph API
const MICROSOFT_SCOPES = ['openid', 'email', 'profile', 'offline_access', 'Files.ReadWrite'];

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, cookies }) {
	if (!locals.user) redirect(302, '/');

	const state = crypto.randomUUID();

	cookies.set('oauth_state', state, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 600 // 10 minutes
	});

	const params = new URLSearchParams({
		client_id: env.MICROSOFT_CLIENT_ID,
		redirect_uri: `${env.ORIGIN}/api/integrations/microsoft/callback`,
		response_type: 'code',
		scope: MICROSOFT_SCOPES.join(' '),
		state,
		response_mode: 'query'
	});

	redirect(
		302,
		`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`
	);
}
