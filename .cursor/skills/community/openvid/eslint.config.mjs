import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated browser assets are served as-is and are not application source.
    "public/ffmpeg/**",
    "public/draco/**",
    // Independent backend and desktop projects have their own toolchains.
    "openvid-back/**",
    "openvid-autozoom/**",
  ]),
]);

export default eslintConfig;
