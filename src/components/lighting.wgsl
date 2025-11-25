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
  vp: mat4x4f,
  m: mat4x4f,
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
  // var pos2 = params.vp * vec4(input.sample_pos, 1.0);
  frag.tex_pos = ((pos.xy ) / ((pos.w - 0.0) * 1.0)) * 0.5 + 0.5;
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
  let uv = input.vertex_position.xy / vec2f(textureDimensions(tex_pos).xy);
  


  let albedo = textureSample(tex_albedo, tex_sampler, uv);
  let pos = textureSample(tex_pos, tex_sampler, uv);
  let normal = textureSample(tex_normal, tex_sampler, uv);

  let vec_to_light = (params.m * vec4f(0.0,0.0, 0.0, 1.0)).xyz - pos.xyz;
  let dist_to_light = length(vec_to_light);
  let dir_to_light = vec4f(vec_to_light / dist_to_light, 0.0).xyz;

  let attenuation = 
    params.quadratic * dist_to_light * dist_to_light
    + params.linear * dist_to_light
    + params.constant;

  var brightness = 1.0 / attenuation + 0.3;

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

  // o.color = vec4f(dir_to_light.xyz * 0.5 + 0.5, 1.0);
  // o.color = vec4f(normal.xyz * 0.5 + 0.5, 1.0);
  o.color = vec4f(max(dot(
   normal.xyz,
   dir_to_light
  ), 0.0) * 1.0);
  
  o.color.a = 1.0;

  // o.color = vec4(1.0, 0.0, 0.0, 1.0);

  return o;
} 