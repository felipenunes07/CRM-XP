import { describe, expect, it } from "vitest";
import {
  anonymizeMessageForAi,
  estimatePromptTokens,
  getNextBusinessWindowStart,
  isWithinBusinessWindow,
  selectEventsAiProviders,
  shouldRunEventsAiBatch,
} from "./eventsBatchAi.js";

const baseConfig = {
  enabled: true,
  provider: "gemini" as const,
  model: "gemini-2.5-flash-lite",
  apiKey: "test-key",
  cerebrasApiKey: "",
  cerebrasModel: "gpt-oss-120b",
  timezone: "America/Sao_Paulo",
  businessStartHour: 8,
  businessEndHour: 18,
  businessDays: [1, 2, 3, 4, 5],
  intervalMinutes: 60,
  dailyRequestLimit: 4,
  dailyTokenLimit: 10_000,
  maxEventsPerBatch: 200,
  lookbackHours: 24,
};

describe("events batch AI policy", () => {
  it("only allows batch runs during configured business hours", () => {
    expect(isWithinBusinessWindow(new Date("2026-06-19T13:00:00.000Z"), baseConfig)).toBe(true);
    expect(isWithinBusinessWindow(new Date("2026-06-19T22:00:00.000Z"), baseConfig)).toBe(false);
    expect(isWithinBusinessWindow(new Date("2026-06-20T13:00:00.000Z"), baseConfig)).toBe(false);
  });

  it("returns the next business window when called outside work time", () => {
    const next = getNextBusinessWindowStart(new Date("2026-06-20T13:00:00.000Z"), baseConfig);

    expect(next.toISOString()).toBe("2026-06-22T11:00:00.000Z");
  });

  it("blocks calls when disabled, missing key, too frequent, or over budget", () => {
    expect(shouldRunEventsAiBatch({
      now: new Date("2026-06-19T13:00:00.000Z"),
      config: { ...baseConfig, enabled: false },
      usage: { requestCount: 0, tokenCount: 0, lastRunAt: null },
    }).allowed).toBe(false);

    expect(shouldRunEventsAiBatch({
      now: new Date("2026-06-19T13:00:00.000Z"),
      config: { ...baseConfig, apiKey: "" },
      usage: { requestCount: 0, tokenCount: 0, lastRunAt: null },
    }).reason).toBe("missing_api_key");

    expect(shouldRunEventsAiBatch({
      now: new Date("2026-06-19T13:00:00.000Z"),
      config: { ...baseConfig, provider: "cerebras", cerebrasApiKey: "" },
      usage: { requestCount: 0, tokenCount: 0, lastRunAt: null },
    }).reason).toBe("missing_api_key");

    expect(shouldRunEventsAiBatch({
      now: new Date("2026-06-19T13:30:00.000Z"),
      config: baseConfig,
      usage: { requestCount: 0, tokenCount: 0, lastRunAt: new Date("2026-06-19T13:00:00.000Z") },
    }).reason).toBe("cadence_wait");

    expect(shouldRunEventsAiBatch({
      now: new Date("2026-06-19T13:00:00.000Z"),
      config: baseConfig,
      usage: { requestCount: 4, tokenCount: 0, lastRunAt: null },
    }).reason).toBe("daily_request_cap");

    expect(shouldRunEventsAiBatch({
      now: new Date("2026-06-19T13:00:00.000Z"),
      config: baseConfig,
      usage: { requestCount: 0, tokenCount: 10_000, lastRunAt: null },
    }).reason).toBe("daily_token_cap");
  });

  it("allows manual runs to skip cadence while preserving business-hour and budget gates", () => {
    expect(shouldRunEventsAiBatch({
      now: new Date("2026-06-19T13:30:00.000Z"),
      config: baseConfig,
      usage: { requestCount: 0, tokenCount: 0, lastRunAt: new Date("2026-06-19T13:00:00.000Z") },
      ignoreCadence: true,
    }).reason).toBe("allowed");

    expect(shouldRunEventsAiBatch({
      now: new Date("2026-06-19T22:00:00.000Z"),
      config: baseConfig,
      usage: { requestCount: 0, tokenCount: 0, lastRunAt: new Date("2026-06-19T13:00:00.000Z") },
      ignoreCadence: true,
    }).reason).toBe("outside_business_hours");
  });

  it("anonymizes customer identifiers before sending text to an external model", () => {
    const text = "Felipe 11 99999-8888 pediu no grupo 120363@g.us email cliente@xp.com CPF 123.456.789-10";

    expect(anonymizeMessageForAi(text)).toBe("[nome] [telefone] pediu no grupo [jid] email [email] CPF [cpf]");
  });

  it("estimates prompt tokens conservatively from character count", () => {
    expect(estimatePromptTokens("abcd")).toBe(1);
    expect(estimatePromptTokens("abcde")).toBe(2);
  });

  it("uses Cerebras first in auto mode and keeps Gemini as fallback", () => {
    expect(selectEventsAiProviders({
      ...baseConfig,
      provider: "auto",
      apiKey: "gemini-key",
      cerebrasApiKey: "cerebras-key",
      model: "gemini-2.5-flash-lite",
      cerebrasModel: "gpt-oss-120b",
    })).toEqual([
      { provider: "cerebras", model: "gpt-oss-120b", apiKey: "cerebras-key" },
      { provider: "gemini", model: "gemini-2.5-flash-lite", apiKey: "gemini-key" },
    ]);
  });
});
