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
  const screenSizedTexture = (scaleFactor: number, format: GPUTextureFormat) =>
    device.createTexture({
      size: dimensions.map((d) => Math.ceil(d * scaleFactor)),
      format,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING,
    });

  const color = screenSizedTexture(1, "rgba8unorm");
  const color2 = screenSizedTexture(1, "rgba8unorm");

  return {
    color,
    color2,
    depth: screenSizedTexture(1, "rg8unorm"),
    depth2: screenSizedTexture(1, "rg8unorm"),
    nearField: screenSizedTexture(1, "rgba8unorm"),
    nearField2: screenSizedTexture(1, "rgba8unorm"),
    farField: screenSizedTexture(1, "rgba8unorm"),
    farField2: screenSizedTexture(1, "rgba8unorm"),
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
      blit: createSimpleFilterPipeline(device, {
        inputs: { x: {} },
        outputs: { y: "rgba8unorm" },
        source: "y = x;",
      }),

      blitToCanvas: createSimpleFilterPipeline(device, {
        inputs: { x: {} },
        outputs: { y: format as "bgra8unorm" },
        source: "y = x;",
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
        blurred = vec2f(0.0, depth.y);
        var size = vec2f(textureDimensions(tex_depth).xy);
        for (var y = -params.dims.y; y < params.dims.y + 1.0; y += 1.0) {
          for (var x = -params.dims.x; x < params.dims.x + 1.0; x += 1.0) {
            blurred.x = max(
              blurred.x,
              textureSample(tex_depth, sampler0, uv + vec2f(x, y) / size).x
            );
          }
        }
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

      applyDofDepthMask: createSimpleFilterPipeline(device, {
        inputs: {
          color: {},
          depth: {},
        },
        uniforms: {
          dims: "vec2f",
          step: "vec2f",
        },
        outputs: {
          // combined: "rgba8unorm",
          near_field_out: "rgba8unorm",
          far_field_out: "rgba8unorm",
        },
        globals: `const OFFSETS = array(${range(90)
          .map((i) => {
            const angle = i * 2.4;
            const r = Math.sqrt(i);
            const rNext = Math.sqrt(i + 1);
            return `vec4f(${Math.cos(angle) * r}, ${Math.sin(angle) * r}, ${r}, ${rNext})`;
          })
          .join(", \n")});`,
        source: `
        let sample_count = (params.dims.x * 2.0 + 1.0) * (params.dims.y * 2.0 + 1.0);

        var far_field = vec4(0.0); 
        var near_field = vec4(0.0); 

        var far_factor = 0.0;
        var near_factor = 0.0;

        var size = vec2f(textureDimensions(tex_depth).xy);

        for (var i = 0; i < 90; i++) {
            let offset = OFFSETS[i];
            let uv2 = uv + offset.xy / size * params.step;

            let d = textureSample(tex_depth, sampler0, uv2);
            let pixel = textureSample(tex_color, sampler0, uv2);

            let maxdist = sqrt(89.0);

            let distance_factor = offset.z / maxdist;
            let distance_factor_next = offset.w / maxdist;

            var opacity_near = mix(
              0.0, 
              min(1.0 / (pow((d.x * maxdist), 2.0)), 1.0), 
              clamp(
                (d.x - distance_factor) / (distance_factor_next - distance_factor),
                0.0, 1.0 
              ) 
            );

            let opacity_far = select(0.0, 
              clamp(depth.y - d.y + 0.6, 0.0, 1.0) 
            , distance_factor < d.y 
            );

            near_factor += opacity_near;
            far_factor += opacity_far;

            let near_pixel = pixel * opacity_near;
            let far_pixel = pow(pixel * opacity_far, vec4f(1.0));

            near_field += near_pixel;
            far_field += far_pixel;
      }

        far_field /= far_factor + 0.001;

        

        near_field_out = near_field;

        if (depth.x > 0.0 && depth.x < 0.1) {
          near_field_out = mix(color, near_field, depth.x * 1.0);
        }

        far_field_out = far_field ;
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

        const nearThreshold = 10;
        const focus = 20;
        const farThreshold = 40;

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
          })
        )(commandEncoder, {
          combined: textures.lighting.depth.createView(),
        });

        // state.depthMaskMaxFilter.withInputs({
        //   depth: textures.lighting.depth.createView(),
        // })(
        //   state.depthMaskMaxFilter.makeUniformBuffer().setBuffer({
        //     dims: [1, 1],
        //   })
        // )(commandEncoder, {
        //   blurred: textures.lighting.depth2.createView(),
        // });

        state.applyDofDepthMask.withInputs({
          depth: textures.lighting.depth.createView(),
          color: textures.lighting.color.createView(),
        })(
          state.applyDofDepthMask.makeUniformBuffer().setBuffer({
            dims: [12, 12],
            step: [1, 1],
          })
        )(commandEncoder, {
          // combined: textures.lighting.color2.createView(),
          near_field_out: textures.lighting.nearField.createView(),
          far_field_out: textures.lighting.farField.createView(),
        });

        fastFarFieldMaxFilter(
          textures.lighting.farField,
          textures.lighting.farField2,
          [3, 3],
          [3, 3]
        );

        // state.blit.withInputs({
        //   x: textures.lighting.depth2.createView(),
        // })(undefined)(commandEncoder, {
        //   y: textures.lighting.color.createView(),
        // });

        state.mixBlend.withInputs({
          bottom: textures.lighting.farField.createView(),
          top: textures.lighting.nearField.createView(),
        })(undefined)(commandEncoder, {
          combined: textures.lighting.color2.createView(),
        });

        state.blitToCanvas.withInputs({
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
