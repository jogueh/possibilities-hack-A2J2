import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { vi } from 'vitest'

afterEach(() => {
  cleanup()
})

// Polyfills for antd components under jsdom.
const globalRef = globalThis as unknown as {
  matchMedia?: (query: string) => MediaQueryList
  ResizeObserver?: unknown
}

if (!globalRef.matchMedia) {
  globalRef.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

if (!globalRef.ResizeObserver) {
  globalRef.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
