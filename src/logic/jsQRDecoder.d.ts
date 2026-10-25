// The bundled Apache-2.0 jsQR decoder is an ES module adapted from the upstream distribution.
export type DecodedQr = { data: string; binaryData?: number[]; version?: number };
declare const decodeQR: (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }
) => DecodedQr | null;
export default decodeQR;
