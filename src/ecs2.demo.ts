import { rotate } from "r628";
import { Keyboard2 } from "./components/input";
import { createSystem } from "./ecs2";
import { Transform2 } from "./transform-component";

const sys = createSystem();

const e = sys.entity(
  Keyboard2(undefined),
  Transform2(rotate([1, 0, 0], Math.PI * 0.25))
);

const m = e.comp(Transform2);

console.log(m);

const kb = sys.compGlobal(Keyboard2).state;

function loop() {
  console.log(kb.isKeyHeld("a"));

  sys.renderUpdate();
  sys.fixedUpdate();

  requestAnimationFrame(loop);
}
loop();

//  type SDKLFJ = any extends number ? true : false;
