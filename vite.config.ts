import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // base path only needed for the GH Pages build, not for local dev
  base: command === "build" ? "/llm-chat/" : "/",
}));
