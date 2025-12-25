import { Vec3 } from "r628";
import { createComponent } from "../ecs2";
import { createSimpleFilterPipeline } from "../shaders/simple-filter";
import {
  DeferredWebgpuRenderer,
  GBUFFER_SUBMIT,
  LIGHTING_PASS,
} from "./renderer";

export const AmbientLightSource = createComponent({
  async init({ compGlobal }) {
    const {
      state: { device, canvasFormat, onResize },
    } = await compGlobal(DeferredWebgpuRenderer);

    return {
      pipeline: createSimpleFilterPipeline(
        device,
        {
          inputs: {
            albedo: {},
          },
          uniforms: {
            lightColor: "vec3f",
          },
          outputs: {
            lighting: "rgba8unorm",
          },
          source: "lighting = albedo * vec4f(params.lightColor, 1.0);",
        },
        {
          lighting: {
            format: "rgba8unorm",
            blend: {
              color: {
                operation: "add",
                srcFactor: "one",
                dstFactor: "one",
              },
              alpha: {
                operation: "add",
                srcFactor: "one",
                dstFactor: "zero",
              },
            },
          },
        }
      ),
    };
  },

  async instantiate(params: { color: Vec3 }) {
    return {
      color: params.color,
    };
  },

  async renderUpdate({
    scheduleTask,
    global: { state },
    instances,
    compGlobal,
  }) {
    const {
      state: { projectionMatrix, viewMatrix, device, textures, ctx },
    } = await compGlobal(DeferredWebgpuRenderer);
    scheduleTask(
      async () => {
        const commandEncoder = device.createCommandEncoder();

        for (const i of instances) {
          state.pipeline.withInputs({
            albedo: textures.gbuffer.albedo.createView(),
          })(
            state.pipeline.makeUniformBuffer().setBuffer({
              lightColor: i.state.color,
            })
          )(commandEncoder, {
            lighting: textures.lighting.color.createView({
              mipLevelCount: 1,
            }),
          });
        }

        device.queue.submit([commandEncoder.finish()]);
      },
      [LIGHTING_PASS],
      [GBUFFER_SUBMIT]
    );
  },
});
