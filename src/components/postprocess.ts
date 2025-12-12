import { Vec2 } from "r628";
import { DeferredWebgpuRenderer, LIGHTING_PASS } from "./renderer";
import { createComponent } from "../ecs2";

export type PostprocessState = {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  ctx: GPUCanvasContext;
};

export const PostprocessingPipeline = <Global, ResolutionDependent>(
  initGlobal: (state: PostprocessState) => Global | Promise<Global>,
  initResolutionDependent: (
    state: PostprocessState,
    res: Vec2,
    global: Awaited<Global>
  ) => ResolutionDependent | Promise<ResolutionDependent>,
  runFrame: (
    state: PostprocessState & {
      position: GPUTexture;
      normal: GPUTexture;
      albedo: GPUTexture;
      lighting: GPUTexture;
    },
    res: Vec2,
    global: Awaited<Global>,
    resDependent: Awaited<ResolutionDependent>
  ) => void | Promise<void>
) =>
  createComponent({
    async init({ compGlobal }) {
      const { device, canvas, onResize, ctx } = (
        await compGlobal(DeferredWebgpuRenderer)
      ).state;

      const post = {
        global: (await initGlobal({ device, canvas, ctx })) as Awaited<Global>,
        resolutionDependent: undefined as
          | Awaited<ResolutionDependent>
          | undefined,
      };

      onResize(async () => {
        post.resolutionDependent = await initResolutionDependent(
          { device, canvas, ctx },
          [canvas.width, canvas.height],
          post.global
        );
      });

      return post;
    },
    async renderUpdate({ global, scheduleTask, compGlobal }) {
      const state = global.state;
      scheduleTask(
        async () => {
          const { device, canvas, ctx, textures } = (
            await compGlobal(DeferredWebgpuRenderer)
          ).state;
          await runFrame(
            {
              device,
              canvas,
              ctx,

              position: textures.gbuffer.position,
              normal: textures.gbuffer.normal,
              albedo: textures.gbuffer.albedo,
              lighting: textures.lighting.color,
            },
            [canvas.width, canvas.height],
            state.global,
            state.resolutionDependent
          );
        },
        [],
        [LIGHTING_PASS]
      );
    },
  });
