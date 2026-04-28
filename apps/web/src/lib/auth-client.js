import { createAuthClient } from 'better-auth/svelte';
import { dev } from '$app/environment';

export const authClient = createAuthClient({
    baseURL: dev ? "http://localhost:5173" : "https://fuzzies.app",
});
