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

export const blurKernelArray = equallyDistributedGoldenSpiral(6)
  .map((e) => `vec4f(${e.join(",")})`)
  .join(", ");
