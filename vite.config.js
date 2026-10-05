import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	build: {
		rollupOptions: {
			output: {
				// Keep heavy, rarely-changing vendors in their own chunks so no
				// single asset exceeds the 500 kB warning threshold and browser
				// caches can reuse them across app updates.
				manualChunks(id) {
					if (id.includes("node_modules")) {
						if (id.includes("mapbox-gl")) return "vendor-mapbox";
						if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
						if (id.includes("tesseract.js") || id.includes("tesseract")) return "vendor-ocr";
						if (id.includes("react") || id.includes("scheduler")) return "vendor-react";
						return "vendor";
					}
					return undefined;
				},
			},
		},
		// mapbox-gl JS is a single un-splittable library (~1.6 MB minified,
		// ~460 kB gzip) — everything else is now under 500 kB, so only raise
		// the threshold enough to silence that one known-large vendor chunk.
		chunkSizeWarningLimit: 1700,
	},
});
