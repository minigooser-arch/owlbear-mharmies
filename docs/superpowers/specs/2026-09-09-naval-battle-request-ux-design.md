# Naval Battle Request UX Design

## Goal

Make the naval battle request flow explicit for both faction leaders and the GM without creating overlapping or stacking notifications when several requests are pending at once.

## Player flow

- A faction leader may request a naval battle in POST_MOVEMENT using an eligible own ship and a currently detected enemy ship.
- After the request is persisted, the same selected ship/target pair shows `Запрошено — ожидает ведущего` instead of `Инициировать морской бой`.
- The button for that pair is disabled while the request remains pending.
- A player sees only pending naval battle requests initiated by a side for which that player is a leader. Ordinary faction members do not receive pending request state.
- The player never starts the naval battle directly.

## GM flow

- The GM receives one aggregated, in-layout notification when one or more naval battle requests are pending.
- The notification text is `Заявки на морской бой: N` and contains one `Открыть` action that switches to the `Бои` tab.
- There is never one banner/toast per request. Multiple pending requests only increase the single counter.
- The `Бои` tab also displays the pending-request count.
- All request cards remain in the `Бои` page queue.

## Starting a battle

For each request the GM sees a clear three-step flow:

1. `1. Выбрать область боя`.
2. `2. Дополнительные корабли` (optional participants).
3. `3. Начать морской бой`.

The start button stays disabled until a non-empty tactical area has been selected for that request and no naval battle is already active.

## Queue and duplicate safety

- Different naval battle requests may coexist in the queue.
- The same initiating ship / target ship pair must not be persisted twice while an equivalent request is already pending.
- Duplicate prevention is authoritative in command processing, not only in UI state.
- Starting one request does not create additional notification banners; remaining requests stay queued and the single aggregated counter reflects the remaining queue.

## Non-goals

- No operating-system notifications, toast stack, modal stack, or separate Owlbear popover per request.
- No automatic battle start.
- No change to the existing naval battle tactical rules.
