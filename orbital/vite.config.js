import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { fileURLToPath } from "node:url";

export default defineConfig({
    define: {
        CESIUM_BASE_URL: JSON.stringify("/cesium/")
    },

    plugins: [
        viteStaticCopy({
            targets: [
                "Workers",
                "ThirdParty",
                "Assets",
                "Widgets"
            ].map(name => ({
                src: `node_modules/cesium/Build/Cesium/${name}`,
                dest: "cesium"
            }))
        })
    ],

    build: {
        rollupOptions: {
            input: {
                main: fileURLToPath(
                    new URL("./index.html", import.meta.url)
                ),

                terrain: fileURLToPath(
                    new URL("./terrain.html", import.meta.url)
                )
            }
        }
    }
});