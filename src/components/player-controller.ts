import {
  add2,
  add3,
  Mat4,
  mulMat4,
  mulMat4ByVec4,
  mulVec4ByMat4,
  normalize3,
  rotate,
  scale2,
  scale3,
  sub3,
  translate,
  Vec2,
  Vec3,
  xy,
  xyz,
} from "r628";
import { specifyComponent } from "../ecs";
import { Keyboard, Mouse, MouseFirstPerson } from "./input";
import {
  PhysicsWorld,
  RigidBody,
  toRapierVec3,
  toVec3,
} from "./physics-components";
import { DeferredWebgpuRenderer } from "./renderer";
import { Transform } from "../transform-component";
import { inv4 } from "../matrix";

export function castCameraRay(
  pos: Vec2,
  size: Vec2,
  viewInv: Mat4,
  fov: number,
  aspect: number
) {
  const f = Math.tan(fov / 2);
  const h = mulMat4ByVec4(viewInv, [
    (pos[0] / size[0] - 0.5) * 2 * aspect * f,
    (pos[1] / size[1] - 0.5) * -2 * f,
    -1,
    0,
  ]);
  const dir = normalize3(xyz(h));
  return dir;
}

export const PhysicalPlayerController = specifyComponent({
  create() {
    return {};
  },
  init(waitFor) {
    return undefined;
  },
  dependencies: [RigidBody] as const,
  globalDependencies: [
    Mouse,
    Keyboard,
    PhysicsWorld,
    DeferredWebgpuRenderer,
  ] as const,
  brand: "physicalPlayerController" as const,
  onDestroy() {},
  fixedUpdate({ subsystem, instances }) {
    const kbd = subsystem(Keyboard).state;

    for (const e of instances) {
      let force: Vec3 = [0, 0, 0];
      if (kbd.isKeyHeld("w")) {
        force = add3(force, [0, 0, -1]);
      }

      if (kbd.isKeyHeld("s")) {
        force = add3(force, [0, 0, 1]);
      }

      if (kbd.isKeyHeld("a")) {
        force = add3(force, [-1, 0, 0]);
      }

      if (kbd.isKeyHeld("d")) {
        force = add3(force, [1, 0, 0]);
      }

      e.entity.rigidBody.body.applyImpulse(
        {
          x: force[0],
          y: force[1],
          z: force[2],
        },
        true
      );
    }

    const mouse = subsystem(Mouse);
    const renderer = subsystem(DeferredWebgpuRenderer);

    const mouseVector = mouse.state.pollPosition();

    if (!mouse.state.isLeftPressed()) return;

    const viewInv = inv4(renderer.state.viewMatrix);

    const vpInv = inv4(
      mulMat4(renderer.state.projectionMatrix, renderer.state.viewMatrix)
    );

    for (const e of instances) {
      const { RAPIER, world } = subsystem(PhysicsWorld).state;

      const bodypos = e.entity.rigidBody.body.translation();
      const pos = xyz(mulMat4ByVec4(viewInv, [0, 0, 0, 1]));

      // const dir = xyz(
      //   mulMat4ByVec4(viewInv, [
      //     ...normalize3([
      //       ((mouseVector[0] / window.innerWidth) * 2.0 - 1.0) * 0.5,
      //       ((1 - mouseVector[1] / window.innerHeight) * 2.0 - 1.0) * 0.5,
      //       -1,
      //     ]),
      //     0,
      //   ])
      // );

      // const fov = Math.tan(renderer.state.fov / 2);

      // const h = mulMat4ByVec4(viewInv, [
      //   (mouseVector[0] / window.innerWidth - 0.5) *
      //     2 *
      //     renderer.state.aspect *
      //     fov,
      //   (mouseVector[1] / window.innerHeight - 0.5) * -2 * fov,
      //   -1,
      //   0,
      // ]);

      // const dir = normalize3(xyz(h));

      const dir = castCameraRay(
        mouseVector,
        [window.innerWidth, window.innerHeight],
        viewInv,
        renderer.state.fov,
        renderer.state.aspect
      );

      const ray = new RAPIER.Ray(toRapierVec3(pos), toRapierVec3(dir));

      const result = world.castRay(ray, 100, false);

      if (result) {
        const intersection = toVec3(ray.pointAt(result.timeOfImpact));
        const bodypos = toVec3(e.entity.rigidBody.body.translation());

        const offset = normalize3(sub3(intersection, bodypos));

        e.entity.rigidBody.body.applyImpulse(toRapierVec3(offset), true);
      }

      // if (result) console.log(result?.timeOfImpact);
    }
  },
});

export const TrackCamera = specifyComponent({
  create() {
    const rotation = translate([0, 0, 0]);
    let distance = 15;
    return { rotation, angles: [0, 0] as Vec2, distance };
  },
  init() {},
  dependencies: [Transform] as const,
  globalDependencies: [DeferredWebgpuRenderer, Mouse] as const,
  onDestroy() {},
  renderUpdate(params) {
    for (const e of params.instances) {
      const invtrans = e.entity.transform.matrix;
      params.subsystem(DeferredWebgpuRenderer).state.viewMatrix = mulMat4(
        mulMat4(translate([0, 0, -e.data.distance]), e.data.rotation),
        translate([-invtrans[12], -invtrans[13], -invtrans[14]])
      );
    }
  },
  fixedUpdate({ state, instances, subsystem }) {
    const mouse = subsystem(Mouse).state;

    const movement = mouse.pollMovement();
    const scroll = mouse.pollScroll();

    for (const i of instances) {
      i.data.distance *= Math.pow(1.1, scroll);
      if (mouse.isRightPressed()) {
        i.data.angles = add2(i.data.angles, scale2(movement, 0.008));

        const xAxis: Vec3 = [1, 0, 0];
        const yAxis: Vec3 = [0, 1, 0];

        i.data.rotation = mulMat4(
          rotate(xAxis, i.data.angles[1]),
          rotate(yAxis, i.data.angles[0])
        );
      }
    }
  },
  brand: "trackCamera" as const,
});
