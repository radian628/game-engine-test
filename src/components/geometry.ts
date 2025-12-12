import { makeUniformBuffer, mulMat4, Vec4 } from "r628";
import { GBUFFER_PASS, DeferredWebgpuRenderer } from "./renderer";
import { Transform } from "../transform-component";

import GBufferRenderer from "./gbuffer.wgsl?raw";
import GBufferRendererJSON from "gbuffer.wgsl";
import { createComponent } from "../ecs2";

export const SampleWebgpuRendererGeometry = createComponent({
  async init({ compGlobal }) {
    const {
      state: { device },
    } = await compGlobal(DeferredWebgpuRenderer);

    const gbufferPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({
          code: GBufferRenderer,
        }),
        buffers: [
          {
            arrayStride: 12,
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3",
              },
            ],
          },
          {
            arrayStride: 12,
            attributes: [
              {
                shaderLocation: 1,
                offset: 0,
                format: "float32x3",
              },
            ],
          },
          // {
          //   arrayStride: 12,
          //   attributes: [
          //     {
          //       shaderLocation: 2,
          //       offset: 0,
          //       format: "float32x3",
          //     },
          //   ],
          // },
        ],
      },
      fragment: {
        module: device.createShaderModule({
          code: GBufferRenderer,
        }),
        targets: [
          { format: "rgba32float" },
          { format: "rgba16float" },
          { format: "rgba8unorm" },
        ],
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus",
      },
      primitive: { topology: "triangle-list", cullMode: "back" },
    });

    return { gbufferPipeline };
  },
  async instantiate(
    params: {
      vertexBuffer: GPUBuffer;
      normalBuffer: GPUBuffer;
      indexBuffer: GPUBuffer;
      indexFormat: "uint16" | "uint32";
      size: number;
      drawColor: Vec4;
    },
    { compGlobal }
  ) {
    const {
      state: { device },
    } = await compGlobal(DeferredWebgpuRenderer);

    const g = await compGlobal(SampleWebgpuRendererGeometry);

    const uniformBuffer = device.createBuffer({
      label: "uniform buffer",
      size: 1024,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.UNIFORM,
    });

    const bindGroup = device.createBindGroup({
      layout: g.state.gbufferPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: uniformBuffer,
        },
      ],
    });

    return {
      bindGroup,
      vertexBuffer: params.vertexBuffer,
      indexBuffer: params.indexBuffer,
      normalBuffer: params.normalBuffer,
      vertexCount: params.size,
      uniformBuffer,
      indexFormat: params.indexFormat,
      drawColor: params.drawColor,
    };
  },
  async renderUpdate({
    global: { state },
    instances,
    compGlobal,
    scheduleTask,
  }) {
    scheduleTask(async () => {
      const {
        state: {
          device,
          viewMatrix,
          projectionMatrix,
          textures,
          gBufferRenderPass,
        },
      } = await compGlobal(DeferredWebgpuRenderer);

      const { gbufferPipeline } = state;

      // const commandEncoder = device.createCommandEncoder();

      const passEncoder = gBufferRenderPass;

      // const passEncoder = commandEncoder.beginRenderPass({
      //   colorAttachments: [
      //     {
      //       view: textures.gbuffer.position.createView(),
      //       clearValue: [0, 0, 0, 1],
      //       loadOp: "clear",
      //       storeOp: "store",
      //     },
      //     {
      //       view: textures.gbuffer.normal.createView(),
      //       clearValue: [0, 0, 0, 1],
      //       loadOp: "clear",
      //       storeOp: "store",
      //     },
      //     {
      //       view: textures.gbuffer.albedo.createView(),
      //       clearValue: [0, 0, 0, 1],
      //       loadOp: "clear",
      //       storeOp: "store",
      //     },
      //   ],
      //   depthStencilAttachment: {
      //     view: textures.gbuffer.depth,
      //     depthClearValue: 1.0,
      //     depthLoadOp: "clear",
      //     depthStoreOp: "store",
      //   },
      // });

      for (const i of instances) {
        const transform = i.entity.comp(Transform).state.matrix;
        const buf = makeUniformBuffer<typeof GBufferRendererJSON, 0, 0>(
          GBufferRendererJSON,
          0,
          0,
          {
            m: transform,
            mvp: mulMat4(projectionMatrix, mulMat4(viewMatrix, transform)),
            draw_color: i.state.drawColor,
          }
        );

        device.queue.writeBuffer(i.state.uniformBuffer, 0, buf);

        passEncoder.setPipeline(gbufferPipeline);
        passEncoder.setVertexBuffer(0, i.state.vertexBuffer);
        passEncoder.setVertexBuffer(1, i.state.normalBuffer);
        passEncoder.setIndexBuffer(i.state.indexBuffer, i.state.indexFormat);
        passEncoder.setBindGroup(0, i.state.bindGroup);
        passEncoder.drawIndexed(i.state.vertexCount);
      }
      // passEncoder.end();

      // device.queue.submit([commandEncoder.finish()]);

      return Promise.resolve();
    }, [GBUFFER_PASS]);
  },
  deps: [Transform] as const,
});
