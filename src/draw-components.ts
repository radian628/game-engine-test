import {
  download,
  makeUniformBuffer,
  mulMat4,
  mulMat4ByVec4,
  range,
  scale,
  translate,
  Vec2,
  Vec3,
} from "r628";
import { specifyComponent } from "./ecs";
import {
  createDofDownsampleShaderPipeline,
  createDofPositionToDepth,
  createDofShaderPipeline,
  runDofDownsample,
  runDofPositionToDepth,
  runDofShaderPipeline,
} from "./shaders/dof";

export const MainCanvas = specifyComponent({
  create() {
    return undefined;
  },
  onDestroy() {},
  async init() {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    document.body.appendChild(canvas);
    return {
      canvas,
    };
  },
  brand: "mainCanvas",
  dependencies: [],
  globalDependencies: [],
});

export const GBUFFER_PASS = Symbol("GBuffer Pass");

export const LIGHTING_PASS = Symbol("Lighting Pass");

function createGBufferTextures(device: GPUDevice, dimensions: Vec2) {
  const albedo = device.createTexture({
    dimension: "2d",
    format: "rgba8unorm",
    label: "albedo",
    size: dimensions,
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING,
  });
  const normal = device.createTexture({
    dimension: "2d",
    format: "rgba16float",
    label: "normal",
    size: dimensions,
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING,
  });
  const position = device.createTexture({
    dimension: "2d",
    format: "rgba32float",
    label: "position",
    size: dimensions,
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.STORAGE_BINDING,
  });
  const depth = device.createTexture({
    size: dimensions,
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  return { albedo, normal, position, depth };
}

function createLightingTextures(device: GPUDevice, dimensions: Vec2) {
  const color = device.createTexture({
    size: dimensions,
    format: "rgba8unorm",
    mipLevelCount: 7,
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.STORAGE_BINDING,
  });
  return {
    color,
    dofMinMaxDepthTextures: [1, 2, 4].map((s) =>
      device.createTexture({
        size: [Math.ceil(dimensions[0] / s), Math.ceil(dimensions[1] / s)],
        format: "rg32float",
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.TEXTURE_BINDING,
        mipLevelCount: 7,
      })
    ),
    dofColorTextures: [
      color,
      ...[2, 4].map((s) =>
        device.createTexture({
          size: [Math.ceil(dimensions[0] / s), Math.ceil(dimensions[1] / s)],
          format: "rgba8unorm",
          usage:
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_SRC |
            GPUTextureUsage.TEXTURE_BINDING,
        })
      ),
    ],
  };
}

type DeferredPipelineTextures = {
  gbuffer: {
    albedo: GPUTexture;
    normal: GPUTexture;
    position: GPUTexture;
    depth: GPUTexture;
  };
  lighting: {
    color: GPUTexture;
    dofMinMaxDepthTextures: GPUTexture[];
    dofColorTextures: GPUTexture[];
  };

  // lightingBindGroup: GPUBindGroup;
  dimensions: Vec2;
};

export function createBufferFromData(
  device: GPUDevice,
  data: Parameters<GPUDevice["queue"]["writeBuffer"]>[2],
  usage: GPUBufferUsageFlags,
  label?: string
) {
  const buf = device.createBuffer({
    label,
    usage,
    size: data.byteLength,
  });

  device.queue.writeBuffer(buf, 0, data);

  return buf;
}

function maybeUpdateTextures(
  device: GPUDevice,
  dimensions: Vec2,
  // lightingPipeline: GPURenderPipeline,
  // lightingLayout: GPUBindGroupLayout,
  existing?: DeferredPipelineTextures
): DeferredPipelineTextures {
  const outTextures = existing
    ? dimensions[0] === existing.dimensions[0] &&
      dimensions[1] === existing.dimensions[1]
      ? existing
      : undefined
    : undefined;

  if (outTextures) return outTextures;

  const gbuffer = createGBufferTextures(device, dimensions);

  return {
    gbuffer,
    dimensions,
    lighting: createLightingTextures(device, dimensions),
    // lightingBindGroup,
  };
}

function fullscreenQuad2DBuffer(device: GPUDevice) {
  return createBufferFromData(
    device,
    new Float32Array([1, -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1]),
    GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    "fullscreen quad for blit"
  );
}

export const SampleWebgpuRenderer = specifyComponent({
  create() {
    return undefined;
  },
  onDestroy() {},
  async init(waitFor) {
    const canvas = (await waitFor(MainCanvas)).canvas;

    const ctx = canvas.getContext("webgpu");

    const adapter = await navigator.gpu.requestAdapter()!;
    const device = await adapter.requestDevice({
      requiredFeatures: ["float32-filterable"],
      requiredLimits: {
        // maxColorAttachmentBytesPerSample: 40,
      },
    });

    const format = navigator.gpu.getPreferredCanvasFormat();

    ctx.configure({
      device,
      format,
    });

    const onResizeCallbacks = new Set<() => void>();

    return {
      dofPositionToDepth: createDofPositionToDepth(device),
      dofDownsample: createDofDownsampleShaderPipeline(device),
      dofPipeline: createDofShaderPipeline(device, format),
      fullscreenQuad: fullscreenQuad2DBuffer(device),
      textures: maybeUpdateTextures(device, [canvas.width, canvas.height]),
      canvas,
      ctx,
      device,
      projectionMatrix: translate([0, 0, 0]),
      viewMatrix: translate([0, 0, 0]),
      canvasFormat: format,
      onResize<T>(cb: () => T): [T, () => void] {
        const value = cb();
        onResizeCallbacks.add(cb);
        return [
          value,
          () => {
            onResizeCallbacks.delete(cb);
          },
        ] as const;
      },
    };
  },
  renderUpdate({ state, scheduleTask }) {
    const { device, textures, fullscreenQuad } = state;
    // scheduleTask(
    //   () => {
    //     const commandEncoder = device.createCommandEncoder();
    //     const passEncoder = commandEncoder.beginRenderPass({
    //       colorAttachments: [
    //         {
    //           view: state.ctx.getCurrentTexture().createView(),
    //           clearValue: [0, 0, 0, 1],
    //           loadOp: "clear",
    //           storeOp: "store",
    //         },
    //       ],
    //     });
    //     passEncoder.setPipeline(lightingPipeline);
    //     passEncoder.setVertexBuffer(0, fullscreenQuad);
    //     passEncoder.setBindGroup(0, textures.lightingBindGroup);
    //     passEncoder.draw(6);
    //     passEncoder.end();
    //     device.queue.submit([commandEncoder.finish()]);
    //     return Promise.resolve();
    //   },
    //   [LIGHTING_PASS],
    //   [GBUFFER_PASS]
    // );

    scheduleTask(
      () => {
        runDofPositionToDepth({
          device,
          positionTex: textures.gbuffer.position.createView(),
          depthTex: textures.lighting.dofMinMaxDepthTextures[0].createView({
            mipLevelCount: 1,
            baseMipLevel: 0,
          }),
          pipeline: state.dofPositionToDepth.pipeline,
          inputDimensions: [state.canvas.width, state.canvas.height],
        });

        for (const i of range(6)) {
          const currMipLevel = i;
          const nextMipLevel = i + 1;

          runDofDownsample({
            device,
            colorTexIn: textures.lighting.dofColorTextures[0].createView({
              mipLevelCount: 1,
              baseMipLevel: currMipLevel,
            }),
            colorTexOut: textures.lighting.dofColorTextures[0].createView({
              mipLevelCount: 1,
              baseMipLevel: nextMipLevel,
            }),
            depthTexIn: textures.lighting.dofMinMaxDepthTextures[0].createView({
              mipLevelCount: 1,
              baseMipLevel: currMipLevel,
            }),
            depthTexOut: textures.lighting.dofMinMaxDepthTextures[0].createView(
              {
                mipLevelCount: 1,
                baseMipLevel: nextMipLevel,
              }
            ),
            pipeline: state.dofDownsample.pipeline,
            inputDimensions: [
              state.canvas.width / 2 ** currMipLevel,
              state.canvas.height / 2 ** currMipLevel,
            ],
          });
        }

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: state.ctx.getCurrentTexture().createView(),
              clearValue: [0, 0, 0, 1],
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });

        runDofShaderPipeline({
          device,
          dofPipeline: state.dofPipeline.dofPipeline,
          passEncoder,
          lightingTexture: state.textures.lighting.dofColorTextures[0],
          positionTexture: state.textures.lighting.dofMinMaxDepthTextures[0],
        });

        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);

        return Promise.resolve();
      },
      [],
      [LIGHTING_PASS, GBUFFER_PASS]
    );
  },
  brand: "sampleWebgpuRenderer" as const,
  dependencies: [] as const,
  globalDependencies: [MainCanvas] as const,
});
