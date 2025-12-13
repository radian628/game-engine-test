import {
  add2,
  add3,
  Mat4,
  mulMat4,
  mulMat4ByVec4,
  mulVec4ByMat4,
  normalize3,
  range,
  rescale,
  rodrigues,
  rotate,
  scale2,
  scale3,
  smartRange,
  sub3,
  translate,
  Vec2,
  Vec3,
  xy,
  xyz,
} from "r628";
import { Keyboard, Mouse, MouseFirstPerson } from "./input";
import {
  PhysicsWorld,
  RigidBody,
  RigidBodyCollider,
  toRapierVec3,
  toVec3,
} from "./physics-components";
import { DeferredWebgpuRenderer } from "./renderer";
import { Transform } from "../transform-component";
import { inv4 } from "../matrix";
import { SampleWebgpuRendererGeometry } from "./geometry";
import { createComponent, CsObj, Entity } from "../ecs2";
import {
  ImpulseJoint,
  RigidBodyType,
  SpringImpulseJoint,
} from "@dimforge/rapier3d-simd";

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

export const TrackCamera = createComponent({
  async instantiate() {
    const rotation = translate([0, 0, 0]);
    let distance = 15;
    return { rotation, angles: [0, 0] as Vec2, distance };
  },
  deps: [Transform] as const,
  async renderUpdate({ instances, compGlobal }) {
    const renderer = (await compGlobal(DeferredWebgpuRenderer)).state;
    for (const e of instances) {
      const invtrans = e.entity.comp(Transform).state.matrix;
      renderer.viewMatrix = mulMat4(
        mulMat4(translate([0, 0, -e.state.distance]), e.state.rotation),
        translate([-invtrans[12], -invtrans[13], -invtrans[14]])
      );
    }
  },
  async fixedUpdate({ instances, compGlobal }) {
    const mouse = (await compGlobal(Mouse)).state;

    const movement = mouse.pollMovement();
    const scroll = mouse.pollScroll();

    for (const i of instances) {
      i.state.distance *= Math.pow(1.1, scroll);
      if (mouse.isRightPressed()) {
        i.state.angles = add2(i.state.angles, scale2(movement, 0.008));

        const xAxis: Vec3 = [1, 0, 0];
        const yAxis: Vec3 = [0, 1, 0];

        i.state.rotation = mulMat4(
          rotate(xAxis, i.state.angles[1]),
          rotate(yAxis, i.state.angles[0])
        );
      }
    }
  },
});

const PLAYER_COLLIDER_GROUP = 0x0001;

const PLAYER_SEGCOUNT = 20;
const SPRING_ROWS = 3;

export const PhysicalPlayerController = createComponent({
  async instantiate(
    params: {
      geometry: CsObj<typeof SampleWebgpuRendererGeometry>["params"];
    },
    { sys, compGlobal }
  ) {
    const { world, RAPIER } = (await compGlobal(PhysicsWorld)).state;
    const { tapper } = (await compGlobal(Keyboard)).state;

    let segments: Entity<
      | typeof RigidBody
      | typeof RigidBodyCollider
      | typeof SampleWebgpuRendererGeometry
      | typeof Transform
    >[] = [];

    let springs: {
      list: SpringImpulseJoint[];
      restLength: number;
    }[] = [];

    for (const i of range(PLAYER_SEGCOUNT)) {
      segments.push(
        await sys.entity(
          Transform(translate([0, 0, 0])),
          RigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, i, 0)),
          SampleWebgpuRendererGeometry(params.geometry),
          RigidBodyCollider(
            RAPIER.ColliderDesc.ball(0.4)
              .setFriction(0.8)
              .setCollisionGroups(
                PLAYER_COLLIDER_GROUP | (~PLAYER_COLLIDER_GROUP << 16)
              )
          )
        )
      );
    }

    function replaceJoints(idx: number, length: number) {
      const angle = rescale(idx, 0, SPRING_ROWS, 0, Math.PI * 2);
      const xOffset = Math.cos(angle) * 0.5;
      const zOffset = Math.sin(angle) * 0.5;

      const oldSprings = springs[idx];
      if (oldSprings) {
        if (length === oldSprings.restLength) return;
        for (const s of springs[idx].list) world.removeImpulseJoint(s, true);
      }

      let springsInner: ImpulseJoint[] = [];

      for (const i of range(PLAYER_SEGCOUNT - 1)) {
        const a = segments[i].comp(RigidBody).state;
        const b = segments[i + 1].comp(RigidBody).state;

        const spring = RAPIER.JointData.spring(
          0.1,
          300,
          50,
          {
            x: xOffset,
            y: length,
            z: zOffset,
          },
          { x: xOffset, y: -length, z: zOffset }
        );
        const jt = world.createImpulseJoint(spring, a.body, b.body, true);
        springsInner.push(jt);
      }
      springs[idx] = { list: springsInner, restLength: length };
    }

    for (const i of range(SPRING_ROWS)) replaceJoints(i, 0.3);

    return {
      fixFront: false,
      keyTapped: tapper(),
      segments,
      springs,
      replaceJoints,
      replaceFriction(f: (x: number) => number) {
        for (const i of range(segments.length)) {
          const x = i / (segments.length - 1);
          segments[i].comp(RigidBodyCollider).state.collider.setFriction(f(x));
        }
      },
    };
  },
  deps: [TrackCamera] as const,

  async renderUpdate({ compGlobal, instances }) {
    for (const i of instances) {
      const t = i.entity.comp(Transform).state;
      t.matrix = i.state.segments[0].comp(Transform).state.matrix;
    }
  },

  async fixedUpdate({ compGlobal, instances }) {
    const kbd = (await compGlobal(Keyboard)).state;

    for (const e of instances) {
      // const cam = e.entity.comp(TrackCamera).state;

      // if (kbd.isKeyHeld("w")) {
      //   e.state.replaceJoints(0, 0.1);
      // } else {
      //   e.state.replaceJoints(0, 0.3);
      // }
      // if (kbd.isKeyHeld("d")) {
      //   e.state.replaceJoints(1, 0.1);
      // } else {
      //   e.state.replaceJoints(1, 0.3);
      // }
      // if (kbd.isKeyHeld("s")) {
      //   e.state.replaceJoints(2, 0.1);
      // } else {
      //   e.state.replaceJoints(2, 0.3);
      // }
      if (kbd.isKeyHeld(" ")) {
        for (const i of range(SPRING_ROWS)) e.state.replaceJoints(i, 0.1);
      } else {
        for (const i of range(SPRING_ROWS)) e.state.replaceJoints(i, 0.3);
      }

      // if (kbd.isKeyHeld("arrowright")) {
      //   for (const i of range(SPRING_ROWS))
      //     e.state.replaceJoints(i, i == 0 ? 0.1 : 0.4);
      // }
      // if (kbd.isKeyHeld("arrowleft")) {
      //   for (const i of range(SPRING_ROWS))
      //     e.state.replaceJoints(i, i == 1 ? 0.1 : 0.4);
      // }

      if (e.state.keyTapped("a")) {
        e.state.fixFront = !e.state.fixFront;
      }

      const first = e.state.segments[0];
      const last = e.state.segments.at(-1)!;

      function setSegmentDynamic(dynamic: boolean, segment: typeof first) {
        segment
          .comp(RigidBody)
          .state.body.setBodyType(
            dynamic ? RigidBodyType.Dynamic : RigidBodyType.Fixed,
            true
          );
        segment.comp(SampleWebgpuRendererGeometry).state.drawColor = dynamic
          ? [1.0, 0.5, 1.0, 1.0]
          : [1.0, 0.0, 0.0, 1.0];
      }

      // e.state.replaceFriction((x) => (x > 0.5 ? 20 : 0));
      // console.log("back");
      // e.state.segments[0]
      //   .comp(RigidBody)
      //   .state.body.applyImpulse(toRapierVec3([0, -4, 0]), true);

      setSegmentDynamic(!e.state.fixFront, first);
      setSegmentDynamic(e.state.fixFront, last);

      let nonFixedSegment = e.state.fixFront ? last : first;
      const t = nonFixedSegment.comp(Transform).state.matrix;

      const fwd = scale3(xyz(mulMat4ByVec4(t, [0, 1, 0, 0])), 0.17);

      function turn(axis: Vec3, angle: number) {
        nonFixedSegment
          .comp(RigidBody)
          .state.body.applyImpulse(
            toRapierVec3(rodrigues(fwd, axis, angle)),
            true
          );
      }
      function turnVert(dir) {
        nonFixedSegment
          .comp(RigidBody)
          .state.body.applyImpulse(toRapierVec3([0, 0.1 * dir, 0]), true);
      }

      const turnAngleMul = e.state.fixFront ? -1 : 1;

      if (kbd.isKeyHeld("arrowright")) {
        turn([0, 1, 0], (Math.PI / 2) * turnAngleMul);
      }
      if (kbd.isKeyHeld("arrowleft")) {
        turn([0, 1, 0], (-Math.PI / 2) * turnAngleMul);
      }
      if (kbd.isKeyHeld("arrowup")) {
        turnVert(1);
      }
      if (kbd.isKeyHeld("arrowdown")) {
        turnVert(-1);
      }
      // let force: Vec3 = [0, 0, 0];
      // if (kbd.isKeyHeld("w")) {
      //   force = add3(force, [0, 0, -1]);
      // }

      // if (kbd.isKeyHeld("s")) {
      //   force = add3(force, [0, 0, 1]);
      // }

      // if (kbd.isKeyHeld("a")) {
      //   force = add3(force, [-1, 0, 0]);
      // }

      // if (kbd.isKeyHeld("d")) {
      //   force = add3(force, [1, 0, 0]);
      // }

      // force = rodrigues(force, [0, -1, 0], cam.angles[0]);

      // if (kbd.isKeyHeld(" ")) {
      //   force = add3(force, [0, 1, 0]);
      // }

      // if (kbd.isKeyHeld("shift")) {
      //   force = add3(force, [0, -1, 0]);
      // }

      // const forceMag = 0.26;

      // e.state.segments[0].comp(RigidBody).state.body.applyImpulse(
      //   {
      //     x: force[0] * forceMag,
      //     y: force[1] * forceMag,
      //     z: force[2] * forceMag,
      //   },
      //   true
      // );
    }
  },
});
