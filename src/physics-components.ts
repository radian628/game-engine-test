import { mulMat4, rotate, translate, Vec3 } from "r628";
import { Components, specifyComponent } from "./ecs";
import { Transform } from "./transform-component";
import type RAPIER from "@dimforge/rapier3d-simd";

export const PhysicsWorld = specifyComponent({
  create() {
    return;
  },
  brand: "physicsWorld" as const,
  dependencies: [] as const,
  globalDependencies: [] as const,
  init: async () => {
    const RAPIER = (await import("@dimforge/rapier3d-simd")).default;
    console.log(RAPIER, RAPIER.World);
    const world = new RAPIER.World({
      x: 0,
      y: -9.81,
      z: 0,
    });
    return {
      world,
      RAPIER,
    };
  },
  fixedUpdate({ state, instances }) {
    state.world.integrationParameters.dt = 0.004;
    state.world.step();
  },
  onDestroy(c) {
    c;
  },
});

function quatToAngleAxis(quat: {
  w: number;
  x: number;
  y: number;
  z: number;
}): {
  angle: number;
  axis: Vec3;
} {
  const s = Math.sqrt(1 - quat.w * quat.w);

  return {
    angle: 2 * Math.acos(quat.w),
    axis: s === 0 ? [1, 0, 0] : [quat.x / s, quat.y / s, quat.z / s],
  };
}

export const RigidBody = specifyComponent({
  brand: "rigidBody" as const,
  dependencies: [Transform] as const,
  globalDependencies: [PhysicsWorld] as const,
  create(params: RAPIER.RigidBodyDesc, _, { physicsWorld }) {
    return { body: physicsWorld.state.world.createRigidBody(params) };
  },
  onDestroy(c, { physicsWorld }) {
    physicsWorld.state.world.removeRigidBody(c.body);
  },
  init: () => undefined,
  fixedUpdate({ state, instances }) {
    for (const inst of instances) {
      const translation = inst.data.body.translation();
      const rotationQuat = inst.data.body.rotation();
      const rotation = quatToAngleAxis(rotationQuat);

      inst.entity.transform.matrix = mulMat4(
        translate([translation.x, translation.y, translation.z]),
        rotate(rotation.axis, rotation.angle)
      );
    }
  },
});

export const RigidBodyCollider = specifyComponent({
  brand: "rigidBodyCollider" as const,
  dependencies: [RigidBody] as const,
  globalDependencies: [PhysicsWorld] as const,
  create(params: RAPIER.ColliderDesc, _, { physicsWorld }, waitFor) {
    const rigidBody = waitFor(RigidBody);
    const collider = physicsWorld.state.world.createCollider(
      params,
      rigidBody.body
    );

    return {
      collider,
    };
  },
  onDestroy(c, { physicsWorld }) {
    physicsWorld.state.world.removeCollider(c.collider, false);
  },
  init: () => undefined,
});
