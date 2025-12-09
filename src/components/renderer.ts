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
import { specifyComponent } from "../ecs";
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

export const GBUFFER_SUBMIT = Symbol("GBuffer Submit");

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
      fog: createSimpleFilterPipeline(device, {
        inputs: { color: {}, position: {} },
        outputs: { fogged: "rgba8unorm" },
        source: `
        fogged = mix(vec4(0.12,0.13,0.14,1.0),color, exp(position.z * -0.05));
        `,
      }),

      blit: createSimpleFilterPipeline(device, {
        inputs: { x: {} },
        outputs: { y: "rgba8unorm" },
        source: "y = x;",
      }),

      blitToCanvas: createSimpleFilterPipeline(device, {
        inputs: { x: {} },
        outputs: { y: format as "bgra8unorm" },
        source: "y = mix(vec4f(1.0,0.0,0.0,1.0), vec4f(x.rgb, 1.0), x.a);",
      }),

      finalComposite: createSimpleFilterPipeline(device, {
        inputs: { original: {}, blurred: {} },
        outputs: { y: format as "bgra8unorm" },
        source: `y = mix(original, blurred, blurred.a);
        y.a = 1.0;`,
      }),

      debugBlitToCanvas: createSimpleFilterPipeline(device, {
        inputs: { x: {} },
        outputs: { y: format as "bgra8unorm" },
        source: `
        y = x;
        y.a = 1.0;`,
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

      blurNear: blurNear(device),
      blurFar: blurFar(device),
      maxFilterNear: maxFilterNear(device),
      maskOutFar: maskOutFar(device),

      farFieldMaxFilter: createSimpleFilterPipeline(device, {
        inputs: { color: {} },
        uniforms: {
          dims: "vec2f",
          delta: "vec2f",
        },
        outputs: { blurred: "rgba8unorm" },
        source: `
        blurred = color; 
        var size = vec2f(textureDimensions(tex_color).xy);
        for (var y = -params.dims.y; y < params.dims.y + 1.0; y += 1.0) {
          for (var x = -params.dims.x; x < params.dims.x + 1.0; x += 1.0) {
            let smpl = textureSample(tex_color, sampler0, uv + vec2f(x, y) / size * params.delta);
            blurred = mix(max(
              blurred,
              smpl 
            ), blurred, color.a);
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

      generateDofDepthMask: createSimpleFilterPipeline(device, {
        inputs: {
          position: {},
        },
        uniforms: {
          inv_v: "mat4x4f",
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
            1.0 - (depth - params.near_threshold) / (params.focus - params.near_threshold) + 0.0 / 256.0,
            -(params.focus - depth) / (params.far_threshold - params.focus) + 0.0 / 256.0
          );
        `,
      }),

      mixBlend: createSimpleFilterPipeline(device, {
        inputs: {
          bottom: {},
          top: {},
        },
        outputs: {
          combined: "rgba8unorm",
        },
        source: `
          combined = mix(bottom, top, top.a); 
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

      generateMipmap: generateMipmap(device),

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
      gBufferRenderPass: undefined as GPURenderPassEncoder,
      // commandEncoder: undefined as GPUCommandEncoder,
      time: 0,
    };
  },
  renderUpdate({ state, scheduleTask }) {
    const { device, textures, fullscreenQuad } = state;

    const encoder = device.createCommandEncoder();
    // state.commandEncoder = encoder;
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

    // scheduleTask(
    //   () => {
    //     // console.log("after lighting");
    //     const encoder = device.createCommandEncoder();

    //     state.debugBlitToCanvas.withInputs({
    //       n: textures.gbuffer.normal.createView(),
    //       l: textures.lighting.color.createView(),
    //     })(undefined)(encoder, {
    //       y: state.ctx.getCurrentTexture().createView(),
    //     });

    //     device.queue.submit([encoder.finish()]);
    //     return Promise.resolve();
    //   },
    //   [],
    //   [LIGHTING_PASS]
    // );

    scheduleTask(
      () => {
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

        function fastFarFieldMaxFilter(
          input: GPUTexture,
          temp: GPUTexture,
          dims: Vec2,
          delta: Vec2
        ) {
          state.farFieldMaxFilter.withInputs({
            color: input.createView(),
          })(
            state.farFieldMaxFilter.makeUniformBuffer().setBuffer({
              dims: [dims[0], 0],
              delta,
            })
          )(commandEncoder, {
            blurred: temp.createView(),
          });

          state.farFieldMaxFilter.withInputs({
            color: temp.createView(),
          })(
            state.farFieldMaxFilter.makeUniformBuffer().setBuffer({
              dims: [0, dims[1]],
              delta,
            })
          )(commandEncoder, {
            blurred: input.createView(),
          });
        }

        state.time += 1 / 60;

        // const focus = Math.sin(state.time * 2) * 20 + 25;
        const focus = 10;
        const dofSize = 0.7;
        const nearThreshold = 0; // focus * (1 - dofSize);
        const farThreshold = focus * (1 + dofSize);

        const farM = 1 / (farThreshold - focus);
        const farB = -focus * farM;

        const nearM = -1 / (focus - nearThreshold);
        const nearB = -nearThreshold * nearM + 1;

        state.generateDofDepthMask.withInputs({
          position: textures.gbuffer.position.createView(),
        })(
          state.generateDofDepthMask.makeUniformBuffer().setBuffer({
            near_threshold: nearThreshold,
            focus: focus,
            far_threshold: farThreshold,
            inv_v: inv4(state.viewMatrix),
          })
        )(commandEncoder, {
          combined: textures.lighting.depth.createView(),
        });

        state.fog.withInputs({
          position: textures.gbuffer.position.createView(),
          color: textures.lighting.color.createView(),
        })(undefined)(commandEncoder, {
          fogged: textures.lighting.color2.createView(),
        });

        state.maskOutFar.withInputs({
          color: textures.lighting.color2.createView(),
          depth: textures.lighting.depth.createView(),
        })(undefined)(commandEncoder, {
          far_field: textures.lighting.farField.createView(),
        });

        const step: Vec2 = [1, 1];

        state.blurFar.withInputs({
          color: textures.lighting.farField.createView(),
          depth: textures.lighting.depth.createView(),
        })(state.blurFar.makeUniformBuffer().setBuffer({ step: [2, 2] }))(
          commandEncoder,
          {
            blurred: textures.lighting.farField2.createView(),
          }
        );

        state.maxFilterNear.withInputs({
          color: textures.lighting.color2.createView(),
          depth: textures.lighting.depth.createView(),
        })(state.maxFilterNear.makeUniformBuffer().setBuffer({ step: [0, 0] }))(
          commandEncoder,
          {
            blurred: textures.lighting.nearField2.createView({
              mipLevelCount: 1,
            }),
          }
        );

        // for (let [mip0, mip1] of [
        //   [0, 1],
        //   [1, 2],
        // ])
        //   state.generateMipmap.withInputs({
        //     x: textures.lighting.nearField2.createView({
        //       baseMipLevel: mip0,
        //       mipLevelCount: 1,
        //     }),
        //   })(undefined)(commandEncoder, {
        //     y: textures.lighting.nearField2.createView({
        //       baseMipLevel: mip1,
        //       mipLevelCount: 1,
        //     }),
        //   });

        // fastBoxBlur(
        //   textures.lighting.nearField2,
        //   textures.lighting.nearField,
        //   [6, 6]
        // );

        state.blurNear.withInputs({
          far: textures.lighting.farField2.createView(),
          near: textures.lighting.nearField2.createView(),
          depth: textures.lighting.depth.createView(),
          color: textures.lighting.color2.createView(),
        })(state.blurNear.makeUniformBuffer().setBuffer({ step }))(
          commandEncoder,
          {
            blurred: textures.lighting.color.createView({
              mipLevelCount: 1,
            }),
          }
        );

        // state.debugBlitToCanvas.withInputs({
        //   // original: textures.lighting.color2.createView(),
        //   // blurred: textures.lighting.color.createView(),
        //   x: textures.gbuffer.normal.createView(),
        // })(undefined)(commandEncoder, {
        //   y: state.ctx.getCurrentTexture().createView(),
        // });

        state.blitToCanvas.withInputs({
          x: textures.lighting.color.createView(),
        })(undefined)(commandEncoder, {
          y: state.ctx.getCurrentTexture().createView(),
        });

        device.queue.submit([commandEncoder.finish()]);

        return Promise.resolve();
      },
      [],
      [LIGHTING_PASS]
    );
  },
  brand: "sampleWebgpuRenderer" as const,
  dependencies: [] as const,
  globalDependencies: [MainCanvas] as const,
});
