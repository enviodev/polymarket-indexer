import { bytesToHex, concatHex, keccak256, padHex, toBytes, toHex } from "viem";

const P = BigInt(
  "21888242871839275222246405745257275088696311157297823662689037894645226208583",
);
const B = BigInt(3);

// https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/common/utils/ctf-utils.ts#L10C1-L10C67
const addModP = (a: bigint, b: bigint): bigint => {
  return (a + b) % P;
};

// https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/common/utils/ctf-utils.ts#L11
const mulModP = (a: bigint, b: bigint): bigint => {
  return (a * b) % P;
};

// https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/common/utils/ctf-utils.ts#L12C1-L34C3
const powModP = (a: bigint, b: bigint): bigint => {
  let at = a;
  let bt = b;
  let result = 1n;

  while ((bt == 0n) == false) {
    if (((bt & 1n) == 0n) == false) {
      result = mulModP(result, at);
    }

    at = mulModP(at, at);
    bt = bt >> 1n;
  }

  return result;
};

// https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/common/utils/ctf-utils.ts#L37C1-L38C56
const legendreSymbol = (a: bigint): bigint => {
  return powModP(a, (P - 1n) >> 1n);
};

// https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/common/utils/ctf-utils.ts#L42C1-L95C3
const computeCollectionId = (
  conditionId: `0x${string}`,
  outcomeIndex: number,
): Uint8Array => {
  const hashPayload = toBytes(
    concatHex([conditionId as `0x${string}`, padHex("0x", { size: 32 })]),
  );

  hashPayload[63] = 1 << outcomeIndex;

  const hahsResult = keccak256(hashPayload);
  const hashResultReversed = toBytes(hahsResult).reverse();

  const hashBigInt = BigInt(bytesToHex(hashResultReversed));
  const odd = ((hashBigInt >> 255n) & 1n) === 1n;

  let x1 = hashBigInt;
  let yy = 0n;

  do {
    x1 = addModP(x1, 1n);
    yy = addModP(mulModP(mulModP(x1, x1), x1), B);
  } while (legendreSymbol(yy) != 1n);

  const oddToggle = 1n << 254n;

  if (odd) {
    if ((x1 & oddToggle) == 0n) {
      x1 = x1 + oddToggle;
    } else {
      x1 = x1 - oddToggle;
    }
  }
  const bytes = new Uint8Array(32);
  bytes.set(toBytes(toHex(x1)).slice(-32)); // FORCE 32 BYTES
  return bytes;
};

// https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/common/utils/ctf-utils.ts#L104C1-L126C1
const computePositionIdFromCollectionId = (
  collateral: `0x${string}`,
  collectionId: Uint8Array,
) => {
  const payload = new Uint8Array(52);

  payload.set(toBytes(collateral).slice(-20), 0);
  payload.set(collectionId, 20);

  const hash = keccak256(payload);
  return BigInt(bytesToHex(toBytes(hash).reverse()));
};

// https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/common/utils/ctf-utils.ts#L127C1-L135C3
const computePositionId = (
  collateral: `0x${string}`,
  conditionId: `0x${string}`,
  outcomeIndex: number,
) => {
  const collectionId = computeCollectionId(conditionId, outcomeIndex);
  return computePositionIdFromCollectionId(collateral, collectionId);
};

export { computePositionId, computeCollectionId };
