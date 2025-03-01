---
layout: post
title: Zustand의 Slice 패턴
author: haeran
date: 2025-02-28 21:07:00 +0900
categories: [Study]
banner:
  image: https://github.com/user-attachments/assets/641d1adf-8a86-4002-8c8a-718b864d68ca
  opacity: 0.618
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold; text-decoration: underline"
  subheading_style: "color: gold"
tags: [Zustand]
---

### 💻 우리 프로젝트에서 Zustand 사용 방식

`zustand`는 React 상태 관리를 위한 경량 상태 관리 라이브러리입니다. `zustand`를 사용하여 애플리케이션의 상태를 관리하고, `localStorage`에 상태를 지속(persist)하도록 설정하고 있습니다.

저희의 zustand 구조는 [v4](https://zustand.docs.pmnd.rs/migrations/migrating-to-v4#statecreator)를 기반으로 두고 있습니다. 최근(24년 10월 14일) v5가 나왔지만, 아직 익숙하지 않아서 적용 시키지는 못했습니다. 좋은 블로그글이 있어 공유합니다 [(블로그)](https://j-ho.dev/50/)

현재 패턴은 슬라이스(Slice) 패턴을 사용하고 있습니다.
Zustand의 **슬라이스(slice) 패턴**은 상태(store)를 모듈화하여 관리하는 방식입니다. 애플리케이션의 상태를 논리적으로 분리함으로써 유지보수성과 확장성을 높일 수 있습니다.

![zustand](https://github.com/user-attachments/assets/dd7f9851-3b42-4d2f-9f1b-451d2389d39d)

### 1. **슬라이스 패턴이 필요한 이유**

Zustand를 사용할 때 상태가 커지면 하나의 큰 `create` 스토어에 모든 상태를 관리하는 것이 비효율적입니다. 이를 해결하기 위해 **슬라이스 패턴**을 사용하면 특정 기능(예: 유저 상태, 테마 상태 등)별로 분리하여 관리할 수 있습니다.

✅ **장점**

- **코드 가독성 증가**: 상태를 논리적으로 분리하여 쉽게 이해할 수 있음
- **유지보수성 향상**: 특정 기능을 수정할 때 다른 상태에 영향을 주지 않음
- **모듈화 가능**: 상태를 독립적으로 정의하여 재사용 가능

### **2. 슬라이스(Slice) 분리하기**

각 상태를 개별적인 **슬라이스(slice)**로 분리하여 관리합니다.

**1️⃣ 슬라이스 정의**

```tsx
// counterSlice.ts
import { StateCreator } from 'zustand';

export interface CounterSlice {
  count: number;
  increase: () => void;
  decrease: () => void;
}

export const createCounterSlice: StateCreator<
  CounterSlice,
  [],
  [],
  CounterSlice
> = (set) => ({
  count: 0,
  increase: () => set((state) => ({ count: state.count + 1 })),
  decrease: () => set((state) => ({ count: state.count - 1 })),
});
```

- `CounterSlice` 인터페이스를 정의하여 상태와 액션을 타입으로 명시
- `createCounterSlice` 함수에서 `set`을 이용해 상태를 변경하는 로직을 구현

**2️⃣ 여러 슬라이스 합치기**

```tsx
// useStore.ts
import { create } from 'zustand';
import { CounterSlice, createCounterSlice } from './counterSlice';
import { ThemeSlice, createThemeSlice } from './themeSlice';

type Store = CounterSlice & ThemeSlice; //여러개의 slice 통합

const useStore = create<Store>()((...a) => ({
  ...createCounterSlice(...a),
  ...createThemeSlice(...a),
}));

export default useStore;
```

- `create` 함수에서 여러 슬라이스를 병합하여 하나의 스토어로 생성
- `...createCounterSlice(...a)`를 통해 상태를 결합

### **3. 정리**

✅ **슬라이스 패턴의 핵심 개념**

- **기능별로 상태를 분리**하여 유지보수성을 높임
- **여러 슬라이스를 결합하여 하나의 상태로 통합**
- **Zustand의 `StateCreator`를 활용하여 슬라이스 타입을 안전하게 관리**

✅ **언제 사용할까?**

- 애플리케이션 상태가 점점 커질 때
- 여러 상태(예: `user`, `theme`, `cart` 등)를 관리해야 할 때
- 코드의 가독성과 유지보수를 개선하고 싶을 때