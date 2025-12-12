import { Mat4 } from "r628";
import { Components, specifyComponent } from "./ecs";
import { createComponent } from "./ecs2";

export const identityMat4 = [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
] as Mat4;

export const Transform = specifyComponent({
  create(matrix: Mat4) {
    return {
      matrix,
    };
  },
  onDestroy() {},
  brand: "transform" as const,
  dependencies: [] as const,
  globalDependencies: [] as const,
  init: () => undefined,
});

export const Transform2 = createComponent({
  instantiate(matrix: Mat4): { matrix: Mat4 } {
    return {
      matrix,
    };
  },
});
