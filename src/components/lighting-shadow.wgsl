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
  inv_vp: mat4x4f,
  m: mat4x4f,
  light_pos: vec4f,
  light_color: vec3f,
  quadratic: f32,
  linear: f32,
  constant: f32,
  cutoff_radius: f32,
}

@group(1) @binding(0) var<uniform> params : Params;
@group(1) @binding(1) var shadow_map : texture_depth_cube;

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
  let ipos = vec2i(input.vertex_position.xy);

  let albedo = textureSample(tex_albedo, tex_sampler, uv);
  let pos = params.inv_vp * textureSample(tex_pos, tex_sampler, uv);
  let normal = textureSample(tex_normal, tex_sampler, uv);

  let vec_to_light = (params.m * vec4f(0.0,0.0, 0.0, 1.0)).xyz - pos.xyz;
  let dist_to_light = length(vec_to_light);
  let dir_to_light = vec4f(vec_to_light / dist_to_light, 0.0).xyz;

  let attenuation = 
    params.quadratic * dist_to_light * dist_to_light
    + params.linear * dist_to_light
    + params.constant;

  let pixel_depth = dist_to_light ;
  let shadow_depth_raw = textureSample(shadow_map, tex_sampler, vec_to_light);


  let shadow_depth = remap(
    shadow_depth_raw,
    0.0,
    1.0,
    0.0,
    800.0
  );


  var brightness = select(0.0, 1.0 / attenuation + 0.3, pixel_depth < shadow_depth * 1.03);

  // brightness = 1.0 / attenuation + 0.3;

  brightness = brightness * min(
    1.0, 
    3.0 * (1.0 - dist_to_light / params.cutoff_radius)
  );

  let ignores_brightness = normal.x == 0.0 && normal.y == 0.0 && normal.z == 0.0;

  var brightness_factor = brightness * max(dot(
    normal.xyz,
    dir_to_light
  ), 0.0);

  if (ignores_brightness) {
    brightness_factor = brightness;
  }

  o.color = select(
    vec4f(0.0),
    albedo * vec4f(params.light_color, 1.0),
    dither256(brightness_factor, ipos) || ignores_brightness
  ) ;

  // o.color.r = select(0.0, 1.0, pixel_depth > 300.0); 
  // o.color.g = select(0.0, 1.0, shadow_depth > 300.0); 

  // o.color.b = 0.0;

  // o.color.r = select(0.0, 1.0, pixel_depth < shadow_depth);

  //  o.color.r = fract(shadow_depth * 800.0);

  // o.color.r = shadow_depth * 800.0 - 799.0;


//   let shadow_depth_debug = textureSample(shadow_map, tex_sampler, vec3f(
//     uv.x,
//     -1.0,
//     uv.y
//   ));
// o.color = vec4f(
//   // vec3f(fract(shadow_depth_debug * 1.0)),
//   fract(shadow_depth * 800.0),
//   0.0, 
//   0.0,
//   1.0
// );

  // o.color = debug_color(uv);

  return o;
} 

fn remap(x: f32, a1: f32, b1: f32, a2: f32, b2: f32) -> f32{
  let n = (x - a1) / ( b1 - a1);
  return (1 - n) * a2 + n * b2;
}

fn debug_color(uv: vec2f) -> vec4f {
  var texcoord = vec3f(0.0);
  if (uv.y > 0.5) {
    if (uv.x > 0.666) {
      texcoord = vec3f(
        1.0, 
        remap(uv.x, 0.666, 1.0, -1.0, 1.0),
        remap(uv.y, 0.5, 1.0, -1.0, 1.0),
      );
    } else if (uv.x > 0.333) {
      texcoord = vec3f(
        remap(uv.x, 0.333, 0.666, -1.0, 1.0),
        1.0, 
        remap(uv.y, 0.5, 1.0, -1.0, 1.0),
      );
    } else {

      texcoord = vec3f(
        1.0, 
        remap(uv.x, 0.0, 0.333, -1.0, 1.0),
        remap(uv.y, 0.5, 1.0, -1.0, 1.0),
      );
    }
  } else {
    if (uv.x > 0.666) {
      texcoord = vec3f(
        -1.0, 
        remap(uv.x, 0.666, 1.0, -1.0, 1.0),
        remap(uv.y, 0.0, 0.5, -1.0, 1.0),
      );
    } else if (uv.x > 0.333) {
      texcoord = vec3f(
        remap(uv.x, 0.333, 0.666, -1.0, 1.0),
        -1.0, 
        remap(uv.y, 0.0, 0.5, -1.0, 1.0),
      );
    } else {
      texcoord = vec3f(
        -1.0, 
        remap(uv.x, 0.0, 0.333, -1.0, 1.0),
        remap(uv.y, 0.0, 0.5, -1.0, 1.0),
      );
    }
  }

  let smpl = textureSample(shadow_map, tex_sampler, texcoord) ;

  return vec4f(
    vec3f((1.0 - smpl) , 0.0, 0.0),
    1.0
  );

}

//#include ./dither256.wgsl