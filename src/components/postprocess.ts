import { Vec2 } from "r628";
import { specifyComponent } from "../ecs";
import { DeferredWebgpuRenderer, LIGHTING_PASS } from "./renderer";

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
  specifyComponent<
    undefined,
    Promise<undefined>,
    {
      global: Awaited<Global>;
      resolutionDependent: Awaited<ResolutionDependent>;
    },
    "postprocessingPipeline",
    [],
    [typeof DeferredWebgpuRenderer]
  >({
    async create(params, global, dependencies, waitFor): Promise<undefined> {
      return undefined;
    },
    onDestroy() {},
    async init(waitFor): Promise<{
      global: Awaited<Global>;
      resolutionDependent: Awaited<ResolutionDependent>;
    }> {
      const { device, canvas, onResize, ctx } = await waitFor(
        DeferredWebgpuRenderer
      );

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
    globalDependencies: [DeferredWebgpuRenderer],
    dependencies: [],
    brand: "postprocessingPipeline",
    async renderUpdate({ state, scheduleTask, subsystem }) {
      scheduleTask(
        async () => {
          const { device, canvas, ctx, textures } = subsystem(
            DeferredWebgpuRenderer
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
