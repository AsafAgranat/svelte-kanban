import { PublicClientApplication, LogLevel } from '@azure/msal-browser';
import { writable } from 'svelte/store';

// NOTE: Remember to replace YOUR_APPLICATION_CLIENT_ID and update the redirectUri for production.
const MSAL_CONFIG = {
	auth: {
		clientId: 'ed509a72-4ec7-4cbe-a974-06b1c1a570f0', // Your App ID from Azure portal
		authority: 'https://login.microsoftonline.com/common',
		redirectUri: 'http://localhost:5173/auth/callback', // Your local redirect URI
	},
	cache: {
		cacheLocation: 'localStorage',
		storeAuthStateInCookie: false,
	},
	system: {
		loggerOptions: {
			loggerCallback: (level, message, containsPii) => {
				if (containsPii) return;
				switch (level) {
					case LogLevel.Error: console.error(message); return;
					case LogLevel.Warning: console.warn(message); return;
				}
			},
		},
	},
};

export const msalInstance = new PublicClientApplication(MSAL_CONFIG);

export const authState = writable({
	isAuthenticated: false,
	isReady: false,
	user: null,
	accessToken: null,
	error: null
});

// --- THIS IS THE KEY CHANGE ---
// We now request Files.ReadWrite.AppFolder instead of User.ReadWrite.
export const loginRequest = {
	scopes: ['openid', 'profile', 'User.Read', 'Tasks.ReadWrite', 'Files.ReadWrite.AppFolder']
};

export const tokenRequest = {
	scopes: ['Tasks.ReadWrite', 'Files.ReadWrite.AppFolder'], // Also needs to be available for silent requests
	forceRefresh: false
};

// The rest of the file remains the same...

export async function initializeAuth() {
	await msalInstance.initialize();
	try {
		await msalInstance.handleRedirectPromise();
		const accounts = msalInstance.getAllAccounts();
		if (accounts.length > 0) {
			msalInstance.setActiveAccount(accounts[0]);
			const currentAccount = msalInstance.getActiveAccount();
			if (currentAccount) {
				const tokenResponse = await getAccessTokenSilent();
				authState.update(state => ({
					...state,
					isAuthenticated: true,
					user: {
						displayName: currentAccount.name,
						username: currentAccount.username,
						localAccountId: currentAccount.localAccountId
					},
					accessToken: tokenResponse.accessToken,
				}));
			}
		}
	} catch (err) {
		console.error("Auth initialization error:", err);
		authState.update(state => ({ ...state, error: err.errorMessage }));
	} finally {
		authState.update(state => ({ ...state, isReady: true }));
	}
}

export async function login() {
	try {
		await msalInstance.loginRedirect(loginRequest);
	} catch (err) {
		authState.update(state => ({ ...state, error: err.errorMessage }));
	}
}

export async function logout() {
	const currentAccount = msalInstance.getActiveAccount();
	if (currentAccount) {
		await msalInstance.logoutRedirect({ account: currentAccount });
	}
	authState.set({ isAuthenticated: false, isReady: true, user: null, accessToken: null, error: null });
}

export async function getAccessTokenSilent(request = tokenRequest) {
	const account = msalInstance.getActiveAccount();
	if (!account) throw new Error("No active account! Please log in.");
	try {
		return await msalInstance.acquireTokenSilent({ ...request, account });
	} catch (error) {
		console.warn("Silent token acquisition failed, falling back to redirect.", error);
		return await msalInstance.acquireTokenRedirect(request);
	}
}