import { areWhatsappJidsEqual } from "../apps/api/src/modules/whatsapp/whatsappMonitorCore.js";

function test(a: string | null | undefined, b: string | null | undefined, expected: boolean) {
  const result = areWhatsappJidsEqual(a, b);
  const passed = result === expected;
  console.log(`areWhatsappJidsEqual(${JSON.stringify(a)}, ${JSON.stringify(b)}) => ${result} | Expected: ${expected} | Passed: ${passed ? "✅" : "❌"}`);
  if (!passed) {
    process.exit(1);
  }
}

console.log("=== RUNNING JID MATCHING TESTS ===");
// Base exact matches
test("5511988887777@s.whatsapp.net", "5511988887777@s.whatsapp.net", true);
test("120363148123456789@g.us", "120363148123456789@g.us", true);

// Brazilian 9-digit mismatch (DDD 11)
test("5511988887777@s.whatsapp.net", "551188887777@s.whatsapp.net", true);
test("551188887777@s.whatsapp.net", "5511988887777@s.whatsapp.net", true);

// Brazilian 9-digit mismatch with formatting (spaces, plus signs)
test("+55 (11) 98888-7777", "551188887777@s.whatsapp.net", true);
test("551188887777", "+55 11 9 8888 7777", true);

// Different DDD (should mismatch)
test("5511988887777@s.whatsapp.net", "5521988887777@s.whatsapp.net", false);
test("551188887777@s.whatsapp.net", "552188887777@s.whatsapp.net", false);

// Different last digits (should mismatch)
test("5511988887777@s.whatsapp.net", "5511988886666@s.whatsapp.net", false);

// Non-Brazilian numbers (exact digits match)
test("14155552671@s.whatsapp.net", "14155552671@s.whatsapp.net", true);
test("14155552671@s.whatsapp.net", "14155552672@s.whatsapp.net", false);

// Nulls/undefined
test(null, "5511988887777@s.whatsapp.net", false);
test("5511988887777@s.whatsapp.net", undefined, false);

console.log("All tests passed! 🎉");
