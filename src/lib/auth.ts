// src/lib/auth.js
import { PublicClientApplication, LogLevel } from '@azure/msal-browser';
import { writable } from 'svelte/store';

// MSAL Configuration
const MSAL_CONFIG = {
	auth: {
		clientId: 'ed509a72-4ec7-4cbe-a974-06b1c1a570f0', // Replace with your App ID from Azure portal
		authority: 'https://login.microsoftonline.com/common', // For multi-tenant and personal accounts
		redirectUri: 'http://localhost:5173/auth/callback', // Must match your Azure app registration
		// postLogoutRedirectUri: 'http://localhost:5173/' // Optional: Where to redirect after logout
	},
	cache: {
		cacheLocation: 'localStorage', // 'sessionStorage' or 'localStorage'
		storeAuthStateInCookie: false, // Set to true for environments where third-party cookies are blocked (e.g., Safari).
	},
	system: {
		loggerOptions: {
			loggerCallback: (level, message, containsPii) => {
				if (containsPii) {
					return;
				}
				switch (level) {
					case LogLevel.Error:
						console.error(message);
						return;
					case LogLevel.Info:
						// console.info(message); // Optionally log info messages
						return;
					case LogLevel.Verbose:
						// console.debug(message); // Optionally log verbose messages
						return;
					case LogLevel.Warning:
						console.warn(message);
						return;
				}
			},
			piiLoggingEnabled: false, // Set to true to log PII for debugging (NEVER in production)
			logLevel: LogLevel.Info,
		}
	}
};

export const msalInstance = new PublicClientApplication(MSAL_CONFIG);

// Svelte store for authentication state
export const authState = writable({
	isAuthenticated: false,
	user: null, // Store user info (e.g., name, email)
	accessToken: null, // Store access token for API calls
	error: null
});

// Define scopes for acquiring tokens
export const loginRequest = {
	scopes: ['openid', 'profile', 'User.Read', 'Tasks.ReadWrite']// Add Tasks.ReadWrite if needed
};

export const tokenRequest = {
	scopes: ['Tasks.ReadWrite'], // Scopes needed for your API calls (Microsoft Graph)
	forceRefresh: false // Set to true to skip cache and force a new token
};

// Call this on app initialization (e.g., in your root +layout.svelte or a specific component)
export async function initializeAuth() {
	await msalInstance.initialize(); // Initialize MSAL

	// Handle redirect promise if app was redirected from AAD
	msalInstance.handleRedirectPromise()
		.then(handleResponse)
		.catch(err => {
			console.error("Redirect Error:", err);
			authState.set({ isAuthenticated: false, user: null, accessToken: null, error: err.errorMessage });
		});

	// Set initial auth state based on current accounts
	const accounts = msalInstance.getAllAccounts();
	if (accounts.length > 0) {
		msalInstance.setActiveAccount(accounts[0]);
		const currentAccount = msalInstance.getActiveAccount();
		if (currentAccount) {
			try {
				const tokenResponse = await getAccessTokenSilent();
				authState.set({
					isAuthenticated: true,
					user: {
						displayName: currentAccount.name,
						username: currentAccount.username, // email or UPN
						localAccountId: currentAccount.localAccountId
					},
					accessToken: tokenResponse.accessToken,
					error: null
				});
			} catch (error) {
				console.warn("Silent token acquisition failed on init:", error);
				// Could mean token expired, needs interactive login, or consent needed
				// For now, treat as not fully authenticated for API calls
				authState.set({ isAuthenticated: false, user: null, accessToken: null, error: "Silent token acquisition failed." });
			}
		}
	}
}

function handleResponse(response) {
	if (response) {
		msalInstance.setActiveAccount(response.account);
		authState.set({
			isAuthenticated: true,
			user: {
				displayName: response.account.name,
				username: response.account.username,
				localAccountId: response.account.localAccountId
			},
			accessToken: response.accessToken, // This might be an ID token, ensure you get an access token for Graph
			error: null
		});
	}
}

export async function login() {
	try {
		// Using redirect flow
		await msalInstance.loginRedirect(loginRequest);
		// For popup flow:
		// const loginResponse = await msalInstance.loginPopup(loginRequest);
		// handleResponse(loginResponse);
	} catch (err) {
		console.error("Login Error:", err);
		authState.set({ isAuthenticated: false, user: null, accessToken: null, error: err.errorMessage });
	}
}

export async function logout() {
	const currentAccount = msalInstance.getActiveAccount();
	if (currentAccount) {
		await msalInstance.logoutRedirect({
			account: currentAccount,
			// postLogoutRedirectUri: MSAL_CONFIG.auth.postLogoutRedirectUri // Optional
		});
		// For popup logout:
		// await msalInstance.logoutPopup({ account: currentAccount });
	}
	authState.set({ isAuthenticated: false, user: null, accessToken: null, error: null });
}

export async function getAccessTokenSilent() {
	const account = msalInstance.getActiveAccount();
	if (!account) {
		throw new Error("No active account! Please log in.");
	}

	try {
		const response = await msalInstance.acquireTokenSilent({
			...tokenRequest,
			account: account
		});
		// Update stored access token if needed
		authState.update(current => ({ ...current, accessToken: response.accessToken, error: null }));
		return response;
	} catch (error) {
		console.warn("Silent token acquisition failed: ", error);
		if (error.name === "InteractionRequiredAuthError" || error.name === "BrowserAuthError") {
			// Fallback to interactive method if silent fails
			console.log("Falling back to interactive token acquisition");
			try {
				const response = await msalInstance.acquireTokenRedirect({ // or acquireTokenPopup
					...tokenRequest,
					account: account // Optional, MSAL will use active account
				});
				// handleRedirectPromise will handle the response after redirect
				// For popup, you'd handle it directly:
				// authState.update(current => ({ ...current, accessToken: response.accessToken, error: null }));
				// return response;
			} catch (interactiveError) {
				console.error("Interactive token acquisition failed: ", interactiveError);
				authState.update(current => ({ ...current, error: interactiveError.errorMessage }));
				throw interactiveError;
			}
		}
		throw error; // Re-throw other errors
	}
}