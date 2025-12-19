import { mulMat4, rotate, scale, translate, Vec3 } from "r628";
import { Transform } from "../transform-component";
import type RAPIER from "@dimforge/rapier3d-simd";
import { createComponent } from "../ecs2";

export function toRapierVec3(vec3: Vec3): { x: number; y: number; z: number } {
  return {
    x: vec3[0],
    y: vec3[1],
    z: vec3[2],
  };
}

export function toVec3(v: { x: number; y: number; z: number }): Vec3 {
  return [v.x, v.y, v.z];
}

export const PhysicsWorld = createComponent({
  async init() {
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
  async fixedUpdate({ global }) {
    global.state.world.step();
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

export const RigidBody = createComponent({
  deps: [Transform] as const,
  async instantiate(params: RAPIER.RigidBodyDesc, { compGlobal }) {
    return {
      body: (await compGlobal(PhysicsWorld)).state.world.createRigidBody(
        params
      ),
      scale: [1, 1, 1] as Vec3,
    };
  },
  async destroy(c, { compGlobal }) {
    const world = (await compGlobal(PhysicsWorld)).state.world;
    world.removeRigidBody(c.state.body);
  },
  async fixedUpdate({ instances }) {
    for (const inst of instances) {
      const translation = inst.state.body.translation();
      const rotationQuat = inst.state.body.rotation();
      const rotation = quatToAngleAxis(rotationQuat);

      inst.entity.comp(Transform).state.matrix = mulMat4(
        mulMat4(
          translate([translation.x, translation.y, translation.z]),
          rotate(rotation.axis, rotation.angle)
        ),
        scale(inst.state.scale)
      );
    }
  },
});

export const RigidBodyCollider = createComponent({
  async instantiate(params: RAPIER.ColliderDesc, { comp, compGlobal }) {
    const rigidBody = await comp(RigidBody);
    const world = await compGlobal(PhysicsWorld);
    const collider = world.state.world.createCollider(
      params,
      rigidBody.state.body
    );

    return {
      collider,
    };
  },
  async destroy(c, { compGlobal }) {
    (await compGlobal(PhysicsWorld)).state.world.removeCollider(
      c.state.collider,
      false
    );
  },
});
