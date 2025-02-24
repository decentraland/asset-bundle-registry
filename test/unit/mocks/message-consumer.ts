export function createMessageConsumerMock() {
  return {
    process: jest.fn(),
    start: jest.fn(),
    stop: jest.fn()
  }
}
