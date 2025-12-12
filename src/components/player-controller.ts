import {
  add2,
  add3,
  Mat4,
  mulMat4,
  mulMat4ByVec4,
  mulVec4ByMat4,
  normalize3,
  range,
  rodrigues,
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
import {
  ComponentParams,
  Components,
  Entity,
  specifyComponent,
  System,
} from "../ecs";
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
import { SampleWebgpuRendererGeometry } from "./geometry";

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

export const PhysicalPlayerController = specifyComponent({
  create(
    params: {
      geometry: ComponentParams<typeof SampleWebgpuRendererGeometry>;
      sys: System<
        typeof RigidBody | typeof SampleWebgpuRendererGeometry | Components
      >;
    },
    global
  ) {
    let segments: Entity<
      typeof RigidBody | typeof SampleWebgpuRendererGeometry
    >[] = [];

    for (const i of range(20)) {
      segments.push({
        // transform:
      });
    }

    return {
      segments,
    };
  },
  init(waitFor) {
    return undefined;
  },
  dependencies: [TrackCamera] as const,
  globalDependencies: [Mouse, Keyboard, PhysicsWorld] as const,
  brand: "physicalPlayerController" as const,
  onDestroy() {},
  fixedUpdate({ subsystem, instances }) {
    const kbd = subsystem(Keyboard).state;

    for (const e of instances) {
      const cam = e.entity.trackCamera;

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

      force = rodrigues(force, [0, -1, 0], cam.angles[0]);

      if (kbd.isKeyHeld(" ")) {
        force = add3(force, [0, 1, 0]);
      }

      if (kbd.isKeyHeld("shift")) {
        force = add3(force, [0, -1, 0]);
      }

      const forceMag = 0.26;

      e.entity.rigidBody.body.applyImpulse(
        {
          x: force[0] * forceMag,
          y: force[1] * forceMag,
          z: force[2] * forceMag,
        },
        true
      );
    }
  },
});
