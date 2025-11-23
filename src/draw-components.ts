import {
  cartesianProduct,
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
import { createKernelShaderPipeline } from "./shaders/kernel";
import { createSimpleFilterPipeline } from "./shaders/simple-filter";

export const MainCanvas = specifyComponent({
  create() {
    return undefined;
  },
  onDestroy() {},
  async init() {
    const canvas = document.createElement("canvas");
    canvas.width = 2560;
    canvas.height = 1440;
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

  const screenSizedColorTexture = (scaleFactor: number = 1) =>
    device.createTexture({
      size: dimensions.map((d) => Math.ceil(d * scaleFactor)),
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING,
    });

  const color2 = screenSizedColorTexture();

  return {
    color,
    color2,
    nearField: screenSizedColorTexture(2),
    nearField2: screenSizedColorTexture(2),
    farField: screenSizedColorTexture(2),
    farField2: screenSizedColorTexture(2),
    depth: device.createTexture({
      size: dimensions,
      format: "rg32float",
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING,
      mipLevelCount: 7,
    }),
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
      blit: createSimpleFilterPipeline(device, {
        inputs: { x: {} },
        outputs: { y: format as "bgra8unorm" },
        source: "y = x;",
      }),

      nearFieldDepthMask: createSimpleFilterPipeline(device, {
        inputs: {
          color: {},
          depth: {},
        },
        uniforms: {
          m: "f32",
          b: "f32",
        },
        outputs: { near_field: "rgba8unorm" },
        source: `near_field = 
          vec4f(color.rgb, params.m * depth.x + params.b);
        `,
      }),

      farFieldDepthMask: createSimpleFilterPipeline(device, {
        inputs: {
          color: {},
          depth: {},
        },
        uniforms: {
          m: "f32",
          b: "f32",
        },
        outputs: { far_field: "rgba8unorm" },
        source: `far_field = mix(
          vec4f(0.0, 0.0, 0.0, 1.0),
          color,
          clamp(
            params.m * depth.x + params.b, 
            0.0, 1.0)
        );`,
      }),

      maxFilter: createSimpleFilterPipeline(device, {
        inputs: { color: {} },
        uniforms: {
          dims: "vec2f",
        },
        outputs: { blurred: "rgba8unorm" },
        source: `
        blurred = vec4f(0.0, 0.0, 0.0, 0.0);
        var size = vec2f(textureDimensions(tex_color).xy);
        for (var y = -params.dims.y; y < params.dims.y + 1.0; y += 1.0) {
          for (var x = -params.dims.x; x < params.dims.x + 1.0; x += 1.0) {
            blurred = max(
              blurred,
              textureSample(tex_color, sampler0, uv + vec2f(x, y) / size)
            );
          } 
        } 
        `,
      }),

      boxBlur: createSimpleFilterPipeline(device, {
        inputs: { color: {} },
        uniforms: {
          dims: "vec2f",
        },
        outputs: { blurred: "rgba8unorm" },
        source: `
        blurred = vec4f(0.0, 0.0, 0.0, 0.0);
        var size = vec2f(textureDimensions(tex_color).xy);
        let sample_count =
          vec4f(
            (params.dims.x * 2.0 + 1.0) * (params.dims.y * 2.0 + 1.0)
          );
        for (var y = -params.dims.y; y < params.dims.y + 1.0; y += 1.0) {
          for (var x = -params.dims.x; x < params.dims.x + 1.0; x += 1.0) {
            blurred = 
              blurred + textureSample(tex_color, sampler0, uv + vec2f(x, y) / size);
          } 
        } 
        blurred = blurred / sample_count; 
        `,
      }),

      dofBlend: createSimpleFilterPipeline(device, {
        inputs: {
          color: {},
          near_field: {},
          far_field: {},
          depth: {},
        },
        uniforms: {
          near_threshold: "f32",
          focus: "f32",
          far_threshold: "f32",
        },
        outputs: { combined: "rgba8unorm" },
        source: `
          let factor = clamp(select(
            (depth.x - params.near_threshold) / (params.focus - params.near_threshold),
            (depth.x - params.focus) / (params.far_threshold - params.focus),
            depth.x > params.focus
          ), 0.0, 1.0);

          var opaque_near_field = near_field;
          opaque_near_field.a = 1.0;

          combined = 
          mix(
          select(
            color,
            mix(color, far_field, factor),
            depth.x > params.focus
          ), opaque_near_field, near_field.a);
          
        `,
      }),

      generateDofDepthMask: createSimpleFilterPipeline(device, {
        inputs: {
          position: {},
        },
        uniforms: {
          near_threshold: "f32",
          focus: "f32",
          far_threshold: "f32",
        },
        outputs: {
          combined: "rg8unorm",
        },
        source: `
          let depth = position.z;
          combined = vec2f(
            1.0 - (depth - params.near_threshold) / (params.focus - params.near_threshold),
            -(params.focus - depth) / (params.far_threshold - params.focus)
          );
        `,
      }),

      depthMaskMaxFilter: createSimpleFilterPipeline(device, {
        inputs: {
          depth: {},
        },
        uniforms: {
          dims: "vec2f",
        },
        outputs: {
          blurred: "rg8unorm",
        },
        source: `
        blurred = vec2f(0.0, 0.0);
        var size = vec2f(textureDimensions(tex_color).xy);
        for (var y = -params.dims.y; y < params.dims.y + 1.0; y += 1.0) {
          for (var x = -params.dims.x; x < params.dims.x + 1.0; x += 1.0) {
            blurred = max(
              blurred,
              textureSample(tex_color, sampler0, uv + vec2f(x, y) / size)
            );
          } 
        } 
        `,
      }),

      maxKernel: createKernelShaderPipeline(
        device,
        {
          accumulate: "max(acc, curr)",
          convert: "acc",
          kernel: cartesianProduct(
            intervalInclusive(-2, 2),
            intervalInclusive(-2, 2)
          ).map(([x, y]) => `vec2f(${x}, ${y})`),
          initial: "vec4f(0.0)",
        },
        format
      ),

      verticalBoxBlur: createKernelShaderPipeline(
        device,
        {
          accumulate: "acc + curr",
          convert: "acc / 41.0",
          // accumulate: "max(acc, curr)",
          // convert: "acc",
          kernel: cartesianProduct(
            intervalInclusive(0, 0),
            intervalInclusive(-20, 20)
          ).map(([x, y]) => `vec2f(${y}, ${y})`),
          initial: "vec4f(0.0)",
        },
        "rgba8unorm"
      ),
      horizontalBoxBlur: createKernelShaderPipeline(
        device,
        {
          accumulate: "acc + curr",
          convert: "acc / 41.0",
          // accumulate: "max(acc, curr)",
          // convert: "acc",
          kernel: cartesianProduct(
            intervalInclusive(-20, 20),
            intervalInclusive(0, 0)
          ).map(([x, y]) => `vec2f(${x}, ${-x})`),
          initial: "vec4f(0.0)",
        },
        "rgba8unorm"
      ),
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

    scheduleTask(
      () => {
        runDofPositionToDepth({
          device,
          positionTex: textures.gbuffer.position.createView(),
          depthTex: textures.lighting.depth.createView({
            mipLevelCount: 1,
            baseMipLevel: 0,
          }),
          pipeline: state.dofPositionToDepth.pipeline,
          inputDimensions: [state.canvas.width, state.canvas.height],
        });

        const commandEncoder = device.createCommandEncoder();

        function fastBoxBlur(input: GPUTexture, temp: GPUTexture, dims: Vec2) {
          state.boxBlur.withInputs({
            color: input.createView(),
          })(
            state.boxBlur.makeUniformBuffer().setBuffer({
              dims: [dims[0], 0],
            })
          )(commandEncoder, {
            blurred: temp.createView(),
          });

          state.boxBlur.withInputs({
            color: temp.createView(),
          })(
            state.boxBlur.makeUniformBuffer().setBuffer({
              dims: [0, dims[1]],
            })
          )(commandEncoder, {
            blurred: input.createView(),
          });
        }

        function fastMaxFilter(
          input: GPUTexture,
          temp: GPUTexture,
          dims: Vec2
        ) {
          state.maxFilter.withInputs({
            color: input.createView(),
          })(
            state.maxFilter.makeUniformBuffer().setBuffer({
              dims: [dims[0], 0],
            })
          )(commandEncoder, {
            blurred: temp.createView(),
          });

          state.maxFilter.withInputs({
            color: temp.createView(),
          })(
            state.maxFilter.makeUniformBuffer().setBuffer({
              dims: [0, dims[1]],
            })
          )(commandEncoder, {
            blurred: input.createView(),
          });
        }

        const nearThreshold = 8;
        const focus = 10;
        const farThreshold = 12;

        const farM = 1 / (farThreshold - focus);
        const farB = -focus * farM;

        const nearM = -1 / (focus - nearThreshold);
        const nearB = -nearThreshold * nearM + 1;

        console.log(nearM, nearB);

        state.farFieldDepthMask.withInputs({
          color: textures.lighting.color.createView(),
          depth: textures.lighting.depth.createView(),
        })(
          state.farFieldDepthMask.makeUniformBuffer().setBuffer({
            m: farM,
            b: farB,
          })
        )(commandEncoder, {
          far_field: textures.lighting.farField.createView(),
        });

        fastMaxFilter(
          textures.lighting.farField,
          textures.lighting.farField2,
          [20, 20]
        );

        fastBoxBlur(
          textures.lighting.farField,
          textures.lighting.farField2,
          [5, 5]
        );

        state.nearFieldDepthMask.withInputs({
          color: textures.lighting.color.createView(),
          depth: textures.lighting.depth.createView(),
        })(
          state.nearFieldDepthMask.makeUniformBuffer().setBuffer({
            m: nearM,
            b: nearB,
          })
        )(commandEncoder, {
          near_field: textures.lighting.nearField.createView(),
        });

        fastMaxFilter(
          textures.lighting.nearField,
          textures.lighting.nearField2,
          [2, 2]
        );

        fastBoxBlur(
          textures.lighting.nearField,
          textures.lighting.nearField2,
          [5, 5]
        );

        state.dofBlend.withInputs({
          color: textures.lighting.color.createView(),
          depth: textures.lighting.depth.createView(),
          near_field: textures.lighting.nearField.createView(),
          far_field: textures.lighting.farField.createView(),
        })(
          state.dofBlend.makeUniformBuffer().setBuffer({
            near_threshold: nearThreshold,
            focus: focus,
            far_threshold: farThreshold,
          })
        )(commandEncoder, {
          combined: textures.lighting.color2.createView(),
        });

        state.blit.withInputs({
          x: textures.lighting.color2.createView(),
        })(undefined)(commandEncoder, {
          y: state.ctx.getCurrentTexture().createView(),
        });

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
