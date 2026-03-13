import type { PositionResponse } from '$lib/shared/types/trading.js';

export const PositionCmd = {
    Sync: 0,
    SetClosing: 1,
    ClearPositions: 2,
    SetFromTrade: 3,
} as const;

export type PositionCommand =
    | { tag: typeof PositionCmd.Sync; globalPos: PositionResponse | null; localPos: PositionResponse | null }
    | { tag: typeof PositionCmd.SetClosing; closing: boolean }
    | { tag: typeof PositionCmd.ClearPositions }
    | { tag: typeof PositionCmd.SetFromTrade; position: PositionResponse };

export const positionCmd = {
    sync: (globalPos: PositionResponse | null, localPos: PositionResponse | null): PositionCommand =>
        ({ tag: PositionCmd.Sync, globalPos, localPos }),
    setClosing: (closing: boolean): PositionCommand =>
        ({ tag: PositionCmd.SetClosing, closing }),
    clearPositions: (): PositionCommand =>
        ({ tag: PositionCmd.ClearPositions }),
    setFromTrade: (position: PositionResponse): PositionCommand =>
        ({ tag: PositionCmd.SetFromTrade, position }),
};
