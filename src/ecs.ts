import { mapObjValues, Mat4, TypeLevelError, Vec3 } from "r628";
import { scheduleAndCompleteAsynchronousTaskGraph } from "./scheduler";

export type Components = ComponentSpec<
  any,
  any,
  any,
  ComponentBrand,
  Components[],
  Components[]
>;

type SpecificComponentInfo<
  C extends Components,
  B extends C["brand"] = C["brand"],
> = {
  state: Awaited<ReturnType<(C & { brand: B })["init"]>>;
  instances: ComponentInstance<C & { brand: B }>;
};

type ComponentsMap<C extends Components> = {
  [K in C["brand"]]: {
    after: Promise<SpecificComponentInfo<C, K>>;
    current: SpecificComponentInfo<C, K>;
  };
};

type SimpleComponentsMap<C extends Components> = {
  [K in C["brand"]]: SpecificComponentInfo<C, K>;
};

type ComponentInstanceMap<C extends Components> = {
  [K in C["brand"]]: ReturnType<(C & { brand: K })["create"]>;
};

type ComponentInstanceData<C extends Components> = ReturnType<C["create"]>;

type ComponentGlobalData<C extends Components> = Awaited<ReturnType<C["init"]>>;

type ComponentInstance<C extends Components> = {
  instance: ComponentInstanceData<C>;
  entity: ComponentInstanceMap<C["dependencies"][number]>;
};

export type ComponentBrand = string;

export type ComponentParams<C> =
  C extends ComponentSpec<infer P, any, any, any, any, any> ? P : never;

type WaitForTags = (tags: symbol[]) => Promise<void>;

type RepeaterCallback<
  Component,
  GlobalState,
  Dependencies extends Components[],
  GlobalDependencies extends Components[],
> = (params: {
  state: GlobalState;
  instances: Set<{
    data: Component;
    entity: ComponentInstanceMap<Dependencies[number]>;
  }>;
  subsystem: <D extends GlobalDependencies[number]>(
    d: D
  ) => SpecificComponentInfo<D>;
  scheduleTask(task: () => Promise<void>, tags?: symbol[], waitFor?: symbol[]);
}) => Promise<void> | void;

export type ComponentSpec<
  Params,
  Component,
  GlobalState,
  Brand extends ComponentBrand,
  Dependencies extends Components[] = [],
  GlobalDependencies extends Components[] = [],
> = {
  create: (
    params: Params,
    global: {
      state: GlobalState;
    },
    dependencies: SimpleComponentsMap<GlobalDependencies[number]>,
    waitFor: <D extends Dependencies[number]>(d: D) => ComponentInstanceData<D>
  ) => Component;
  onDestroy: (
    c: Component,
    dependencies: SimpleComponentsMap<GlobalDependencies[number]>
  ) => void;
  brand: Brand;
  dependencies: Dependencies;
  globalDependencies: GlobalDependencies;
  init: (
    waitFor: <D extends GlobalDependencies[number]>(
      d: D
    ) => Promise<ComponentGlobalData<D>>
  ) => Promise<GlobalState> | GlobalState;
  renderUpdate?: RepeaterCallback<
    Component,
    GlobalState,
    Dependencies,
    GlobalDependencies
  >;
  fixedUpdate?: RepeaterCallback<
    Component,
    GlobalState,
    Dependencies,
    GlobalDependencies
  >;
};

export type Entity<C extends Components> = {
  component<Comp extends C>(type: Comp): ReturnType<Comp["create"]>;
  destroy(): void;
};

export type System<Comps extends Components> = {
  entity: <
    EntityComps extends {
      [K in Comps["brand"]]?: Parameters<(Comps & { brand: K })["create"]>[0];
    },
  >(
    components: EntityComps
  ) => keyof EntityComps extends Comps["brand"]
    ? Entity<Comps & { brand: keyof EntityComps }>
    : TypeLevelError<"Some entity types do not exist.">;
  renderUpdate(): Promise<void>;
  fixedUpdate(): Promise<void>;
  subsystem<C extends Components>(
    c: C
  ): {
    global: Awaited<ReturnType<C["init"]>>;
    instances: Set<ReturnType<C["create"]>>;
  };
};

export function specifyComponent<
  Params,
  Component,
  GlobalState,
  Brand extends ComponentBrand,
  Dependencies extends Components[],
  GlobalDependencies extends Components[],
>(
  spec: ComponentSpec<
    Params,
    Component,
    GlobalState,
    Brand,
    Dependencies,
    GlobalDependencies
  >
) {
  return spec;
}

function triggerablePromise<T>(): Promise<T> & { trigger: (t: T) => void } {
  let resolver;
  const promise = new Promise<T>((resolve, reject) => {
    resolver = resolve;
  });
  // @ts-expect-error
  promise.trigger = resolver;
  // @ts-expect-error
  return promise;
}

export async function createSystem<Comps extends Components>(
  componentTypes: Comps[]
): Promise<System<Comps>> {
  const componentMapPending: Record<
    string,
    Promise<{
      componentTemplate: Components;
      instances: Set<{
        data: any;
        entity: any;
      }>;
      state: any;
    }>
  > = {};

  async function initSubsystem(t: Components) {
    if (componentMapPending[t.brand]) return;

    componentMapPending[t.brand] = (async () => ({
      componentTemplate: t,
      instances: new Set(),
      state: await t.init(async (u) => {
        await initSubsystem(u);
        return (await componentMapPending[u.brand]).state;
      }),
    }))();
  }

  for (const c of componentTypes) initSubsystem(c);

  const componentMap = Object.fromEntries(
    await Promise.all(
      Object.entries(componentMapPending).map(async ([k, v]) => [k, await v])
    )
  );

  // await Promise.all(
  //   componentTypes.map(async (t) => {
  //     await initSubsystem(t);
  //   })
  // );

  async function handleRepeatingPerComponentTask(
    prop: "fixedUpdate" | "renderUpdate"
  ) {
    const updatedComponentMap: Record<any, any> = {};

    const tasks: {
      task: () => Promise<void>;
      tags: symbol[];
      waitFor: symbol[];
    }[] = [];

    async function updateSubsystem(s: Components) {
      if (updatedComponentMap[s.brand]) return;
      updatedComponentMap[s.brand] =
        s[prop]?.({
          state: componentMap[s.brand].state,
          instances: componentMap[s.brand].instances,
          subsystem(t) {
            return componentMap[t.brand];
          },
          scheduleTask(task, tags, waitFor) {
            tasks.push({
              task,
              tags: tags ?? [],
              waitFor: waitFor ?? [],
            });
          },
        }) ?? Promise.resolve();
      await updatedComponentMap[s.brand];
    }

    await Promise.all(
      Object.values(componentMap).map(
        async (a: any) => await updateSubsystem(a.componentTemplate)
      )
    );

    await scheduleAndCompleteAsynchronousTaskGraph(tasks);
  }

  return {
    subsystem(c) {
      return {
        instances: componentMap[c.brand].instances,
        global: componentMap[c.brand].state,
      };
    },

    async renderUpdate() {
      await handleRepeatingPerComponentTask("renderUpdate");
    },
    async fixedUpdate() {
      await handleRepeatingPerComponentTask("fixedUpdate");
    },

    // @ts-expect-error
    entity(ec) {
      const entity: Record<any, any> = {};

      const loadComponent = (k: string, v: any) => {
        if (entity[k]) return;

        const comp = componentMap[k]!.componentTemplate.create(
          v,
          { ...componentMap[k] },
          componentMap,
          (spec) => {
            loadComponent(spec.brand, ec[spec.brand]);
            return entity[spec.brand];
          }
        );

        componentMap[k]!.instances.add({ data: comp, entity });

        entity[k] = comp;
      };

      for (const [k, v] of Object.entries(ec) as [any, any][]) {
        loadComponent(k, v);
        // const comp = componentMap[k]!.componentTemplate.create(v, componentMap);

        // componentMap[k]!.instances.add({ data: comp, entity });

        // entity[k] = comp;
      }

      return {
        component(type) {
          return entity[type.brand];
        },
        destroy() {
          for (const [k, v] of Object.entries(entity)) {
            componentMap[k]?.instances.delete(v);
          }
        },
      };
    },
  };
}
