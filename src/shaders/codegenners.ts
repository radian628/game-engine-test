import { range, Vec4 } from "r628";

export function equallyDistributedGoldenSpiral(radius: number): Vec4[] {
  const count = radius ** 2;
  return range(count).map((i) => {
    const angle = i * 2.4;
    const r = Math.sqrt(i);
    const rNext = Math.sqrt(i + 1);
    return [Math.cos(angle) * r, Math.sin(angle) * r, r, rNext];
  });
}

export function goldenSpiral(radius: number, step: number): Vec4[] {
  const count = Math.round(radius / step);
  return range(count).map((i) => {
    const angle = i * 2.4;
    const r = i * step;
    const rNext = (i + 1) * step;
    return [Math.cos(angle) * r, Math.sin(angle) * r, r, rNext];
  });
}

export function goldenSpiralSquared(count: number, maxRadius: number): Vec4[] {
  const rad = (x) => (x / count) ** 2 * maxRadius;

  return range(count).map((i) => {
    const angle = i * 2.4;
    const r = rad(i);
    const rNext = rad(i + 1);
    return [Math.cos(angle) * r, Math.sin(angle) * r, r, rNext];
  });
}

export const blurKernelArray = goldenSpiralSquared(36, 6)
  .map((e) => `vec4f(${e.join(",")})`)
  .join(", ");

console.log(blurKernelArray);
