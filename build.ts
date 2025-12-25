import "@loaders.gl/polyfills";
import * as esbuild from "esbuild";
import { demosPlugin } from "r628/src-node/esbuild-demos";
import { wgslPlugin } from "r628/src-node/esbuild-wgsl-plugin";
import { rawQueryParamPlugin } from "r628/src-node/esbuild-raw-query-param";
import { buildNotifyPlugin } from "r628/src-node/esbuild-build-notify";
import copyPlugin from "esbuild-plugin-copy";
import wasmLoader from "esbuild-plugin-wasm";
import Env from "./env.json";
import { watch } from "chokidar";
import {
  GLTFLoader,
  GLTFMeshPostprocessed,
  postProcessGLTF,
} from "@loaders.gl/gltf";
import { parse } from "@loaders.gl/core";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";
import { smartAsyncReplaceAll } from "r628";

export function gltfLoader(): esbuild.Plugin {
  return {
    name: "gltf",
    setup(build) {
      build.onResolve({ filter: /\.(gltf|glb)$/ }, (args) => {
        return {
          path: path.join(args.resolveDir, args.path),
          namespace: "gltf",
          pluginData: {
            originalPath: args.path,
          },
        };
      });

      build.onLoad({ filter: /.*/, namespace: "gltf" }, async (args) => {
        console.log("PATHNAME", args.path);
        const file = await fs.readFile(args.path);

        const gltf = await parse(new Blob([file.buffer]), GLTFLoader);

        const gltf2 = postProcessGLTF(gltf);

        const json = gltf2;

        const declpath = args.path + ".d.ts";
        console.log("declpath", declpath);
        fs.writeFile(
          declpath,
          `declare module "${
            args.pluginData.originalPath
          }" {\n  const data: ${JSON.stringify(
            json,
            undefined,
            2
          )};\n export default data; \n}`
        );

        return {
          loader: "json",
          contents: JSON.stringify(json),
          watchFiles: [args.path],
        };
      });
    },
  };
}

function includeFindReplace(
  str: string,
  filepath: string,
  existing = new Set<string>()
) {
  const pattern = /\/\/\#include\s+.*/g;
  return smartAsyncReplaceAll(str, pattern, async (str, pos, cursor) => {
    const filename = str.match(/\/\/\#include\s+(.*$)/)?.[1];

    if (!filename) {
      console.log(`Could not identify filename in string '${str}'`);
      return "";
    }

    const newfilepath = path.join(path.dirname(filepath), filename);

    if (existing.has(newfilepath)) return "";
    existing.add(newfilepath);

    const file = (await fs.readFile(newfilepath)).toString();

    return await includeFindReplace(file, newfilepath, existing);
  });
}

const inclQueryParamPlugin: esbuild.Plugin = {
  name: "incl",
  setup(build) {
    build.onResolve({ filter: /\?.*incl/ }, (args) => {
      return {
        path: path.join(args.resolveDir, args.path),
        namespace: "incl-ns",
      };
    });
    build.onLoad({ filter: /.*/, namespace: "incl-ns" }, async (args) => {
      const fspath = args.path.replace(/\?.*$/, "");
      const contents = (
        await includeFindReplace((await fs.readFile(fspath)).toString(), fspath)
      ).str;
      return {
        contents,
        loader: "text",
        watchFiles: [fspath],
      };
    });
  },
};

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

    setTimeout(() => {
      const blender = spawn(
        Env.blender5,
        ["./assets.blend", "--background", "--python", "load-assets.py"],
        {
          stdio: "pipe",
        }
      );
      blender.stdout.pipe(prefixer("[BLENDER] ")).pipe(process.stdout);
      blender.stderr.pipe(prefixer("[BLENDER ERROR] ")).pipe(process.stderr);
    }, 500);
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
      inclQueryParamPlugin,
      buildNotifyPlugin,
      // copyPlugin({
      //   assets: {
      //     from: "./src/models.glb",
      //     to: "assets/models.glb",
      //   },
      // }),
      wasmLoader(),
    ],
  });

  await ctx.watch();
})();
