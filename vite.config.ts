import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
    plugins: [
        webExtension({
            manifest: 'manifest.json',
            browser: process.env.TARGET_BROWSER || 'chrome',
        }),
    ],
    build: {
        outDir: `dist/${process.env.TARGET_BROWSER || 'chrome'}`,
        emptyOutDir: true,
        minify: false,
    },
    publicDir: 'public',
});
