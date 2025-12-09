import { createSimpleFilterPipeline, TextureFormat } from "./simple-filter";

export function fogEffect(device: GPUDevice) {
  return createSimpleFilterPipeline(device, {
    inputs: { color: {}, position: {} },
    outputs: { fogged: "rgba8unorm" },
    uniforms: { color: "vec3f", factor: "f32" },
    source: `
        fogged = mix(vec4(params.color,1.0),color, exp(-position.z * params.factor));
        `,
  });
}

export function blit(device: GPUDevice, outputFormat: TextureFormat) {
  return createSimpleFilterPipeline(device, {
    inputs: { x: {} },
    outputs: { y: outputFormat },
    source: "y = x;",
  });
}

export function maxFilter(device: GPUDevice) {
  return createSimpleFilterPipeline(device, {
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
  });
}
export function boxBlur(device: GPUDevice) {
  return createSimpleFilterPipeline(device, {
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
  });
}
