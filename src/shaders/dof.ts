// import DOFShaderJSON from "dof.wgsl";
import DOFShader from "./dof.wgsl?raw";
import DOFDownsampleShader from "./dof-downsample.wgsl?raw";
import PositionToDepth from "./position-to-depth.wgsl?raw";
import { Vec2 } from "r628";

export function createDofShaderPipeline(
  device: GPUDevice,
  canvasFormat: GPUTextureFormat
) {
  const dofBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        sampler: { type: "filtering" },
        visibility: GPUShaderStage.FRAGMENT,
      },
      {
        binding: 1,
        texture: { sampleType: "float", viewDimension: "2d" },
        visibility: GPUShaderStage.FRAGMENT,
      },
      {
        binding: 2,
        texture: { sampleType: "float", viewDimension: "2d" },
        visibility: GPUShaderStage.FRAGMENT,
      },
      {
        binding: 3,
        sampler: { type: "filtering" },
        visibility: GPUShaderStage.FRAGMENT,
      },
    ],
  });

  const dofPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [dofBindGroupLayout],
    }),
    vertex: {
      module: device.createShaderModule({
        code: DOFShader,
      }),
    },
    fragment: {
      module: device.createShaderModule({
        code: DOFShader,
      }),
      targets: [
        {
          format: canvasFormat,
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  return {
    dofBindGroupLayout,
    dofPipeline,
  };
}

export function runDofShaderPipeline(params: {
  device: GPUDevice;
  dofPipeline: GPURenderPipeline;
  passEncoder: GPURenderPassEncoder;
  lightingTexture: GPUTexture;
  positionTexture: GPUTexture;
}) {
  const { device, dofPipeline, passEncoder, lightingTexture, positionTexture } =
    params;
  passEncoder.setBindGroup(
    0,
    device.createBindGroup({
      layout: dofPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: device.createSampler({
            minFilter: "nearest",
            magFilter: "nearest",
          }),
        },
        {
          binding: 1,
          resource: lightingTexture,
        },
        {
          binding: 2,
          resource: positionTexture,
        },
        {
          binding: 3,
          resource: device.createSampler({
            minFilter: "linear",
            magFilter: "linear",
          }),
        },
      ],
    })
  );

  passEncoder.setPipeline(dofPipeline);
  passEncoder.draw(6);
}

export function createDofDownsampleShaderPipeline(device: GPUDevice) {
  const pipeline = device.createComputePipeline({
    compute: {
      module: device.createShaderModule({
        code: DOFDownsampleShader,
      }),
    },
    layout: "auto",
  });

  return {
    pipeline,
  };
}

export function createDofPositionToDepth(device: GPUDevice) {
  return {
    pipeline: device.createComputePipeline({
      compute: {
        module: device.createShaderModule({
          code: PositionToDepth,
        }),
      },
      layout: "auto",
    }),
  };
}

export function runDofPositionToDepth(params: {
  device: GPUDevice;
  positionTex: GPUTextureView;
  depthTex: GPUTextureView;
  pipeline: GPUComputePipeline;
  inputDimensions: Vec2;
}) {
  const { device, positionTex, depthTex, pipeline, inputDimensions } = params;

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(
    0,
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          resource: positionTex,
          binding: 0,
        },
        {
          resource: depthTex,
          binding: 1,
        },
      ],
    })
  );

  pass.dispatchWorkgroups(
    Math.floor(inputDimensions[0] / 8),
    Math.floor(inputDimensions[1] / 8)
  );
  pass.end();

  device.queue.submit([encoder.finish()]);
}

export function runDofDownsample(params: {
  device: GPUDevice;
  depthTexIn: GPUTextureView;
  colorTexIn: GPUTextureView;
  depthTexOut: GPUTextureView;
  colorTexOut: GPUTextureView;
  inputDimensions: Vec2;
  pipeline: GPUComputePipeline;
}) {
  const {
    device,
    depthTexIn,
    colorTexIn,
    depthTexOut,
    colorTexOut,
    pipeline,
    inputDimensions,
  } = params;

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(
    0,
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          resource: colorTexIn,
          binding: 0,
        },
        {
          resource: depthTexIn,
          binding: 1,
        },
        {
          resource: colorTexOut,
          binding: 2,
        },
        {
          resource: depthTexOut,
          binding: 3,
        },
      ],
    })
  );
  pass.dispatchWorkgroups(
    Math.floor(inputDimensions[0] / 8),
    Math.floor(inputDimensions[1] / 8)
  );
  pass.end();

  device.queue.submit([encoder.finish()]);
}
