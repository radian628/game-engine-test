import {
  cartesianProduct,
  download,
  makeUniformBuffer,
  Mat4,
  mulMat4,
  mulMat4ByVec4,
  range,
  scale,
  translate,
  Vec2,
  Vec3,
} from "r628";
import {
  createDofDownsampleShaderPipeline,
  createDofPositionToDepth,
  createDofShaderPipeline,
  runDofDownsample,
  runDofPositionToDepth,
  runDofShaderPipeline,
} from "../shaders/dof";
import { createKernelShaderPipeline } from "../shaders/kernel";
import { createSimpleFilterPipeline } from "../shaders/simple-filter";
import {
  blurFar,
  blurNear,
  generateMipmap,
  maskOutFar,
  maxFilterNear,
} from "../shaders/dof-post-effects";
import { inv4 } from "../matrix";
import { createComponent } from "../ecs2";

export const MainCanvas = createComponent({
  async init() {
    const canvas = document.createElement("canvas");
    canvas.style = `
top: 0;
left: 0;
position: absolute;
width: 100vw;
height: 100vh;    
`;
    canvas.width = 1024;
    canvas.height = 1024;
    document.body.appendChild(canvas);
    return {
      canvas,
    };
  },
});

export const GBUFFER_PASS = Symbol("GBuffer Pass");

export const GBUFFER_SUBMIT = Symbol("GBuffer Submit");

export const LIGHTING_PASS = Symbol("Lighting Pass");

function perspectiveWebgpu(
  fieldOfViewInRadians: number,
  aspectRatio: number,
  near: number,
  far: number
): Mat4 {
  const f = 1.0 / Math.tan(fieldOfViewInRadians / 2);
  const rangeInv = 1 / (near - far);

  return [
    f / aspectRatio,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    far * rangeInv,
    -1,
    0,
    0,
    near * far * rangeInv,
    0,
  ];
}

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
  const screenSizedTexture = (
    scaleFactor: number,
    format: GPUTextureFormat,
    mipLevelCount: number
  ) =>
    device.createTexture({
      size: dimensions.map((d) => Math.ceil(d * scaleFactor)),
      format,
      mipLevelCount,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING,
    });

  const color = screenSizedTexture(1, "rgba8unorm", 2);
  const color2 = screenSizedTexture(1, "rgba8unorm", 1);

  return {
    color,
    color2,
    depth: screenSizedTexture(1, "rg8unorm", 1),
    depth2: screenSizedTexture(1, "rg8unorm", 1),
    nearField: screenSizedTexture(1, "rgba8unorm", 1),
    nearField2: screenSizedTexture(1, "rgba8unorm", 1),
    farField: screenSizedTexture(1, "rgba8unorm", 1),
    farField2: screenSizedTexture(1, "rgba8unorm", 1),
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
    depth: GPUTexture;
    depth2: GPUTexture;
    color: GPUTexture;
    color2: GPUTexture;
    nearField: GPUTexture;
    nearField2: GPUTexture;
    farField: GPUTexture;
    farField2: GPUTexture;
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

function intervalInclusive(a: number, b: number): number[] {
  return range(b - a + 1).map((i) => i - a);
}

export const DeferredWebgpuRenderer = createComponent({
  async init({ compGlobal }) {
    const canvas = (await compGlobal(MainCanvas)).state.canvas;
    canvas.style.imageRendering = "pixelated";

    const ctx = canvas.getContext("webgpu");

    const adapter = await navigator.gpu.requestAdapter()!;
    const device = await adapter.requestDevice({
      requiredFeatures: ["float32-filterable"],
      requiredLimits: {},
    });

    const format = navigator.gpu.getPreferredCanvasFormat();

    ctx.configure({
      device,
      format,
    });

    const onResizeCallbacks = new Set<() => void>();

    function resize() {
      canvas.width = window.innerWidth * window.devicePixelRatio * 0.25;
      canvas.height = window.innerHeight * window.devicePixelRatio * 0.25;
      for (const cb of onResizeCallbacks) cb();
      ret.textures = maybeUpdateTextures(device, [canvas.width, canvas.height]);
    }

    window.addEventListener("resize", resize);

    const ret = {
      fullscreenQuad: fullscreenQuad2DBuffer(device),
      textures: maybeUpdateTextures(device, [canvas.width, canvas.height]),
      canvas,
      ctx,
      device,
      projectionMatrix: translate([0, 0, 0]),
      fov: 1,
      aspect: 1,
      near: 0.1,
      far: 100,
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
      gBufferRenderPass: undefined as GPURenderPassEncoder,
      time: 0,
    };

    resize();

    return ret;
  },

  async renderUpdate({ global, scheduleTask }) {
    const state = global.state;
    const { device, textures, fullscreenQuad } = state;

    state.projectionMatrix = perspectiveWebgpu(
      state.fov,
      window.innerWidth / window.innerHeight,
      state.near,
      state.far
    );

    const encoder = device.createCommandEncoder();
    const gbufferPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textures.gbuffer.position.createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: "clear",
          storeOp: "store",
        },
        {
          view: textures.gbuffer.normal.createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: "clear",
          storeOp: "store",
        },
        {
          view: textures.gbuffer.albedo.createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: textures.gbuffer.depth,
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    state.gBufferRenderPass = gbufferPass;

    scheduleTask(
      () => {
        gbufferPass.end();
        device.queue.submit([encoder.finish()]);
        return Promise.resolve();
      },
      [GBUFFER_SUBMIT],
      [GBUFFER_PASS]
    );
  },
});
