import { Mat4 } from "r628";
import { createComponent } from "./ecs2";

export const identityMat4 = [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
] as Mat4;

export const Transform = createComponent({
  async instantiate(matrix: Mat4) {
    return {
      matrix,
    };
  },
});
