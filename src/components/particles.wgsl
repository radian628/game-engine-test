struct ParticlesVertInput {
  @location(0) position: vec3f,
  @builtin(vertex_index) vindex : u32,
  //  @location(2) uv: vec2f,
}

struct ParticlesFragInput {
  @builtin(position) vertex_position: vec4f, 
  @location(0) pos: vec4f,
  // @location(1) normal: vec4f,
  @location(2) albedo: vec4f,
  @location(3) uv: vec2f,
}

struct ParticlesFragOutput {
  @location(0) pos: vec4f,
  @location(1) normal: vec4f,
  @location(2) albedo: vec4f,
}

struct Params {
  mvp: mat4x4f,
  draw_color: vec4f,
  scale: vec2f,
}

//#include ./dither256.wgsl

@group(0) @binding(0) var<uniform> params : Params;

@vertex
fn VSMain(input: ParticlesVertInput) -> ParticlesFragInput {
  var frag: ParticlesFragInput;

  let center = params.mvp * vec4f(input.position, 1.0);

  // frag.normal  = vec4(0.0);
  frag.albedo = params.draw_color;

  frag.pos = vec4(array(
    vec2( 1.0,  1.0),
    vec2( 1.0, -1.0), 
    vec2(-1.0, -1.0),
    vec2( 1.0,  1.0),
    vec2(-1.0, -1.0),
    vec2(-1.0,  1.0),
  )[input.vindex] * params.scale, 1.0, 1.0) + center;

  frag.vertex_position = frag.pos;

  frag.uv = array(
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0),
    vec2(1.0, 0.0),
    vec2(0.0, 1.0),
    vec2(0.0, 0.0),
  )[input.vindex]; 


  return frag;
}

@fragment
fn FSMain(input: ParticlesFragInput) -> ParticlesFragOutput {
  var o: ParticlesFragOutput;

  let ipos = vec2i(input.vertex_position.xy);

  let rad = length(input.uv - vec2f(0.5)) * 2.0;

  let factor = select(
    0.0, 
    (1.0 - pow(rad, 1.0)) * 0.6, 
    rad < 1.0
  );

  if (
    !dither256(factor, ipos / 4)
  ) {
    discard;
  }

  o.pos = input.pos;
  // o.normal = input.normal;
  o.normal = params.mvp * normalize(vec4f(input.uv * 2.0 - 1.0, 1.0, 0.0));
  o.albedo = input.albedo;
  return o;
} 