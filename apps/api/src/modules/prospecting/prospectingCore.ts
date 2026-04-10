import { normalizeName, normalizeText } from "../../lib/normalize.js";

export interface ProspectScoreInput {
  keyword: string;
  state: string;
  city?: string | null;
  displayName: string;
  primaryCategory?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  phone?: string | null;
  websiteUrl?: string | null;
  leadState?: string | null;
  leadCity?: string | null;
  isWorked?: boolean;
}

function tokenize(value: string) {
  return normalizeName(value)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function buildProspectingTextQuery(keyword: string, state: string, city?: string | null) {
  const cleanedKeyword = normalizeText(keyword);
  const cleanedState = normalizeText(state);
  const cleanedCity = normalizeText(city ?? "");

  return cleanedCity
    ? `${cleanedKeyword} em ${cleanedCity}, ${cleanedState}, Brasil`
    : `${cleanedKeyword} em ${cleanedState}, Brasil`;
}

export function normalizeProspectPhone(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  if (digits.startsWith("55") && digits.length >= 12) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

export function buildWhatsappUrl(value: string | null | undefined) {
  const normalized = normalizeProspectPhone(value);
  return normalized ? `https://wa.me/${normalized}` : null;
}

export function calculateProspectScore(input: ProspectScoreInput) {
  const keywordTokens = tokenize(input.keyword);
  const haystack = `${normalizeName(input.displayName)} ${normalizeName(input.primaryCategory ?? "")}`;
  const matchedTokens = keywordTokens.filter((token) => haystack.includes(token)).length;
  const keywordCoverage = keywordTokens.length ? matchedTokens / keywordTokens.length : 0;
  const keywordScore = Math.min(35, Math.round(keywordCoverage * 35));

  const hasPhone = Boolean(normalizeProspectPhone(input.phone));
  const phoneScore = hasPhone ? 20 : 0;

  const rating = typeof input.rating === "number" && Number.isFinite(input.rating) ? Math.max(0, Math.min(input.rating, 5)) : 0;
  const ratingScore = rating ? Math.round((rating / 5) * 15) : 0;

  const reviewCount = Math.max(0, Number(input.reviewCount ?? 0));
  const reviewScore = Math.min(10, Math.round((Math.log10(reviewCount + 1) / Math.log10(201)) * 10));

  const websiteScore = input.websiteUrl ? 5 : 0;

  const normalizedState = normalizeName(input.state);
  const normalizedLeadState = normalizeName(input.leadState ?? input.state);
  const normalizedCity = normalizeName(input.city ?? "");
  const normalizedLeadCity = normalizeName(input.leadCity ?? input.city ?? "");
  const stateMatch = normalizedState && normalizedLeadState === normalizedState;
  const cityMatch = !normalizedCity || normalizedLeadCity === normalizedCity;
  const locationScore = stateMatch ? (cityMatch ? 10 : 6) : 0;

  const freshnessScore = input.isWorked ? 0 : 5;

  return Math.min(100, keywordScore + phoneScore + ratingScore + reviewScore + websiteScore + locationScore + freshnessScore);
}
