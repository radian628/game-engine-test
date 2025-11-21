import * as esbuild from "esbuild";
import { demosPlugin } from "r628/src-node/esbuild-demos";
import { wgslPlugin } from "r628/src-node/esbuild-wgsl-plugin";
import { rawQueryParamPlugin } from "r628/src-node/esbuild-raw-query-param";
import { buildNotifyPlugin } from "r628/src-node/esbuild-build-notify";
import copyPlugin from "esbuild-plugin-copy";
import wasmLoader from "esbuild-plugin-wasm";
import Env from "./env.json";
import { watch } from "chokidar";

import { spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";

function prefixer(prefix: string) {
  return new Transform({
    transform(chunk, encoding, callback) {
      this.push(chunk.toString().replaceAll("\n", "\n" + prefix));

      callback();
    },
  });
}

(async () => {
  watch("./assets.blend").on("all", () => {
    console.log("blend file modification detected");

    const blender = spawn(
      Env.blender5,
      ["./assets.blend", "--background", "--python", "load-assets.py"],
      {
        stdio: "pipe",
      }
    );
    blender.stdout.pipe(prefixer("[BLENDER] ")).pipe(process.stdout);
  });

  const ctx = await esbuild.context({
    entryPoints: ["src/**/*.demo.*"],
    outdir: "build",
    minify: true,
    bundle: true,
    splitting: true,
    sourcemap: true,
    format: "esm",
    plugins: [
      demosPlugin({
        template(jslink) {
          return `<!DOCTYPE html>
          <html><head></head><body><script type="module" src="${jslink.split("/").at(-1)}"></script></body></html>`;
        },
      }),
      wgslPlugin(),
      rawQueryParamPlugin,
      buildNotifyPlugin,
      copyPlugin({
        assets: {
          from: "assets/*",
          to: "assets",
        },
      }),
      wasmLoader(),
    ],
  });

  await ctx.watch();
})();
