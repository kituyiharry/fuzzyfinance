import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/** @type {import('@sveltejs/kit').RequestHandler} */
export function GET() {
	const entries = [
		{
			relation: ['delegate_permission/common.get_login_creds'],
			target: {
				namespace: 'android_app',
				package_name: 'app.fuzzies',
				sha256_cert_fingerprints: env.ANDROID_CERT_SHA256
					? env.ANDROID_CERT_SHA256.split(',').map((s) => s.trim())
					: []
			}
		}
	];
	return json(entries);
}
