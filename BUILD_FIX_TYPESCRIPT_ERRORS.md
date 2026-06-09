# 🔧 Build Fix - TypeScript Errors

## ❌ Build Errors

The build was failing with these TypeScript errors:

```
src/app.ts(1667,13): error TS2353: Object literal may only specify known properties, and 'baseUrl' does not exist in type 'EvolutionInstanceConfig'.
src/app.ts(1677,85): error TS2339: Property 'id' does not exist on type '{}'.
src/app.ts(1678,62): error TS2339: Property 'id' does not exist on type '{}'.
```

---

## 🔍 Root Cause

### Error 1: Wrong Property Names
The `EvolutionInstanceConfig` interface expects:
- `evolutionBaseUrl` (not `baseUrl`)
- `evolutionApiKey` (not `apiKey`)

**Correct interface from `evolutionService.ts`:**
```typescript
export interface EvolutionInstanceConfig {
  instanceName: string;
  evolutionBaseUrl: string;  // ✅ Not "baseUrl"
  evolutionApiKey: string;   // ✅ Not "apiKey"
}
```

### Error 2: Untyped Variable
The `result` variable was declared without a type:
```typescript
let result;  // TypeScript infers as `undefined` or `any`
```

TypeScript couldn't determine the type, so accessing `result.key.id` caused errors.

---

## ✅ Solution Applied

### Fix 1: Correct Property Names
**Before (incorrect):**
```typescript
result = await sendWhatsappInstanceTextMessage(
  {
    instanceName: String(instance.evolution_instance_name),
    baseUrl: String(instance.evolution_base_url),      // ❌ WRONG
    apiKey: String(instance.evolution_api_key)         // ❌ WRONG
  },
  jid,
  message
);
```

**After (correct):**
```typescript
result = await sendWhatsappInstanceTextMessage(
  {
    instanceName: String(instance.evolution_instance_name),
    evolutionBaseUrl: String(instance.evolution_base_url),  // ✅ CORRECT
    evolutionApiKey: String(instance.evolution_api_key)     // ✅ CORRECT
  },
  jid,
  message
);
```

### Fix 2: Add Type Annotation
**Before (untyped):**
```typescript
let result;  // TypeScript doesn't know the type
```

**After (typed):**
```typescript
let result: Record<string, any>;  // ✅ Explicitly typed
```

### Fix 3: Safe Property Access
**Before:**
```typescript
response.json({ success: true, messageId: result?.key?.id || `msg-${Date.now()}` });
```

**After:**
```typescript
response.json({ success: true, messageId: (result as any)?.key?.id || `msg-${Date.now()}` });
```

---

## 🎯 Files Modified

### `apps/api/src/app.ts`
- **Line ~1667**: Fixed property names (`evolutionBaseUrl`, `evolutionApiKey`)
- **Line ~1654**: Added type annotation `Record<string, any>`
- **Line ~1677-1678**: Added type casting `(result as any)`

---

## ✅ Result

### Build Output:
```bash
> @olist-crm/api@0.1.0 build
> npm run build -w @olist-crm/shared && tsc -p tsconfig.json

> @olist-crm/shared@0.1.0 build
> tsc -p tsconfig.json

Exit Code: 0  ✅ SUCCESS
```

**All TypeScript errors resolved!**

---

## 📚 Reference

### Evolution API Service
The correct interface is defined in:
- **File**: `apps/api/src/modules/whatsapp/evolutionService.ts`
- **Interface**: `EvolutionInstanceConfig`

### Usage Pattern
Always use the correct property names when calling Evolution API functions:
```typescript
const config: EvolutionInstanceConfig = {
  instanceName: "my-instance",
  evolutionBaseUrl: "https://api.evolution.com",
  evolutionApiKey: "my-api-key"
};

await sendWhatsappInstanceTextMessage(config, jid, message);
```

---

## 🚀 Next Steps

The build now completes successfully. You can proceed with:

1. ✅ Deploy to production
2. ✅ Test the WhatsApp message sending endpoint
3. ✅ Verify all fixes work in production

---

**Status:** ✅ BUILD FIXED - Ready to Deploy

**Date:** June 9, 2026
