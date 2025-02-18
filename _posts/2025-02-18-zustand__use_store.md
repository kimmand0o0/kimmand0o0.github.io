---
title: Zustand를 use_store로 중앙 집중식 상태 관리
author: haeran
date: 2025-02-18 21:07:00 +0900
categories: [Zustand]
tags: [Zustand]
---

### zustand를 그냥 사용했을 때 문제점

zustand를 각각의 slice로 관리하다보면 다음의 단점이 있습니다.
1. 각각의 store에서 상태를 가져와야하기 때문에 import와 const 선언문이 길어집니다.
2. 각각의 store에 속해있는 상태값을 서로 참고하거나 가져올 수 없습니다.

### use_store 훅을 통한 중앙 집중식 관리

백화점을 떠올리면 좋을 것 같습니다.
각각의 store를 use_store에 입점시켜 서로를 참조하고, 함께 가져올 수 있도록 합니다.

기본 구조는 [zustand의 공식문서](https://zustand.docs.pmnd.rs/migrations/migrating-to-v4#usestore)를 참고하여 작성하였습니다.

또, 휘발 될 수 있는 상태값을 localStorage에 저장하여 재사용성을 높였습니다.

### use_store의 형태

```typescript
import type { TCartSlice } from "@/stores/cart_store";

import { create } from "zustand";
import { createCartSlice } from "@/stores/cart_store";
import { createSelectorFunctions } from "auto-zustand-selectors-hook";
import { persist, createJSONStorage, subscribeWithSelector } from "zustand/middleware";

const storage: StateStorage = {
  removeItem: async (name: string): Promise<void> => {
    window.localStorage.removeItem(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    window.localStorage.setItem(name, JSON.parse(value));
  },
  getItem: async (name: string): Promise<string | null> => {
    const value = window.localStorage.getItem(name);
    return value !== undefined ? JSON.stringify(value) : null;
  },
};

export type State = TCartSlice;

export const useStore = create<State>()(
  subscribeWithSelector(
    persist(
      (...a) => ({
        ...createCartSlice(...a),
      }),
      {
        version: 144,
        name: "haru-damu",
        storage: createJSONStorage(() => storage),
        partialize: (keys) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { ...persistData } = keys;

          return persistData;
        },
      },
    ),
  ),
);

export const selector = createSelectorFunctions(useStore);
```

### 사용 예시
```typescript
// use_store를 불러와 한번에 선언 할 수 있습니다.
import { useStore } from "@/hooks/usestore";

  const { cart, getIsCheckedAllCartItems, changeIsCheckedAllCartItems, bulkAddMealCartItems, getCheckedCartItems } =
    useStore();

// 각각의 store에서 get()을 통해 서로를 참조하여 사용 할 수 있습니다.
  getCartItem: () => {
    return get().user?
  },
```