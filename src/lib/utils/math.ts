export function roundDownToFactor(value: number, factor: number): number {
    return Math.floor(value * factor) / factor;
}

export function roundDownToStep(value: number, step: number): number {
    if (step === 0) return value;
    const inv = 1.0 / step;
    return Math.floor(value * inv) / inv;
}

export function roundPrice(value: number, decimalPlaces: number): number {
    const factor = Math.pow(10, decimalPlaces);
    return Math.round(value * factor) / factor;
}