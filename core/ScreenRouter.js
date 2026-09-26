// Basic screen switching. One screen is active at a time.
// A screen is any object with optional hooks:
//   enter(params), exit(), update(dt), render(ctx, alpha),
//   onTap(p), onDragStart(p), onDrag(p), onDragEnd(p), onHold(p), onDown(p), onUp(p)
// The router forwards input events from the bus to the active screen only.
// A modal (e.g. MajorFeedback) can sit on top: while modal.active is true it gets the input instead.
// Layers (e.g. a guide) sit between: each active layer is asked first with handleInput(hook, p);
// returning true means "used it", false lets the tap carry on to the screen.
const INPUT_ROUTES = {
  'input:tap': 'onTap',
  'input:down': 'onDown',
  'input:up': 'onUp',
  'input:dragstart': 'onDragStart',
  'input:drag': 'onDrag',
  'input:dragend': 'onDragEnd',
  'input:hold': 'onHold',
  'input:wheel': 'onWheel',
};

export class ScreenRouter {
  constructor(bus) {
    this.bus = bus;
    this.screens = new Map();
    this.current = null;
    this.currentName = null;
    this.modal = null;
    this.layers = [];

    for (const [type, hook] of Object.entries(INPUT_ROUTES)) {
      bus.on(type, (p) => {
        if (this.modal?.active) {
          this.modal[hook]?.(p);
          return;
        }
        for (const layer of this.layers) if (layer.active && layer.handleInput(hook, p) === true) return;
        this.current?.[hook]?.(p);
      });
    }
  }

  register(name, screen) {
    this.screens.set(name, screen);
    return this;
  }

  go(name, params = {}) {
    const next = this.screens.get(name);
    if (!next) {
      console.error(`[ScreenRouter] unknown screen "${name}"`);
      return;
    }
    const prevName = this.currentName;
    this.previous = prevName;
    this.current?.exit?.();
    this.current = next;
    this.currentName = name;
    next.enter?.(params);
    this.bus.emit('screen:change', { from: prevName, to: name });
  }

  update(dt) {
    this.current?.update?.(dt);
  }

  render(ctx, alpha) {
    this.current?.render?.(ctx, alpha);
  }
}
