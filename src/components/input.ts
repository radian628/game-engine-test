import { add2, Vec2 } from "r628";
import { specifyComponent } from "../ecs";

export const Keyboard = specifyComponent({
  async init(subsystem) {
    const keysHeldCaseSensitive = new Set<string>();
    const keysHeld = new Set<string>();

    document.addEventListener("keydown", (e) => {
      keysHeldCaseSensitive.add(e.key);
      keysHeld.add(e.key.toLowerCase());
    });
    document.addEventListener("keyup", (e) => {
      keysHeldCaseSensitive.delete(e.key);
      keysHeld.delete(e.key.toLowerCase());
    });

    return {
      isKeyHeldCaseSensitive(k: string) {
        return keysHeldCaseSensitive.has(k);
      },
      isKeyHeld(k: string) {
        return keysHeld.has(k);
      },
    };
  },
  onDestroy() {},
  create() {},
  dependencies: [],
  globalDependencies: [],
  brand: "keyboard",
});

export function accumulator<T, D>(
  accumulate: (prev: T, curr: D) => T,
  init: T
) {
  let value = init;

  return {
    add(d: D) {
      value = accumulate(value, d);
    },
    poll() {
      const v = value;
      value = init;
      return v;
    },
  };
}

export const Mouse = specifyComponent({
  async init(subsystem) {
    let movement: Vec2 = [0, 0];

    let mouseButtons = new Set<number>();

    let position: Vec2 = [0, 0];

    document.addEventListener("mousemove", (e) => {
      movement = add2(movement, [e.movementX, e.movementY]);
      position = [e.clientX, e.clientY];
    });

    document.addEventListener("mousedown", (e) => {
      mouseButtons.add(e.button);
    });

    document.addEventListener("mouseup", (e) => {
      mouseButtons.delete(e.button);
    });

    document.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    let scrollDelta = 0;

    document.addEventListener("wheel", (e) => {
      scrollDelta += Math.sign(e.deltaY);
    });

    return {
      pollMovement() {
        const m = movement;
        movement = [0, 0];
        return m;
      },
      pollScroll() {
        const s = scrollDelta;
        scrollDelta = 0;
        return s;
      },
      isLeftPressed() {
        return mouseButtons.has(0);
      },
      isRightPressed() {
        return mouseButtons.has(2);
      },
      pollPosition() {
        return position;
      },
    };
  },
  onDestroy() {},
  create() {},
  dependencies: [],
  globalDependencies: [],
  brand: "mouse",
});

export const MouseFirstPerson = specifyComponent({
  async init(subsystem) {
    let movement: Vec2 = [0, 0];

    document.addEventListener("mousemove", (e) => {
      movement = add2(movement, [e.movementX, e.movementY]);
    });

    document.addEventListener("click", (e) => {
      document.body.requestPointerLock();
    });

    return {
      pollMovement() {
        const m = movement;
        movement = [0, 0];
        return m;
      },
    };
  },
  onDestroy() {},
  create() {},
  dependencies: [],
  globalDependencies: [],
  brand: "mouesFirstPerson",
});
