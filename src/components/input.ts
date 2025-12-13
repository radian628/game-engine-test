import { add2, Vec2 } from "r628";
import { createComponent } from "../ecs2";

export const Keyboard = createComponent({
  async init() {
    const keysHeldCaseSensitive = new Set<string>();
    const keysHeld = new Set<string>();

    const keyTappers: Set<Set<string>> = new Set();

    document.addEventListener("keydown", (e) => {
      keysHeldCaseSensitive.add(e.key);
      keysHeld.add(e.key.toLowerCase());
      for (const kt of keyTappers) {
        kt.add(e.key.toLowerCase());
      }
    });
    document.addEventListener("keyup", (e) => {
      keysHeldCaseSensitive.delete(e.key);
      keysHeld.delete(e.key.toLowerCase());
      for (const kt of keyTappers) {
        kt.delete(e.key.toLowerCase());
      }
    });

    return {
      isKeyHeldCaseSensitive(k: string) {
        return keysHeldCaseSensitive.has(k);
      },
      isKeyHeld(k: string) {
        return keysHeld.has(k);
      },
      tapper() {
        const keyTapped = new Set<string>();
        keyTappers.add(keyTapped);
        const isTapped = (k: string) => {
          const isTapped = keyTapped.has(k);
          if (isTapped) {
            keyTapped.delete(k);
          }
          return isTapped;
        };

        isTapped.destroy = () => {
          keyTappers.delete(keyTapped);
        };

        return isTapped;
      },
    };
  },
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

export const Mouse = createComponent({
  async init() {
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
});

export const MouseFirstPerson = createComponent({
  async init() {
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
});
