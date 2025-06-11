<script>
  import { onMount }      from 'svelte';
  import { authState, initializeAuth, login, logout } from '$lib/auth.js'; // Adjust path
  import { navigating } from '$app/stores'; // To show loading indicator during navigation
  import '../app.scss';

  let appInitialized = false;

  onMount(async () => {
    await initializeAuth();
    appInitialized = true;
  });
</script>

<header>
  <nav>
    <a href="/">Home</a>
    {#if $authState.isAuthenticated}
      <span>Welcome, {$authState.user?.displayName || 'User'}!</span>
      <button on:click={logout}>Logout</button>
    {:else if appInitialized}
      <button on:click={login}>Login with Microsoft</button>
    {/if}
  </nav>
  {#if $authState.error}
    <p class="error-message">Authentication Error: {$authState.error}</p>
  {/if}
  {#if $navigating}
    <p>Loading...</p> {/if}
</header>

<main>
  {#if appInitialized}
    <slot />
  {:else}
    <p>Initializing application...</p>
  {/if}
</main>

<footer>
  <p>&copy; {new Date().getFullYear()} To Do Kanban</p>
</footer>

<style>
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #f4f4f4;
    color: #333;
    line-height: 1.6;
  }

  header {
    background: #3367D6; /* Example theme color */
    color: #fff;
    padding: 1rem;
    text-align: center;
  }
  nav {
    display: flex;
    justify-content: space-around;
    align-items: center;
  }
  nav a {
    color: #fff;
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

  main {
    padding: 1rem;
    margin: 1rem auto; /* Center content */
  }

  footer {
    text-align: center;
    padding: 1rem;
    background: #333;
    color: #fff;
    margin-top: 2rem;
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