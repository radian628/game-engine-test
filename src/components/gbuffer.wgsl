struct GBufferVertInput {
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
  //  @location(2) uv: vec2f,
}

struct GBufferFragInput {
  @builtin(position) vertex_position:  vec4f, 
  @location(0) pos: vec4f,
  @location(1) normal: vec4f,
  @location(2) albedo: vec4f,
  @location(3) pos_m: vec4f,
}

struct GBufferFragOutput {
  @location(0) pos: vec4f,
  @location(1) normal: vec4f,
  @location(2) albedo: vec4f,
}

struct Params {
  mvp: mat4x4f,
  m: mat4x4f,
  m_inv: mat4x4f,
  draw_color: vec4f,
  camera_pos: vec3f,
  facing_alpha: f32,
  glancing_alpha: f32
}

@group(0) @binding(0) var<uniform> params : Params;

@vertex
fn VSMain(input: GBufferVertInput) -> GBufferFragInput {
  var frag: GBufferFragInput;
  let clipspace = params.mvp * vec4f(input.pos, 1.0);
  frag.pos = params.mvp * vec4f(input.pos, 1.0);
  frag.vertex_position = clipspace;
  frag.pos_m = params.m * vec4f(input.pos, 1.0);
  frag.normal = vec4f(input.normal, 0.0) * params.m_inv;
  frag.albedo = params.draw_color;
  return frag;
}

const DITHER16_THRESHOLDS = array(
  0.0, 8.0, 2.0, 10.0,
  12.0, 4.0, 13.0, 6.0,
  3.0, 11.0, 1.0, 9.0,
  14.0, 7.0, 15.0, 5.0
);

fn dither16(factor: f32, coord: vec2i) -> bool {
  let x = coord.x % 4;
  let y = coord.y % 4;
  let threshold = DITHER16_THRESHOLDS[y * 4 + x] / 16.0;
  return factor > threshold ;
}


/* 
function makeDitherKernel(iters) {
	if (iters === 0) {
		return [0];
	}

	const kernel = makeDitherKernel(iters - 1);
	const oldLength = kernel.length;
	const oldSideLength = Math.sqrt(oldLength);
	
	const newLength = kernel.length * 4;
	const newSideLength = Math.sqrt(newLength);

	let k = new Array(newLength);
	
	for (const [x, y, idx] of [[0, 0,0], [1, 1, 1], [1, 0, 2], [0, 1, 3]]) {
		let baseIndex = y * newSideLength + x;
		for (let i = 0; i < oldSideLength; i++) {
			for (let j = 0; j < oldSideLength; j++) {
				k[baseIndex + i * 2 * newSideLength + j * 2] = 
					kernel[i * oldSideLength + j] + idx * kernel.length
			}
		}
	}

	return k;
	
}

console.log(makeDitherKernel(4));
*/

//#include ./dither256.wgsl

@fragment
fn FSMain(input: GBufferFragInput) -> GBufferFragOutput {
  var o: GBufferFragOutput;

  let vec_to_camera = params.camera_pos - input.pos_m.xyz;

  var alpha = input.albedo.a;
  let facing = dot(
      normalize(input.normal.xyz),
      normalize(vec_to_camera)
    );

  if (alpha < 1.0) {
    alpha = alpha * mix(params.glancing_alpha, params.facing_alpha, pow(facing, 4.0)); 
  }

  let ipos = vec2i(input.vertex_position.xy);
  if (
    !dither256(min(input.pos.z * 0.5 - 0.5, alpha), ipos / vec2i(4))
    // ipos.x % 3 != 1 && input.albedo.a < 1.0
    
    // && (ipos.x + ipos.y) % 4 != 0
  ) {
    discard;
  }


  o.pos = input.pos;
  o.normal = input.normal;
  o.albedo = input.albedo;
  return o;
} 