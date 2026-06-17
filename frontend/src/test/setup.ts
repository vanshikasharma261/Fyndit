import "@testing-library/jest-dom";

// jsdom does not implement ResizeObserver — polyfill it for components that
// use it (e.g. FilterSidebar's scroll-hint affordance).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
