import Matrix, { inverse } from "ml-matrix";
import { Mat4 } from "r628";

export function inv4(m: Mat4): Mat4 {
  const M = new Matrix([
    m.slice(0, 4),
    m.slice(4, 8),
    m.slice(8, 12),
    m.slice(12, 16),
  ]).transpose();
  const invM = inverse(M);
  return invM.transpose().to1DArray() as Mat4;
}
