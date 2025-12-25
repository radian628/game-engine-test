import {
  makeUniformBuffer,
  mulMat4,
  mulMat4ByVec4,
  mulVec4ByMat4,
  Vec4,
  xyz,
} from "r628";
import { GBUFFER_PASS, DeferredWebgpuRenderer } from "./renderer";
import { Transform } from "../transform-component";

import GBufferRenderer from "./gbuffer.wgsl?incl";
import GBufferRendererJSON from "gbuffer.wgsl";

import TexturedGBuffer from "./gbuffer-uv.wgsl?raw";
import TexturedGBufferJSON from "gbuffer-uv.wgsl";

import { createComponent } from "../ecs2";
import { inv4 } from "../matrix";

export const TexturedGeometry = createComponent({
  async init({ compGlobal }) {
    const {
      state: { device },
    } = await compGlobal(DeferredWebgpuRenderer);

    const gbufferPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({
          code: TexturedGBuffer,
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
          {
            arrayStride: 8,
            attributes: [
              {
                shaderLocation: 2,
                offset: 0,
                format: "float32x2",
              },
            ],
          },
        ],
      },
      fragment: {
        module: device.createShaderModule({
          code: TexturedGBuffer,
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
      uvBuffer: GPUBuffer;
      indexBuffer: GPUBuffer;
      albedoTexture: GPUTexture;
      indexFormat: "uint16" | "uint32";
      size: number;
      drawColor: Vec4;
    },
    { compGlobal }
  ) {
    const {
      state: { device },
    } = await compGlobal(DeferredWebgpuRenderer);

    const g = await compGlobal(TexturedGeometry);

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
        {
          binding: 1,
          resource: params.albedoTexture.createView(),
        },
        {
          binding: 2,
          resource: device.createSampler({
            minFilter: "linear",
            magFilter: "linear",
          }),
        },
      ],
    });

    return {
      bindGroup,
      vertexBuffer: params.vertexBuffer,
      indexBuffer: params.indexBuffer,
      normalBuffer: params.normalBuffer,
      uvBuffer: params.uvBuffer,
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

      const passEncoder = gBufferRenderPass;

      for (const i of instances) {
        const transform = i.entity.comp(Transform).state.matrix;
        const buf = makeUniformBuffer<typeof TexturedGBufferJSON, 0, 0>(
          TexturedGBufferJSON,
          0,
          0,
          {
            m: transform,
            mvp: mulMat4(projectionMatrix, mulMat4(viewMatrix, transform)),
          }
        );

        device.queue.writeBuffer(i.state.uniformBuffer, 0, buf);

        passEncoder.setPipeline(gbufferPipeline);
        passEncoder.setVertexBuffer(0, i.state.vertexBuffer);
        passEncoder.setVertexBuffer(1, i.state.normalBuffer);
        passEncoder.setVertexBuffer(2, i.state.uvBuffer);
        passEncoder.setIndexBuffer(i.state.indexBuffer, i.state.indexFormat);
        passEncoder.setBindGroup(0, i.state.bindGroup);
        passEncoder.drawIndexed(i.state.vertexCount);
      }

      return Promise.resolve();
    }, [GBUFFER_PASS]);
  },
  deps: [Transform] as const,
});

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

      const cameraPos = xyz(mulMat4ByVec4(inv4(viewMatrix), [0, 0, 0, 1]));

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
            camera_pos: cameraPos,
            m_inv: inv4(transform),
            glancing_alpha: 0,
            facing_alpha: 1,
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
