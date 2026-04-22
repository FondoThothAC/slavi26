/**
 * @description Representa un par candidato que cumple los criterios de volumen.
 */
export interface VolumeStarter {
    pair: string;
    volume24h: number;
    volumeRank: number;
    volumeVsAvgRatio: number;
    spreadPct: number;
    isPriorityPair: boolean;
    momentumPct: number;
    timestamp: Date;
}

/**
 * @description Resultado de un ciclo de escaneo de mercado.
 */
export interface ScanResult {
    starters: VolumeStarter[];
    scannedAt: Date;
    totalPairsScanned: number;
}
