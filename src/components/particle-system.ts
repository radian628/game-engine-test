import { makeUniformBuffer, mulMat4, Vec4 } from "r628";
import { specifyComponent } from "../ecs";
import { Transform } from "../transform-component";
import { GBUFFER_PASS, DeferredWebgpuRenderer } from "./renderer";
import ParticlesShader from "./particles.wgsl?raw";
import ParticlesShaderJSON from "particles.wgsl";

import ParticlesForcefield from "./particle-forcefield.wgsl?raw";

export const ParticleForcefield = specifyComponent({
  async init(subsystem) {
    const { device } = await subsystem(DeferredWebgpuRenderer);

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
  create(
    params: {
      positionBuffer: GPUBuffer;
      velocityBuffer: GPUBuffer;
      forceFieldTexture: GPUTexture;
      count: number;
    },
    global,
    { deferredWebgpuRenderer }
  ) {
    const { device } = deferredWebgpuRenderer.state;

    const bindGroup = device.createBindGroup({
      layout: global.state.particlesForcefieldPipeline.getBindGroupLayout(0),
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
  renderUpdate({ state, instances, subsystem, scheduleTask }) {
    scheduleTask(() => {
      const {
        device,
        viewMatrix,
        projectionMatrix,
        textures,
        gBufferRenderPass,
      } = subsystem(DeferredWebgpuRenderer).state;

      const commandEncoder = device.createCommandEncoder();
      const compute = commandEncoder.beginComputePass();

      compute.setPipeline(state.particlesForcefieldPipeline);

      for (const i of instances) {
        compute.setBindGroup(0, i.data.bindGroup);
        compute.dispatchWorkgroups(Math.floor(i.data.particleCount / 64));
      }
      compute.end();

      device.queue.submit([commandEncoder.finish()]);
      return Promise.resolve();
    }, [GBUFFER_PASS]);
  },
  dependencies: [Transform] as const,
  globalDependencies: [DeferredWebgpuRenderer] as const,
  onDestroy() {},
  brand: "particleForcefield" as const,
});

export const ParticleSystem = specifyComponent({
  async init(subsystem) {
    const { device } = await subsystem(DeferredWebgpuRenderer);

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
  create(
    params: { positionBuffer: GPUBuffer; count: number; drawColor: Vec4 },
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
      layout: global.state.particlesPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: uniformBuffer,
        },
      ],
    });

    return {
      bindGroup,
      positionBuffer: params.positionBuffer,
      particleCount: params.count,
      uniformBuffer,
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

      const { particlesPipeline } = state;

      const passEncoder = gBufferRenderPass;

      for (const i of instances) {
        const buf = makeUniformBuffer<typeof ParticlesShaderJSON, 0, 0>(
          ParticlesShaderJSON,
          0,
          0,
          {
            mvp: mulMat4(
              projectionMatrix,
              mulMat4(viewMatrix, i.entity.transform.matrix)
            ),
            draw_color: i.data.drawColor,
          }
        );

        device.queue.writeBuffer(i.data.uniformBuffer, 0, buf);

        passEncoder.setPipeline(particlesPipeline);
        passEncoder.setVertexBuffer(0, i.data.positionBuffer);
        passEncoder.setBindGroup(0, i.data.bindGroup);
        passEncoder.draw(6, i.data.particleCount);
      }
      // passEncoder.end();

      // device.queue.submit([commandEncoder.finish()]);
      return Promise.resolve();
    }, [GBUFFER_PASS]);
  },
  dependencies: [Transform] as const,
  globalDependencies: [DeferredWebgpuRenderer] as const,
  onDestroy() {},
  brand: "particleSystem" as const,
});
