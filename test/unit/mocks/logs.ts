export function createLogMockComponent() {
  return {
    getLogger: jest.fn().mockReturnValue({
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn()
    })
  }
}
