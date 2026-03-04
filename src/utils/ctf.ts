import { keccak256, encodePacked, toHex, pad } from "viem";

const P =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const B = 3n;

const addModP = (a: bigint, b: bigint): bigint => ((a + b) % P + P) % P;
const mulModP = (a: bigint, b: bigint): bigint => ((a * b) % P + P) % P;

const powModP = (a: bigint, b: bigint): bigint => {
  let at = a;
  let bt = b;
  let result = 1n;
  at = ((at % P) + P) % P;

  while (bt > 0n) {
    if (bt & 1n) {
      result = mulModP(result, at);
    }
    at = mulModP(at, at);
    bt >>= 1n;
  }

  return result;
};

const legendreSymbol = (a: bigint): bigint => powModP(a, (P - 1n) >> 1n);

export function computeCollectionId(
  conditionId: `0x${string}`,
  outcomeIndex: number,
): `0x${string}` {
  // Build 64-byte payload: conditionId (32 bytes) + indexSet (32 bytes)
  const indexSet = 1n << BigInt(outcomeIndex);
  const indexSetHex = pad(toHex(indexSet), { size: 32 });

  const hashResult = keccak256(
    encodePacked(["bytes32", "bytes32"], [conditionId, indexSetHex]),
  );

  // Convert hash to bigint (big-endian)
  let hashBigInt = BigInt(hashResult);

  // Check if MSB is set
  const odd = (hashBigInt >> 255n) !== 0n;

  let x1 = hashBigInt;
  let yy = 0n;

  // Increment x1 until we find a point on the curve y^2 = x^3 + 3 (mod P)
  do {
    x1 = addModP(x1, 1n);
    yy = addModP(mulModP(x1, mulModP(x1, x1)), B);
  } while (legendreSymbol(yy) !== 1n);

  const oddToggle = 1n << 254n;
  if (odd) {
    if ((x1 & oddToggle) === 0n) {
      x1 = x1 + oddToggle;
    } else {
      x1 = x1 - oddToggle;
    }
  }

  return pad(toHex(x1), { size: 32 });
}

export function computePositionIdFromCollectionId(
  collateral: `0x${string}`,
  collectionId: `0x${string}`,
): bigint {
  const hash = keccak256(
    encodePacked(["address", "bytes32"], [collateral, collectionId]),
  );
  return BigInt(hash);
}

export function computePositionId(
  collateral: `0x${string}`,
  conditionId: `0x${string}`,
  outcomeIndex: number,
): bigint {
  const collectionId = computeCollectionId(conditionId, outcomeIndex);
  return computePositionIdFromCollectionId(collateral, collectionId);
}
