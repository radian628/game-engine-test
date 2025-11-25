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
