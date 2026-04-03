import { browser } from '$app/environment';

/** @typedef {'light' | 'dark' | 'low-contrast'} Theme */

function createThemeStore() {
	let currentTheme = $state(
		browser ? (localStorage.getItem('theme') || 'light') : 'light'
	);

	return {
		get current() {
			return currentTheme;
		},
		/** @param {Theme} theme */
		set(theme) {
			currentTheme = theme;
			if (browser) {
				localStorage.setItem('theme', theme);
				document.documentElement.setAttribute('data-theme', theme);
			}
		},
		init() {
			if (browser) {
				document.documentElement.setAttribute('data-theme', currentTheme);
			}
		}
	};
}

export const themeStore = createThemeStore();
