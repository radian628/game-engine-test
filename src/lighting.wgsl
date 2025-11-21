struct LightingVertInput {
  @location(0) sample_pos: vec3f,
}

struct LightingFragInput {
  @builtin(position) vertex_position : vec4f,
  @location(0) tex_pos: vec2f,
}

struct LightingFragOutput {
  @location(0) color : vec4f,
}

@group(0) @binding(0) var tex_sampler : sampler;
@group(0) @binding(1) var tex_pos : texture_2d<f32>;
@group(0) @binding(2) var tex_normal : texture_2d<f32>;
@group(0) @binding(3) var tex_albedo : texture_2d<f32>;

struct Params {
  mvp: mat4x4f,
  light_pos: vec4f,
  light_color: vec3f,
  quadratic: f32,
  linear: f32,
  constant: f32,
  cutoff_radius: f32,
}

@group(1) @binding(0) var<uniform> params : Params;

@vertex
fn VSMain(input: LightingVertInput) -> LightingFragInput {
  var frag: LightingFragInput;
  var pos = params.mvp * vec4(input.sample_pos, 1.0);
  frag.tex_pos = (pos.xy / pos.w) * 0.5 + 0.5;
  frag.tex_pos.y = 1.0 - frag.tex_pos.y;
  frag.vertex_position = pos;
  return frag;
}

@fragment
fn FSMain(input: LightingFragInput) -> LightingFragOutput {
  var o: LightingFragOutput;
  // _ = tex_pos;
  // _ = tex_albedo;
  // _ = tex_normal;

  

  let albedo = textureSample(tex_albedo, tex_sampler, input.tex_pos);
  let pos = textureSample(tex_pos, tex_sampler, input.tex_pos);
  let normal = textureSample(tex_normal, tex_sampler, input.tex_pos);

  let vec_to_light = params.light_pos.xyz - pos.xyz;
  let dist_to_light = length(vec_to_light);
  let dir_to_light = vec_to_light / dist_to_light;

  let attenuation = 
    params.quadratic * dist_to_light * dist_to_light
    + params.linear * dist_to_light
    + params.constant;

  var brightness = 1.0 / attenuation;

  brightness = brightness * min(
    1.0, 
    3.0 * (1.0 - dist_to_light / params.cutoff_radius)
  );

  o.color = (albedo * brightness * max(dot(
    normal.xyz,
    dir_to_light
  ), 0.0));

  o.color = max(o.color, vec4f(0.0));

  o.color.a = 1.0;

  o.color = pow(o.color, vec4(1 / 2.2));

  return o;
} 