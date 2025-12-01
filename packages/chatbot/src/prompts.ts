import type { MemoryExtractionPattern, MemoryType } from '@unified/types';

export const SHIPPING_SYSTEM_PROMPT = `You are an expert shipping/logistics integration developer specializing in EasyPost and Easyship APIs.

EXPERTISE:
- EasyPost: 100+ carriers, domestic US focus, rate shopping
- Easyship: 550+ couriers, international shipping, DDP/DDU, landed cost
- TypeScript/Node.js shipping integrations
- International regulations: customs, HS codes, Incoterms

CRITICAL DOMAIN RULES:
1. International shipments MUST include customs_info with HS codes
2. US exports >$2,500 per Schedule B require EEI filing (AES ITN)
3. DDP (Delivered Duty Paid): seller pays all duties—WARN about IOR restrictions in MX, BR, AR
4. Dimensional weight calculations: FedEx/UPS round fractional inches UP (DIM factor 139)
5. Webhook handlers MUST return 2XX within 7s (EasyPost) or 30s (Easyship)
6. CN22 forms: max 2kg, €368 value; CN23/Commercial Invoice: above limits
7. HS codes: 6-digit international standard, 8-10 digit country-specific

CODE GENERATION STANDARDS:
- Strict TypeScript with explicit return types
- Zod schemas for all external API responses
- Exponential backoff retry logic (start 5s)
- Circuit breakers for provider isolation
- Rate caching max 5 minutes (rates volatile)
- Comprehensive error handling per error type

PROVIDER SELECTION LOGIC:
- EasyPost: domestic US, multi-carrier rate shopping, simple integrations
- Easyship: international, DDP required, duty calculations, non-US destinations

OUTPUT STRUCTURE:
1. Type definitions
2. Zod validation schemas
3. Core implementation
4. Error handling
5. Usage example with actual values

Always validate: address formats, weight/dimensions, HS codes, customs requirements.`;

export const MEMORY_EXTRACTION_PATTERNS: MemoryExtractionPattern[] = [
  { pattern: /using (easypost|easyship)/i, type: 'provider_preference' as MemoryType },
  { pattern: /ship(?:ping)? to (\w{2})/i, type: 'destination_country' as MemoryType },
  { pattern: /(domestic|international) shipping/i, type: 'shipping_scope' as MemoryType },
  { pattern: /carrier.*?(fedex|ups|usps|dhl)/i, type: 'carrier_preference' as MemoryType },
  { pattern: /incoterm.*?(EXW|FCA|DAP|DDP)/i, type: 'incoterm_preference' as MemoryType },
  { pattern: /hs code.*?(\d{6,10})/i, type: 'general' as MemoryType },
  { pattern: /i (?:like|love|prefer|always use)/i, type: 'preference' as MemoryType },
  { pattern: /my favorite/i, type: 'preference' as MemoryType },
];

export const SHIPPING_KNOWLEDGE_TRIGGERS = [
  'rate',
  'label',
  'customs',
  'hs code',
  'duty',
  'incoterm',
  'tracking',
  'webhook',
  'address validation',
  'dimensional weight',
  'shipment',
  'carrier',
  'easypost',
  'easyship',
];

export function buildSystemPrompt(
  basePrompt: string,
  memoryContext?: string,
  conversationContext?: string
): string {
  let prompt = basePrompt;

  if (memoryContext) {
    prompt += `\n\nRelevant memories about the user:\n${memoryContext}`;
  }

  if (conversationContext) {
    prompt += `\n\nRecent conversation:\n${conversationContext}`;
  }

  return prompt;
}

export function isShippingRelated(message: string): boolean {
  const messageLower = message.toLowerCase();
  return SHIPPING_KNOWLEDGE_TRIGGERS.some(trigger =>
    messageLower.includes(trigger)
  );
}
