<script>
  import { onMount } from 'svelte';
  import { msalInstance, authState } from '$lib/auth.js'; // Adjust path if needed
  import { goto } from '$app/navigation';

  onMount(async () => {
    try {
      // `handleRedirectPromise` should ideally be called once on app load.
      // If MSAL is initialized and handleRedirectPromise called in initializeAuth,
      // this page might just be a loading indicator or redirector.
      // However, some MSAL patterns re-call it on the callback page.
      // Let's assume initializeAuth() in a root layout handles the main redirect promise.
      // This page ensures the user is redirected away after MSAL processes the hash.

      const response = await msalInstance.handleRedirectPromise();
      if (response && response.account) {
        msalInstance.setActiveAccount(response.account);
        // The authState should be updated by handleRedirectPromise via initializeAuth
        // or directly if handleResponse is called here.
         authState.set({
            isAuthenticated: true,
            user: {
                displayName: response.account.name,
                username: response.account.username,
                localAccountId: response.account.localAccountId
            },
            accessToken: response.accessToken, // This might be an ID token
            error: null
        });
        goto('/'); // Redirect to home page after successful login
      } else {
        // If no response, it might mean it was already handled or it's not a redirect.
        // Check if already authenticated from initializeAuth.
        const currentAuthState = $authState; // Use $ to subscribe to store value
        if (currentAuthState.isAuthenticated) {
            goto('/');
        } else {
            // Potentially an error or unexpected state.
            // You might want to redirect to login or show an error.
            // For now, let's assume initializeAuth on the main page will pick up the state.
            goto('/'); // Or perhaps a login page if not authenticated
        }
      }
    } catch (error) {
      console.error('Callback Error:', error);
      authState.set({ isAuthenticated: false, user: null, accessToken: null, error: error.errorMessage });
      goto('/login-error'); // Redirect to an error page or show message
    }
  });
</script>

<div class="container">
  <p>Processing authentication...</p>
  <p>You will be redirected shortly.</p>
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 80vh;
    text-align: center;
  }
</style>
