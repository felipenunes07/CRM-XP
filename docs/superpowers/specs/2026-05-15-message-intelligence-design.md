# Message Intelligence Upgrade Design

## Goal

Make the "Inteligencia de Mensagens" page operationally useful by separating real action items from routine chat, commercial signals, praise, questions, risk, and legacy noise.

## Scope

- Replace substring-only classification with a rule engine that normalizes Portuguese text, uses word boundaries, and stores confidence/reason metadata.
- Treat common WhatsApp phrases, product lists, price pitches, greetings, laughs, and short acknowledgements as filtered noise unless they clearly require action.
- Detect commercial opportunities from price, stock, catalog, freight, wholesale, and model availability intent.
- Detect complaints only from explicit problem, cancellation, delay, defect, support escalation, or churn wording.
- Keep actionable questions and commercial opportunities visible; keep neutral/greeting noise out of default events.
- Fix database event type constraints for all event types used by the code.
- Add a reclassification script for legacy events already saved with noisy labels.
- Upgrade the page to show action queues, confidence/reason, and useful status labels instead of treating every row as a negative pending issue.

## Architecture

The backend keeps `eventsService.ts` as the public service boundary, but adds a focused classification API inside it: `classifyMessageContent`. `createEventFromMessage` uses the classification result to decide whether to create an event, which severity to apply, and which metadata to store. Metrics add filtered-noise and action-required counts for the UI.

The frontend keeps the existing Events page route and components, but changes the workspace from a raw event table to an operations surface: priority cards, executive insight text, smarter row badges, and reason/confidence chips.

## Testing

The first tests cover the exact false-positive examples from the screenshot and the target categories. API tests verify classification and low-level event decisions without requiring a database. Build and package tests verify the shared contract and UI compilation.
