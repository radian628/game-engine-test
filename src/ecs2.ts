import { arrayToMapKeys } from "r628";
import { scheduleAndCompleteSynchronousTaskGraph } from "./scheduler";

export type AnyComponentSpec = ComponentSpec<any, any, any, any, any>;

export type AnyComponentInstance = ComponentInstance<AnyComponentSpec>;

export type AnyComponentInstanceGenerator = ComponentInstanceGenerator<
  any,
  any,
  any,
  any,
  any
>;

export type Entity<Cs extends AnyComponentSpec> = {
  comp: (component: Cs) => ComponentInstance<Cs>;
};

export type CsObj<Cs extends AnyComponentSpec> =
  Cs extends ComponentSpec<
    infer Params,
    infer State,
    infer GlobalState,
    infer Dependencies,
    infer GlobalDependencies
  >
    ? {
        params: Params;
        state: State;
        globalState: GlobalState;
        dependencies: Dependencies;
        globalDependencies: GlobalDependencies;
      }
    : never;

export type ComponentGlobal<Cs extends AnyComponentSpec> = {
  spec: Cs;
  state: CsObj<Cs>["globalState"];
  instances: Set<ComponentInstance<Cs>>;
};

export type System = {
  entity<Ci extends AnyComponentInstanceGenerator>(
    ...components: Ci[]
  ): Entity<Ci["spec"]>;
  renderUpdate(): void;
  fixedUpdate(): void;
  compGlobal<Cs extends AnyComponentSpec>(spec: Cs): ComponentGlobal<Cs>;
};

type ComponentAndDependencies<Cs extends AnyComponentSpec> =
  Cs extends ComponentSpec<
    infer Params,
    infer State,
    infer GlobalState,
    infer Dependencies,
    infer GlobalDependencies
  >
    ?
        | Cs
        | ComponentAndDependencies<Dependencies>
        | ComponentAndDependencies<GlobalDependencies>
    : never;

export type ComponentInstance<Cs extends AnyComponentSpec> =
  Cs extends ComponentSpec<
    infer Params,
    infer State,
    infer GlobalState,
    infer Dependencies,
    infer GlobalDependencies
  >
    ? {
        spec: Cs;
        global: ComponentGlobal<Cs>;
        state: State;
        entity: Entity<Cs>;
      }
    : never;

export type ComponentInstanceGenerator<
  Params,
  State,
  GlobalState,
  Dependencies extends AnyComponentSpec,
  GlobalDependencies extends AnyComponentSpec,
> = {
  spec: ComponentSpec<
    Params,
    State,
    GlobalState,
    Dependencies,
    GlobalDependencies
  >;
  params: Params;
};

export type ComponentSpec<
  Params,
  State,
  GlobalState,
  Dependencies extends AnyComponentSpec,
  GlobalDependencies extends AnyComponentSpec,
> = {
  (
    params: Params
  ): ComponentInstanceGenerator<
    Params,
    State,
    GlobalState,
    Dependencies,
    GlobalDependencies
  >;
  args: CreateComponentArgs<
    Params,
    State,
    GlobalState,
    Dependencies,
    GlobalDependencies
  >;
};

export type UpdateArgs<Cs extends AnyComponentSpec> = {
  global: ComponentGlobal<Cs>;
  compGlobal: <G extends CsObj<Cs>["globalDependencies"]>(
    gspec: G
  ) => ComponentGlobal<G>;
  instances: Set<ComponentInstance<Cs | CsObj<Cs>["dependencies"]>>;
  scheduleTask(task: () => void, tags?: symbol[], waitFor?: symbol[]);
};

export type InitArgs<Cs extends AnyComponentSpec> = {
  compGlobal: <G extends CsObj<Cs>["globalDependencies"]>(
    gspec: G
  ) => ComponentGlobal<G>;
};

export type DestroyArgs<Cs extends AnyComponentSpec> = {
  global: ComponentGlobal<Cs>;
  compGlobal: <G extends CsObj<Cs>["globalDependencies"]>(
    gspec: G
  ) => ComponentGlobal<G>;
  instances: Set<ComponentInstance<Cs | CsObj<Cs>["dependencies"]>>;
  comp: <D extends CsObj<Cs>["dependencies"]>(dspec: D) => ComponentInstance<D>;
};

export type InstantiateArgs<Cs extends AnyComponentSpec> = DestroyArgs<Cs>;

export type DefaultIfUnknownOrAny<T, D> = unknown extends T ? D : T;

export type CreateComponentArgs<
  Params,
  State,
  GlobalState,
  Dependencies extends AnyComponentSpec,
  GlobalDependencies extends AnyComponentSpec,
> = {
  deps?: Dependencies[];
  gdeps?: GlobalDependencies[];

  init?(
    args: InitArgs<
      ComponentSpec<
        Params,
        State,
        GlobalState,
        Dependencies,
        GlobalDependencies
      >
    >
  ): GlobalState;
  instantiate?(
    params: Params,
    args: InstantiateArgs<
      ComponentSpec<
        Params,
        State,
        GlobalState,
        Dependencies,
        GlobalDependencies
      >
    >
  ): State;

  destroy?(
    instance: ComponentInstance<
      ComponentSpec<
        Params,
        State,
        GlobalState,
        Dependencies,
        GlobalDependencies
      >
    >,
    args: DestroyArgs<
      ComponentSpec<
        Params,
        State,
        GlobalState,
        Dependencies,
        GlobalDependencies
      >
    >
  ): void;

  renderUpdate?: (
    args: UpdateArgs<
      ComponentSpec<
        Params,
        State,
        GlobalState,
        Dependencies,
        GlobalDependencies
      >
    >
  ) => {};
  fixedUpdate?: (
    args: UpdateArgs<
      ComponentSpec<
        Params,
        State,
        GlobalState,
        Dependencies,
        GlobalDependencies
      >
    >
  ) => {};
};

export function createSystem(): System {
  const components = new Map<
    AnyComponentSpec,
    ComponentGlobal<AnyComponentSpec>
  >();

  function getComp<Cs extends AnyComponentSpec>(comp: Cs): ComponentGlobal<Cs> {
    let res = components.get(comp);

    if (!res) {
      res = {
        instances: new Set(),
        spec: comp,
        state:
          comp.args.init?.({
            compGlobal: getComp,
          }) ?? undefined,
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

  function getUpdateArgs<Cs extends AnyComponentSpec>(
    spec: Cs,
    scheduleTask: (
      task: () => void,
      tags?: symbol[],
      waitFor?: symbol[]
    ) => void
  ): UpdateArgs<Cs> {
    const c = getComp<Cs>(spec);
    return {
      global: c,
      compGlobal<G extends CsObj<Cs>["globalDependencies"]>(g) {
        return getComp<G>(g);
      },
      instances: c.instances,
      scheduleTask: scheduleTask,
    };
  }

  function createDestroyArgs<Cs extends AnyComponentSpec>(
    spec: Cs,
    loadComponent: <Cs2 extends CsObj<Cs>["dependencies"]>(
      comp: Cs2
    ) => ComponentInstance<Cs2>
  ): DestroyArgs<Cs> {
    const c = getComp<Cs>(spec);
    return {
      instances: c.instances,
      global: c,
      comp: loadComponent,
      compGlobal: (g) => getComp(g),
    };
  }

  function repeatingUpdate(name: "fixedUpdate" | "renderUpdate") {
    let tasks: { task: () => void; tags: symbol[]; waitFor: symbol[] }[] = [];
    for (const [k, v] of components)
      k.args[name]?.(
        getUpdateArgs(k, (task, tags = [], waitFor = []) => {
          tasks.push({ task, tags, waitFor });
        })
      );
    scheduleAndCompleteSynchronousTaskGraph(tasks);
  }

  return {
    entity<Cg extends AnyComponentInstanceGenerator>(
      ...components: Cg[]
    ): Entity<Cg["spec"]> {
      const argmap = new Map(
        components.map((k) => [k.spec, k.params] as const)
      );

      const compmap = new Map<AnyComponentSpec, AnyComponentInstance>();

      function loadComp<Cs2 extends AnyComponentSpec>(c: Cs2) {
        if (compmap.get(c)) {
          return compmap.get(c);
        }
        const comp = c.args.instantiate?.(argmap.get(c), {
          ...createDestroyArgs(c, loadComp),
        });
        compmap.set(c, comp);
        return comp;
      }

      for (const c of components) loadComp(c.spec);

      return {
        // @ts-expect-error
        comp(spec) {
          return compmap.get(spec);
        },
      };
    },
    renderUpdate() {
      repeatingUpdate("renderUpdate");
    },
    fixedUpdate() {
      repeatingUpdate("fixedUpdate");
    },
    compGlobal<Cs extends AnyComponentSpec>(spec) {
      return getComp<Cs>(spec);
    },
  };
}

export function createComponent<
  Params = undefined,
  State = undefined,
  GlobalState = undefined,
  Dependencies extends AnyComponentSpec = never,
  GlobalDependencies extends AnyComponentSpec = never,
>(
  args: CreateComponentArgs<
    Params,
    State,
    GlobalState,
    Dependencies,
    GlobalDependencies
  >
): ComponentSpec<Params, State, GlobalState, Dependencies, GlobalDependencies> {
  const ret = function (params: Params) {
    return {
      params,
      spec: ret,
    };
  };

  ret.args = args;

  return ret;
}
