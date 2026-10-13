import { defineConfig } from "astro/config";

export default defineConfig({
    site: "https://notes.zelchi.com",
    base: "/",
    trailingSlash: "always",
    output: "static",
    server: { host: "127.0.0.1", port: 4321 },
});
