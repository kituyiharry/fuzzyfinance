import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const GOOGLE_SCOPES = [
	'openid',
	'email',
	'https://www.googleapis.com/auth/drive.file',
	'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/generative-language.retriever'
];

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
		client_id: env.GOOGLE_CLIENT_ID,
		redirect_uri: `${env.ORIGIN}/api/integrations/google/callback`,
		response_type: 'code',
		scope: GOOGLE_SCOPES.join(' '),
		state,
		access_type: 'offline',
		prompt: 'consent' // always prompt to guarantee a refresh_token is issued
	});

	redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
