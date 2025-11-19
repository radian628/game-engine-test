struct LightingVertInput {
  @location(0) sample_pos: vec2f,
}

struct LightingFragInput {
  @builtin(position) vertex_position : vec4f,
  @location(0) tex_pos: vec2f,
}

struct LightingFragOutput {
  @location(0) color : vec4f,
}

@group(0) @binding(0) var<uniform> tex_sampler : sampler;
@group(0) @binding(1) var<uniform> tex_pos : texture_2d<vec4f>;
@group(0) @binding(2) var<uniform> tex_normal : texture_2d<vec4f>;
@group(0) @binding(3) var<uniform> tex_albedo : texture_2d<vec4f>;


@vertex
fn VSMain(input: GBufferVertInput) -> GBufferFragInput {
  var frag: LightingFragInput;
  frag.tex_pos = input.sample_pos * 0.5 + 0.5;
  frag.vertex_position = input.sample_pos;
  return frag;
}

@fragment
fn FSMain(input: LightingFragInput) -> LightingFragOutput {
  var o: LightingFragOutput;
  o.color = textureSample(tex_normal, tex_sampler, input.tex_pos); 
  return o;
} 