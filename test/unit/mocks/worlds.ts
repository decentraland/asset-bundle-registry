import { WorldsComponent } from "../../../src/types";

export function createWorldsMockComponent(): WorldsComponent {
    return {
        getWorld: jest.fn(),
        isWorldDeployment: jest.fn()
    }
}
