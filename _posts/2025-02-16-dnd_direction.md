---
title: Direction을 통한 dnd관리
author: haeran
date: 2025-02-16 21:07:00 +0900
categories: [dnd-kit, Typescript]
tags: [dnd-kit, Typescript]
---

여러 형태의 컴포넌트를 서로 드래그 앤 드랍하여 작업하기 위해서는 드래그가 가능한 것과 드랍이 가능한 컴포넌트를 분리하고, 방향을 정해주는 게 중요하다고 생각했습니다.

먼저 각각의 컴포넌트 타입을 정의합니다.
그 후 드래그가 가능한 방향을 정의하고 값을 만들어주는 유틸을 만들었습니다.

```typescript
// type.ts
// 드래그 가능한 컴포넌트 타입 정의
export type DraggableComponent = (typeof DRAGGABLE_TYPES)[number];
export type DroppableArea = (typeof DROPPABLE_ONLY_TYPES)[number];
export type DraggableAndDroppable = (typeof DRAGGABLE_TYPES | typeof DROPPABLE_ONLY_TYPES)[number];

export type FromDirection = DraggableComponent;
export type ToDirection = DraggableAndDroppable;

export type DragDirection = `${FromDirection} -> ${ToDirection}`;

// get-drag-direction.ts
import type { DragDirection, FromDirection, ToDirection } from "@/types";

function getDragDirection(activeType: FromDirection, overType: ToDirection): DragDirection {
  return `${activeType} -> ${overType}`;
}

export default getDragDirection;
```

이렇게 만들어낸 방향으로 분기 처리하여 드래그 이벤트를 넣어줍니다.
```typescript
if (dragDirection === "cart-item -> cart-item" || dragDirection === "cart-item -> cart-list-box") {
      return onCartItemDragEnd(event);
}
```

이렇게 지정 된 방향을 통해 이벤트를 넣어주기 때문에 서로 다른 컴포넌트 사이의 이벤트도 문제없이 처리할 수 있습니다.

이 방향을 정한것으로 dnd의 확장성을 넓힐 수 있었습니다.