import { makeDelimitedReplacements } from "./string-utils";
import { WgslReflect } from "wgsl_reflect";

import SimpleFilterSource from "./simple-filter.wgsl?raw";
import {
  makeUniformBuffer,
  Mat2,
  Mat2x3,
  Mat2x4,
  Mat3,
  Mat3x2,
  Mat3x4,
  Mat4,
  Mat4x2,
  Mat4x3,
  Vec2,
  Vec3,
  Vec4,
} from "r628";

function createSimpleFilterShader(params: {
  textures: string;
  globals: string;
  outputStruct: string;
  fragmentBody: string;
}) {
  return makeDelimitedReplacements(SimpleFilterSource, [
    {
      delimiter: "/*TEXTURES*/",
      replaceWith: params.textures,
    },
    {
      delimiter: "/*GLOBALS*/",
      replaceWith: params.globals,
    },
    {
      delimiter: "/*OUTPUT_STRUCT*/",
      replaceWith: params.outputStruct,
    },
    {
      delimiter: "/*FRAGMENT_BODY*/",
      replaceWith: params.fragmentBody,
    },
  ]);
}

type SimpleFilterInputTextures = Record<
  string,
  {
    type?: "f32" | "i32" | "u32";
    dimensionality?: number;
    sampleWith?: number; // default to Sampler 0, if available
  }
>;

const TEXTURE_FORMAT_TO_WGSL_TYPE_LUT = {
  r8unorm: "f32",
  r8snorm: "f32",
  r8uint: "u32",
  r8sint: "i32",
  r16unorm: "u32",
  r16snorm: "i32",
  r16uint: "u32",
  r16sint: "i32",
  r16float: "f32",
  rg8unorm: "vec2f",
  rg8snorm: "vec2f",
  rg8uint: "vec2u",
  rg8sint: "vec2i",
  r32uint: "u32",
  r32sint: "i32",
  r32float: "f32",
  rg16unorm: "vec2f",
  rg16snorm: "vec2f",
  rg16uint: "vec2u",
  rg16sint: "vec2i",
  rg16float: "vec2f",
  rgba8unorm: "vec4f",
  "rgba8unorm-srgb": "vec4f",
  rgba8snorm: "vec4f",
  rgba8uint: "vec4u",
  rgba8sint: "vec4i",
  bgra8unorm: "vec4f",
  "bgra8unorm-srgb": "vec4f",
  rgb9e5ufloat: "vec4f",
  rgb10a2uint: "vec4u",
  rgb10a2unorm: "vec4f",
  rg11b10ufloat: "vec4f",
  rg32uint: "vec2u",
  rg32sint: "vec2i",
  rg32float: "vec2f",
  rgba16unorm: "vec4u",
  rgba16snorm: "vec4i",
  rgba16uint: "vec4u",
  rgba16sint: "vec4i",
  rgba16float: "vec4f",
  rgba32uint: "vec4u",
  rgba32sint: "vec4i",
  rgba32float: "vec4f",
  //  "stencil8"
  //  "depth16unorm"
  //  "depth24plus"
  //  "depth24plus-stencil8"
  // "depth32float"
  // "depth32float-stencil8"
  //  "bc1-rgba-unorm"
  //  "bc1-rgba-unorm-srgb"
  //  "bc2-rgba-unorm"
  //  "bc2-rgba-unorm-srgb"
  //  "bc3-rgba-unorm"
  //  "bc3-rgba-unorm-srgb"
  //  "bc4-r-unorm"
  //  "bc4-r-snorm"
  //  "bc5-rg-unorm"
  //  "bc5-rg-snorm"
  //  "bc6h-rgb-ufloat"
  //  "bc6h-rgb-float"
  //  "bc7-rgba-unorm"
  //  "bc7-rgba-unorm-srgb"
  //  "etc2-rgb8unorm"
  //  "etc2-rgb8unorm-srgb"
  //  "etc2-rgb8a1unorm"
  //  "etc2-rgb8a1unorm-srgb"
  //  "etc2-rgba8unorm"
  //  "etc2-rgba8unorm-srgb"
  //  "eac-r11unorm"
  //  "eac-r11snorm"
  //  "eac-rg11unorm"
  //  "eac-rg11snorm"
  //  "astc-4x4-unorm"
  //  "astc-4x4-unorm-srgb"
  //  "astc-5x4-unorm"
  //  "astc-5x4-unorm-srgb"
  //  "astc-5x5-unorm"
  //  "astc-5x5-unorm-srgb"
  //  "astc-6x5-unorm"
  //  "astc-6x5-unorm-srgb"
  //  "astc-6x6-unorm"
  //  "astc-6x6-unorm-srgb"
  //  "astc-8x5-unorm"
  //  "astc-8x5-unorm-srgb"
  //  "astc-8x6-unorm"
  //  "astc-8x6-unorm-srgb"
  //  "astc-8x8-unorm"
  //  "astc-8x8-unorm-srgb"
  //  "astc-10x5-unorm"
  //  "astc-10x5-unorm-srgb"
  //  "astc-10x6-unorm"
  //  "astc-10x6-unorm-srgb"
  //  "astc-10x8-unorm"
  //  "astc-10x8-unorm-srgb"
  //  "astc-10x10-unorm"
  //  "astc-10x10-unorm-srgb"
  //  "astc-12x10-unorm"
  //  "astc-12x10-unorm-srgb"
  //  "astc-12x12-unorm"
  // "astc-12x12-unorm-srgb";
} as const;

type SimpleFilterOutputTextures = Record<
  string,
  keyof typeof TEXTURE_FORMAT_TO_WGSL_TYPE_LUT
>;

type SimpleFilterSamplers = GPUSamplerDescriptor[];

type WebGPUPrimitiveBase<T extends string, S extends string> =
  | `vec${S}${T}`
  | `${T}32`
  | `mat${S}x${S}f`
  | `mat${S}`;

type WebGPUPrimitive = WebGPUPrimitiveBase<"f" | "i" | "u", "2" | "3" | "4">;

export type UniformParameters = Record<string, WebGPUPrimitive>;
type UniformParameterValues<T extends UniformParameters> = {
  [K in keyof T]: ParseUniformPrimitive<T[K]>;
};

type WithGPUBackedBuffer = {
  gpuBuffer: GPUBuffer;
};

type ParseUniformPrimitive<T extends string> = T extends `mat2x2${string}`
  ? Mat2
  : T extends `mat3x3${string}`
    ? Mat3
    : T extends `mat4x4${string}`
      ? Mat4
      : T extends `mat3x4${string}`
        ? Mat3x4
        : T extends `mat4x3${string}`
          ? Mat4x3
          : T extends `mat2x4${string}`
            ? Mat2x4
            : T extends `mat4x2${string}`
              ? Mat4x2
              : T extends `mat2x3${string}`
                ? Mat2x3
                : T extends `mat3x2${string}`
                  ? Mat3x2
                  : T extends `mat2${string}`
                    ? Mat2
                    : T extends `mat3${string}`
                      ? Mat3
                      : T extends `mat4${string}`
                        ? Mat4
                        : T extends `vec4${string}`
                          ? Vec4
                          : T extends `vec3${string}`
                            ? Vec3
                            : T extends `vec2${string}`
                              ? Vec2
                              : number;

export function createSimpleFilterPipeline<
  Inputs extends SimpleFilterInputTextures,
  Outputs extends SimpleFilterOutputTextures,
  Samplers extends SimpleFilterSamplers,
  Uniforms extends UniformParameters,
>(
  device: GPUDevice,
  spec: {
    inputs: Inputs;
    outputs: Outputs;
    samplers?: Samplers;
    source: string;
    globals?: string;
    uniforms?: Uniforms;
  }
) {
  let fragmentBody = "";

  let bindings = "";

  let bindingIndex = 0;

  const samplers: GPUSampler[] = [];

  for (const s of spec.samplers ?? [{}]) {
    bindings += `@group(0) @binding(${bindingIndex})
var sampler${bindingIndex}: sampler;\n`;
    samplers.push(device.createSampler(s));
    bindingIndex++;
  }

  bindingIndex = 0;

  const nameToInputMap = new Map<string, number>();
  const nameToOutputMap = new Map<string, number>();

  const inputEntries = Object.entries(spec.inputs);

  for (const [name, value] of inputEntries) {
    bindings += `@group(1) @binding(${bindingIndex}) 
var tex_${name}: texture_${value.dimensionality ?? "2d"}<${value.type ?? "f32"}>;`;
    nameToInputMap.set(name, bindingIndex);
    fragmentBody += `  var ${name} = textureSample(tex_${name}, sampler${value.sampleWith ?? 0}, uv);\n`;
    bindingIndex++;
  }

  let outputStruct = "";

  let outputBindingIndex = 0;

  for (const [name, value] of Object.entries(spec.outputs)) {
    outputStruct += `  @location(${outputBindingIndex}) ${name}: ${TEXTURE_FORMAT_TO_WGSL_TYPE_LUT[value]},\n`;
    nameToOutputMap.set(name, outputBindingIndex);
    fragmentBody += `  var ${name}: ${TEXTURE_FORMAT_TO_WGSL_TYPE_LUT[value]};\n`;
    outputBindingIndex++;
  }

  fragmentBody += spec.source;

  fragmentBody += `\n  var OUTPUT: Output;\n`;

  const outputsEntries = Object.entries(spec.outputs);

  for (const [name, value] of outputsEntries) {
    fragmentBody += `  OUTPUT.${name} = ${name};\n`;
  }

  fragmentBody += "return OUTPUT;";

  let globals = "";

  globals += spec.globals ?? "";

  if (spec.uniforms) {
    globals += `@group(2) @binding(0) var<uniform> params : Params;
struct Params {\n`;

    for (const [uniformName, uniformType] of Object.entries(
      spec.uniforms ?? {}
    )) {
      globals += `  ${uniformName}: ${uniformType},\n`;
    }

    globals += "}";
  }

  const shaderSource = createSimpleFilterShader({
    textures: bindings,
    globals: globals,
    outputStruct,
    fragmentBody,
  });

  // console.log(shaderSource);

  const reflect = new WgslReflect(shaderSource);

  const reflectBindGroups = reflect.getBindGroups();

  const module = device.createShaderModule({
    code: shaderSource,
  });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module },
    fragment: {
      module,
      targets: outputsEntries.map(([name, value]) => ({
        format: value,
      })),
    },
  });

  const samplerBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: samplers.map((s, i) => ({
      resource: s,
      binding: i,
    })),
  });

  return {
    pipeline,
    makeUniformBuffer() {
      const buffer = device.createBuffer({
        size: 1024,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(2),
        entries: [
          {
            resource: buffer,
            binding: 0,
          },
        ],
      });

      const ret = {
        buffer,
        bindGroup,
        setBuffer(values: UniformParameterValues<Uniforms>) {
          const buf = makeUniformBuffer(
            {
              bindGroups: reflectBindGroups,
            },
            2,
            0,
            // @ts-expect-error
            values
          );
          device.queue.writeBuffer(buffer, 0, buf);
          return ret;
        },
      };

      return ret;
    },
    withInputs(inputs: {
      [K in keyof Inputs]: GPUTextureView;
    }) {
      const inputTextureBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(1),
        entries: inputEntries.map(([name, value], i) => ({
          resource: inputs[name],
          binding: i,
        })),
      });

      return (
          uniforms: keyof Uniforms extends never
            ? undefined
            : { bindGroup: GPUBindGroup }
        ) =>
        (
          encoder: GPUCommandEncoder,
          outputs: {
            [K in keyof Outputs]: GPUTextureView | GPURenderPassColorAttachment;
          },
          samplers?: GPUSampler[]
        ) => {
          const pass = encoder.beginRenderPass({
            colorAttachments: outputsEntries.map(([name, value]) =>
              outputs[name] instanceof GPUTextureView
                ? {
                    view: outputs[name],
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store",
                  }
                : outputs[name]
            ),
          });

          pass.setPipeline(pipeline);

          pass.setBindGroup(0, samplerBindGroup);

          pass.setBindGroup(1, inputTextureBindGroup);

          if (uniforms) pass.setBindGroup(2, uniforms.bindGroup);

          pass.draw(6);

          pass.end();
        };
    },
  };
}
