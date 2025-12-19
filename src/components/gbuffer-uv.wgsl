struct GBufferVertInput {
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

struct GBufferFragInput {
  @builtin(position) vertex_position:  vec4f, 
  @location(0) pos: vec4f,
  @location(1) normal: vec4f,
  @location(2) uv: vec2f,
}

struct GBufferFragOutput {
  @location(0) pos: vec4f,
  @location(1) normal: vec4f,
  @location(2) albedo: vec4f,
}

struct Params {
  mvp: mat4x4f,
  m: mat4x4f,
}

@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var tex_albedo : texture_2d<f32>;
@group(0) @binding(2) var samp : sampler;

@vertex
fn VSMain(input: GBufferVertInput) -> GBufferFragInput {
  var frag: GBufferFragInput;
  let clipspace = params.mvp * vec4f(input.pos, 1.0);
  frag.pos = params.mvp * vec4f(input.pos, 1.0);
  frag.vertex_position = clipspace;
  frag.normal = params.m * vec4f(input.normal, 0.0);
  frag.uv = input.uv;
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

const DITHER256_THRESHOLDS = array<f32, 256>(
  0,
  128,
  32,
  160,
  8,
  136,
  40,
  168,
  2,
  130,
  34,
  162,
  10,
  138,
  42,
  170,
  192,
  64,
  224,
  96,
  200,
  72,
  232,
  104,
  194,
  66,
  226,
  98,
  202,
  74,
  234,
  106,
  48,
  176,
  16,
  144,
  56,
  184,
  24,
  152,
  50,
  178,
  18,
  146,
  58,
  186,
  26,
  154,
  240,
  112,
  208,
  80,
  248,
  120,
  216,
  88,
  242,
  114,
  210,
  82,
  250,
  122,
  218,
  90,
  12,
  140,
  44,
  172,
  4,
  132,
  36,
  164,
  14,
  142,
  46,
  174,
  6,
  134,
  38,
  166,
  204,
  76,
  236,
  108,
  196,
  68,
  228,
  100,
  206,
  78,
  238,
  110,
  198,
  70,
  230,
  102,
  60,
  188,
  28,
  156,
  52,
  180,
  20,
  148,
  62,
  190,
  30,
  158,
  54,
  182,
  22,
  150,
  252,
  124,
  220,
  92,
  244,
  116,
  212,
  84,
  254,
  126,
  222,
  94,
  246,
  118,
  214,
  86,
  3,
  131,
  35,
  163,
  11,
  139,
  43,
  171,
  1,
  129,
  33,
  161,
  9,
  137,
  41,
  169,
  195,
  67,
  227,
  99,
  203,
  75,
  235,
  107,
  193,
  65,
  225,
  97,
  201,
  73,
  233,
  105,
  51,
  179,
  19,
  147,
  59,
  187,
  27,
  155,
  49,
  177,
  17,
  145,
  57,
  185,
  25,
  153,
  243,
  115,
  211,
  83,
  251,
  123,
  219,
  91,
  241,
  113,
  209,
  81,
  249,
  121,
  217,
  89,
  15,
  143,
  47,
  175,
  7,
  135,
  39,
  167,
  13,
  141,
  45,
  173,
  5,
  133,
  37,
  165,
  207,
  79,
  239,
  111,
  199,
  71,
  231,
  103,
  205,
  77,
  237,
  109,
  197,
  69,
  229,
  101,
  63,
  191,
  31,
  159,
  55,
  183,
  23,
  151,
  61,
  189,
  29,
  157,
  53,
  181,
  21,
  149,
  255,
  127,
  223,
  95,
  247,
  119,
  215,
  87,
  253,
  125,
  221,
  93,
  245,
  117,
  213,
  85
);

fn dither256(factor: f32, coord: vec2i) -> bool {
  let x = coord.x % 16;
  let y = coord.y % 16;
  let threshold = DITHER256_THRESHOLDS[y * 16 + x] / 256.0;
  return factor > threshold ;
}

@fragment
fn FSMain(input: GBufferFragInput) -> GBufferFragOutput {
  var o: GBufferFragOutput;

  let ipos = vec2i(input.vertex_position.xy);
  if (
    !dither256(input.pos.z * 0.5 - 0.5, ipos)
    // && (ipos.x + ipos.y) % 4 != 0
  ) {
    discard;
  }

  _ = tex_albedo;
  _ = samp; 

  o.pos = input.pos;
  o.normal = input.normal;
  o.albedo = textureSample(tex_albedo, samp, input.uv);
  o.albedo.a = 1.0;
;
  return o;
} 