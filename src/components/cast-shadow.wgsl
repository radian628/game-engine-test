struct CastShadowVertInput {
  @location(0) pos: vec3f,
}

struct CastShadowFragInput {
  @builtin(position) vertex_position : vec4f,
  @location(0) pos : vec4f,
}

struct Params {
  mvp: mat4x4f,
}

@group(0) @binding(0) var<uniform> params : Params;

@vertex
fn VSMain(input: CastShadowVertInput) -> CastShadowFragInput {
  var frag: CastShadowFragInput;
  frag.vertex_position = params.mvp * vec4f(input.pos, 1.0); 
  frag.pos = frag.vertex_position;
  // frag.vertex_position.w = 1.0;
  return frag;
}

@fragment
fn FSMain(input: CastShadowFragInput) -> @builtin(frag_depth) f32 {
  return length(input.pos.xyz) / 800.0;
}