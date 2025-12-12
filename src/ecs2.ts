import { arrayToMapKeys } from "r628";
import {
  scheduleAndCompleteAsynchronousTaskGraph,
  scheduleAndCompleteSynchronousTaskGraph,
} from "./scheduler";

export type AnyComponentSpec = ComponentSpec<any, any, any, any>;

export type AnyComponentArgs = CreateComponentArgs<any, any, any, any>;

export type AnyComponentInstance = ComponentInstance<AnyComponentSpec>;

export type AnyComponentInstanceGenerator = ComponentInstanceGenerator<
  any,
  any,
  any,
  any
>;

export type Entity<Cs extends AnyComponentSpec> = {
  comp: <D extends Cs>(component: D) => ComponentInstance<D>;
};

export type CsObj<Cs extends AnyComponentSpec> =
  Cs extends ComponentSpec<
    infer Params,
    infer State,
    infer GlobalState,
    infer Dependencies
  >
    ? {
        params: Params;
        state: State;
        globalState: GlobalState;
        dependencies: Dependencies;
      }
    : never;

export type ComponentGlobal<Cs extends AnyComponentSpec> = {
  spec: Cs;
  state: CsObj<Cs>["globalState"];
  instances: Set<ComponentInstance<Cs>>;
};

export type System = {
  entity<Ci extends AnyComponentInstanceGenerator[]>(
    ...components: Ci
  ): Promise<Entity<Ci[number]["spec"]>>;
  renderUpdate(): Promise<void>;
  fixedUpdate(): Promise<void>;
  compGlobal<Cs extends AnyComponentSpec>(
    spec: Cs
  ): Promise<ComponentGlobal<Cs>>;
};

type ComponentAndDependencies<Cs extends AnyComponentSpec> =
  Cs extends ComponentSpec<
    infer Params,
    infer State,
    infer GlobalState,
    infer Dependencies
  >
    ? Cs | ComponentAndDependencies<Dependencies>
    : never;

export type ComponentInstance<Cs extends AnyComponentSpec> = {
  spec: Cs;
  global: Awaited<ReturnType<Cs["args"]["init"]>>;
  state: Awaited<ReturnType<Cs["args"]["instantiate"]>>;
  entity: Entity<Cs | Cs["args"]["deps"][number]>;
};

export type ComponentInstanceGenerator<
  Params,
  State,
  GlobalState,
  Dependencies extends AnyComponentSpec,
> = {
  spec: ComponentSpec<Params, State, GlobalState, Dependencies>;
  params: Params;
};

export type ComponentSpec<
  Params,
  State,
  GlobalState,
  Dependencies extends AnyComponentSpec,
> = {
  (
    params: Params
  ): ComponentInstanceGenerator<Params, State, GlobalState, Dependencies>;
  args: CreateComponentArgs<Params, State, GlobalState, Dependencies>;
};

export type UpdateArgs<Cs extends AnyComponentSpec> = {
  global: ComponentGlobal<Cs>;
  compGlobal: <G extends AnyComponentSpec>(
    gspec: G
  ) => Promise<ComponentGlobal<G>>;
  instances: Set<ComponentInstance<Cs>>;
  scheduleTask(task: () => Promise<void>, tags?: symbol[], waitFor?: symbol[]);
};

export type InitArgs = {
  compGlobal: <G extends AnyComponentSpec>(
    gspec: G
  ) => Promise<ComponentGlobal<G>>;
};

export type DestroyArgs<Cs extends AnyComponentSpec> = {
  global: ComponentGlobal<Cs>;
  compGlobal: <G extends AnyComponentSpec>(
    gspec: G
  ) => Promise<ComponentGlobal<G>>;
  instances: Set<ComponentInstance<Cs | CsObj<Cs>["dependencies"]>>;
  comp: <D extends AnyComponentSpec>(dspec: D) => Promise<ComponentInstance<D>>;
};

export type InstantiateArgs<Cs extends AnyComponentSpec> = DestroyArgs<Cs>;

export type CreateComponentArgs<
  Params,
  State,
  GlobalState,
  Dependencies extends AnyComponentSpec,
> = {
  init?(args: InitArgs): Promise<GlobalState>;
  instantiate?(
    params: Params,
    args: {
      compGlobal: <G extends AnyComponentSpec>(
        gspec: G
      ) => Promise<ComponentGlobal<G>>;
      comp: <D extends Dependencies>(dspec: D) => Promise<ComponentInstance<D>>;
      sys: System;
    }
  ): Promise<State>;
  deps?: Dependencies[];

  destroy?(
    instance: ComponentInstance<
      ComponentSpec<Params, State, GlobalState, Dependencies>
    >,
    args: DestroyArgs<ComponentSpec<Params, State, GlobalState, Dependencies>>
  ): Promise<void>;

  renderUpdate?: (
    args: UpdateArgs<ComponentSpec<Params, State, GlobalState, Dependencies>>
  ) => Promise<void>;
  fixedUpdate?: (
    args: UpdateArgs<ComponentSpec<Params, State, GlobalState, Dependencies>>
  ) => Promise<void>;
};

export function createSystem(): System {
  const components = new Map<
    AnyComponentSpec,
    ComponentGlobal<AnyComponentSpec>
  >();

  async function getComp<Cs extends AnyComponentSpec>(
    comp: Cs
  ): Promise<ComponentGlobal<Cs>> {
    let res = components.get(comp);

    if (!res) {
      res = {
        instances: new Set(),
        spec: comp,
        state:
          (await comp.args.init?.({
            compGlobal: getComp,
          })) ?? undefined,
      };
      components.set(comp, res);
    }

    // @ts-expect-error
    return res;
  }

  function setComp<Cs extends AnyComponentSpec>(
    comp: Cs,
    value: ComponentGlobal<Cs>
  ) {
    components.set(comp, value);
  }

  async function getUpdateArgs<Cs extends AnyComponentSpec>(
    spec: Cs,
    scheduleTask: (
      task: () => Promise<void>,
      tags?: symbol[],
      waitFor?: symbol[]
    ) => void
  ): Promise<UpdateArgs<Cs>> {
    const c = await getComp<Cs>(spec);
    return {
      global: c,
      compGlobal<G extends AnyComponentSpec>(g) {
        return getComp<G>(g);
      },
      instances: c.instances,
      scheduleTask: scheduleTask,
    };
  }

  async function createDestroyArgs<Cs extends AnyComponentSpec>(
    spec: Cs,
    loadComponent: <Cs2 extends CsObj<Cs>["dependencies"]>(
      comp: Cs2
    ) => Promise<ComponentInstance<Cs2>>
  ): Promise<DestroyArgs<Cs>> {
    const c = await getComp<Cs>(spec);
    return {
      instances: c.instances,
      global: c,
      comp: loadComponent,
      compGlobal: getComp,
    };
  }

  async function repeatingUpdate(name: "fixedUpdate" | "renderUpdate") {
    let tasks: {
      task: () => Promise<void>;
      tags: symbol[];
      waitFor: symbol[];
    }[] = [];
    for (const [k, v] of components)
      k.args[name]?.(
        await getUpdateArgs(k, (task, tags = [], waitFor = []) => {
          tasks.push({ task, tags, waitFor });
        })
      );
    scheduleAndCompleteAsynchronousTaskGraph(tasks);
  }

  return {
    async entity<Cg extends AnyComponentInstanceGenerator>(
      ...components: Cg[]
    ): Promise<Entity<Cg["spec"]>> {
      const argmap = new Map(
        components.map((k) => [k.spec, k.params] as const)
      );

      const compmap = new Map<AnyComponentSpec, AnyComponentInstance>();

      const entity = {
        comp(spec) {
          return compmap.get(spec);
        },
      };

      const loadComp = async <Cs2 extends AnyComponentSpec>(
        c: Cs2
      ): Promise<ComponentInstance<Cs2>> => {
        if (compmap.get(c)) {
          // @ts-expect-error
          return compmap.get(c);
        }
        const comp = await c.args.instantiate?.(argmap.get(c), {
          ...(await createDestroyArgs(c, loadComp)),
          sys: this,
        });

        const cglobal = await getComp(c);

        const instance: ComponentInstance<Cs2> = {
          spec: c,
          // @ts-expect-error
          global: cglobal,
          state: comp,
          // @ts-expect-error
          entity,
        };
        compmap.set(c, instance);
        cglobal.instances.add(instance);

        return instance;
      };

      for (const c of components) await loadComp(c.spec);

      // @ts-expect-error
      return entity;
    },
    async renderUpdate() {
      await repeatingUpdate("renderUpdate");
    },
    async fixedUpdate() {
      await repeatingUpdate("fixedUpdate");
    },
    async compGlobal<Cs extends AnyComponentSpec>(spec) {
      return await getComp<Cs>(spec);
    },
  };
}

export type DefaultIfUnknownOrAny<T, D> = unknown extends T ? D : T;

export function createComponent<
  Params,
  State,
  GlobalState,
  Dependencies extends AnyComponentSpec,
>(
  args: CreateComponentArgs<Params, State, GlobalState, Dependencies>
): ComponentSpec<
  // Args["instantiate"] extends undefined
  //   ? void
  //   : Parameters<Args["instantiate"]>[0],
  // Args["instantiate"] extends undefined
  //   ? undefined
  //   : Awaited<ReturnType<Args["instantiate"]>>,
  // Args["init"] extends undefined
  //   ? undefined
  //   : Awaited<ReturnType<Args["init"]>>,
  // "deps" extends keyof Args ? Args["deps"][number] : never
  Params,
  State,
  GlobalState,
  Dependencies
> {
  const ret = function (params) {
    return {
      params,
      spec: ret,
    };
  };

  ret.args = args;

  return ret;
}
