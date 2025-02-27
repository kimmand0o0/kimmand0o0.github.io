---
layout: post
title: Dto와 type은 다른건가?
author: haeran
date: 2025-02-26 21:07:00 +0900
categories: [Study]
banner:
  image: https://github.com/user-attachments/assets/6df847d8-c1f8-4bbb-90cb-80da6ddbe884
  opacity: 0.618
  background: "#000"
  height: "100vh"
  min_height: "38vh"
  heading_style: "font-size: 4.25em; font-weight: bold; text-decoration: underline"
  subheading_style: "color: gold"
tags: [Study, Typescript]
---

# TypeScript `Partial`과 `Omit` 차이점

TypeScript에서 `Partial`과 `Omit`은 객체 타입을 변경하는 유용한 유틸리티 타입입니다. 이들의 차이점은 주로 속성을 어떻게 처리하는지에 있습니다.

## 1. `Partial<T>`

`Partial`은 주어진 타입 `T`의 모든 속성을 **선택적으로** 만듭니다. 즉, 타입의 각 프로퍼티를 optional로 바꿔줍니다.

### 예시:
```typescript
interface User {
  name: string;
  age: number;
}

const user: Partial<User> = {
  name: "Alice"
  // age는 선택적이므로 생략 가능
};
```

### 특징:
- 모든 속성이 선택적입니다.
- 객체의 속성 중 일부만 포함될 수 있습니다.

## 2. `Omit<T, K>`

`Omit`은 주어진 타입 `T`에서 특정 속성 `K`를 **제거**한 새로운 타입을 생성합니다. `K`는 제거할 속성들의 키를 나타냅니다.

### 예시:
```typescript
interface User {
  name: string;
  age: number;
  email: string;
}

const user: Omit<User, "email"> = {
  name: "Alice",
  age: 25
  // email 속성은 제거됨
};
```

### 특징:
- 특정 속성을 제외하고 나머지 속성만 포함합니다.
- 하나 이상의 속성도 제거할 수 있습니다.

## 차이점 요약:

| 유틸리티 타입     | 동작 방식                                                 |
|-------------------|-----------------------------------------------------------|
| **`Partial<T>`**   | 모든 속성을 선택적으로 만듭니다.                          |
| **`Omit<T, K>`**   | 특정 속성을 제거하고 나머지 속성만 포함합니다.            |

따라서, `Partial`은 속성을 선택적으로 만들 때 사용하고, `Omit`은 특정 속성을 제거할 때 사용됩니다.
