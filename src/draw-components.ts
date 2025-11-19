import { download, makeUniformBuffer, mulMat4, translate, Vec2 } from "r628";
import { specifyComponent } from "./ecs";
import SampleRenderer from "./sample-renderer.wgsl?raw";
import SampleRendererJSON from "sample-renderer.wgsl";
import { Transform } from "./transform-component";

import GBufferRenderer from "./gbuffer.wgsl?raw";
import GBufferRendererJSON from "gbuffer.wgsl";

import LightingRrenderer from "./lighting.wgsl?raw";
import LightingRendererJSON from "lighting.wgsl";

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

function createGBufferTextures(device: GPUDevice, dimensions: Vec2) {
  const albedo = device.createTexture({
    dimension: "2d",
    format: "rgba8unorm",
    label: "albedo",
    size: dimensions,
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const normal = device.createTexture({
    dimension: "2d",
    format: "rgba8unorm",
    label: "normal",
    size: dimensions,
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const position = device.createTexture({
    dimension: "2d",
    format: "rgba32float",
    label: "position",
    size: dimensions,
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  return { albedo, normal, position };
}

function createRenderTextures(device: GPUDevice, dimensions: Vec2) {
  const depth = device.createTexture({
    size: dimensions,
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  return { depth };
}

type DeferredPipelineTextures = {
  gbuffer: {
    albedo: GPUTexture;
    normal: GPUTexture;
    position: GPUTexture;
  };
  render: {
    depth: GPUTexture;
  };
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
  existing?: DeferredPipelineTextures
) {
  const outTextures = existing
    ? dimensions[0] === existing.dimensions[0] &&
      dimensions[1] === existing.dimensions[1]
      ? existing
      : undefined
    : undefined;

  if (outTextures) return outTextures;
  return {
    gbuffer: createGBufferTextures(device, dimensions),
    render: createRenderTextures(device, dimensions),
  };
}

function fullscreenQuad2DBuffer(device: GPUDevice) {
  return createBufferFromData(
    device,
    new Float32Array([-1, 1, 1, -1, -1, -1, 1, -1, -1, 1, 1, 1]),
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
    const device = await adapter.requestDevice();

    const format = navigator.gpu.getPreferredCanvasFormat();

    ctx.configure({
      device,
      format,
    });

    const depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const drawPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({
          code: SampleRenderer,
        }),
        buffers: [
          {
            arrayStride: 4 * 3,
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3",
              },
            ],
          },
          {
            arrayStride: 4 * 3,
            attributes: [
              {
                shaderLocation: 1,
                offset: 0,
                format: "float32x3",
              },
            ],
          },
        ],
      },
      fragment: {
        module: device.createShaderModule({
          code: SampleRenderer,
        }),
        targets: [{ format: format }],
      },
      primitive: {
        topology: "triangle-list",
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus",
      },
    });

    return {
      canvas,
      ctx,
      drawPipeline,
      device,
      depthTexture,
      projectionMatrix: translate([0, 0, 0]),
      viewMatrix: translate([0, 0, 0]),
    };
  },
  brand: "sampleWebgpuRenderer" as const,
  dependencies: [] as const,
  globalDependencies: [MainCanvas] as const,
});

export const SampleWebgpuRendererGeometry = specifyComponent({
  create(
    params: {
      vertexBuffer: GPUBuffer;
      normalBuffer: GPUBuffer;
      indexBuffer: GPUBuffer;
      indexFormat: "uint16" | "uint32";
      size: number;
    },
    { sampleWebgpuRenderer }
  ) {
    const { device } = sampleWebgpuRenderer.state;

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
      layout: sampleWebgpuRenderer.state.drawPipeline.getBindGroupLayout(0),
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
    };
  },
  renderUpdate({ state, instances, subsystem: subsystem }) {
    const {
      ctx,
      drawPipeline,
      device,
      depthTexture,
      viewMatrix,
      projectionMatrix,
    } = subsystem(SampleWebgpuRenderer).state;

    const commandEncoder = device.createCommandEncoder();

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: ctx!.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    for (const i of instances) {
      const buf = makeUniformBuffer<typeof GBufferRendererJSON, 0, 0>(
        GBufferRendererJSON,
        0,
        0,
        {
          mvp: mulMat4(
            projectionMatrix,
            mulMat4(viewMatrix, i.entity.transform.matrix)
          ),
        }
      );

      device.queue.writeBuffer(i.data.uniformBuffer, 0, buf);

      passEncoder.setPipeline(drawPipeline);
      passEncoder.setVertexBuffer(0, i.data.vertexBuffer);
      passEncoder.setVertexBuffer(1, i.data.normalBuffer);
      passEncoder.setIndexBuffer(i.data.indexBuffer, i.data.indexFormat);
      passEncoder.setBindGroup(0, i.data.bindGroup);
      passEncoder.drawIndexed(i.data.vertexCount);
    }
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
  },
  onDestroy() {},
  dependencies: [Transform] as const,
  globalDependencies: [SampleWebgpuRenderer] as const,
  brand: "sampleWebgpuRendererGeometry" as const,
  init() {},
});

export const Test = SampleRendererJSON;
