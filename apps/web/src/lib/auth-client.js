import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient({
    baseURL: "https://fuzzies.app",
});
