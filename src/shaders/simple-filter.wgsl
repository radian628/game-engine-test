/*TEXTURES*/

/*TEXTURES*/


/*GLOBALS*/

/*GLOBALS*/

struct FragInput {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@vertex
fn VSMain(@builtin(vertex_index) vertexIndex: u32) -> FragInput {
  var output: FragInput;

  output.position = vec4(array(
    vec2( 1.0,  1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0, -1.0),
    vec2( 1.0,  1.0),
    vec2(-1.0, -1.0),
    vec2(-1.0,  1.0),
  )[vertexIndex], 0.5, 1.0);

  output.uv = array(
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0),
    vec2(1.0, 0.0),
    vec2(0.0, 1.0),
    vec2(0.0, 0.0),
  )[vertexIndex];

  return output;
}

struct Output {
/*OUTPUT_STRUCT*/

/*OUTPUT_STRUCT*/
}

@fragment
fn FSMain(@location(0) uv : vec2f) -> Output  {
  /*FRAGMENT_BODY*/

  /*FRAGMENT_BODY*/
}