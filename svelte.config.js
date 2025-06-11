import { mdsvex } from "mdsvex";
import adapter from "@sveltejs/adapter-vercel";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const config = {
  preprocess: [vitePreprocess(), mdsvex()],
  kit: {
    adapter: adapter(),
    serviceWorker: {
      register: true, // true by default if a service worker exists at expected location
      // files: (filepath) => !/\.DS_Store/.test(filepath) // Example: custom filter
    },
	 // Add your manifest.json to assets if it's in static and not handled automatically
    // SvelteKit usually handles the `static` folder correctly.
    // files: {
    //  assets: 'static'
    // }
  },
  extensions: [".svelte", ".svx"],
};

export default config;
