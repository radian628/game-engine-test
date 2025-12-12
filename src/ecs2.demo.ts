import { rotate } from "r628";
import { Keyboard } from "./components/input";
import { createSystem } from "./ecs2";
import { Transform } from "./transform-component";

const sys = createSystem();

async function main() {
  const e = await sys.entity(Transform(rotate([1, 0, 0], Math.PI * 0.25)));

  const m = e.comp(Transform);

  console.log(m);

  const kb = await sys.compGlobal(Keyboard);

  console.log("kb", kb, kb.state);

  async function loop() {
    console.log(kb.state.isKeyHeld("a"));

    await sys.renderUpdate();
    await sys.fixedUpdate();

    requestAnimationFrame(loop);
  }
  loop();
}

main();

//  type SDKLFJ = any extends number ? true : false;
