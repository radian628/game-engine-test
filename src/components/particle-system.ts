import { makeUniformBuffer, mulMat4, Vec4 } from "r628";
import { Transform } from "../transform-component";
import { GBUFFER_PASS, DeferredWebgpuRenderer } from "./renderer";
import ParticlesShader from "./particles.wgsl?incl";
import ParticlesShaderJSON from "particles.wgsl";

import ParticlesForcefield from "./particle-forcefield.wgsl?raw";
import { createComponent } from "../ecs2";

export const ParticleForcefield = createComponent({
  async init({ compGlobal }) {
    const { device } = (await compGlobal(DeferredWebgpuRenderer)).state;

    const particlesForcefieldPipeline = device.createComputePipeline({
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          code: ParticlesForcefield,
        }),
      },
    });

    return {
      particlesForcefieldPipeline,
    };
  },
  async instantiate(
    params: {
      positionBuffer: GPUBuffer;
      velocityBuffer: GPUBuffer;
      forceFieldTexture: GPUTexture;
      count: number;
    },
    { compGlobal }
  ) {
    const {
      state: { device },
    } = await compGlobal(DeferredWebgpuRenderer);
    const g = await compGlobal(ParticleForcefield);

    const bindGroup = device.createBindGroup({
      layout: g.state.particlesForcefieldPipeline.getBindGroupLayout(0),
      entries: [
        {
          resource: params.positionBuffer,
          binding: 0,
        },
        {
          resource: params.velocityBuffer,
          binding: 1,
        },
        {
          resource: params.forceFieldTexture,
          binding: 2,
        },
      ],
    });

    return {
      bindGroup,
      positionBuffer: params.positionBuffer,
      particleCount: params.count,
      velocityBuffer: params.velocityBuffer,
      forceFieldTexture: params.forceFieldTexture,
    };
  },
  async renderUpdate({ global, compGlobal, instances, scheduleTask }) {
    scheduleTask(async () => {
      const {
        device,
        viewMatrix,
        projectionMatrix,
        textures,
        gBufferRenderPass,
      } = (await compGlobal(DeferredWebgpuRenderer)).state;

      const state = global.state;

      const commandEncoder = device.createCommandEncoder();
      const compute = commandEncoder.beginComputePass();

      compute.setPipeline(state.particlesForcefieldPipeline);

      for (const i of instances) {
        compute.setBindGroup(0, i.state.bindGroup);
        compute.dispatchWorkgroups(Math.floor(i.state.particleCount / 64));
      }
      compute.end();

      device.queue.submit([commandEncoder.finish()]);
      return;
    }, [GBUFFER_PASS]);
  },
});

export const ParticleSystem = createComponent({
  async init({ compGlobal }) {
    const { device } = (await compGlobal(DeferredWebgpuRenderer)).state;

    const module = device.createShaderModule({
      code: ParticlesShader,
    });

    const blend: GPUBlendState = {
      color: {
        srcFactor: "one",
        dstFactor: "one-minus-src-alpha",
      },
      alpha: {
        srcFactor: "one",
        dstFactor: "one-minus-src-alpha",
      },
    };

    const particlesPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module,
        buffers: [
          {
            arrayStride: 16,
            stepMode: "instance",
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3",
              },
            ],
          },
        ],
      },
      fragment: {
        module,
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
      primitive: { topology: "triangle-list" },
    });

    const particlesForcefieldPipeline = device.createComputePipeline({
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          code: ParticlesForcefield,
        }),
      },
    });

    return {
      particlesPipeline,
      particlesForcefieldPipeline,
    };
  },
  async instantiate(
    params: {
      positionBuffer: GPUBuffer;
      count: number;
      drawColor: Vec4;
      scale: number;
    },
    { compGlobal }
  ) {
    const {
      state: { device },
    } = await compGlobal(DeferredWebgpuRenderer);

    const g = await compGlobal(ParticleSystem);

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
      layout: g.state.particlesPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: uniformBuffer,
        },
      ],
    });

    return {
      scale: params.scale,
      bindGroup,
      positionBuffer: params.positionBuffer,
      particleCount: params.count,
      uniformBuffer,
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
          aspect,
        },
      } = await compGlobal(DeferredWebgpuRenderer);

      const { particlesPipeline } = state;

      const passEncoder = gBufferRenderPass;

      for (const i of instances) {
        const buf = makeUniformBuffer<typeof ParticlesShaderJSON, 0, 0>(
          ParticlesShaderJSON,
          0,
          0,
          {
            scale: [i.state.scale / aspect, i.state.scale],
            mvp: mulMat4(
              projectionMatrix,
              mulMat4(viewMatrix, i.entity.comp(Transform).state.matrix)
            ),
            draw_color: i.state.drawColor,
          }
        );

        device.queue.writeBuffer(i.state.uniformBuffer, 0, buf);

        passEncoder.setPipeline(particlesPipeline);
        passEncoder.setVertexBuffer(0, i.state.positionBuffer);
        passEncoder.setBindGroup(0, i.state.bindGroup);
        passEncoder.draw(6, i.state.particleCount);
      }
      // passEncoder.end();

      // device.queue.submit([commandEncoder.finish()]);
    }, [GBUFFER_PASS]);
  },
  deps: [Transform] as const,
});
