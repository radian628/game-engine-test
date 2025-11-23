import KernelSourceCode from "./kernel.wgsl?raw";
import { makeDelimitedReplacements } from "./string-utils";

function substituteKernelSourceRaw(props: {
  paste: string;
  outLocation: string;
  outType: string;
  body: string;
}) {
  return makeDelimitedReplacements(KernelSourceCode, [
    {
      start: "/*PASTE_START*/",
      end: "/*PASTE_END*/",
      replaceWith: props.paste,
    },
    {
      start: "/*OUT_LOCATION*/",
      end: "/*OUT_LOCATION*/",
      replaceWith: props.outLocation,
    },
    {
      start: "/*OUT_TYPE*/",
      end: "/*OUT_TYPE*/",
      replaceWith: props.outType,
    },
    {
      start: "/*BODY_START*/",
      end: "/*BODY_END*/",
      replaceWith: props.body,
    },
  ]);
}

type KernelShaderParams = {
  accumulate: string;
  convert: string;
  kernel: string[];
  initial: string;
  kernelType?: string;
  accumulatorType?: string;
  outType?: string;
  extraGlobal?: string;
  extraInMain?: string;
  outLocation?: string;
};

function substituteKernelSource(props: KernelShaderParams) {
  const outType = props.outType ?? "vec4f";
  const accumulatorType = props.accumulatorType ?? "vec4f";
  const kernelType = props.kernelType ?? "vec2f";
  const extraGlobal = props.extraGlobal ?? "";
  const extraInMain = props.extraInMain ?? "";
  const outLocation = props.outLocation ?? "@location(0)";

  return substituteKernelSourceRaw({
    paste: `${extraGlobal}const KERNEL = array(
  ${props.kernel.join(",\n  ")}
);

fn accumulate(acc: ${accumulatorType}, curr: vec4f, k: ${kernelType}) -> ${accumulatorType} {
  return ${props.accumulate};
}

fn convert(acc: vec4f) -> vec4f {
  return ${props.convert};
}`,
    outType,
    outLocation,
    body: `${extraInMain}  var acc = ${props.initial};
  let dims = vec2f(textureDimensions(tex_src, 0).xy);
  for (var i = 0; i < ${props.kernel.length}; i++) {
    let smpl = KERNEL[i];
    let uv2 = uv + smpl.xy / dims;
    let pixel = textureSample(tex_src, samp, uv2);
    acc = accumulate(acc, pixel, smpl);
  }`,
  });
}

export function createKernelShaderPipeline(
  device: GPUDevice,
  params: KernelShaderParams,
  targetFormat: GPUTextureFormat
) {
  const code = substituteKernelSource(params);
  const module = device.createShaderModule({
    code,
  });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module,
    },
    fragment: {
      module,
      targets: [
        {
          format: targetFormat,
        },
      ],
    },
  });

  return {
    pipeline,
    drawUsing(
      pass: GPURenderPassEncoder,
      sampler: GPUSampler,
      inputTex: GPUTextureView
    ) {
      pass.setPipeline(pipeline);
      pass.setBindGroup(
        0,
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            {
              binding: 0,
              resource: sampler,
            },
            {
              binding: 1,
              resource: inputTex,
            },
          ],
        })
      );
      pass.draw(6);
    },
  };
}
