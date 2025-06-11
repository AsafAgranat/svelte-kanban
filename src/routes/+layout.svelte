<script>
  import { onMount } from 'svelte';
  import { authState, initializeAuth, login, logout } from '$lib/auth.js';
  import { navigating } from '$app/stores';
	import '../app.scss';
  // This function is still crucial and runs once when the app shell loads.
  onMount(async () => {
    await initializeAuth();
  });
</script>

<header>
  <nav>
    <a href="/">Home</a>
    {#if $authState.isAuthenticated}
      <span>Welcome, {$authState.user?.displayName || 'User'}!</span>
      <button onclick={logout}>Logout</button>
    {/if}
    <!-- The login button is removed from here to prevent duplication. -->
  </nav>
  {#if $authState.error}
    <p class="error-message">Authentication Error: {$authState.error}</p>
  {/if}
  {#if $navigating}
    <p class="loading-message">Navigating...</p>
  {/if}
</header>

<main>
  <!-- The layout now simply provides the "slot" for the page content. -->
  <!-- The page itself will handle its own loading/logged-out states. -->
  <slot />
</main>

<footer>
  <p>&copy; {new Date().getFullYear()} To Do Kanban</p>
</footer>

<style>
  main {
    /* padding: 1rem; */
    max-width: 100%;
    margin: 0 auto; /* Center content */
    /* Add this to allow the center-stage message to fill the height */
    flex-grow: 1;
    display: flex;
    flex-direction: column;
	height: 100%;
  }
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #444;
    color: var(--app-bg, #252020);
    line-height: 1.6;
    /* Add this to make the layout take up the full screen height */
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    /* background: #3367D6; Example theme color */
    /* color: #fff; */
    padding: 1rem;
    text-align: center;
  }
  nav {
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }
  nav a {
    /* color: #fff; */
    text-decoration: none;
    padding: 0.5rem 1rem;
  }
  nav a:hover {
    background-color: #254e9d;
    border-radius: 4px;
  }
  nav button {
    background: #fff;
    color: #3367D6;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  nav button:hover {
    background: #eee;
  }
  nav span {
    margin-right: 1rem;
  }


  footer {
    text-align: center;
    /* padding: 1rem; */
    background: #333;
    color: #fff;
    /* margin-top: 2rem; */
  }
  .error-message {
    color: red;
    background-color: #ffebee;
    border: 1px solid red;
    padding: 0.5em;
    margin: 0.5em 0;
    border-radius: 4px;
    text-align: center;
  }
</style>