import { makeUniformBuffer, mulMat4, Vec4 } from "r628";
import { GBUFFER_PASS, DeferredWebgpuRenderer } from "./renderer";
import { specifyComponent } from "../ecs";
import { Transform } from "../transform-component";

import GBufferRenderer from "./gbuffer.wgsl?raw";
import GBufferRendererJSON from "gbuffer.wgsl";

export const SampleWebgpuRendererGeometry = specifyComponent({
  async init(subsystem) {
    const { device } = await subsystem(DeferredWebgpuRenderer);

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
  create(
    params: {
      vertexBuffer: GPUBuffer;
      normalBuffer: GPUBuffer;
      indexBuffer: GPUBuffer;
      indexFormat: "uint16" | "uint32";
      size: number;
      drawColor: Vec4;
    },
    global,
    { deferredWebgpuRenderer }
  ) {
    const { device } = deferredWebgpuRenderer.state;

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
      layout: global.state.gbufferPipeline.getBindGroupLayout(0),
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
  renderUpdate({ state, instances, subsystem, scheduleTask }) {
    scheduleTask(() => {
      const {
        device,
        viewMatrix,
        projectionMatrix,
        textures,
        gBufferRenderPass,
      } = subsystem(DeferredWebgpuRenderer).state;

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
        const buf = makeUniformBuffer<typeof GBufferRendererJSON, 0, 0>(
          GBufferRendererJSON,
          0,
          0,
          {
            m: i.entity.transform.matrix,
            mvp: mulMat4(
              projectionMatrix,
              mulMat4(viewMatrix, i.entity.transform.matrix)
            ),
            draw_color: i.data.drawColor,
          }
        );

        device.queue.writeBuffer(i.data.uniformBuffer, 0, buf);

        passEncoder.setPipeline(gbufferPipeline);
        passEncoder.setVertexBuffer(0, i.data.vertexBuffer);
        passEncoder.setVertexBuffer(1, i.data.normalBuffer);
        passEncoder.setIndexBuffer(i.data.indexBuffer, i.data.indexFormat);
        passEncoder.setBindGroup(0, i.data.bindGroup);
        passEncoder.drawIndexed(i.data.vertexCount);
      }
      // passEncoder.end();

      // device.queue.submit([commandEncoder.finish()]);

      return Promise.resolve();
    }, [GBUFFER_PASS]);
  },
  onDestroy() {},
  dependencies: [Transform] as const,
  globalDependencies: [DeferredWebgpuRenderer] as const,
  brand: "sampleWebgpuRendererGeometry" as const,
});
