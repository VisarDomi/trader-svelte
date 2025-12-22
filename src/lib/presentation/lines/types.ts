export interface LineData {
    price: number;
    title: string;
    color: string;
}

export interface IChartLine {
    getData(isLandscape: boolean): LineData | null;
}