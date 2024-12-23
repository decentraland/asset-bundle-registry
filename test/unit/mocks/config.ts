import { IConfigComponent } from "@well-known-components/interfaces";

export function createConfigMockComponent(): IConfigComponent {
    return {
        requireString: jest.fn(),
        requireNumber: jest.fn(),
        getString: jest.fn(),
        getNumber: jest.fn()
    }
}
