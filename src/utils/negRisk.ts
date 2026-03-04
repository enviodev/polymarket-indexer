import { keccak256, encodePacked, toHex, pad } from "viem";
import {
  NEG_RISK_ADAPTER,
  NEG_RISK_WRAPPED_COLLATERAL,
} from "./constants.js";
import { computePositionId } from "./ctf.js";

export function getNegRiskQuestionId(
  marketId: `0x${string}`,
  questionIndex: number,
): `0x${string}` {
  // Replace last byte of marketId with questionIndex
  const base = marketId.slice(0, 64); // "0x" + 62 hex chars = 31 bytes
  const indexHex = questionIndex.toString(16).padStart(2, "0");
  return `${base}${indexHex}` as `0x${string}`;
}

export function getConditionId(
  oracle: `0x${string}`,
  questionId: `0x${string}`,
): `0x${string}` {
  // Build 84-byte payload: oracle (20 bytes) + questionId (32 bytes) + outcomeSlotCount=2 (32 bytes)
  const outcomeSlotCount = pad(toHex(2n), { size: 32 });
  return keccak256(
    encodePacked(
      ["address", "bytes32", "uint256"],
      [oracle, questionId, BigInt(2)],
    ),
  );
}

export function getNegRiskConditionId(
  negRiskMarketId: `0x${string}`,
  questionIndex: number,
): `0x${string}` {
  const questionId = getNegRiskQuestionId(negRiskMarketId, questionIndex);
  return getConditionId(NEG_RISK_ADAPTER as `0x${string}`, questionId);
}

export function getNegRiskPositionId(
  negRiskMarketId: `0x${string}`,
  questionIndex: number,
  outcomeIndex: number,
): bigint {
  const conditionId = getNegRiskConditionId(negRiskMarketId, questionIndex);
  return computePositionId(
    NEG_RISK_WRAPPED_COLLATERAL as `0x${string}`,
    conditionId,
    outcomeIndex,
  );
}

export function getUserPositionEntityId(
  user: string,
  tokenId: bigint,
): string {
  return `${user}-${tokenId.toString()}`;
}

export function indexSetContains(indexSet: bigint, index: number): boolean {
  return (indexSet & (1n << BigInt(index))) > 0n;
}

export function getEventKey(
  chainId: number,
  blockNumber: number,
  logIndex: number,
): string {
  return `${chainId}_${blockNumber}_${logIndex}`;
}
